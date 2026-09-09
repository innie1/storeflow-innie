import { beforeEach, describe, expect, it } from 'vitest';
import { backfillCustomerBook } from '@/lib/customer-backfill';
import { getLocalLaundryRecords, laundryLocalStorageKey } from '@/lib/laundry-offline';
import type { Customer, StoreData } from '@/types/store';

/**
 * Putting everyone the shop has served into the customer book.
 *
 * The book was written by two screens only, so a shop that had served three
 * people was told it had two - or one - depending on which of them happened to
 * be recorded after that was fixed. The name field found all three, because it
 * reads the work as well as the book; the dashboard counted only the book. The
 * app contradicting itself in two places is worse than either number.
 */

const CODE = 'BACK01';
let counter = 0;
const makeId = () => `made-${++counter}`;

const store = (extra: Partial<StoreData> = {}): StoreData => ({
  storeName: 'Shine Laundry',
  accessCode: CODE,
  products: [],
  sales: [],
  createdAt: new Date().toISOString(),
  ...extra,
} as StoreData);

const bookCustomer = (id: string, name: string, phone: string): Customer => ({
  id, name, phone,
  totalPurchases: 0, outstandingDebt: 0, purchaseHistory: [], loyaltyPoints: 0, visitsCount: 0,
} as Customer);

const job = (clientRef: string, name: string, phone: string, customerId?: string) => ({
  clientRef, accessCode: CODE, tagCode: `LT-${clientRef}`,
  customerId, customerName: name, customerPhone: phone,
  serviceId: 's1', serviceName: 'Wash', pricing: 'per_kg', billingQuantity: 1,
  total: 1000, notes: '', garments: [], pieceCount: 0, garmentSummary: '',
  createdAt: '2026-09-08T09:00:00.000Z',
});

const debt = (id: string, name: string, phone: string, customerId?: string) => ({
  id, customerId, customerName: name, customerPhone: phone,
  items: [], total: 1000, paid: 0, balance: 1000,
  createdAt: '2026-09-08T09:00:00.000Z', status: 'pending' as const, events: [], saleIds: [],
});

const seedJobs = (records: any[]) =>
  localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify(records));

beforeEach(() => { localStorage.clear(); counter = 0; });

describe('everyone served becomes a customer', () => {
  it('gives a walk-in with no number a real customer record', () => {
    seedJobs([job('a', 'Musa Bello', '')]);
    const after = backfillCustomerBook(store(), makeId);
    expect(after.customers).toHaveLength(1);
    expect(after.customers?.[0].name).toBe('Musa Bello');
  });

  it('counts three people as three, not as however many reached the book', () => {
    // The reported case, exactly: three bundles, three names, a dashboard
    // saying two.
    seedJobs([job('a', 'mee', ''), job('b', 'bnsjb', ''), job('c', 'fdbklij', '')]);
    expect(backfillCustomerBook(store(), makeId).customers).toHaveLength(3);
  });

  it('does not make a second copy of somebody already in the book', () => {
    seedJobs([job('a', 'Ada Nwosu', '08099887766')]);
    const after = backfillCustomerBook(store({ customers: [bookCustomer('CUST-1', 'Ada Nwosu', '08099887766')] }), makeId);
    expect(after.customers).toHaveLength(1);
    expect(after.customers?.[0].id).toBe('CUST-1');
  });

  it('picks up somebody who only exists on a debt', () => {
    const after = backfillCustomerBook(store({ pendingPayments: [debt('p1', 'Ngozi Eze', '')] as any }), makeId);
    expect(after.customers?.map(entry => entry.name)).toContain('Ngozi Eze');
  });

  it('leaves what they owe on the bundle rather than copying it onto them', () => {
    /*
     * Debt is added up from the unpaid bundles. Writing the same figure onto
     * the customer record too would have every shop's debts doubled overnight.
     */
    const after = backfillCustomerBook(store({ pendingPayments: [debt('p1', 'Ngozi Eze', '')] as any }), makeId);
    expect(after.customers?.[0].outstandingDebt).toBe(0);
  });
});

describe('old work gets pointed at the right person', () => {
  it('links a bundle to the customer it made', () => {
    seedJobs([job('a', 'Musa Bello', '')]);
    const after = backfillCustomerBook(store(), makeId);
    const linked = getLocalLaundryRecords(CODE)[0];
    expect(linked.customerId).toBe(after.customers?.[0].id);
  });

  it('links the debt too, so it lands on one person', () => {
    seedJobs([job('a', 'Musa Bello', '')]);
    const after = backfillCustomerBook(store({ pendingPayments: [debt('laundry-a', 'Musa Bello', '')] as any }), makeId);
    expect(after.pendingPayments?.[0].customerId).toBe(after.customers?.[0].id);
  });

  it('will not point old work at one of two people sharing a name', () => {
    /*
     * Nothing in an old record can settle which Musa it was, and guessing
     * moves somebody's debt onto a stranger. Left unlinked, it still behaves
     * as it did before - matched by name - which is no worse than today.
     */
    seedJobs([job('a', 'Musa Bello', '')]);
    const after = backfillCustomerBook(store({
      customers: [bookCustomer('CUST-1', 'Musa Bello', ''), bookCustomer('CUST-2', 'Musa Bello', '')],
    }), makeId);
    expect(getLocalLaundryRecords(CODE)[0].customerId).toBeUndefined();
    expect(after.customers).toHaveLength(2);
  });

  it('never overrules a link the counter already made', () => {
    seedJobs([job('a', 'Musa Bello', '08012345678', 'CHOSEN')]);
    backfillCustomerBook(store({
      customers: [bookCustomer('CHOSEN', 'Musa Bello', ''), bookCustomer('CUST-1', 'Musa Bello', '08012345678')],
    }), makeId);
    expect(getLocalLaundryRecords(CODE)[0].customerId).toBe('CHOSEN');
  });

  it('repairs a link pointing at a customer who is gone', () => {
    /*
     * Worse than no link: it looks settled, so nothing ever revisits it and
     * the bundle belongs to nobody for good. It happens when a customer is
     * deleted, and it happened to me writing this - the links were written
     * while the customer records that went with them were not.
     */
    seedJobs([job('a', 'Ada Nwosu', '08099887766', 'DELETED')]);
    const after = backfillCustomerBook(store(), makeId);
    const live = getLocalLaundryRecords(CODE)[0].customerId;
    expect(live).not.toBe('DELETED');
    expect(after.customers?.map(entry => entry.id)).toContain(live);
  });
});

describe('it stops once there is nothing to do', () => {
  it('hands back the very same store when every bundle knows whose it is', () => {
    seedJobs([job('a', 'Musa Bello', '', 'CUST-1')]);
    // The link has to name somebody who exists, or there is still work to do.
    const before = store({ customers: [bookCustomer('CUST-1', 'Musa Bello', '')] });
    // Identity, not equality: this runs on every load and must cost nothing.
    expect(backfillCustomerBook(before, makeId)).toBe(before);
  });

  it('is safe to run twice', () => {
    seedJobs([job('a', 'Musa Bello', '')]);
    const once = backfillCustomerBook(store(), makeId);
    const twice = backfillCustomerBook(once, makeId);
    expect(twice.customers).toHaveLength(1);
  });

  it('does nothing for a shop with no work recorded', () => {
    const empty = store();
    expect(backfillCustomerBook(empty, makeId)).toBe(empty);
  });

  it('survives a device with no laundry storage at all', () => {
    const retail = store({ accessCode: '' , pendingPayments: [debt('p1', 'Buyer', '08011112222')] as any });
    expect(backfillCustomerBook(retail, makeId).customers).toHaveLength(1);
  });
});
