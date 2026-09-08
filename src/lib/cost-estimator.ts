/**
 * What one piece actually costs the shop to do.
 *
 * Nobody is asked. A per-item cost typed in once and never revisited is worse
 * than none, because it looks like fact long after it stopped being true - and
 * no laundry owner is going to weigh the detergent that went on one shirt.
 *
 * So it is worked backwards from what the shop really spent and really did:
 * the money that goes out because washing happened, spread across the pieces
 * that were washed.
 *
 * Which costs count is the whole judgement here. Detergent, bleach, starch and
 * nylon bags are used up doing the work. So, for a laundry, is most of the
 * power and water - the machines are the bill. Rent and salaries are not: they
 * are owed whether or not a single bundle arrives, which is what makes them
 * the thing break-even has to clear rather than part of the cost of a piece.
 *
 * Counted in pieces, never in drop-offs. One shirt is one piece; a bundle of
 * twenty is twenty. Spreading a month of detergent across "jobs" would make a
 * shop doing many small jobs look far more expensive per unit than one doing
 * few large ones, when it is the pieces that consume the soap.
 */

import type { Expense, ExpenseCategory, StoreData } from '@/types/store';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';
import { isServiceFirstBusiness } from '@/lib/business-runtime';

/**
 * Costs that rise and fall with the amount of work done.
 *
 * Consumables always. Utilities only for a shop that sells work: a laundry's
 * electricity and water are the machines running, while a provision store's
 * are the lights, which burn whether or not anybody buys anything.
 */
export const ALWAYS_VARIABLE: ExpenseCategory[] = ['Consumables'];
export const VARIABLE_FOR_SERVICES: ExpenseCategory[] = ['Consumables', 'Utilities'];

export function variableCategories(store: StoreData): ExpenseCategory[] {
  return isServiceFirstBusiness(store) ? VARIABLE_FOR_SERVICES : ALWAYS_VARIABLE;
}

export function isVariableCost(store: StoreData, expense: Pick<Expense, 'category'>): boolean {
  return variableCategories(store).includes(expense.category);
}

/**
 * Enough pieces that dividing by them means something.
 *
 * A drum of detergent divided by three shirts produces a confident figure
 * built on nothing, and a shop could reprice off it.
 */
export const MIN_PIECES_TO_ESTIMATE = 10;

export interface CostEstimate {
  /** True until there is enough work recorded to divide by. */
  learning: boolean;
  pieces: number;
  needed: number;
  /** What went out on things used up doing the work, in the window. */
  spend: number;
  /** spend ÷ pieces, or null while learning. */
  perPiece: number | null;
  /** What made it up, largest first, for saying where the money went. */
  breakdown: { category: ExpenseCategory; amount: number }[];
  /** How many days of trade this was worked out from. */
  days: number;
}

const DAY = 86400000;

/**
 * Worked out over a rolling window rather than the calendar month.
 *
 * A shop looking on the 2nd would otherwise be told its costs from two days of
 * trade, and a drum of detergent bought on the 1st would land on whatever few
 * pieces happened to follow it.
 */
export function estimateUnitCost(store: StoreData, days = 30): CostEstimate {
  const since = Date.now() - days * DAY;
  const within = (value: unknown) => {
    const time = new Date(String(value || '')).getTime();
    return Number.isFinite(time) && time >= since;
  };

  const categories = variableCategories(store);
  const totals = new Map<ExpenseCategory, number>();
  let spend = 0;

  for (const expense of store.expenses || []) {
    if (!within(expense.date) || !categories.includes(expense.category)) continue;
    const amount = Math.max(0, Number(expense.amount) || 0);
    spend += amount;
    totals.set(expense.category, (totals.get(expense.category) || 0) + amount);
  }

  const accessCode = String(store.accessCode || '');
  let pieces = 0;
  for (const record of accessCode ? getLocalLaundryRecords(accessCode) : []) {
    if (!within(record.createdAt)) continue;
    pieces += Number(record.pieceCount) || 0;
  }

  const breakdown = Array.from(totals.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const learning = pieces < MIN_PIECES_TO_ESTIMATE || spend <= 0;

  return {
    learning,
    pieces,
    needed: MIN_PIECES_TO_ESTIMATE,
    spend,
    perPiece: learning ? null : spend / pieces,
    breakdown,
    days,
  };
}

/** "₦38 a piece — soap, power and water over the last 30 days, across 214 pieces." */
export function explainUnitCost(estimate: CostEstimate): string {
  if (estimate.learning) {
    const short = Math.max(0, estimate.needed - estimate.pieces);
    if (estimate.spend <= 0) {
      return 'Record what you spend on soap, power and water and I can work out what a piece costs you.';
    }
    return `Still working out what a piece costs you — ${short} more ${short === 1 ? 'piece' : 'pieces'} and I will know.`;
  }

  const parts = estimate.breakdown.map(entry => entry.category.toLowerCase()).join(' and ');
  return `₦${Math.round(estimate.perPiece!).toLocaleString()} a piece — ${parts} over the last ${estimate.days} days, across ${estimate.pieces} pieces.`;
}
