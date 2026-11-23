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
import { shopLaundryRecords } from '@/lib/shop-laundry';

import { receivedBetween } from '@/lib/money-figures';
import { estimateUnitCost, isVariableCost } from '@/lib/cost-estimator';
import { isStockPurchase } from '@/lib/store-data';
import { monthlyRent } from '@/lib/rent';

const DAY = 86400000;

/** Enough pieces that dividing by them means something. */
export const MIN_PIECES_FOR_UNIT_COST = 10;

/** More than this share of the work's price is not what doing the work cost. */
export const MAX_COST_SHARE = 0.75;

/** A weekly bill comes round this many times a month, not four. */
const WEEKS_A_MONTH = 52 / 12;

export interface MonthWindow {
  start: number;
  end: number;
  daysInMonth: number;
  dayOfMonth: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "1-30 November": the month a target is for, its 1st to its last day. */
export function monthSpan(at: Date = new Date()): string {
  const last = new Date(at.getFullYear(), at.getMonth() + 1, 0).getDate();
  return `1-${last} ${MONTHS[at.getMonth()]}`;
}

/** "October": the whole month before, that the margin is read from. */
export function lastMonthName(at: Date = new Date()): string {
  return MONTHS[(at.getMonth() + 11) % 12];
}

/** The calendar month before this one: its 1st to its last day. */
export function previousMonthWindow(window: MonthWindow): MonthWindow {
  const first = new Date(window.start);
  const start = new Date(first.getFullYear(), first.getMonth() - 1, 1).getTime();
  return { start, end: window.start, daysInMonth: Math.round((window.start - start) / DAY), dayOfMonth: 1 };
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
  const rent = store.profile?.rent;
  const profileRentSet = !!rent?.isRented && Number(rent.amount) > 0;
  const isRent = (expense: { category?: string; note?: string }) =>
    expense.category === 'Rent' || /rent/i.test(String(expense.note || ''));

  const spent = (store.expenses || [])
    .filter(expense => inWindow(expense.date, window))
    // Anything used up doing the work is taken off the revenue side instead,
    // so counting it here as well would charge the shop twice for its soap.
    .filter(expense => !isStockPurchase(expense) && !isVariableCost(store, expense))
    // Salaries and the profile's rent are counted below, each its own way.
    .filter(expense => expense.category !== 'Salaries')
    .filter(expense => !(profileRentSet && isRent(expense)))
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
      return sum + (bill.frequency === 'weekly' ? amount * WEEKS_A_MONTH : amount);
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
  /*
   * A salary belongs to the month it pays for. October's wage handed over on
   * the 1st of November was counted as November's, so November's own wage then
   * looked paid - and when it was paid at the end of the month the target
   * jumped by a whole salary. Payday records say which month; one typed by
   * hand goes by its date, as before.
   */
  const thisMonth = monthOf(window.start);
  const salariesPaid = (store.expenses || [])
    .filter(expense => expense.category === 'Salaries')
    .filter(expense => (expense.payMonth ? expense.payMonth === thisMonth : inWindow(expense.date, window)))
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  // What the wages come to: the settings, or more if more was paid.
  const wages = Math.max(payroll, salariesPaid);

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
  /*
   * And always as its monthly share.
   *
   * Paying the rent used to be added on top: a year's rent paid this month
   * made this month's target a year's rent higher, and next month's dropped
   * back. Rent is paid in lumps but the shop uses the place every month, so
   * each month carries one month of it, paid or not.
   */
  // Monthly, quarterly or yearly - the three the profile offers. Unset is
  // yearly, because that is what the form showed when it was filled in.
  const profileRent = profileRentSet && rent ? monthlyRent(rent) : 0;

  return Math.max(0, spent + upcoming + wages + profileRent);
}

function monthOf(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The price of the work taken in between two moments, and its pieces. */
function workBetween(store: StoreData, from: number, to: number): { pieces: number; work: number } {
  const accessCode = String(store.accessCode || '');
  let pieces = 0;
  let work = 0;
  for (const record of accessCode ? shopLaundryRecords(accessCode) : []) {
    const time = new Date(String(record.createdAt || '')).getTime();
    if (!Number.isFinite(time) || time < from || time >= to) continue;
    pieces += Number(record.pieceCount) || 0;
    work += Number(record.total) || 0;
  }
  return { pieces, work };
}

export interface PiecesAndRevenue {
  pieces: number;
  /** Money received this month - payments, by the day they were paid. */
  revenue: number;
  /** The price of the work taken in this month, paid or not. */
  workTakenIn: number;
}

/** The money that came in this month, the work taken in, and its pieces. */
export function monthToDate(store: StoreData, window: MonthWindow = monthWindow()): PiecesAndRevenue {
  const accessCode = String(store.accessCode || '');
  const records = accessCode ? shopLaundryRecords(accessCode) : [];

  let pieces = 0;
  let workTakenIn = 0;
  for (const record of records) {
    if (!inWindow(record.createdAt, window)) continue;
    // Pieces, not bundles: one shirt is one, twenty shirts are twenty.
    pieces += Number(record.pieceCount) || 0;
    workTakenIn += Number(record.total) || 0;
  }

  /*
   * Revenue is money received, not the price of the bundles.
   *
   * This added up bundle prices, paid or not, while the Revenue card it sits
   * on counted payments. So the ring could say the month was covered while
   * most of that money was still owed, beside a card reading ₦0 for today.
   */
  const revenue = receivedBetween(store, window.start, window.end);
  return { pieces, revenue, workTakenIn };
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
  /** Money received this month - payments, by the day they were paid. */
  revenue: number;
  /** The price of the work taken in this month, paid or not. */
  workTakenIn: number;
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
  /** The costs per piece came to more of the work's price than they can, so were left out. */
  costsDoubtful: boolean;
  /** The margin came from last month, 1st to last day, so the target holds all month. */
  steady: boolean;
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
  const { pieces, revenue, workTakenIn } = monthToDate(store, window);

  /*
   * Everything is by the calendar month. The costs and the money are this
   * month's, the 1st to the last day. The margin - how much of each naira the
   * work uses up - is read from last month, its 1st to its last day, and held.
   * A month that has ended no longer changes.
   *
   * It used to come from this month so far: every bundle taken in and every
   * bag of soap bought moved it, and with it the target - so the figure the
   * shop was aiming at changed value through the day, most of all in the first
   * week, when a handful of bundles decided it. Read from a stretch that has
   * already ended, it stays the same all month and changes only when a new
   * cost is recorded.
   *
   * A shop without enough work last month - its first month in the app -
   * has nothing settled to read, so until it does the margin is learnt from
   * this month as it goes, as it always was.
   */
  const lastMonth = previousMonthWindow(window);
  const before = estimateUnitCost(store, lastMonth.daysInMonth, lastMonth.end, lastMonth.start);
  const earlier = workBetween(store, lastMonth.start, lastMonth.end);
  const steady = before.perPiece !== null && earlier.pieces >= MIN_PIECES_FOR_UNIT_COST && earlier.work > 0;
  // Learnt from this month alone, the 1st to now, not from the 30 days before today.
  const perPiece = steady ? before.perPiece : estimateUnitCost(store, window.daysInMonth, window.end, window.start).perPiece;

  const consumed = perPiece === null ? 0 : perPiece * pieces;
  const contribution = revenue - consumed;
  // The work the margin is read from, and what that work used up.
  const marginWork = steady ? earlier.work : workTakenIn;
  const consumedBefore = steady ? (perPiece ?? 0) * earlier.pieces : consumed;

  /*
   * The share of each naira left after what the work consumed. Without enough
   * pieces to know it, the target is the fixed costs alone rather than a
   * guessed margin - understating it is safer than inventing one.
   *
   * Taken from the price of the work, not from money received. The margin is
   * a property of what a job is priced at; money received lags the work, so a
   * month with a lot still unpaid would read as almost no margin and the
   * target would balloon to many times the real costs.
   */
  /*
   * And not from figures that cannot be true. A month's light bill spread over
   * the few bundles a shop has started putting in the app reads as most of
   * the price of each one, and dividing the rent by what is left put a ₦350,000
   * month's target at ₦2.5 million. Costs taking more than three quarters of
   * the price of the work is bundles missing from the app, so the target falls
   * back to the fixed costs and says why.
   */
  const costsDoubtful = marginWork > 0 && consumedBefore > MAX_COST_SHARE * marginWork;
  const marginRate = marginWork > 0 && consumedBefore > 0 && !costsDoubtful
    ? Math.max(0.05, (marginWork - consumedBefore) / marginWork)
    : 1;
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
    workTakenIn,
    pieces,
    contribution,
    remaining,
    progress,
    reached: target > 0 && revenue >= target,
    perDayNeeded: remaining > 0 ? remaining / daysLeft : 0,
    daysLeft,
    pace,
    surplus: Math.max(0, revenue - target),
    variableCostPerPiece: costsDoubtful ? null : perPiece,
    steady,
    costsDoubtful,
  };
}

/** Said the way a person would say it, from the figures above. */
export function breakEvenSentence(state: BreakEven): string {
  if (state.target <= 0) {
    return 'Record your rent, salaries and other monthly costs and I can tell you what you need to make.';
  }
  if (state.reached) {
    return `You have covered this month's costs and brought in ₦${Math.round(state.surplus).toLocaleString()} above them.`;
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
