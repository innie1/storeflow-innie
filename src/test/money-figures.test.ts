import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { createLocalLaundryRecord } from '@/lib/laundry-offline';
import { recordLaundryPayment } from '@/lib/laundry-money';
import {
  bundleCount,
  receivedBetween,
  receivedByChannel,
  runningCostsBetween,
  workTakenInBetween,
} from '@/lib/money-figures';
import { revenueInRange } from '@/lib/revenue-window';
import { breakEven } from '@/lib/service-breakeven';
import { monthReport } from '@/lib/service-month-report';

/**
 * One meaning for each money word, everywhere.
 *
 * The dashboard's Revenue card counted payments. The break-even ring beside it,
 * the monthly summary and the Analysis page counted the price of bundles, paid
 * or not - so a shop could read ₦0 today beside a ring saying the month was
 * covered. Revenue now means money received, and the price of the work is
 * shown beside it as "work taken in", never instead of it.
 */

const CODE = 'MONEY1';
const DAY = 86_400_000;
const EVER = Number.MAX_SAFE_INTEGER;

const shop = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-M', storeName: 'Shine', accessCode: CODE,
  storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], recurringBills: [], pendingPayments: [],
  createdAt: new Date(0).toISOString(),
  ...over,
} as unknown as StoreData);

const bundle = (pieces: number, total: number) => createLocalLaundryRecord({
  accessCode: CODE,
  customerName: 'Musa Bello', customerPhone: '08031234567',
  serviceId: 'svc', serviceName: 'Wash & Iron',
  pricing: 'per_piece', billingQuantity: 1, total,
  garments: [{ garmentType: 'Shirt', quantity: pieces, unitPrice: total / pieces, subtotal: total }],
});

/** A bundle taken in, with `paid` of its price handed over at the counter. */
function takeIn(store: StoreData, pieces: number, total: number, paid: number) {
  const record = bundle(pieces, total);
  const next = recordLaundryPayment(store, {
    clientRef: record.clientRef, tagCode: record.tagCode,
    customerName: record.customerName, customerPhone: record.customerPhone,
    serviceId: 'svc', serviceName: 'Wash & Iron', total, amountPaid: paid,
  });
  return { store: next, record };
}

const payment = (total: number, daysAgo: number, extra: Record<string, unknown> = {}) => ({
  id: `p${Math.random()}`, productId: 'svc', productName: 'Wash & Iron', quantity: 1,
  unitPrice: total, total, profit: total, date: new Date(Date.now() - daysAgo * DAY).toISOString(),
  ...extra,
});

beforeEach(() => localStorage.clear());

describe('money received', () => {
  it('counts payments by the day they were paid', () => {
    const store = shop({ sales: [payment(1_000, 0), payment(2_000, 3), payment(4_000, 40)] as any });
    expect(receivedBetween(store, Date.now() - 7 * DAY, EVER)).toBe(3_000);
  });

  it('counts nothing for a bundle nobody has paid for', () => {
    const { store } = takeIn(shop(), 10, 5_000, 0);
    expect(receivedBetween(store, 0, EVER)).toBe(0);
    expect(workTakenInBetween(store, 0, EVER)).toBe(5_000);
  });

  it('counts a deposit as exactly what was handed over', () => {
    const { store } = takeIn(shop(), 10, 5_000, 2_000);
    expect(receivedBetween(store, 0, EVER)).toBe(2_000);
    expect(workTakenInBetween(store, 0, EVER)).toBe(5_000);
  });

  it('is the very figure the Revenue card shows', () => {
    // One implementation, so the card and everything else cannot drift apart.
    const store = shop({ sales: [payment(1_500, 0), payment(2_500, 20)] as any });
    expect(revenueInRange(store, 'all')).toBe(receivedBetween(store, 0, EVER));
  });

  it('ignores a payment with no readable date rather than guessing one', () => {
    const store = shop({ sales: [payment(1_000, 0), { ...payment(9_000, 0), date: 'not a date' }] as any });
    expect(receivedBetween(store, 0, EVER)).toBe(1_000);
  });

  it('splits the counter from the storefront by where the money came in', () => {
    const store = shop({ sales: [payment(3_000, 0), payment(2_000, 0, { channel: 'online_order' })] as any });
    expect(receivedByChannel(store, 0, EVER)).toEqual({ counter: 3_000, online: 2_000 });
  });
});

describe('what "Recorded" counts', () => {
  it('counts bundles, not payments', () => {
    // A deposit and a balance are one job; an unpaid bundle is still a job.
    const taken = takeIn(shop(), 10, 5_000, 2_000);
    let store = taken.store;
    const record = taken.record;
    store = recordLaundryPayment(store, {
      clientRef: record.clientRef, tagCode: record.tagCode,
      customerName: record.customerName, customerPhone: record.customerPhone,
      serviceId: 'svc', serviceName: 'Wash & Iron', total: 5_000, amountPaid: 3_000,
    });
    takeIn(store, 4, 2_000, 0);

    expect((store.sales || []).length).toBe(2);
    expect(bundleCount(store)).toBe(2);
  });
});

describe('what running the shop cost', () => {
  it('leaves out stock bought, which is not a running cost', () => {
    const store = shop({
      expenses: [
        { id: 'e1', amount: 10_000, category: 'Rent', date: new Date().toISOString() },
        { id: 'e2', amount: 50_000, category: 'Restock', date: new Date().toISOString() },
      ] as any,
    });
    expect(runningCostsBetween(store, 0, EVER)).toBe(10_000);
  });

  it('counts piece work once, when it is approved, not again when it is paid', () => {
    const store = shop({
      pieceWork: [{ id: 'w1', approved: true, at: new Date().toISOString(), amount: 350 }] as any,
      expenses: [{ id: 'e1', amount: 200, category: 'Piece work', date: new Date().toISOString() }] as any,
    });
    expect(runningCostsBetween(store, 0, EVER)).toBe(350);
  });
});

describe('the break-even ring reads money received', () => {
  it('does not call the month covered on work nobody has paid for', () => {
    for (let i = 0; i < 30; i += 1) bundle(10, 10_000);
    const state = breakEven(shop({ expenses: [{ id: 'r', amount: 50_000, category: 'Rent', date: new Date().toISOString() }] as any }));
    expect(state.workTakenIn).toBe(300_000);
    expect(state.revenue).toBe(0);
    expect(state.reached).toBe(false);
    expect(state.progress).toBe(0);
  });

  it('keeps the target steady while the work is still unpaid', () => {
    /*
     * The trap. The margin is what the price of a job leaves after the soap it
     * used, so it comes from the work, not the payments. Taking it from money
     * received would collapse it early in any month with unpaid work, and the
     * target would balloon to twenty times the real costs.
     */
    for (let i = 0; i < 10; i += 1) bundle(10, 5_000);
    const state = breakEven(shop({
      expenses: [
        { id: 'r', amount: 100_000, category: 'Rent', date: new Date().toISOString() },
        { id: 'c', amount: 10_000, category: 'Consumables', date: new Date().toISOString() },
      ] as any,
    }));
    expect(Math.round(state.target)).toBe(125_000);
    expect(state.revenue).toBe(0);
  });

  it('fills the ring with the money that came in', () => {
    for (let i = 0; i < 10; i += 1) bundle(10, 5_000);
    const state = breakEven(shop({
      expenses: [
        { id: 'r', amount: 100_000, category: 'Rent', date: new Date().toISOString() },
        { id: 'c', amount: 10_000, category: 'Consumables', date: new Date().toISOString() },
      ] as any,
      sales: [payment(25_000, 0)] as any,
    }));
    expect(state.revenue).toBe(25_000);
    expect(state.progress).toBeCloseTo(0.2, 5);
  });
});

describe('the month report', () => {
  it('says what came in, and what is still owed on the work', () => {
    const { store } = takeIn(shop(), 10, 10_000, 4_000);
    const report = monthReport(store);
    expect(report.revenue).toBe(4_000);
    expect(report.workTakenIn).toBe(10_000);
    expect(report.owed).toBe(6_000);
    expect(report.summary).toContain('received');
    expect(report.summary).toContain('still owed');
  });

  it('prices the average drop-off from the work, not from the payments', () => {
    const { store } = takeIn(shop(), 10, 10_000, 4_000);
    expect(monthReport(store).averageJob).toBe(10_000);
  });

  it('keeps the money it received even in a month with no new drop-offs', () => {
    // Balances paid this month for last month's work are still this month's money.
    const report = monthReport(shop({ sales: [payment(7_000, 0)] as any }));
    expect(report.revenue).toBe(7_000);
    expect(report.summary).not.toBe('No work recorded this month.');
  });
});
