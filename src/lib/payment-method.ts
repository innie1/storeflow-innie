/**
 * Cash or transfer, without anybody typing it.
 *
 * A laundry payment recorded only an amount, so the shop could not say how
 * much of a week's money was in the drawer and how much was in the bank - the
 * figure an owner needs to reconcile either one.
 *
 * The app cannot see a bank account or a hand, so it cannot know by itself
 * how somebody paid. What it can do is make telling it free: wherever money
 * is taken there are two buttons instead of one, "Cash" and "Transfer", so
 * choosing is the same tap that recorded the payment before. Where an amount
 * is typed, the likely answer is already picked:
 *
 *   - change was given: it was cash, and nothing is asked;
 *   - otherwise how this customer paid last time;
 *   - otherwise how the shop is usually paid.
 *
 * Money recorded before this was kept has no method. It is shown as "not
 * recorded" rather than being called cash, because guessing it would make the
 * drawer look fuller than it ever was.
 */

import type { PaymentMethod, Sale, StoreData } from '@/types/store';

/** How money is handed over at a counter. POS is the bank's side, with transfer. */
export type CounterMethod = 'cash' | 'transfer';

export interface ReceivedByMethod {
  cash: number;
  /** Bank transfer and POS: money that never touched the drawer. */
  transfer: number;
  /** Payments from before the method was kept. */
  notRecorded: number;
  total: number;
}

function timeOf(value: unknown): number {
  const at = new Date(String(value || '')).getTime();
  return Number.isFinite(at) ? at : 0;
}

/** One payment's money, by where it went. */
function splitSale(sale: Pick<Sale, 'total' | 'paymentMethod' | 'paymentAllocation'>): { cash: number; transfer: number; notRecorded: number } {
  const amount = Number(sale.total) || 0;
  const method = sale.paymentMethod as PaymentMethod | undefined;
  if (!method) return { cash: 0, transfer: 0, notRecorded: amount };
  if (method === 'cash') return { cash: amount, transfer: 0, notRecorded: 0 };
  if (method === 'mixed') {
    const split = sale.paymentAllocation;
    // A mixed payment with no split kept cannot be divided honestly.
    if (!split) return { cash: 0, transfer: 0, notRecorded: amount };
    return { cash: Number(split.cash) || 0, transfer: Number(split.bank) || 0, notRecorded: 0 };
  }
  return { cash: 0, transfer: amount, notRecorded: 0 };
}

/** Money received in a stretch, by how it was paid. The parts add up to the total. */
export function receivedByMethod(store: Pick<StoreData, 'sales'>, from: number, to: number): ReceivedByMethod {
  const out: ReceivedByMethod = { cash: 0, transfer: 0, notRecorded: 0, total: 0 };
  for (const sale of store.sales || []) {
    const at = timeOf(sale?.date);
    if (!(at >= from && at < to)) continue;
    const part = splitSale(sale);
    out.cash += part.cash;
    out.transfer += part.transfer;
    out.notRecorded += part.notRecorded;
    out.total += Number(sale.total) || 0;
  }
  return out;
}

const digits = (value: unknown) => String(value || '').replace(/\D/g, '').replace(/^234/, '0');

/**
 * How a payment is most likely being made, so the right button is already lit.
 *
 * The customer's own last payment first: somebody who transfers tends to
 * transfer. Then the shop's habit over its recent payments. Cash when nothing
 * is known, because that is what a counter takes when nobody says otherwise.
 */
export function likelyMethod(
  store: Pick<StoreData, 'sales' | 'pendingPayments'>,
  customer: { customerId?: string; phone?: string } = {},
  now: number = Date.now(),
): CounterMethod {
  const known = (store.sales || [])
    .filter(sale => sale.paymentMethod === 'cash' || sale.paymentMethod === 'transfer' || sale.paymentMethod === 'pos')
    .map(sale => ({ sale, at: timeOf(sale.date) }))
    .sort((a, b) => b.at - a.at);
  if (!known.length) return 'cash';
  const side = (sale: Sale): CounterMethod => (sale.paymentMethod === 'cash' ? 'cash' : 'transfer');

  const phone = digits(customer.phone);
  if (customer.customerId || phone) {
    const debts = new Map((store.pendingPayments || []).map(entry => [entry.id, entry]));
    const theirs = known.find(({ sale }) => {
      const debt = sale.pendingPaymentId ? debts.get(sale.pendingPaymentId) : undefined;
      const id = sale.customerId || debt?.customerId;
      if (customer.customerId && id && String(id) === String(customer.customerId)) return true;
      return !!phone && digits(debt?.customerPhone) === phone;
    });
    if (theirs) return side(theirs.sale);
  }

  // The shop's habit: the last thirty payments it has a method for, within ninety days.
  const recent = known.filter(entry => now - entry.at < 90 * 86400000).slice(0, 30);
  if (!recent.length) return 'cash';
  const transfers = recent.filter(entry => side(entry.sale) === 'transfer').length;
  return transfers > recent.length / 2 ? 'transfer' : 'cash';
}

/** "Cash" / "Transfer", for a button or a line of a report. */
export function methodLabel(method: CounterMethod): string {
  return method === 'cash' ? 'Cash' : 'Transfer';
}
