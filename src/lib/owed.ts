/**
 * What counts as a debt.
 *
 * Every unpaid balance used to be "owed". A laundry writes a balance the
 * moment a bundle is dropped off, so a customer whose clothes were still in
 * the wash - who had done nothing but leave them, and would pay when they came
 * back - was listed as a debtor, counted in "money owed", chased by Flow's
 * advice and marked overdue the day their clothes were promised. A shop that
 * takes payment at collection was told most of its customers were in debt.
 *
 * It is a debt when the customer has the goods and the shop does not have the
 * money. So there are two piles, and every screen reads them from here:
 *
 *   Owed                 - the work was handed over and is not fully paid.
 *                          This is the money to chase.
 *   To pay on collection - the clothes are still in the shop. The shop holds
 *                          them; nothing is late, and nothing is owed yet.
 *
 * Anything that is not work the shop is holding - a credit sale, a service
 * already given - is owed from the start, as it always was.
 */

import type { PendingPayment, StoreData } from '@/types/store';
import { shopLaundryRecords } from '@/lib/shop-laundry';

/** The name for a balance on work still in the shop. */
export const PAY_ON_COLLECTION = 'To pay on collection';

/** The balances that belong to bundles the shop still holds. */
export function heldBundleDebtIds(store: Pick<StoreData, 'accessCode'>): Set<string> {
  const held = new Set<string>();
  const accessCode = String(store.accessCode || '');
  if (!accessCode) return held;
  try {
    for (const record of shopLaundryRecords(accessCode)) {
      if (record.workflowStage !== 'collected') held.add(`laundry-${record.clientRef}`);
    }
  } catch { /* no bundles readable: every balance stays a debt, as before */ }
  return held;
}

export interface OwedSplit {
  /** Handed over and not fully paid. */
  debts: PendingPayment[];
  /** Still in the shop, to be paid when it is collected. */
  onCollection: PendingPayment[];
  debtTotal: number;
  onCollectionTotal: number;
}

/** Every open balance, in the pile it belongs to. */
export function splitOwed(store: Pick<StoreData, 'accessCode' | 'pendingPayments'>): OwedSplit {
  const held = heldBundleDebtIds(store);
  const debts: PendingPayment[] = [];
  const onCollection: PendingPayment[] = [];
  for (const payment of store.pendingPayments || []) {
    if (payment.status !== 'pending') continue;
    (held.has(payment.id) ? onCollection : debts).push(payment);
  }
  const sum = (list: PendingPayment[]) => list.reduce((total, payment) => total + Math.max(0, Number(payment.balance) || 0), 0);
  return { debts, onCollection, debtTotal: sum(debts), onCollectionTotal: sum(onCollection) };
}
