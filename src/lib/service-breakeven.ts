/**
 * What the shop must take this month before it starts earning.
 *
 * Break-even is the one number a small laundry almost never knows. Rent,
 * salaries and diesel go out whether or not anybody brings washing, and
 * without a figure to clear, a good week and a bad one feel the same.
 *
 * Everything here is derived from what the shop has actually recorded. Nothing
 * asks the owner to estimate anything, because an estimate typed once and
 * never revisited is worse than no number at all - it looks like fact.
 *
 * Counted in pieces, never in drop-offs. A customer bringing one shirt and a
 * customer bringing twenty are not the same event, and treating each as "one
 * job" would make a shop doing many small jobs look identical to one doing few
 * large ones.
 */

import type { StoreData } from '@/types/store';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';
import { estimateUnitCost, isVariableCost } from '@/lib/cost-estimator';
import { isStockPurchase } from '@/lib/store-data';

const DAY = 86400000;

/** Enough pieces that dividing by them means something. */
export const MIN_PIECES_FOR_UNIT_COST = 10;

export interface MonthWindow {
  start: number;
  end: number;
  daysInMonth: number;
  dayOfMonth: number;
}

export function monthWindow(at: Date = new Date()): MonthWindow {
  const start = new Date(at.getFullYear(), at.getMonth(), 1).getTime();
  const end = new Date(at.getFullYear(), at.getMonth() + 1, 1).getTime();
  return {
    start,
    end,
    daysInMonth: Math.round((end - start) / DAY),
    dayOfMonth: at.getDate(),
  };
}

function inWindow(dateish: unknown, window: MonthWindow): boolean {
  const time = new Date(String(dateish || '')).getTime();
  return Number.isFinite(time) && time >= window.start && time < window.end;
}

/**
 * The costs that do not move with the washing.
 *
 * Rent, salaries, the internet: what the shop owes whether it takes in one
 * bundle or none. Read from what was actually spent this month, with the
 * shop's own recurring bills, staff salaries and the rent on its profile used
 * for anything not yet paid - a rent day that has not arrived is still rent
 * owed, and leaving it out would make the target look easy right up until it
 * is not.
 *
 * Everything here is counted once. Each source subtracts what has already been
 * recorded as spending, because charging a shop twice for the same rent is as
 * wrong as not charging it at all.
 */
export function monthlyFixedCosts(store: StoreData, window: MonthWindow = monthWindow()): number {
  const spent = (store.expenses || [])
    .filter(expense => inWindow(expense.date, window))
    // Anything used up doing the work is taken off the revenue side instead,
    // so counting it here as well would charge the shop twice for its soap.
    .filter(expense => !isStockPurchase(expense) && !isVariableCost(store, expense))
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  // A recurring bill already paid this month is in `spent` above, so only the
  // ones still to come are added.
  const upcoming = (store.recurringBills || [])
    .filter(bill => bill.active)
    .filter(bill => !(store.expenses || []).some(
      expense => inWindow(expense.date, window) && String(expense.note || '').includes(bill.label),
    ))
    .reduce((sum, bill) => {
      const amount = Number(bill.amount) || 0;
      return sum + (bill.frequency === 'weekly' ? amount * 4 : amount);
    }, 0);

  /*
   * Wages still owed this month.
   *
   * A salary set on the staff record is a real monthly obligation, and it is
   * usually the largest after rent. Without it a shop was told it had covered
   * its month while a wage it had not yet paid was still due - the target
   * looked reachable right up until payday.
   *
   * Only what has not already been paid: a Salaries expense recorded this
   * month is in `spent` above, and counting both would double the wage bill.
   */
  const payroll = (store.staffMembers || []).reduce(
    (sum, member) => sum + Math.max(0, Number((member as any).monthlySalary) || 0),
    0,
  );
  const salariesPaid = (store.expenses || [])
    .filter(expense => inWindow(expense.date, window) && expense.category === 'Salaries')
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const wagesOwed = Math.max(0, payroll - salariesPaid);

  /*
   * Rent from the shop's own profile.
   *
   * There were two places to enter rent and only one of them counted. A shop
   * that filled in Store Rent under Edit Profile - landlord, amount, when it
   * is due - had that money reach a rent affordability panel and nothing else,
   * so the break-even target, the pricing advice and the month report were all
   * computed as though the largest bill the shop pays did not exist. The
   * target came out low and reachable, and it was neither.
   *
   * Only when it has not already been recorded as spending. A shop that pays
   * its rent and books the expense would otherwise be charged for it twice in
   * the same month, which is the opposite error and just as wrong.
   */
  const rent = store.profile?.rent;
  let profileRent = 0;
  if (rent?.isRented && Number(rent.amount) > 0) {
    const amount = Number(rent.amount);
    // Monthly, quarterly or yearly - the three the profile offers. Anything
    // unset is treated as monthly, which is how the rest of the app reads it.
    const monthly = rent.frequency === 'yearly' ? amount / 12
      : rent.frequency === 'quarterly' ? amount / 3
      : amount;

    const rentPaid = (store.expenses || [])
      .filter(expense => inWindow(expense.date, window))
      .filter(expense => expense.category === 'Rent' || /rent/i.test(String(expense.note || '')))
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

    profileRent = Math.max(0, monthly - rentPaid);
  }

  return Math.max(0, spent + upcoming + wagesOwed + profileRent);
}

export interface PiecesAndRevenue {
  pieces: number;
  revenue: number;
}

/** What the shop took in, and how many pieces it took in, this month. */
export function monthToDate(store: StoreData, window: MonthWindow = monthWindow()): PiecesAndRevenue {
  const accessCode = String(store.accessCode || '');
  const records = accessCode ? getLocalLaundryRecords(accessCode) : [];

  let pieces = 0;
  let revenue = 0;
  for (const record of records) {
    if (!inWindow(record.createdAt, window)) continue;
    // Pieces, not bundles: one shirt is one, twenty shirts are twenty.
    pieces += Number(record.pieceCount) || 0;
    revenue += Number(record.total) || 0;
  }
  return { pieces, revenue };
}

/**
 * What one piece costs the shop in things it uses up.
 *
 * Derived from real consumable spending divided by real pieces, so it sharpens
 * every month the shop trades. Withheld below a handful of pieces, because
 * dividing a drum of detergent by three shirts produces a confident number
 * built on nothing, and a shop could reprice off it.
 */
export function variableCostPerPiece(store: StoreData): number | null {
  // One estimator, shared with the pricing advisor, so the two can never
  // disagree about what a piece costs.
  return estimateUnitCost(store).perPiece;
}

export interface BreakEven {
  /** What must be taken this month to cover the fixed costs. */
  target: number;
  fixedCosts: number;
  revenue: number;
  pieces: number;
  /** Revenue less what those pieces consumed. This is what pays the rent. */
  contribution: number;
  /** Still to find before the month is paid for. */
  remaining: number;
  /** 0-1. */
  progress: number;
  reached: boolean;
  /** Turnover still needed each remaining day. */
  perDayNeeded: number;
  daysLeft: number;
  /** How far through the month, 0-1, against how far through the target. */
  pace: 'ahead' | 'on track' | 'slightly behind' | 'behind' | 'no target';
  /** Taken above break-even, once it is passed. */
  surplus: number;
  variableCostPerPiece: number | null;
}

/**
 * Where the shop stands this month.
 *
 * The target is turnover, not contribution, because turnover is the number an
 * owner can see happening at the counter. The margin is applied to it: if a
 * third of every naira is consumed doing the work, the shop must take more
 * than its fixed costs to cover them, and this says how much more.
 */
export function breakEven(store: StoreData, at: Date = new Date()): BreakEven {
  const window = monthWindow(at);
  const fixedCosts = monthlyFixedCosts(store, window);
  const { pieces, revenue } = monthToDate(store, window);
  const perPiece = variableCostPerPiece(store);

  const consumed = perPiece === null ? 0 : perPiece * pieces;
  const contribution = revenue - consumed;

  /*
   * The share of each naira left after what the work consumed. Without enough
   * pieces to know it, the target is the fixed costs alone rather than a
   * guessed margin - understating it is safer than inventing one.
   */
  const marginRate = revenue > 0 && consumed > 0 ? Math.max(0.05, contribution / revenue) : 1;
  const target = marginRate > 0 ? fixedCosts / marginRate : fixedCosts;

  const remaining = Math.max(0, target - revenue);
  const progress = target > 0 ? Math.min(1, revenue / target) : 0;
  const daysLeft = Math.max(1, window.daysInMonth - window.dayOfMonth + 1);

  const monthElapsed = window.dayOfMonth / window.daysInMonth;
  let pace: BreakEven['pace'] = 'no target';
  if (target > 0) {
    const gap = progress - monthElapsed;
    if (gap >= 0.1) pace = 'ahead';
    else if (gap >= -0.05) pace = 'on track';
    else if (gap >= -0.2) pace = 'slightly behind';
    else pace = 'behind';
  }

  return {
    target,
    fixedCosts,
    revenue,
    pieces,
    contribution,
    remaining,
    progress,
    reached: target > 0 && revenue >= target,
    perDayNeeded: remaining > 0 ? remaining / daysLeft : 0,
    daysLeft,
    pace,
    surplus: Math.max(0, revenue - target),
    variableCostPerPiece: perPiece,
  };
}

/** Said the way a person would say it, from the figures above. */
export function breakEvenSentence(state: BreakEven): string {
  if (state.target <= 0) {
    return 'Record your rent, salaries and other monthly costs and I can tell you what you need to make.';
  }
  if (state.reached) {
    return `You have covered this month's costs and taken ₦${Math.round(state.surplus).toLocaleString()} above them.`;
  }

  const perDay = `₦${Math.round(state.perDayNeeded).toLocaleString()} a day for the ${state.daysLeft} ${state.daysLeft === 1 ? 'day' : 'days'} left`;
  switch (state.pace) {
    case 'ahead':
      return `Ahead of where you need to be. ${perDay} finishes the month covered.`;
    case 'on track':
      return `On track. ${perDay} and this month is paid for.`;
    case 'slightly behind':
      return `A little behind. ${perDay} brings it back.`;
    default:
      return `Behind for the month. It needs ${perDay}.`;
  }
}
