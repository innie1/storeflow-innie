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
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { type LocalLaundryRecord } from '@/lib/laundry-offline';
import { getOperatingExpenses } from '@/lib/store-data';
import { approvedLabourBetween, PIECE_WORK_CATEGORY } from '@/lib/piece-work';
import { laundryBalance } from '@/lib/laundry-money';

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

/** Money received in a stretch, by when the clothes it paid for came in. */
export interface MoneySources {
  /** Paid on clothes brought in during this same stretch. */
  fromThese: number;
  /** Paid on clothes brought in during the stretch before. */
  fromPrevious: number;
  /** Paid on clothes older than that. */
  fromOlder: number;
  /** Money with no bundle behind it: a sale or payment not tied to one. */
  other: number;
  total: number;
}

/**
 * Where the money received in a stretch came from.
 *
 * Money counts in the week it is paid, whenever the clothes came in. That is
 * right - it is the day the cash arrived - but it leaves a question a single
 * figure cannot answer: was this a good week for new work, or a week of old
 * debts coming home? Each payment names its bundle, and the bundle knows the
 * day it was dropped off, so the same total is split here by how old the work
 * behind it was.
 *
 * The parts always add up to the money received in the stretch.
 */
export function receivedBySource(
  store: Pick<StoreData, 'sales' | 'accessCode' | 'pendingPayments'>,
  from: number,
  to: number,
  previousFrom: number,
): MoneySources {
  const droppedOff = new Map<string, number>();
  const accessCode = String(store.accessCode || '');
  try {
    for (const record of accessCode ? shopLaundryRecords(accessCode) : []) {
      droppedOff.set(`laundry-${record.clientRef}`, timeOf(record.createdAt));
    }
  } catch { /* no bundles readable: everything falls under "other" */ }
  // A bundle taken in on another phone is known here only by its debt record.
  for (const debt of store.pendingPayments || []) {
    if (!droppedOff.has(debt.id) && !debt.takenInElsewhere) droppedOff.set(debt.id, timeOf(debt.createdAt));
  }

  const sources: MoneySources = { fromThese: 0, fromPrevious: 0, fromOlder: 0, other: 0, total: 0 };
  for (const sale of store.sales || []) {
    if (!inside(timeOf(sale?.date), from, to)) continue;
    const amount = Number(sale.total) || 0;
    sources.total += amount;
    const at = droppedOff.get(String(sale.pendingPaymentId || ''));
    if (at === undefined || !Number.isFinite(at)) sources.other += amount;
    else if (at >= from) sources.fromThese += amount;
    else if (at >= previousFrom) sources.fromPrevious += amount;
    else sources.fromOlder += amount;
  }
  return sources;
}

/** Bundles dropped off inside a window. */
export function bundlesBetween(store: Pick<StoreData, 'accessCode'>, from: number, to: number): LocalLaundryRecord[] {
  const accessCode = String(store.accessCode || '');
  if (!accessCode) return [];
  try {
    return shopLaundryRecords(accessCode).filter(record => inside(timeOf(record.createdAt), from, to));
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
    return shopLaundryRecords(accessCode).length;
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

export interface WaitingToCollect {
  /** Bundles not yet handed back. */
  count: number;
  /** What they are priced at, paid or not. */
  value: number;
  /** How much of that has not been paid - money not realised yet. */
  unpaid: number;
}

/**
 * Work still in the shop, and the money on it not realised yet.
 *
 * Everything not yet handed back: its price is work the shop has done or is
 * doing, and its unpaid part is money the shop has earned in effort and not in
 * cash. Different from what is owed, which also counts bundles that have
 * already left the shop unpaid.
 */
export function waitingToCollect(store: Pick<StoreData, 'accessCode' | 'pendingPayments'>): WaitingToCollect {
  const accessCode = String(store.accessCode || '');
  const none = { count: 0, value: 0, unpaid: 0 };
  if (!accessCode) return none;
  let records: LocalLaundryRecord[];
  try {
    records = shopLaundryRecords(accessCode);
  } catch {
    return none;
  }
  let count = 0;
  let value = 0;
  let unpaid = 0;
  for (const record of records) {
    if (record.workflowStage === 'collected') continue;
    count += 1;
    value += Number(record.total) || 0;
    unpaid += Math.max(0, laundryBalance(store as StoreData, record.clientRef));
  }
  return { count, value: Math.round(value), unpaid: Math.round(unpaid) };
}
