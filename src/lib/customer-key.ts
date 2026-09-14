import type { PendingPayment } from '@/types/store';

/**
 * Which customer a debt belongs to, as a key for counting and grouping.
 *
 * Debts were grouped by name everywhere. Two customers who share a name - two
 * Musa Bellos, each owing for their own bundles - were counted as one person
 * owing both amounts, "has delayed payment" added their records together, and
 * a payment from one of them was taken off both balances.
 *
 * The customer's id says who a debt belongs to. A phone number is next best,
 * and a name is the last resort, for debts recorded before either was kept.
 *
 * Deliberately imports nothing but types, so the store's own data code can
 * use it without an import loop.
 */

type DebtIdentity = Partial<Pick<PendingPayment, 'customerId' | 'customerPhone' | 'customerName'>>;

export function debtorKey(payment: DebtIdentity): string {
  const id = String(payment.customerId || '').trim();
  if (id) return `id:${id}`;

  const digits = String(payment.customerPhone || '').replace(/\D/g, '');
  // +2348012345678 and 08012345678 are one number.
  if (digits) return `phone:${digits.startsWith('234') && digits.length >= 12 ? `0${digits.slice(3)}` : digits}`;

  const name = String(payment.customerName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return name ? `name:${name}` : '';
}

/** How many different customers a set of debts belongs to. */
export function countDebtors(payments: DebtIdentity[]): number {
  return new Set(payments.map(debtorKey).filter(Boolean)).size;
}
