import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { categoryFromName, fileExpenseByName, fileExpensesByName } from '@/lib/expense-names';
import { addExpense, loadStore, STORE_PREFIX } from '@/lib/store-data';
import { utilityPace } from '@/lib/cost-estimator';

/**
 * The owner's form started on Rent and a worker's on Consumables, so a light
 * bill saved without pressing Utilities was counted as rent, or as soap.
 */

beforeEach(() => localStorage.clear());

describe('reading what an expense is from its name', () => {
  it('knows the bills, the soap, the rent, the wages and the fares', () => {
    expect(categoryFromName('Light bill')).toBe('Utilities');
    expect(categoryFromName('NEPA token')).toBe('Utilities');
    expect(categoryFromName('Diesel for gen')).toBe('Utilities');
    expect(categoryFromName('Water')).toBe('Utilities');
    expect(categoryFromName('Ariel soap × 7')).toBe('Consumables');
    expect(categoryFromName('Starch')).toBe('Consumables');
    expect(categoryFromName('October rent')).toBe('Rent');
    expect(categoryFromName("Destiny's salary")).toBe('Salaries');
    expect(categoryFromName('Keke to market')).toBe('Transport');
  });

  it('guesses nothing when a name says two things, or none', () => {
    expect(categoryFromName('Transport for soap')).toBeNull();
    expect(categoryFromName('Shop rent and light')).toBeNull();
    expect(categoryFromName('Misc')).toBeNull();
    expect(categoryFromName('')).toBeNull();
    // "current" is not rent.
    expect(categoryFromName('Current bill')).toBeNull();
  });
});

describe('filing expenses by their names', () => {
  it('moves a light bill off the button the form started on', () => {
    expect(fileExpenseByName({ category: 'Rent', note: 'Light bill' }).category).toBe('Utilities');
    expect(fileExpenseByName({ category: 'Consumables', note: 'Light bill' }).category).toBe('Utilities');
    expect(fileExpenseByName({ category: 'Other', note: 'Diesel' }).category).toBe('Utilities');
  });

  it('keeps a button somebody pressed, a restock and a supply bought', () => {
    expect(fileExpenseByName({ category: 'Transport', note: 'Light bill' }).category).toBe('Transport');
    expect(fileExpenseByName({ category: 'Rent', note: 'Light bill', source: 'restock' }).category).toBe('Rent');
    expect(fileExpenseByName({ category: 'Consumables', note: 'Bleach', supply: 'bleach' }).category).toBe('Consumables');
    expect(fileExpenseByName({ category: 'Rent', note: 'October rent' }).category).toBe('Rent');
  });

  it('files a new expense as it goes into the book', () => {
    const store = { accessCode: 'NAME01', expenses: [], cashBalance: 50_000 } as unknown as StoreData;
    const next = addExpense(store, { amount: 6_000, category: 'Rent', date: new Date().toISOString(), note: 'Light bill' });
    expect(next.expenses[0].category).toBe('Utilities');
  });

  it('files the old ones when the shop opens, so light bills are counted as light', () => {
    const day = (ago: number) => new Date(Date.now() - ago * 86400000).toISOString();
    const saved = {
      accessCode: 'NAME02', storeName: 'Washlie', storeType: 'laundry', businessType: 'laundry',
      products: [], sales: [], customers: [],
      expenses: [
        { id: 'x1', amount: 6_000, category: 'Rent', note: 'Light bill', date: day(25) },
        { id: 'x2', amount: 6_000, category: 'Rent', note: 'Light bill', date: day(1) },
        { id: 'x3', amount: 300_000, category: 'Rent', note: 'Shop rent', date: day(40) },
      ],
      recurringBills: [{ id: 'b1', label: 'Light bill', amount: 6_000, category: 'Rent', frequency: 'monthly', nextDueDate: day(-5), active: true }],
      createdAt: day(400),
    };
    localStorage.setItem(STORE_PREFIX + 'NAME02', JSON.stringify(saved));
    const store = loadStore('NAME02')!;
    expect(store.expenses.map(expense => expense.category)).toEqual(['Utilities', 'Utilities', 'Rent']);
    expect(store.recurringBills![0].category).toBe('Utilities');
    expect(utilityPace(store).map(pace => pace.key)).toEqual(['electricity']);
  });

  it('hands back the same store when nothing needed moving', () => {
    const store = { expenses: [{ id: 'a', amount: 1, category: 'Utilities', note: 'Light bill', date: '' }] } as unknown as StoreData;
    expect(fileExpensesByName(store)).toBe(store);
  });
});
