import { describe, expect, it } from 'vitest';
import {
  getLaundryDepositRule,
  laundryBalance,
  recordLaundryPayment,
  requiredDeposit,
  setLaundryDepositRule,
} from '@/lib/laundry-money';
import { getDashboardStats } from '@/lib/store-data';
import type { StoreData } from '@/types/store';

/**
 * Laundry money was recorded nowhere.
 *
 * Intake worked out a total and displayed it, and that was the end of it. No
 * payment was captured at drop-off or at collection, and no sale was ever
 * written, so a shop could take in forty bundles, hand them all back, and be
 * told it had earned nothing — with no record of who still owed. Confirmed on
 * a real store: three bundles worth ₦13,500 recorded, revenue ₦0.
 */

const base = (): StoreData => ({
  id: 's', storeId: 'SF', storeName: 'Shine', accessCode: 'A', storeType: 'laundry',
  createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  products: [{ id: 'svc', name: 'Wash & Iron', category: 'Service', costPrice: 0, sellingPrice: 1500, quantity: 0, isService: true } as any],
  sales: [], expenses: [], pendingPayments: [],
} as unknown as StoreData);

const bundle = (over: Partial<Parameters<typeof recordLaundryPayment>[1]> = {}) => ({
  clientRef: 'ref-1', tagCode: 'PEM27H', customerName: 'John Okafor', customerPhone: '08031234567',
  serviceId: 'svc', serviceName: 'Wash & Iron', total: 4500, amountPaid: 0,
  at: '2026-09-07T09:00:00.000Z', ...over,
});

describe('a shop can require a deposit at drop-off', () => {
  it('asks for nothing by default', () => {
    expect(getLaundryDepositRule(base()).percent).toBe(0);
    expect(requiredDeposit(base(), 4500)).toBe(0);
  });

  it('works out the amount from the percentage', () => {
    const store = setLaundryDepositRule(base(), 50);
    expect(requiredDeposit(store, 4500)).toBe(2250);
  });

  it('rounds up, so the shop is never short', () => {
    expect(requiredDeposit(setLaundryDepositRule(base(), 30), 1001)).toBe(301);
  });

  it('never asks for more than the job costs', () => {
    expect(requiredDeposit(setLaundryDepositRule(base(), 100), 4500)).toBe(4500);
  });

  it('refuses a nonsense percentage rather than storing it', () => {
    expect(getLaundryDepositRule(setLaundryDepositRule(base(), 250)).percent).toBe(100);
    expect(getLaundryDepositRule(setLaundryDepositRule(base(), -20)).percent).toBe(0);
    expect(getLaundryDepositRule(setLaundryDepositRule(base(), Number.NaN)).percent).toBe(0);
  });
});

describe('money taken is money earned', () => {
  it('books a deposit as revenue the day it is taken', () => {
    const after = recordLaundryPayment(base(), bundle({ amountPaid: 2000 }));
    expect(after.sales).toHaveLength(1);
    expect(after.sales[0].total).toBe(2000);
    expect(getDashboardStats(after).totalRevenue).toBe(2000);
  });

  it('books nothing when nothing was handed over', () => {
    const after = recordLaundryPayment(base(), bundle({ amountPaid: 0 }));
    expect(after.sales).toHaveLength(0);
    expect(getDashboardStats(after).totalRevenue).toBe(0);
  });

  it('books only the new money on a second payment', () => {
    // Deposit at drop-off, balance on collection: two sales, not a double count.
    let store = recordLaundryPayment(base(), bundle({ amountPaid: 2000 }));
    store = recordLaundryPayment(store, bundle({ amountPaid: 2500, at: '2026-09-08T09:00:00.000Z' }));
    expect(store.sales.map(s => s.total)).toEqual([2000, 2500]);
    expect(getDashboardStats(store).totalRevenue).toBe(4500);
  });

  it('cannot be paid past the price of the job', () => {
    let store = recordLaundryPayment(base(), bundle({ amountPaid: 4000 }));
    store = recordLaundryPayment(store, bundle({ amountPaid: 9999 }));
    expect(getDashboardStats(store).totalRevenue).toBe(4500);
    expect(laundryBalance(store, 'ref-1')).toBe(0);
  });

  it('does not invent a cost for a service with no stock behind it', () => {
    const after = recordLaundryPayment(base(), bundle({ amountPaid: 2000 }));
    expect(after.sales[0].profit).toBe(2000);
  });
});

describe('what is unpaid is owed to the shop', () => {
  it('opens a pending payment for the balance', () => {
    const after = recordLaundryPayment(base(), bundle({ amountPaid: 2000 }));
    const owed = (after.pendingPayments || [])[0];
    expect(owed.customerName).toBe('John Okafor');
    expect(owed.total).toBe(4500);
    expect(owed.paid).toBe(2000);
    expect(owed.balance).toBe(2500);
    expect(owed.status).toBe('pending');
  });

  it('shows up in the shop-wide outstanding total', () => {
    const after = recordLaundryPayment(base(), bundle({ amountPaid: 2000 }));
    const owedNow = (after.pendingPayments || [])
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + p.balance, 0);
    expect(owedNow).toBe(2500);
  });

  it('closes the debt once the balance is paid', () => {
    let store = recordLaundryPayment(base(), bundle({ amountPaid: 2000 }));
    store = recordLaundryPayment(store, bundle({ amountPaid: 2500 }));
    const owed = (store.pendingPayments || [])[0];
    expect(owed.balance).toBe(0);
    expect(owed.status).toBe('paid');
    expect(laundryBalance(store, 'ref-1')).toBe(0);
  });

  it('keeps one record per bundle, not one per payment', () => {
    let store = recordLaundryPayment(base(), bundle({ amountPaid: 1000 }));
    store = recordLaundryPayment(store, bundle({ amountPaid: 1000 }));
    store = recordLaundryPayment(store, bundle({ amountPaid: 1000 }));
    expect(store.pendingPayments).toHaveLength(1);
    expect(store.pendingPayments![0].paid).toBe(3000);
  });

  it('keeps a note of each payment, so the shop can show what was taken when', () => {
    let store = recordLaundryPayment(base(), bundle({ amountPaid: 2000 }));
    store = recordLaundryPayment(store, bundle({ amountPaid: 2500, at: '2026-09-08T09:00:00.000Z' }));
    const events = store.pendingPayments![0].events;
    expect(events).toHaveLength(2);
    expect(events.map(e => e.amount)).toEqual([2000, 2500]);
  });

  it('carries the promised date so the debt has a due date', () => {
    const after = recordLaundryPayment(base(), bundle({ amountPaid: 0, promisedFor: '2026-09-08T07:00:00.000Z' }));
    expect(after.pendingPayments![0].dueDate).toBe('2026-09-08T07:00:00.000Z');
  });

  it('leaves a bundle with no price alone', () => {
    const after = recordLaundryPayment(base(), bundle({ total: 0, amountPaid: 0 }));
    expect(after.pendingPayments).toHaveLength(0);
    expect(after.sales).toHaveLength(0);
  });

  it('does not disturb debts from other bundles', () => {
    let store = recordLaundryPayment(base(), bundle({ amountPaid: 1000 }));
    store = recordLaundryPayment(store, bundle({ clientRef: 'ref-2', tagCode: 'AAA111', amountPaid: 0 }));
    expect(store.pendingPayments).toHaveLength(2);
    expect(laundryBalance(store, 'ref-1')).toBe(3500);
    expect(laundryBalance(store, 'ref-2')).toBe(4500);
  });
});
