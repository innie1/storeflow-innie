import { beforeEach, describe, expect, it } from 'vitest';
import type { PendingPayment, StoreData } from '@/types/store';
import { createLocalLaundryRecord } from '@/lib/laundry-offline';
import { DEFAULT_SOAP_PER_PIECE, estimateUnitCost, pieceCostParts, pieceCostSentence } from '@/lib/cost-estimator';
import { wasEverOwed, getPendingSummary } from '@/lib/store-data';
import { busyTimes, forecastHorizon, forecastTrackRecord, getRepaymentInsights } from '@/lib/manager-intel';

/*
 * The figures on Flow's screens, checked by hand: what a piece costs and what
 * it is made of, who has really owed money, how right the forecast has been,
 * and when the work comes in, paid and not.
 */

const CODE = 'FLOWFG';
const DAY = 86400000;
const ago = (days: number, hour = 10) => {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const laundry = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-F', storeName: 'Shine', accessCode: CODE,
  storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], recurringBills: [], pendingPayments: [],
  createdAt: new Date(0).toISOString(),
  ...over,
} as unknown as StoreData);

const washed = (pieces: number, total: number) => createLocalLaundryRecord({
  accessCode: CODE,
  customerName: 'A', customerPhone: '08010000000',
  serviceId: 'svc', serviceName: 'Wash & Iron',
  pricing: 'per_piece', billingQuantity: 1, total,
  garments: [{ garmentType: 'Shirt', quantity: pieces, unitPrice: total / pieces, subtotal: total }],
});

describe('what a piece costs, taken apart', () => {
  beforeEach(() => localStorage.clear());

  it('makes ₦255 out of the starting soap figure and one light bill, and says so', () => {
    // 200 pieces washed this month, one ₦45,000 light bill, no soap bought yet.
    for (let i = 0; i < 20; i += 1) washed(10, 5_000);
    const store = laundry({
      expenses: [{ id: 'l1', amount: 45_000, category: 'Utilities', note: 'Light bill', date: ago(2) }] as any,
    });
    const estimate = estimateUnitCost(store);
    expect(estimate.perPiece).toBe(DEFAULT_SOAP_PER_PIECE + 45_000 / 200);
    expect(Math.round(estimate.perPiece!)).toBe(255);

    const parts = pieceCostParts(store, estimate);
    expect(parts.map(part => part.label)).toEqual(['light', 'detergent']);
    expect(Math.round(parts[0].perPiece)).toBe(225);
    expect(parts[1]).toMatchObject({ perPiece: 30, assumed: true });
    // The parts add up to the figure, so nothing is hidden in it.
    expect(parts.reduce((sum, part) => sum + part.perPiece, 0)).toBeCloseTo(estimate.perPiece!, 6);

    expect(pieceCostSentence(store, estimate)).toBe(
      '₦255 a piece to do the work: light ₦225, detergent ₦30 (starting figure). From the last 30 days, 200 pieces.',
    );
  });

  it('names piece-work pay instead of calling it soap and electricity', () => {
    for (let i = 0; i < 20; i += 1) washed(10, 5_000);
    const store = laundry({
      pieceWork: [{ id: 'w1', staffName: 'Ada', task: 'iron', pieces: 200, amount: 4_000, at: ago(1), approved: true }],
    } as any);
    const labels = pieceCostParts(store, estimateUnitCost(store)).map(part => part.label);
    expect(labels).toContain('piece-work pay');
  });
});

const debt = (id: string, over: Partial<PendingPayment>): PendingPayment => ({
  id, customerName: 'Amaka', customerPhone: '0801', items: [], total: 5_000, paid: 0, balance: 5_000,
  createdAt: ago(10, 9), status: 'pending', events: [], saleIds: [], ...over,
} as PendingPayment);

describe('who has really owed money', () => {
  const paidOnTheSpot = debt('a', { paid: 5_000, balance: 0, status: 'paid', events: [{ date: ago(10, 9), amount: 5_000 }] });
  const paidLater = debt('b', { paid: 5_000, balance: 0, status: 'paid', events: [{ date: ago(10, 9), amount: 1_000 }, { date: ago(7), amount: 4_000 }] });
  const stillOwing = debt('c', { paid: 2_000, balance: 3_000, events: [{ date: ago(10, 9), amount: 2_000 }] });

  it('is not someone who paid in full the day they brought the clothes', () => {
    expect(wasEverOwed(paidOnTheSpot)).toBe(false);
    expect(wasEverOwed(paidLater)).toBe(true);
    expect(wasEverOwed(stillOwing)).toBe(true);
  });

  it('leaves bundles paid on the spot out of repayments and the recovery rate', () => {
    const store = laundry({ pendingPayments: [paidOnTheSpot, paidOnTheSpot, paidOnTheSpot, paidLater, stillOwing] as any });
    const insights = getRepaymentInsights(store);
    expect(insights.customers[0].totalDebts).toBe(2);
    // ₦7,000 recovered of the ₦10,000 actually owed, not of ₦25,000 of bundles.
    expect(getPendingSummary(store).recoveryRate).toBe(70);
  });
});

describe('how right the forecast has been', () => {
  const steady = (days: number, amount = 5_000) =>
    Array.from({ length: days }, (_, i) => ({ id: `s${i}`, date: ago(i + 1, 12), total: amount, profit: amount, productId: 'x', quantity: 1 }));

  it('is worked out from what really came in, not asked', () => {
    const record = forecastTrackRecord(laundry({ sales: steady(60) as any }), 7);
    expect(record.checks).toHaveLength(4);
    for (const check of record.checks) {
      expect(check.actual).toBe(35_000);
      expect(check.withinRange).toBe(true);
    }
    expect(record.accuracyPct).toBeGreaterThanOrEqual(95);
  });

  it('waits until there is a week of history behind a forecast', () => {
    expect(forecastTrackRecord(laundry({ sales: steady(9) as any }), 7).checks).toHaveLength(0);
  });

  it('looks back to the first sale, not to the day the store record was made', () => {
    const store = laundry({ createdAt: ago(2), sales: steady(40) as any });
    expect(forecastHorizon(store, 7).daysObserved).toBe(30);
  });
});

describe('when the work comes in, paid and not', () => {
  it('puts each bundle in its slot, split by what was paid', () => {
    const at = new Date(); at.setHours(9, 10, 0, 0);
    const later = new Date(); later.setHours(9, 40, 0, 0);
    const times = busyTimes([
      { at: at.toISOString(), paid: 3_000, unpaid: 2_000 },
      { at: later.toISOString(), paid: 0, unpaid: 4_000 },
    ], 'lifetime', 30, Date.now() + DAY);
    const nine = times.slots.find(slot => slot.minute === 9 * 60)!;
    const halfPast = times.slots.find(slot => slot.minute === 9 * 60 + 30)!;
    expect(nine).toMatchObject({ count: 1, paid: 3_000, unpaid: 2_000 });
    expect(halfPast).toMatchObject({ count: 1, paid: 0, unpaid: 4_000 });
    expect(times).toMatchObject({ total: 2, paid: 3_000, unpaid: 6_000 });
  });
});
