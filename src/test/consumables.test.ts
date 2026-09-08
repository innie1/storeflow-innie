import { describe, expect, it } from 'vitest';
import type { StoreData, SupplyItem } from '@/types/store';
import {
  consumablesSpend,
  costPerJob,
  buildSupplyExpense,
  markSupplyPurchased,
  reportSupplyLow,
  lowSupplies,
  supplyList,
  MIN_JOBS_FOR_UNIT_COST,
} from '@/lib/consumables';
import { getOperatingExpenses } from '@/lib/store-data';

const store = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's1',
  storeId: 'SF-T',
  storeName: 'Shine',
  accessCode: 'SUP123',
  storeType: 'laundry',
  products: [],
  sales: [],
  expenses: [],
  createdAt: new Date(0).toISOString(),
  ...over,
} as StoreData);

const soap = (): SupplyItem => supplyList(store()).find(item => item.name === 'Detergent')!;

describe('what the shop uses up', () => {
  /**
   * The whole reason this is not a restock. A retailer who buys goods still
   * owns them, so the app keeps that out of profit. Detergent is gone once the
   * wash is done, so it has to land in profit like rent does - otherwise the
   * shop's margin is a fiction that flatters it.
   */
  it('counts against profit, unlike buying stock', () => {
    const withSoap = markSupplyPurchased(store(), { supply: soap(), amount: 12000 });
    const operating = getOperatingExpenses(withSoap);

    expect(operating).toHaveLength(1);
    expect(operating[0].amount).toBe(12000);
    expect(operating[0].category).toBe('Consumables');
  });

  it('names what was bought so the expense list is readable', () => {
    const expense = buildSupplyExpense({ supply: soap(), amount: 9000 });
    expect(expense.note).toContain('Detergent');
    expect(expense.note).toContain('bag');
  });

  it('offers a starting list before the shop has typed anything', () => {
    expect(supplyList(store()).map(item => item.name)).toContain('Diesel');
  });

  it('remembers who said it had run out, and forgets once it is bought', () => {
    const reported = reportSupplyLow(store(), soap(), true, 'Hanna');
    expect(lowSupplies(reported)).toHaveLength(1);
    expect(lowSupplies(reported)[0].lowReportedBy).toBe('Hanna');

    const bought = markSupplyPurchased(reported, { supply: soap(), amount: 12000 });
    expect(lowSupplies(bought)).toHaveLength(0);
    expect(bought.supplies?.[0].lastPurchaseCost).toBe(12000);
  });

  it('adding one supply does not drop the rest of the starting list', () => {
    // supplyList seeds items that were never saved, so the first write has to
    // carry them or reporting one shortage wipes the others off the screen.
    const reported = reportSupplyLow(store(), soap(), true);
    expect(supplyList(reported).length).toBeGreaterThan(1);
  });

  it('only counts supply spend inside the window', () => {
    const old = { id: 'e0', amount: 5000, category: 'Consumables' as const, date: new Date(Date.now() - 60 * 86400000).toISOString() };
    const recent = { id: 'e1', amount: 3000, category: 'Consumables' as const, date: new Date().toISOString() };
    const rent = { id: 'e2', amount: 90000, category: 'Rent' as const, date: new Date().toISOString() };
    expect(consumablesSpend(store({ expenses: [old, recent, rent] }), 30)).toBe(3000);
  });
});

describe('what one job costs in supplies', () => {
  const spent = store({
    expenses: [{ id: 'e1', amount: 20000, category: 'Consumables', date: new Date().toISOString() }],
  });

  it('divides supply spend across the jobs that used it', () => {
    expect(costPerJob(spent, 40)).toBe(500);
  });

  /**
   * Withheld rather than guessed. Two bundles and a drum of detergent produce
   * a confident-looking figure built on nothing, and a shop could reprice off
   * it.
   */
  it('says nothing when there are too few jobs to divide by', () => {
    expect(costPerJob(spent, MIN_JOBS_FOR_UNIT_COST - 1)).toBeNull();
  });

  it('says nothing when no supplies have been bought', () => {
    expect(costPerJob(store(), 100)).toBeNull();
  });
});
