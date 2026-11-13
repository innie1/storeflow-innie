import { StoreData, Customer } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';

// ─── Customer Helpers ─────────────────────────────────────────────────────────
/**
 * The one way the app decides whether it already knows somebody.
 *
 * By phone when there is a phone, because two people share a name far more
 * often than a number. By name when there is not - which there often is not
 * now that the counter can take a bundle from a walk-in who would rather not
 * give a number.
 *
 * The empty case is the one that bites: matching '' against '' makes every
 * anonymous walk-in the same person, so a shop that served four of them would
 * find one customer with four visits. Comparing names instead keeps Musa and
 * Ngozi apart, and two different Musas with no phone between them will merge -
 * which is a smaller wrong than either losing them or inventing four people.
 */
export function matchCustomer(
  customers: Customer[] | undefined,
  who: { name?: string; phone?: string },
): Customer | undefined {
  const digits = String(who.phone || '').replace(/\D/g, '');
  const name = String(who.name || '').trim().toLowerCase();

  /*
   * Everybody by that name, whether or not they have a number.
   *
   * This used to consider only customers with no number, on the grounds that
   * "Musa with a phone" and "a walk-in called Musa" were different records.
   * That rule is what turned every number added to an existing customer into
   * a brand-new customer: the new number matched nobody, and the Musa already
   * in the book was skipped for having a number at all.
   */
  const sameName = (customers || []).filter(customer =>
    String(customer.name || '').trim().toLowerCase() === name);

  if (digits) {
    /*
     * Everybody on that number, not the first of them.
     *
     * A number can belong to more than one person - a household phone, a shop
     * line - once the counter has said so at intake. Handing back whichever
     * was recorded first would file this bundle, and its money, against the
     * wrong one of them, so the name decides between them. No name match among
     * them still means the person on that number, which is what a shop with
     * one customer per number has always had.
     */
    const onThatNumber = (customers || []).filter(customer => String(customer.phone || '').replace(/\D/g, '') === digits);
    if (onThatNumber.length) {
      const byName = onThatNumber.find(customer => String(customer.name || '').trim().toLowerCase() === name);
      return byName || onThatNumber[0];
    }
    /*
     * A number the book has never seen, for a name exactly one customer has.
     *
     * That is them: a first number, a changed number or a second phone - not
     * a second copy of the person, which splits their history and their debt.
     * Whether the new number replaces the saved one is the counter's call and
     * is asked on screen; nothing here overwrites anything. Two customers by
     * that name is a coin toss, so that still matches nobody.
     */
    if (name && sameName.length === 1) return sameName[0];
    return undefined;
  }

  if (!name) return undefined;
  /*
   * Two walk-ins called Musa Bello, neither with a number, are two people.
   * Handing back the first of them files this bundle - and its money - against
   * whichever happened to be recorded first, which is a coin toss the shop
   * cannot see and cannot undo. The counter was shown both; not choosing means
   * this is somebody new.
   */
  return sameName.length === 1 ? sameName[0] : undefined;
}

export function addCustomer(store: StoreData, customer: Omit<Customer, 'id' | 'totalPurchases' | 'outstandingDebt' | 'purchaseHistory' | 'loyaltyPoints' | 'visitsCount'>): StoreData {
  const newCust: Customer = {
    ...customer,
    id: generateId(),
    totalPurchases: 0,
    outstandingDebt: 0,
    purchaseHistory: [],
    loyaltyPoints: 0,
    visitsCount: 0
  };
  const updated = {
    ...store,
    customers: [newCust, ...(store.customers || [])]
  };
  saveStore(updated);
  return updated;
}

export function updateCustomer(store: StoreData, id: string, updates: Partial<Customer>): StoreData {
  const updated = {
    ...store,
    customers: (store.customers || []).map(c => c.id === id ? { ...c, ...updates } : c)
  };
  saveStore(updated);
  return updated;
}

export function deleteCustomer(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    customers: (store.customers || []).filter(c => c.id !== id)
  };
  saveStore(updated);
  return updated;
}
