import { beforeEach, describe, expect, it } from 'vitest';
import { knownCustomers, isInCustomerBook } from '@/lib/customer-directory';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { suggestCustomers } from '@/lib/customer-suggest';
import type { Customer, StoreData } from '@/types/store';

/**
 * Finding a customer who is plainly in the app.
 *
 * A shop could see somebody on the analysis page, on the day board and in the
 * debt list, then type their name at intake and be offered nothing - because
 * that field read the customer book, and only two screens in the app ever
 * wrote to it. Every bundle taken in without a phone number, every credit sale,
 * every storefront order named somebody the name field could not find.
 *
 * The real cost is not the typing. Typing the name again creates a second
 * person, which splits their history and loses what they owed.
 */

const CODE = 'LAUN01';

const store = (extra: Partial<StoreData> = {}): StoreData => ({
  storeName: 'Shine Laundry',
  accessCode: CODE,
  products: [],
  sales: [],
  createdAt: new Date().toISOString(),
  ...extra,
} as StoreData);

const bookCustomer = (name: string, phone: string, extra: Partial<Customer> = {}): Customer => ({
  id: `book-${name.toLowerCase().replace(/\W/g, '')}`,
  name,
  phone,
  totalPurchases: 0,
  outstandingDebt: 0,
  purchaseHistory: [],
  loyaltyPoints: 0,
  visitsCount: 0,
  ...extra,
} as Customer);

const job = (name: string, phone: string, createdAt = '2026-09-01T09:00:00.000Z') => ({
  clientRef: `ref-${name}-${phone}-${createdAt}`,
  accessCode: CODE,
  tagCode: 'LT-001',
  customerName: name,
  customerPhone: phone,
  serviceId: 's1',
  serviceName: 'Wash and iron',
  pricing: 'per_kg',
  billingQuantity: 1,
  total: 2000,
  notes: '',
  garments: [],
  pieceCount: 0,
  garmentSummary: '',
  createdAt,
});

const seedJobs = (records: any[]) =>
  localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify(records));

const debt = (name: string, phone: string, balance: number, createdAt = '2026-09-02T09:00:00.000Z') => ({
  id: `laundry-${name}`,
  customerName: name,
  customerPhone: phone,
  items: [],
  total: balance,
  paid: 0,
  balance,
  createdAt,
  status: 'pending' as const,
  events: [],
  saleIds: [],
});

beforeEach(() => localStorage.clear());

describe('everyone the shop has named', () => {
  it('offers a customer who only ever appeared on a bundle', () => {
    // The exact case: an order recorded without a phone number, so the book
    // never heard of them - but the shop has seen them all week.
    seedJobs([job('Musa Bello', '')]);
    const names = knownCustomers(store()).map(entry => entry.name);
    expect(names).toContain('Musa Bello');
  });

  it('offers somebody who is only in the debt list', () => {
    const names = knownCustomers(store({ pendingPayments: [debt('Ngozi Eze', '', 1500)] as any }))
      .map(entry => entry.name);
    expect(names).toContain('Ngozi Eze');
  });

  it('offers somebody who only ever ordered through the storefront', () => {
    const withOrders = store();
    (withOrders as any).orders = [
      { id: 'o1', customer_name: 'Tola Ade', customer_phone: '08033334444', created_at: '2026-09-03T09:00:00.000Z' },
    ];
    expect(knownCustomers(withOrders).map(entry => entry.name)).toContain('Tola Ade');
  });

  it('still offers the customer book itself', () => {
    const found = knownCustomers(store({ customers: [bookCustomer('Ada Nwosu', '08099887766')] }));
    expect(found.map(entry => entry.name)).toEqual(['Ada Nwosu']);
  });

  it('does not invent anybody from a blank name', () => {
    seedJobs([job('', '08012345678'), job('   ', '')]);
    expect(knownCustomers(store())).toHaveLength(0);
  });
});

describe('one person, not several', () => {
  it('counts a bundle and a book entry with the same number as one customer', () => {
    seedJobs([job('Ada Nwosu', '08099887766')]);
    const found = knownCustomers(store({ customers: [bookCustomer('Ada Nwosu', '08099887766')] }));
    expect(found).toHaveLength(1);
    // The book's own id survives, so picking still saves against the customer
    // that already exists rather than making a second one.
    expect(found[0].id).toBe('book-adanwosu');
  });

  it('counts ten bundles from the same person once', () => {
    seedJobs([job('Musa Bello', ''), job('Musa Bello', ''), job('musa  bello', '')]);
    expect(knownCustomers(store())).toHaveLength(1);
  });

  it('treats a bundle with no number as the one person already known by that name', () => {
    seedJobs([job('Ada Nwosu', '')]);
    const found = knownCustomers(store({ customers: [bookCustomer('Ada Nwosu', '08099887766')] }));
    expect(found).toHaveLength(1);
    expect(found[0].phone).toBe('08099887766');
  });

  it('refuses to guess when two people share a name', () => {
    // Two Musas with different numbers. A nameless bundle could be either, and
    // guessing sends somebody else's clothes message to the wrong phone.
    seedJobs([job('Musa Bello', '')]);
    const found = knownCustomers(store({
      customers: [bookCustomer('Musa Bello', '08011112222'), { ...bookCustomer('Musa Bello', '08033334444'), id: 'book-musa2' }],
    }));
    expect(found).toHaveLength(2);
    expect(found.every(entry => isInCustomerBook(entry))).toBe(true);
  });

  it('fills in a number for the one person we had no number for', () => {
    seedJobs([job('Ada Nwosu', '08099887766')]);
    const found = knownCustomers(store({ customers: [bookCustomer('Ada Nwosu', '')] }));
    expect(found).toHaveLength(1);
    expect(found[0].phone).toBe('08099887766');
  });

  it('does not attach a number when two people by that name have none', () => {
    seedJobs([job('Musa Bello', '08055556666')]);
    const found = knownCustomers(store({
      customers: [bookCustomer('Musa Bello', ''), { ...bookCustomer('Musa Bello', ''), id: 'book-musa2' }],
    }));
    // A third row rather than a wrong number on one of the two.
    expect(found).toHaveLength(3);
    expect(found.filter(entry => entry.phone === '08055556666')).toHaveLength(1);
  });

  it('never touches the store it was given', () => {
    seedJobs([job('Ada Nwosu', '08099887766')]);
    const book = [bookCustomer('Ada Nwosu', '')];
    knownCustomers(store({ customers: book }));
    expect(book[0].phone).toBe('');
  });
});

describe('who comes first', () => {
  it('puts the person seen most recently at the top', () => {
    seedJobs([
      job('Old Customer', '08000000001', '2026-01-01T09:00:00.000Z'),
      job('Yesterday Customer', '08000000002', '2026-09-05T09:00:00.000Z'),
    ]);
    expect(knownCustomers(store())[0].name).toBe('Yesterday Customer');
  });

  it('gives the same person the same id every time', () => {
    seedJobs([job('Musa Bello', '')]);
    const first = knownCustomers(store())[0].id;
    const second = knownCustomers(store())[0].id;
    expect(first).toBe(second);
  });
});

describe('what they owe', () => {
  it('shows a laundry debt that never reaches the customer book', () => {
    // Laundry debt lives in pendingPayments; Customer.outstandingDebt is a
    // retail field nothing in the laundry ever sets, so the counter was told
    // everybody owed nothing.
    seedJobs([job('Musa Bello', '08077778888')]);
    const found = knownCustomers(store({ pendingPayments: [debt('Musa Bello', '08077778888', 3000)] as any }));
    expect(found).toHaveLength(1);
    expect(found[0].outstandingDebt).toBe(3000);
  });

  it('adds a shop debt to a laundry one rather than replacing it', () => {
    const found = knownCustomers(store({
      customers: [bookCustomer('Ada Nwosu', '08099887766', { outstandingDebt: 500 })],
      pendingPayments: [debt('Ada Nwosu', '08099887766', 2000)] as any,
    }));
    expect(found[0].outstandingDebt).toBe(2500);
  });
});

describe('the counter can find them by typing', () => {
  it('suggests a bundle-only customer as the name is typed', () => {
    seedJobs([job('Musa Bello', '')]);
    const matches = suggestCustomers(knownCustomers(store()), 'Mus');
    expect(matches.map(match => match.customer.name)).toEqual(['Musa Bello']);
  });

  it('suggests them by phone number too', () => {
    seedJobs([job('Musa Bello', '08077778888')]);
    const matches = suggestCustomers(knownCustomers(store()), '0807777');
    expect(matches[0].customer.name).toBe('Musa Bello');
  });
});
