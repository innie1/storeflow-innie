import type { Customer, StoreData } from '@/types/store';
import { isInCustomerBook, knownCustomers } from '@/lib/customer-directory';
import { getLocalLaundryRecords, setLocalLaundryCustomerIds } from '@/lib/laundry-offline';

/**
 * Putting everyone the shop has served into the customer book, once.
 *
 * The book was only ever written by two screens, so a shop that had served
 * three people could be told it had two customers - or one - depending on
 * which of them happened to be recorded after the writing was fixed. The name
 * field found all three, because it reads the work as well as the book, and
 * the dashboard counted only the book. The app contradicting itself in two
 * places is worse than either number.
 *
 * Reading around the gap everywhere it shows would mean changing the count on
 * the simple home, the full dashboard, the customer page, the export, the
 * analytics and everything Flow says about customers - and missing one. So
 * the gap is closed instead: everyone gets a real customer record with a real
 * internal id, and every bundle and debt already recorded is pointed at the
 * person it belongs to.
 *
 * Runs on load, and does nothing at all once there is nothing left to do.
 */

const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const norm = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Whether anything is unlinked, checked before doing any real work.
 *
 * This runs on every store load, and the steady state - a shop where every
 * bundle already knows whose it is - has to cost nothing.
 */
function needsBackfill(store: StoreData): boolean {
  const known = new Set((store.customers || []).map(customer => customer.id));
  const accessCode = String(store.accessCode || '');
  if (accessCode) {
    try {
      if (getLocalLaundryRecords(accessCode).some(record => record.customerName && !linkIsLive(record.customerId, known))) return true;
    } catch { /* no records on this device */ }
  }
  return (store.pendingPayments || []).some(payment => payment?.customerName && !linkIsLive(payment.customerId, known));
}

/**
 * A link is only worth keeping while the customer it names still exists.
 *
 * One pointing at a deleted customer - or at one that a half-finished earlier
 * run never actually saved - is worse than none: it looks settled, so nothing
 * ever revisits it, and the bundle belongs to nobody for good.
 */
function linkIsLive(customerId: string | undefined, known: Set<string>): boolean {
  return Boolean(customerId) && known.has(String(customerId));
}

export function backfillCustomerBook(store: StoreData, makeId: () => string): StoreData {
  if (!store || !needsBackfill(store)) return store;

  const book: Customer[] = [...(store.customers || [])];

  /*
   * Everyone the shop knows, merged the same way the counter's search merges
   * them - so a person the name field has been offering all along becomes the
   * same single record here, rather than a second copy of themselves.
   */
  for (const entry of knownCustomers(store)) {
    if (isInCustomerBook(entry)) continue;
    book.push({
      id: makeId(),
      name: entry.name,
      phone: entry.phone || '',
      address: entry.address,
      totalPurchases: 0,
      /*
       * Zero, deliberately. What they owe lives on the unpaid bundles and is
       * added up from there; copying the directory's figure onto the record
       * would have every debt counted twice.
       */
      outstandingDebt: 0,
      lastPurchaseDate: entry.lastPurchaseDate,
      purchaseHistory: [],
      loyaltyPoints: 0,
      visitsCount: 0,
    });
  }

  // Who to point a nameless old record at: by number, or by a name only one
  // person in the book answers to.
  const live = new Set(book.map(customer => customer.id));
  const byPhone = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const customer of book) {
    const phone = digits(customer.phone);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, customer.id);
    const key = norm(customer.name);
    if (key) byName.set(key, [...(byName.get(key) || []), customer.id]);
  }

  const resolve = (name: string, phone: string): string => {
    const number = digits(phone);
    const byNumber = number ? byPhone.get(number) : undefined;
    if (byNumber) return byNumber;
    // Two people by that name is not something old data can settle, and
    // guessing would move somebody's debt onto a stranger.
    const named = byName.get(norm(name)) || [];
    return named.length === 1 ? named[0] : '';
  };

  const accessCode = String(store.accessCode || '');
  if (accessCode) {
    const links: Record<string, string> = {};
    try {
      for (const record of getLocalLaundryRecords(accessCode)) {
        // A live link is the counter's own choice and is never overruled here.
        if (!record.customerName || linkIsLive(record.customerId, live)) continue;
        const id = resolve(record.customerName, record.customerPhone);
        if (id) links[record.clientRef] = id;
      }
      if (Object.keys(links).length) setLocalLaundryCustomerIds(accessCode, links);
    } catch { /* nothing to link on this device */ }
  }

  const pendingPayments = (store.pendingPayments || []).map(payment => {
    if (!payment?.customerName || linkIsLive(payment.customerId, live)) return payment;
    const id = resolve(payment.customerName, payment.customerPhone || '');
    return id ? { ...payment, customerId: id } : payment;
  });

  return { ...store, customers: book, pendingPayments };
}
