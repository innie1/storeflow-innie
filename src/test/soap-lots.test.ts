import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { consumablePace, DEFAULT_SOAP_PER_PIECE, RECENT_LOTS, soapPaceSentence } from '@/lib/cost-estimator';
import { breakEven, monthlyFixedCosts } from '@/lib/service-breakeven';
import { monthlyRent, rentFrequency } from '@/lib/rent';
import { rentAnalysis } from '@/lib/manager-intel';

/**
 * Soap that keeps learning, rent read the way the form showed it, and a
 * month's target that will not run to millions on figures that cannot be true.
 */

const CODE = 'LOTS01';
const DAY = 86400000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const laundry = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-L', storeName: 'Washlie', accessCode: CODE,
  storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], recurringBills: [],
  createdAt: ago(400),
  ...over,
} as unknown as StoreData);

const soap = (amount: number, daysAgo: number, packs?: number) => ({
  id: `e${Math.random()}`, amount, category: 'Consumables',
  note: packs ? `Ariel × ${packs}` : 'Detergent', date: ago(daysAgo),
});

/** Bundles put straight into this phone's list, each on its own day. */
const bundles = (rows: { daysAgo: number; pieces: number; total?: number; by?: string; service?: string }[]) => {
  localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify(rows.map((row, index) => ({
    clientRef: `r${index}`, accessCode: CODE, tagCode: `LT-${index}`, customerName: 'A',
    serviceId: 'svc', serviceName: row.service || 'Full Service',
    garments: [{ garmentType: 'Shirt', quantity: row.pieces }], pieceCount: row.pieces,
    total: row.total ?? row.pieces * 500, createdAt: ago(row.daysAgo), workflowStage: 'ready', syncStatus: 'synced',
    stageHistory: row.by ? [{ stage: 'washing', at: ago(row.daysAgo), by: row.by }] : [],
  }))));
};

beforeEach(() => localStorage.clear());

describe('soap that keeps adjusting', () => {
  it('follows the most recent lots, so better habits show', () => {
    // Five lots of ₦10,000. The first two washed 20 pieces each; the last
    // three, used more carefully, washed 50 each.
    const buys = [100, 80, 60, 40, 20, 0];
    bundles([
      { daysAgo: 90, pieces: 20 }, { daysAgo: 70, pieces: 20 },
      { daysAgo: 50, pieces: 50 }, { daysAgo: 30, pieces: 50 }, { daysAgo: 10, pieces: 50 },
    ]);
    const store = laundry({ expenses: buys.map(days => soap(10_000, days)) as any });
    const [pace] = consumablePace(store);

    expect(pace.lots).toHaveLength(6);
    expect(pace.lots.map(lot => lot.perPiece)).toEqual([500, 500, 200, 200, 200, null]);
    // From the last three finished lots only: ₦30,000 across 150 pieces.
    expect(RECENT_LOTS).toBe(3);
    expect(pace.perPiece).toBe(200);
    expect(soapPaceSentence(store)).toContain('the last 3 lots washed 150 pieces');
  });

  it('says which lot went faster than usual, and who was washing then', () => {
    bundles([
      { daysAgo: 70, pieces: 50, by: 'Ada' },
      { daysAgo: 50, pieces: 20, by: 'Musa' },
      { daysAgo: 45, pieces: 5, by: 'Ada' },
      { daysAgo: 30, pieces: 50, by: 'Ada' },
    ]);
    const store = laundry({ expenses: [soap(10_000, 80), soap(10_000, 60), soap(10_000, 40), soap(17_000, 0, 7)] as any });
    const [pace] = consumablePace(store);
    const [first, second, third] = pace.lots;

    expect(first.high).toBe(false);
    expect(second.perPiece).toBe(400);
    expect(second.high).toBe(true);
    expect(second.washers).toEqual([{ name: 'Musa', pieces: 20 }, { name: 'Ada', pieces: 5 }]);
    expect(third.high).toBe(false);
    // The lot in use is not judged.
    expect(pace.lots[3].finished).toBe(false);
    expect(pace.lots[3].packs).toBe(7);
  });

  it('names nobody when the stage was never moved', () => {
    bundles([{ daysAgo: 30, pieces: 40 }]);
    const [pace] = consumablePace(laundry({ expenses: [soap(8_000, 40), soap(8_000, 0)] as any }));
    expect(pace.lots[0].washers).toEqual([{ name: 'Not recorded', pieces: 40 }]);
  });

  it('leaves ironing out of each lot', () => {
    bundles([{ daysAgo: 30, pieces: 40 }, { daysAgo: 29, pieces: 30, service: 'Ironing Only' }]);
    const [pace] = consumablePace(laundry({ expenses: [soap(8_000, 40), soap(8_000, 0)] as any }));
    expect(pace.lots[0].washed).toBe(40);
  });
});

describe('rent the way the form showed it', () => {
  /**
   * The form shows Yearly when nothing is chosen and saves nothing until the
   * box is changed. Washlie's ₦300,000 a year was being counted every month.
   */
  it('reads rent with no frequency saved as yearly', () => {
    expect(rentFrequency({})).toBe('yearly');
    expect(monthlyRent({ isRented: true, amount: 300_000 })).toBe(25_000);
    expect(monthlyRent({ isRented: true, amount: 300_000, frequency: 'monthly' })).toBe(300_000);
    expect(monthlyRent({ isRented: true, amount: 300_000, frequency: 'quarterly' })).toBe(100_000);
    expect(monthlyRent({ isRented: false, amount: 300_000 })).toBe(0);
  });

  it('is the same in the target and in Flow', () => {
    const store = laundry({ profile: { rent: { isRented: true, amount: 300_000, dueDate: '2027-08-15' } } as any });
    expect(monthlyFixedCosts(store)).toBe(25_000);
    expect(rentAnalysis(store)!.monthly).toBe(25_000);
  });
});

describe('the month target', () => {
  it('counts a weekly bill as the weeks a month really has', () => {
    const store = laundry({ recurringBills: [{ id: 'b', label: 'Diesel', amount: 12_000, frequency: 'weekly', active: true }] as any });
    expect(Math.round(monthlyFixedCosts(store))).toBe(52_000);
  });

  /** Washlie, 3 November: 9 pieces this month and a light bill spread over the few recorded. */
  it('falls back to the fixed costs when the costs cannot be true', () => {
    bundles([{ daysAgo: 0, pieces: 10, total: 2_000 }]);
    const store = laundry({
      staffMembers: [{ id: 'd', name: 'Destiny', monthlySalary: 50_000 }] as any,
      expenses: [{ id: 'u', amount: 30_000, category: 'Utilities', date: ago(0) }] as any,
    });
    const state = breakEven(store);
    expect(state.costsDoubtful).toBe(true);
    expect(state.target).toBe(50_000);
    expect(state.variableCostPerPiece).toBeNull();
  });

  it('comes to the shop\'s real month for a shop like Washlie', () => {
    bundles([{ daysAgo: 0, pieces: 12, total: 7_000 }]);
    const store = laundry({
      staffMembers: [{ id: 'd', name: 'Destiny', monthlySalary: 50_000 }] as any,
      profile: { rent: { isRented: true, amount: 300_000 } } as any,
      expenses: [soap(17_000, 0, 7)] as any,
    });
    const state = breakEven(store);
    expect(state.fixedCosts).toBe(75_000);
    expect(state.costsDoubtful).toBe(false);
    // Soap at its starting figure on 12 pieces of ₦7,000 of work.
    const left = (7_000 - 12 * DEFAULT_SOAP_PER_PIECE) / 7_000;
    expect(Math.round(state.target)).toBe(Math.round(75_000 / left));
    expect(state.target).toBeLessThan(80_000);
  });
});
