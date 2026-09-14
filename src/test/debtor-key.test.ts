import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { countDebtors, debtorKey } from '@/lib/customer-key';
import { addPaymentToPending, getPendingSummary } from '@/lib/store-data';
import { serviceSnapshot } from '@/lib/flow-service-brain';

/**
 * Counting who owes by who they are, not by what they are called.
 *
 * Debts were grouped by name, so two customers who share one - two Musa
 * Bellos, each owing for their own bundles - showed as "1 customer" owing the
 * total, and a payment from one was taken off both balances.
 */

const debt = (id: string, over: Record<string, unknown> = {}) => ({
  id, customerName: 'Musa Bello', customerPhone: '',
  items: [], total: 1_000, paid: 0, balance: 1_000,
  createdAt: new Date().toISOString(), status: 'pending', events: [], saleIds: [],
  ...over,
});

const shop = (over: Partial<StoreData> = {}): StoreData => ({
  storeName: 'Shine', accessCode: 'DEBT01', storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], pendingPayments: [], expenses: [],
  createdAt: new Date(0).toISOString(),
  ...over,
} as unknown as StoreData);

beforeEach(() => localStorage.clear());

describe('who a debt belongs to', () => {
  it('counts two customers who share a name as two people', () => {
    expect(countDebtors([debt('a', { customerId: 'CUST-1' }), debt('b', { customerId: 'CUST-2' })] as any)).toBe(2);
  });

  it('counts two bundles owed by the same customer once', () => {
    expect(countDebtors([debt('a', { customerId: 'CUST-1' }), debt('b', { customerId: 'CUST-1' })] as any)).toBe(1);
  });

  it('treats +234 and 0 forms of one number as one customer', () => {
    expect(countDebtors([
      debt('a', { customerPhone: '+2348031234567' }),
      debt('b', { customerPhone: '08031234567' }),
    ] as any)).toBe(1);
  });

  it('falls back to the name only for old debts that carry nothing else', () => {
    expect(countDebtors([debt('a'), debt('b', { customerName: 'musa  bello' })] as any)).toBe(1);
  });

  it('does not invent a customer out of a debt with nothing on it', () => {
    expect(debtorKey({})).toBe('');
    expect(countDebtors([{}, {}])).toBe(0);
  });
});

describe('every screen counts the people who owe the same way', () => {
  const twoMusas = () => shop({
    pendingPayments: [debt('a', { customerId: 'CUST-1' }), debt('b', { customerId: 'CUST-2' })] as any,
  });

  it('the Money Owed card counts two customers', () => {
    expect(getPendingSummary(twoMusas()).customerCount).toBe(2);
  });

  it('Flow counts the same two', () => {
    expect(serviceSnapshot(twoMusas()).owedBy).toBe(2);
  });
});

describe('a payment comes off the right customer', () => {
  const customers = [
    { id: 'CUST-1', name: 'Musa Bello', phone: '', outstandingDebt: 1_000, totalPurchases: 0, purchaseHistory: [], loyaltyPoints: 0, visitsCount: 0 },
    { id: 'CUST-2', name: 'Musa Bello', phone: '', outstandingDebt: 1_000, totalPurchases: 0, purchaseHistory: [], loyaltyPoints: 0, visitsCount: 0 },
  ];

  it('takes it off only the customer the debt belongs to', () => {
    const next = addPaymentToPending(shop({
      customers: customers as any,
      pendingPayments: [debt('p1', { customerId: 'CUST-2' })] as any,
    }), 'p1', 400);
    const byId = new Map((next.customers || []).map(c => [c.id, c.outstandingDebt]));
    expect(byId.get('CUST-2')).toBe(600);
    expect(byId.get('CUST-1')).toBe(1_000);
  });

  it('does not guess between two customers of the same name on an old debt', () => {
    // No id on the debt, and two people answer to its name: neither balance
    // is touched rather than both, or the wrong one.
    const next = addPaymentToPending(shop({
      customers: customers as any,
      pendingPayments: [debt('p1')] as any,
    }), 'p1', 400);
    expect((next.customers || []).map(c => c.outstandingDebt)).toEqual([1_000, 1_000]);
  });

  it('still reduces the one customer by that name when there is only one', () => {
    const next = addPaymentToPending(shop({
      customers: [customers[0]] as any,
      pendingPayments: [debt('p1')] as any,
    }), 'p1', 400);
    expect(next.customers?.[0].outstandingDebt).toBe(600);
  });
});
