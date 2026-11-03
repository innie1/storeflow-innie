import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { createLocalLaundryRecord } from '@/lib/laundry-offline';
import {
  consumablePace,
  DEFAULT_SOAP_PER_PIECE,
  estimateUnitCost,
  explainUnitCost,
  isVariableCost,
  MIN_PIECES_TO_ESTIMATE,
  soapPaceSentence,
  washesClothes,
} from '@/lib/cost-estimator';
import { breakEven } from '@/lib/service-breakeven';
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

const DAY = 86400000;
/** Soap bought `daysAgo` days ago; a negative number is just after the bundles in the test. */
const soap = (amount: number, daysAgo: number, note = 'Detergent (bag)') => ({
  id: `e${Math.random()}`, amount, category: 'Consumables', note,
  date: new Date(Date.now() - daysAgo * DAY).toISOString(),
});
const JUST_AFTER = -1 / 1440;

const job = (pieces: number, total: number) => createLocalLaundryRecord({
  accessCode: CODE,
  customerName: 'A', customerPhone: '08010000000',
  serviceId: 'svc', serviceName: 'Wash & Iron',
  pricing: 'per_piece', billingQuantity: 1, total,
  garments: [{ garmentType: 'Shirt', quantity: pieces, unitPrice: total / pieces, subtotal: total }],
});

/** A drop-off that was only ironed. */
const ironing = (pieces: number, total: number) => createLocalLaundryRecord({
  accessCode: CODE,
  customerName: 'B', customerPhone: '08010000001',
  serviceId: 'iron-only', serviceName: 'Ironing',
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
    // The first lot of soap ran out across these bundles, and power on top.
    const store = laundry({ expenses: [soap(10_000, 30), soap(10_000, JUST_AFTER), spend(10_000, 'Utilities')] as any });
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
    expect(estimateUnitCost(laundry({ expenses: [spend(2_100, 'Utilities')] as any })).pieces).toBe(21);
    // Power spread across 21 pieces, and soap at its starting figure.
    expect(estimateUnitCost(laundry({ expenses: [spend(2_100, 'Utilities')] as any })).perPiece).toBe(100 + DEFAULT_SOAP_PER_PIECE);
  });

  it('says where the money went, largest first', () => {
    for (let i = 0; i < 5; i += 1) job(10, 5_000);
    const store = laundry({ expenses: [spend(5_000, 'Utilities'), soap(10_000, 30), soap(10_000, JUST_AFTER)] as any });
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
    const estimate = estimateUnitCost(shop());
    expect(estimate.learning).toBe(true);
    expect(explainUnitCost(estimate)).toContain('Record what you spend');
  });

  it('explains the figure it gives, rather than just stating it', () => {
    for (let i = 0; i < 5; i += 1) job(10, 5_000);
    const line = explainUnitCost(estimateUnitCost(laundry({
      expenses: [soap(10_000, 30), soap(10_000, JUST_AFTER), spend(10_000, 'Utilities')] as any,
    })));
    expect(line).toContain('400');
    expect(line).toContain('50 pieces');
    expect(line).toContain('consumables');
    expect(line).not.toContain('starting');
  });
});

/**
 * A ₦17,000 lot of soap lasts a month or two. Charged in full to the month it
 * was bought, it read as most of the price of every piece, and a laundry with
 * ₦350,000 of costs was told it had to take ₦2.5 million.
 */
describe('soap that lasts more than a day', () => {
  beforeEach(() => localStorage.clear());

  it('starts a laundry at a small figure a piece, and says it is a starting one', () => {
    for (let i = 0; i < 5; i += 1) job(10, 5_000);
    const estimate = estimateUnitCost(laundry());
    expect(estimate.perPiece).toBe(DEFAULT_SOAP_PER_PIECE);
    expect(estimate.soapGuessed).toBe(true);
    expect(explainUnitCost(estimate)).toContain('starting');
  });

  it('does not charge one big buy to the month it was bought in', () => {
    for (let i = 0; i < 10; i += 1) job(10, 5_000);
    const store = laundry({ expenses: [spend(100_000, 'Rent'), soap(17_000, 0, 'Big packs × 7')] as any });
    expect(estimateUnitCost(store).perPiece).toBe(DEFAULT_SOAP_PER_PIECE);

    // 50,000 of work with 3,000 of soap in it: 94% of each naira is left.
    const { target } = breakEven(store);
    expect(Math.round(target)).toBe(Math.round(100_000 / 0.94));
    expect(soapPaceSentence(store)).toContain('when you buy it again');
  });

  it('learns what washing a piece costs from the clothes a finished lot washed', () => {
    for (let i = 0; i < 4; i += 1) job(10, 5_000);
    const store = laundry({ expenses: [soap(8_000, 20, 'Ariel × 4'), soap(17_000, JUST_AFTER, 'Ariel × 7')] as any });
    // The first ₦8,000 washed these 40 pieces. The new ₦17,000 is not used yet.
    expect(estimateUnitCost(store).perPiece).toBe(200);
    expect(estimateUnitCost(store).soapGuessed).toBe(false);

    const [pace] = consumablePace(store);
    expect(pace.usedWashed).toBe(40);
    expect(pace.piecesLeft).toBe(85);
    const line = soapPaceSentence(store);
    expect(line).toContain('₦200 a piece washed');
    expect(line).toContain('washed 40 pieces, about 10 a pack');
    expect(line).toContain('should wash about 85 more');
  });

  it('charges no soap to clothes that were only ironed', () => {
    for (let i = 0; i < 4; i += 1) job(10, 5_000);
    ironing(20, 4_000);
    const store = laundry({ expenses: [soap(8_000, 20), soap(17_000, JUST_AFTER)] as any });
    // ₦8,000 across the 40 washed pieces, not the 60 that came in.
    expect(consumablePace(store)[0].perPiece).toBe(200);
    // Averaged over every piece, the ironed ones carry none of it.
    expect(Math.round(estimateUnitCost(store).perPiece!)).toBe(Math.round((200 * 40) / 60));
  });

  it('knows ironing from washing by the service name', () => {
    expect(washesClothes({ serviceName: 'Full Service' })).toBe(true);
    expect(washesClothes({ serviceName: 'Wash Only' })).toBe(true);
    expect(washesClothes({ serviceName: 'Wash Only & iron' })).toBe(true);
    expect(washesClothes({ serviceName: 'Ironing' })).toBe(false);
    expect(washesClothes({ serviceName: 'Iron only' })).toBe(false);
    expect(washesClothes({ serviceId: 'iron-only', serviceName: 'Starching' })).toBe(false);
  });

  it('keeps the starting figure when no washing was recorded with the finished lot', () => {
    // Soap bought forty and ten days ago, bundles only recorded today.
    for (let i = 0; i < 5; i += 1) job(10, 5_000);
    const store = laundry({ expenses: [soap(15_000, 40), soap(15_000, 10)] as any });
    expect(estimateUnitCost(store).perPiece).toBe(DEFAULT_SOAP_PER_PIECE);
    expect(soapPaceSentence(store)).toContain('only 0 washed pieces');
  });

  /**
   * Washing nobody put in the app makes a lot look as if it washed a handful
   * of clothes. Soap at more than half the price of a piece is that, and
   * using it would put the target in the millions again.
   */
  it('sets aside a figure too high to be soap', () => {
    for (let i = 0; i < 2; i += 1) job(10, 5_000);
    const store = laundry({ expenses: [spend(100_000, 'Rent'), soap(17_000, 20), soap(17_000, JUST_AFTER)] as any });
    const [pace] = consumablePace(store);
    // ₦850 a piece against ₦500 charged for it.
    expect(pace.doubtful).toBe(true);
    expect(pace.perPiece).toBeNull();
    expect(estimateUnitCost(store).perPiece).toBe(DEFAULT_SOAP_PER_PIECE);
    expect(soapPaceSentence(store)).toContain('some washing may not be in the app');
    expect(breakEven(store).target).toBeLessThan(110_000);
  });

  it('counts the clothes from the day the soap was bought, never the ones before', () => {
    // These bundles came in before either buy.
    for (let i = 0; i < 4; i += 1) job(10, 5_000);
    const store = laundry({ expenses: [soap(8_000, JUST_AFTER), soap(17_000, -3)] as any });
    const [pace] = consumablePace(store);
    expect(pace.usedWashed).toBe(0);
    expect(pace.washedSinceLast).toBe(0);
    expect(pace.perPiece).toBeNull();
  });

  it('counts two buys a day apart as one trip', () => {
    const store = laundry({ expenses: [soap(17_000, 1, 'Ariel × 5'), soap(2_000, 0.5, 'Ariel × 2')] as any });
    const [pace] = consumablePace(store);
    expect(pace.buys).toBe(1);
    expect(pace.lastAmount).toBe(19_000);
    expect(pace.lastPacks).toBe(7);
    expect(pace.perPiece).toBeNull();
  });

  it('does not measure soap against starch', () => {
    const store = laundry({ expenses: [soap(17_000, 10), soap(3_000, 5, 'Starch (bottle)')] as any });
    const paces = consumablePace(store);
    expect(paces.map(pace => pace.key).sort()).toEqual(['detergent', 'starch']);
    expect(paces.every(pace => pace.perPiece === null)).toBe(true);
  });

  it('knows soap by any of its names', () => {
    const store = laundry({ expenses: [soap(17_000, 30, 'Big packs × 7'), soap(9_000, 0, 'Soap (bag)')] as any });
    expect(consumablePace(store)).toHaveLength(1);
    expect(consumablePace(store)[0].key).toBe('detergent');
  });
});
