import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { createLocalLaundryRecord } from '@/lib/laundry-offline';
import { estimateUnitCost, explainUnitCost, isVariableCost, MIN_PIECES_TO_ESTIMATE } from '@/lib/cost-estimator';
import { monthlyFixedCosts } from '@/lib/service-breakeven';

const CODE = 'ESTIM8';
const today = () => new Date().toISOString();

const laundry = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-E', storeName: 'Shine', accessCode: CODE,
  storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], recurringBills: [],
  createdAt: new Date(0).toISOString(),
  ...over,
} as unknown as StoreData);

const shop = (over: Partial<StoreData> = {}): StoreData => laundry({
  storeType: 'provision', businessType: 'provision', ...over,
} as any);

const spend = (amount: number, category: any) => ({ id: `e${Math.random()}`, amount, category, date: today() });

const job = (pieces: number, total: number) => createLocalLaundryRecord({
  accessCode: CODE,
  customerName: 'A', customerPhone: '08010000000',
  serviceId: 'svc', serviceName: 'Wash & Iron',
  pricing: 'per_piece', billingQuantity: 1, total,
  garments: [{ garmentType: 'Shirt', quantity: pieces, unitPrice: total / pieces, subtotal: total }],
});

describe('what counts as the cost of doing the work', () => {
  /**
   * A laundry's electricity and water are the machines running - they rise and
   * fall with the washing. A provision store's are the lights, which burn
   * whether or not anybody buys anything.
   */
  it('treats power and water as part of the work for a laundry', () => {
    expect(isVariableCost(laundry(), { category: 'Utilities' })).toBe(true);
    expect(isVariableCost(laundry(), { category: 'Consumables' })).toBe(true);
  });

  it('does not for a shop that sells goods', () => {
    expect(isVariableCost(shop(), { category: 'Utilities' })).toBe(false);
  });

  it('never treats rent or salaries as part of a piece', () => {
    for (const category of ['Rent', 'Salaries', 'Transport'] as const) {
      expect(isVariableCost(laundry(), { category })).toBe(false);
    }
  });

  /**
   * The same expense must not be both. Counted as fixed and again as what a
   * piece consumed, the shop would be charged twice for its own soap.
   */
  it('keeps them out of the fixed costs it is spread across', () => {
    const store = laundry({ expenses: [spend(90_000, 'Rent'), spend(20_000, 'Consumables'), spend(15_000, 'Utilities')] as any });
    expect(monthlyFixedCosts(store)).toBe(90_000);
  });
});

describe('spreading it across the work actually done', () => {
  beforeEach(() => localStorage.clear());

  it('divides real spending by real pieces', () => {
    for (let i = 0; i < 5; i += 1) job(10, 5_000);
    const store = laundry({ expenses: [spend(15_000, 'Consumables'), spend(5_000, 'Utilities')] as any });
    // 20,000 across 50 pieces.
    expect(estimateUnitCost(store).perPiece).toBe(400);
  });

  /**
   * Pieces, not drop-offs. Spreading a month of detergent across "jobs" would
   * make a shop doing many small jobs look far more expensive per unit than
   * one doing few large ones, when it is the pieces that consume the soap.
   */
  it('counts one shirt as one piece and a bundle of twenty as twenty', () => {
    job(1, 500);
    job(20, 10_000);
    expect(estimateUnitCost(laundry({ expenses: [spend(2_100, 'Consumables')] as any })).pieces).toBe(21);
    expect(estimateUnitCost(laundry({ expenses: [spend(2_100, 'Consumables')] as any })).perPiece).toBe(100);
  });

  it('says where the money went, largest first', () => {
    for (let i = 0; i < 5; i += 1) job(10, 5_000);
    const store = laundry({ expenses: [spend(5_000, 'Utilities'), spend(15_000, 'Consumables')] as any });
    expect(estimateUnitCost(store).breakdown.map(b => b.category)).toEqual(['Consumables', 'Utilities']);
  });
});

describe('saying so when it does not know', () => {
  beforeEach(() => localStorage.clear());

  it('will not divide a drum of detergent by three shirts', () => {
    job(3, 1_500);
    const estimate = estimateUnitCost(laundry({ expenses: [spend(20_000, 'Consumables')] as any }));
    expect(estimate.learning).toBe(true);
    expect(estimate.perPiece).toBeNull();
    expect(explainUnitCost(estimate)).toContain(`${MIN_PIECES_TO_ESTIMATE - 3} more pieces`);
  });

  it('counts down in the singular on the last one', () => {
    job(MIN_PIECES_TO_ESTIMATE - 1, 3_000);
    const estimate = estimateUnitCost(laundry({ expenses: [spend(20_000, 'Consumables')] as any }));
    expect(explainUnitCost(estimate)).toContain('1 more piece');
    expect(explainUnitCost(estimate)).not.toContain('1 more pieces');
  });

  it('asks for the spending when none has been recorded', () => {
    for (let i = 0; i < 5; i += 1) job(10, 5_000);
    const estimate = estimateUnitCost(laundry());
    expect(estimate.learning).toBe(true);
    expect(explainUnitCost(estimate)).toContain('Record what you spend');
  });

  it('explains the figure it gives, rather than just stating it', () => {
    for (let i = 0; i < 5; i += 1) job(10, 5_000);
    const line = explainUnitCost(estimateUnitCost(laundry({ expenses: [spend(20_000, 'Consumables')] as any })));
    expect(line).toContain('400');
    expect(line).toContain('50 pieces');
    expect(line).toContain('consumables');
  });
});
