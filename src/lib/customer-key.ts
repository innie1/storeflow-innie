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

/** 0803… and +234803… are one number. */
export function localNumber(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('234') && digits.length >= 12 ? `0${digits.slice(3)}` : digits;
}

/** "ada obi" and "Ada  Obi" are one name. */
export function sameName(one: string, other: string): boolean {
  const norm = (value: string) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(one).length > 0 && norm(one) === norm(other);
}

interface NamedCustomer { id: string; name?: string; phone?: string }

export interface SharedNumber<T extends NamedCustomer> {
  /** Everybody the book already holds on that number. */
  holders: T[];
  /** Their names, for the question: "Ada Obi" or "Chidi Eze and Ada Obi". */
  savedName: string;
  many: boolean;
}

/**
 * Who already answers to this number, when the name says somebody else.
 *
 * A number the book held used to decide who a bundle belonged to on its own,
 * so a household phone or a shop line filed the second person's clothes - and
 * their debt - against the first person. Nothing in the data can tell that
 * apart from a regular whose name was typed differently today, so the counter
 * is asked. Null when there is nothing to ask about: no number worth matching,
 * nobody on it, or somebody on it by that very name.
 */
export function peopleOnThisNumber<T extends NamedCustomer>(
  book: T[] | undefined,
  phone: string,
  typedName: string,
): SharedNumber<T> | null {
  const typed = localNumber(phone);
  const name = String(typedName || '').trim();
  if (!name || typed.length < 7) return null;

  const holders = (book || []).filter(entry => localNumber(String(entry.phone || '')) === typed);
  if (!holders.length) return null;
  if (holders.some(entry => sameName(String(entry.name || ''), name))) return null;

  const names = holders.map(entry => String(entry.name || '').trim()).filter(Boolean);
  return {
    holders,
    savedName: names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : names[0] || 'someone else',
    many: names.length > 1,
  };
}
