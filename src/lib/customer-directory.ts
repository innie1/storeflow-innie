import type { Customer, StoreData } from '@/types/store';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';
import { owedByCustomer } from '@/lib/flow-service-brain';

/**
 * Everyone this shop has ever named, in one list.
 *
 * The customer book is not the only place a shop learns a name. A laundry
 * bundle carries one. So does a credit sale, and an order placed through the
 * storefront. Only two screens in the whole app ever wrote to the book, so
 * somebody taken in over the counter before that was true - or named on a
 * debt, or on an online order - existed everywhere except the one place that
 * offers them back: the name field.
 *
 * The shape that caused it is worth stating plainly. A shop would see a
 * customer on the analysis page, on the day board, in the debt list, and then
 * type their name at intake and be offered nothing, because that field read
 * the book alone. From the counter it looks like the app forgot somebody it is
 * visibly still showing.
 *
 * So this reads every source and returns one merged list. Nothing is written:
 * the book fills itself the next time that person is actually served, which is
 * the moment we know they are real rather than a stale row.
 */

/** A name we found somewhere, and when. */
interface Sighting {
  /** Which customer, when whatever we found it on said so outright. */
  customerId?: string;
  name: string;
  phone: string;
  address?: string;
  at: number;
}

const norm = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');

function time(value: unknown): number {
  const parsed = new Date(String(value || '')).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Orders from the storefront, read loosely on purpose.
 *
 * They arrive from the customer app and from Supabase under several spellings
 * depending on how old the row is, and none of them is declared on StoreData.
 * A name we cannot read is a customer the counter cannot find, so it is worth
 * trying all of them rather than being strict.
 */
function onlineOrders(store: StoreData): Record<string, any>[] {
  const root = store as Record<string, any>;
  const nested = root.data || {};
  for (const key of ['orders', 'customerOrders', 'customer_orders']) {
    if (Array.isArray(root[key])) return root[key];
    if (Array.isArray(nested[key])) return nested[key];
  }
  return [];
}

/** Every name the shop holds outside the book, with the day it was last used. */
function sightings(store: StoreData): Sighting[] {
  const found: Sighting[] = [];

  const accessCode = String(store.accessCode || '');
  if (accessCode) {
    // Wrapped: a device with no storage still has a book worth showing.
    try {
      for (const record of getLocalLaundryRecords(accessCode)) {
        const name = String(record.customerName || '').trim();
        if (!name) continue;
        found.push({
          customerId: record.customerId,
          name,
          phone: digits(record.customerPhone),
          address: String(record.customerAddress || '').trim() || undefined,
          at: time(record.createdAt),
        });
      }
    } catch { /* no records on this device */ }
  }

  for (const payment of store.pendingPayments || []) {
    const name = String(payment?.customerName || '').trim();
    if (!name) continue;
    found.push({
      customerId: payment.customerId,
      name,
      phone: digits(payment.customerPhone),
      at: time(payment.createdAt),
    });
  }

  for (const order of onlineOrders(store)) {
    const name = String(order?.customer_name || order?.customerName || '').trim();
    if (!name) continue;
    found.push({
      name,
      phone: digits(order.customer_phone || order.customerPhone),
      at: time(order.created_at || order.createdAt || order.date),
    });
  }

  return found;
}

/**
 * The book, plus everyone else the shop knows, newest first.
 *
 * Book entries keep their own id, so picking one still saves against the
 * customer that already exists. Anyone found elsewhere gets a stable made-up
 * id - the same one every time, so the list does not reshuffle under a finger
 * mid-tap.
 *
 * The debt on every entry here is the whole picture, pending payments
 * included, because a laundry's debt never touches Customer.outstandingDebt.
 * Do not pass one of these back through owedByCustomer: it is already counted.
 */
export function knownCustomers(store: StoreData): Customer[] {
  const entries: Customer[] = [];
  const byPhone = new Map<string, Customer>();
  const byName = new Map<string, Customer[]>();
  const lastSeen = new Map<string, number>();

  const remember = (customer: Customer, at: number) => {
    lastSeen.set(customer.id, Math.max(lastSeen.get(customer.id) || 0, at));
  };

  const index = (customer: Customer, at: number) => {
    entries.push(customer);
    const phone = digits(customer.phone);
    if (phone) byPhone.set(phone, customer);
    const key = norm(customer.name);
    byName.set(key, [...(byName.get(key) || []), customer]);
    remember(customer, at);
  };

  for (const customer of store.customers || []) {
    if (!customer || !String(customer.name || '').trim()) continue;
    // A copy: the phone may be filled in below from a job that knew it, and
    // the shop's saved book is not ours to edit.
    index({ ...customer }, time(customer.lastPurchaseDate));
  }

  const byId = new Map(entries.map(entry => [entry.id, entry]));

  for (const seen of sightings(store)) {
    /*
     * When the job says whose it is, that settles it. Nothing below needs to
     * run: no matching by number, no matching by name, and no refusing to
     * choose between two people called Musa Bello - the bundle already knows
     * which of them it belongs to.
     */
    if (seen.customerId) {
      const owner = byId.get(seen.customerId);
      if (owner) {
        remember(owner, seen.at);
        continue;
      }
      // Named a customer who is no longer in the book. Fall through and treat
      // it as any other sighting rather than losing the person entirely.
    }

    if (seen.phone) {
      const sameNumber = byPhone.get(seen.phone);
      if (sameNumber) {
        remember(sameNumber, seen.at);
        continue;
      }

      /*
       * A number for somebody we had no number for.
       *
       * Only when exactly one entry by that name is missing one. Two Musas
       * with no numbers between them is a coin toss, and putting a stranger's
       * number against the wrong Musa sends their clothes' message to
       * somebody else.
       */
      const nameless = (byName.get(norm(seen.name)) || []).filter(entry => !digits(entry.phone));
      if (nameless.length === 1) {
        nameless[0].phone = seen.phone;
        if (!nameless[0].address && seen.address) nameless[0].address = seen.address;
        byPhone.set(seen.phone, nameless[0]);
        remember(nameless[0], seen.at);
        continue;
      }

      index(fromSighting(seen, `known:phone:${seen.phone}`), seen.at);
      continue;
    }

    const sameName = byName.get(norm(seen.name)) || [];
    if (sameName.length === 1) {
      // One person by that name already: a bundle taken in without a number
      // is that person, not a second copy of them.
      remember(sameName[0], seen.at);
      continue;
    }
    if (sameName.length > 1) continue; // Ambiguous, and already on the list twice.

    index(fromSighting(seen, `known:name:${norm(seen.name)}`), seen.at);
  }

  /*
   * Most recently dealt with first. The suggestion list shows five, so a
   * regular who was here yesterday has to beat somebody from last year -
   * otherwise the counter scrolls, and scrolling is what makes an attendant
   * type the name again and split the customer in two.
   */
  return entries
    .map(entry => {
      const seen = lastSeen.get(entry.id) || 0;
      return {
        ...entry,
        outstandingDebt: owedByCustomer(store, entry),
        /*
         * When they were last dealt with, wherever that was.
         *
         * Carried on the entry because it is what tells two people with the
         * same name apart. "Musa Bello, last order 2 Sep, no phone" and "Musa
         * Bello, last order 7 Sep, owes ₦1,500" are visibly two people; two
         * bare "Musa Bello" rows are a coin toss.
         */
        lastPurchaseDate: seen ? new Date(seen).toISOString() : entry.lastPurchaseDate,
      };
    })
    .sort((a, b) => (lastSeen.get(b.id) || 0) - (lastSeen.get(a.id) || 0));
}

function fromSighting(seen: Sighting, id: string): Customer {
  return {
    id,
    name: seen.name,
    phone: seen.phone,
    address: seen.address,
    totalPurchases: 0,
    outstandingDebt: 0,
    purchaseHistory: [],
    loyaltyPoints: 0,
    visitsCount: 0,
  };
}

/** Whether an entry came from the book or was pieced together from work. */
export function isInCustomerBook(customer: Pick<Customer, 'id'>): boolean {
  return !String(customer.id || '').startsWith('known:');
}
