/**
 * The shop's money, defined once.
 *
 * The same word meant different things on different screens. The dashboard's
 * Revenue card counted payments; the break-even ring beside it, the monthly
 * summary and the Analysis page counted the price of bundles, paid or not. A
 * shop could read ₦0 for today beside a ring saying the month was covered, or
 * see Analysis "Collected" include money that was also listed as still owed.
 * Each number was right about what it counted, and the app still contradicted
 * itself.
 *
 * So there are two figures with one meaning each, and every screen reads them
 * from here:
 *
 *   Money received  - payments, by the day they were paid. This is revenue.
 *   Work taken in   - the price of bundles, by the day they were dropped off,
 *                     paid or not. Shown beside revenue, never instead of it.
 *
 * What is still owed is the gap between them, and already has one source: the
 * outstanding balances in pendingPayments.
 */

import type { StoreData } from '@/types/store';
import { getLocalLaundryRecords, type LocalLaundryRecord } from '@/lib/laundry-offline';
import { getOperatingExpenses } from '@/lib/store-data';
import { approvedLabourBetween, PIECE_WORK_CATEGORY } from '@/lib/piece-work';

function timeOf(value: unknown): number {
  const at = new Date(String(value || '')).getTime();
  return Number.isFinite(at) ? at : NaN;
}

/** Inside [from, to): the start counts and the end does not, so windows never overlap. */
function inside(at: number, from: number, to: number): boolean {
  return Number.isFinite(at) && at >= from && at < to;
}

/**
 * Money that actually came in: payments, by the day they were paid.
 *
 * A bundle paid in full at drop-off, a deposit, and the balance paid at
 * collection each count once, on the day the money changed hands. A bundle
 * nobody has paid for counts nothing here - it is work taken in, and owed.
 */
export function receivedBetween(store: Pick<StoreData, 'sales'>, from: number, to: number): number {
  return (store.sales || []).reduce((sum, sale) => (
    inside(timeOf(sale?.date), from, to) ? sum + (Number(sale.total) || 0) : sum
  ), 0);
}

/** The same money, split by where it came in. */
export function receivedByChannel(
  store: Pick<StoreData, 'sales'>,
  from: number,
  to: number,
): { counter: number; online: number } {
  let counter = 0;
  let online = 0;
  for (const sale of store.sales || []) {
    if (!inside(timeOf(sale?.date), from, to)) continue;
    const amount = Number(sale.total) || 0;
    if (sale.channel === 'online_order') online += amount;
    else counter += amount;
  }
  return { counter, online };
}

/** Bundles dropped off inside a window. */
export function bundlesBetween(store: Pick<StoreData, 'accessCode'>, from: number, to: number): LocalLaundryRecord[] {
  const accessCode = String(store.accessCode || '');
  if (!accessCode) return [];
  try {
    return getLocalLaundryRecords(accessCode).filter(record => inside(timeOf(record.createdAt), from, to));
  } catch {
    return [];
  }
}

/**
 * The price of the work taken in - what it is worth, paid or not.
 *
 * Useful, and not revenue. A busy week with little paid is real work and real
 * money still to chase; calling it revenue is how a shop celebrates a month it
 * has not been paid for.
 */
export function workTakenInBetween(store: Pick<StoreData, 'accessCode'>, from: number, to: number): number {
  return bundlesBetween(store, from, to).reduce((sum, record) => sum + (Number(record.total) || 0), 0);
}

/**
 * How many bundles have been recorded.
 *
 * Bundles, not payments. The dashboard counted payments under "Recorded", so a
 * bundle paid as a deposit and a balance counted twice and an unpaid bundle
 * did not count at all.
 */
export function bundleCount(store: Pick<StoreData, 'accessCode'>): number {
  const accessCode = String(store.accessCode || '');
  if (!accessCode) return 0;
  try {
    return getLocalLaundryRecords(accessCode).length;
  } catch {
    return 0;
  }
}

/**
 * What running the shop cost over a window.
 *
 * Operating expenses, never stock bought - buying stock turns cash into goods
 * the shop still owns. Piece work is counted when the owner approves it and
 * not again when the worker is paid: the payment is recorded as an expense too,
 * and counting both would charge the shop twice for the same shirts. The cost
 * estimator follows the same rule, so the two can never disagree.
 */
export function runningCostsBetween(store: Pick<StoreData, 'expenses' | 'pieceWork'>, from: number, to: number): number {
  const expenses = getOperatingExpenses(store)
    .filter(expense => expense.category !== PIECE_WORK_CATEGORY)
    .filter(expense => inside(timeOf(expense.date), from, to))
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  return expenses + approvedLabourBetween(store, from, to);
}
