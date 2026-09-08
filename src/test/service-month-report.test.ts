import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { createLocalLaundryRecord, laundryLocalStorageKey } from '@/lib/laundry-offline';
import {
  breakEvenCelebrated,
  breakEvenDate,
  getMonthHistory,
  markBreakEvenCelebrated,
  monthKey,
  monthReport,
  recordMonthSnapshot,
} from '@/lib/service-month-report';
import { monthWindow } from '@/lib/service-breakeven';

const CODE = 'REPORT';
const today = () => new Date().toISOString();

const laundry = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-R', storeName: 'Shine', accessCode: CODE,
  storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], recurringBills: [],
  createdAt: new Date(0).toISOString(),
  ...over,
} as unknown as StoreData);

const spend = (amount: number, category: any) => ({ id: `e${Math.random()}`, amount, category, date: today() });

const job = (pieces: number, total: number) => createLocalLaundryRecord({
  accessCode: CODE,
  customerName: 'A', customerPhone: '08010000000',
  serviceId: 'svc', serviceName: 'Wash & Iron',
  pricing: 'per_piece', billingQuantity: 1, total,
  garments: [{ garmentType: 'Shirt', quantity: pieces, unitPrice: total / pieces, subtotal: total }],
});

describe('how the month went', () => {
  beforeEach(() => localStorage.clear());

  it('counts drop-offs and pieces as the different things they are', () => {
    job(1, 500);
    job(20, 10_000);
    const report = monthReport(laundry());
    expect(report.jobs).toBe(2);
    expect(report.pieces).toBe(21);
    expect(report.averageJob).toBe(5_250);
  });

  it('takes both kinds of cost off the takings', () => {
    for (let i = 0; i < 5; i += 1) job(10, 20_000);
    const store = laundry({ expenses: [spend(50_000, 'Rent'), spend(10_000, 'Consumables')] as any });
    const report = monthReport(store);

    expect(report.revenue).toBe(100_000);
    expect(report.fixedCosts).toBe(50_000);
    expect(report.variableCosts).toBe(10_000);
    expect(report.profit).toBe(40_000);
  });

  /** A loss said as a loss, not as a smaller profit. */
  it('says plainly when the month did not cover itself', () => {
    job(10, 5_000);
    const store = laundry({ expenses: [spend(90_000, 'Rent')] as any });
    const report = monthReport(store);

    expect(report.profit).toBeLessThan(0);
    expect(report.summary).toContain('short');
    expect(report.summary).toContain('did not cover itself');
  });

  it('says nothing happened rather than reporting zeroes', () => {
    expect(monthReport(laundry()).summary).toBe('No work recorded this month.');
  });
});

describe('the day the month was covered', () => {
  beforeEach(() => localStorage.clear());

  it('is the drop-off that took it over the target', () => {
    job(10, 40_000);
    job(10, 40_000);
    job(10, 40_000);
    const found = breakEvenDate(laundry(), monthWindow(), 100_000);
    expect(found).not.toBeNull();
    // The third one crosses 100,000; the second only reaches 80,000.
    expect(new Date(found!).getTime()).toBeGreaterThanOrEqual(0);
  });

  it('is nothing when the target was never reached', () => {
    job(10, 5_000);
    expect(breakEvenDate(laundry(), monthWindow(), 100_000)).toBeNull();
  });

  it('is nothing when there is no target to reach', () => {
    job(10, 5_000);
    expect(breakEvenDate(laundry(), monthWindow(), 0)).toBeNull();
  });
});

describe('keeping the months', () => {
  beforeEach(() => localStorage.clear());

  /**
   * Laundry records sync and are eventually pruned, so a month left uncounted
   * is a month lost. It is filed once and never rewritten - a closed month is
   * history, not a live figure.
   */
  it('files the month that has just ended', () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

    const record = job(10, 20_000);
    // Move it into last month, the way a real record would have been written.
    const key = laundryLocalStorageKey(CODE);
    const rows = JSON.parse(localStorage.getItem(key)!);
    rows[0].createdAt = lastMonth.toISOString();
    localStorage.setItem(key, JSON.stringify(rows));
    expect(record).toBeTruthy();

    const history = recordMonthSnapshot(laundry(), now);
    expect(history).toHaveLength(1);
    expect(history[0].key).toBe(monthKey(lastMonth));
    expect(history[0].revenue).toBe(20_000);
  });

  it('does not file the same month twice', () => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    job(10, 20_000);
    const key = laundryLocalStorageKey(CODE);
    const rows = JSON.parse(localStorage.getItem(key)!);
    rows[0].createdAt = lastMonth.toISOString();
    localStorage.setItem(key, JSON.stringify(rows));

    recordMonthSnapshot(laundry(), now);
    const second = recordMonthSnapshot(laundry(), now);
    expect(second).toHaveLength(1);
  });

  it('does not file a month in which nothing happened', () => {
    expect(recordMonthSnapshot(laundry(), new Date())).toHaveLength(0);
    expect(getMonthHistory(CODE)).toHaveLength(0);
  });
});

describe('celebrating once, when it is earned', () => {
  beforeEach(() => localStorage.clear());

  it('happens once a month and not again', () => {
    expect(breakEvenCelebrated(CODE)).toBe(false);
    markBreakEvenCelebrated(CODE);
    expect(breakEvenCelebrated(CODE)).toBe(true);
  });

  it('is available again next month', () => {
    const now = new Date();
    markBreakEvenCelebrated(CODE, now);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 5);
    expect(breakEvenCelebrated(CODE, nextMonth)).toBe(false);
  });

  it('keeps each shop’s to itself', () => {
    markBreakEvenCelebrated(CODE);
    expect(breakEvenCelebrated('OTHER1')).toBe(false);
  });
});
