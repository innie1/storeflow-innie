import type { StoreData } from '@/types/store';
import { money, packSize } from './inventory-sale-math';
export interface ReconciliationIssue { id: string; record: string; issue: string; fix: string }
/** Read-only: incomplete historical evidence must never become an invented correction. */
export function inspectStoreRecords(store: StoreData): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const add = (id: string, record: string, issue: string, fix: string) => issues.push({ id, record, issue, fix });
  const saleIds = new Set<string>();
  const products = new Map(store.products.map(p => [p.id, p]));
  const payments = new Map((store.pendingPayments || []).map(p => [p.id, p]));
  for (const p of store.products) {
    const pieces = p.quantity * packSize(p);
    if (!Number.isFinite(p.quantity) || p.quantity < 0 || (packSize(p) > 1 && Math.abs(pieces - Math.round(pieces)) > 0.000001)) {
      add(`stock-${p.id}`, p.name, `Recorded stock (${p.quantity}) does not represent valid whole pieces.`, 'Count physical stock, then enter the count in Inventory. Do not round old balances without counting.');
    }
  }
  for (const sale of store.sales) {
    if (saleIds.has(sale.id)) add(`duplicate-${sale.id}`, sale.productName, 'Duplicate sale ID.', 'Compare receipts and payment evidence before reversing the duplicate.');
    saleIds.add(sale.id);
    if (!products.has(sale.productId) && !sale.pendingPaymentId?.startsWith('laundry-')) add(`product-${sale.id}`, sale.productName, 'The original product is missing.', 'Restore the archived product or recover it from a backup.');
    if (sale.pendingPaymentId && !payments.has(sale.pendingPaymentId) && !sale.pendingPaymentId.startsWith('laundry-')) add(`payment-${sale.id}`, sale.productName, 'The linked debt record is missing.', 'Recover the debt record from a backup and verify payments against the receipt.');
    if (!Number.isFinite(sale.total) || sale.total < 0) add(`total-${sale.id}`, sale.productName, 'Invalid sale total.', 'Compare the original receipt and correct the transaction.');
    if (sale.paymentMethod === 'mixed' && !sale.paymentAllocation) add(`split-${sale.id}`, sale.productName, 'Historical mixed payment has no recorded cash/bank split.', 'Check the cashbook and bank statement before adjusting balances.');
  }
  for (const p of store.pendingPayments || []) {
    const expected = money(Math.max(0, p.total - p.paid - (p.writtenOffAmount || 0)));
    if (!Number.isFinite(p.paid) || p.paid < 0 || p.paid > p.total || Math.abs(expected - p.balance) > 0.009) add(`balance-${p.id}`, p.customerName, `Recorded debt balance (${p.balance}) does not match total less payments and write-offs (${expected}).`, 'Verify the payment history before correcting the debt balance.');
    if ((p.events || []).length && Math.abs(money(p.events.reduce((sum, e) => sum + e.amount, 0)) - p.paid) > 0.009) add(`events-${p.id}`, p.customerName, 'Payment history does not add up to the recorded amount paid.', 'Compare payment receipts and bank/cash records to recover missing or duplicate payments.');
    if (!(p.id.startsWith('laundry-')) && (p.saleIds || []).some(id => !saleIds.has(id))) add(`links-${p.id}`, p.customerName, 'Some sales linked to this debt are missing.', 'Recover the missing sale from a backup; do not create a second payment.');
  }
  for (const c of store.customers || []) {
    const linked = (store.pendingPayments || []).filter(p => p.customerId === c.id);
    const ambiguous = (store.pendingPayments || []).some(p => !p.customerId && (p.customerName.toLowerCase() === c.name.toLowerCase() || (!!p.customerPhone && p.customerPhone === c.phone)));
    if (linked.length && !ambiguous) {
      const balance = money(linked.reduce((sum, p) => sum + p.balance, 0));
      if (Math.abs(c.outstandingDebt - balance) > 0.009) add(`customer-${c.id}`, c.name, `Customer debt (${c.outstandingDebt}) differs from linked invoices (${balance}).`, 'Check for older unlinked invoices before correcting the customer balance.');
    }
  }
  return issues;
}
