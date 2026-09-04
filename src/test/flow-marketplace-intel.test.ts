import { describe, expect, it } from 'vitest';
import { askFlowMarketplace, flowMarketplaceSuggestions, flowTopRecommendation } from '@/lib/flow-marketplace-intel';
import type { StoreData } from '@/types/store';

/**
 * Flow Intelligence in the Marketplace used to answer one of four hard-coded
 * strings, quoting invented supplier prices and even asserting the merchant's
 * own sales ("You sold 27 Minerals this week") without reading their data.
 *
 * These check the replacement is grounded: every figure it reports has to come
 * from the store passed in, and a store with no records has to be told so
 * rather than given a number.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function makeStore(overrides: Partial<StoreData> = {}): StoreData {
  return {
    id: 'store-1',
    storeId: 'SF-TEST01',
    storeName: 'Test Store',
    accessCode: 'TEST01',
    storeType: 'provision',
    products: [],
    sales: [],
    createdAt: new Date(0).toISOString(),
    ...overrides,
  } as StoreData;
}

const rice = {
  id: 'p-rice', name: 'Rice', category: 'Groceries',
  costPrice: 7000, sellingPrice: 8000, quantity: 3,
};

describe('Flow Intelligence answers from the store, not from invented data', () => {
  it('reports the real best seller and its real revenue', () => {
    const store = makeStore({
      products: [rice as any],
      sales: [
        { id: 's1', productId: 'p-rice', productName: 'Rice', quantity: 4, unitPrice: 8000, total: 32000, profit: 4000, date: daysAgo(2) },
        { id: 's2', productId: 'p-rice', productName: 'Rice', quantity: 2, unitPrice: 8000, total: 16000, profit: 2000, date: daysAgo(5) },
      ] as any,
    });

    const a = askFlowMarketplace(store, 'what is selling best?');
    expect(a).not.toBeNull();
    expect(a!.text).toContain('Rice');
    // 6 units, ₦48,000 — both come from the sales rows above.
    expect(a!.points.join(' ')).toContain('6 sold');
    expect(a!.points.join(' ')).toContain('48,000');
  });

  it('answers about a named product using that product only', () => {
    const store = makeStore({
      products: [rice as any, { id: 'p-oil', name: 'Oil', category: 'Groceries', costPrice: 100, sellingPrice: 200, quantity: 50 } as any],
      sales: [{ id: 's1', productId: 'p-rice', productName: 'Rice', quantity: 4, unitPrice: 8000, total: 32000, profit: 4000, date: daysAgo(2) }] as any,
    });

    const a = askFlowMarketplace(store, 'how is rice doing?');
    expect(a!.text).toContain('Rice');
    expect(a!.points.join(' ')).toContain('In stock: 3');
    expect(a!.points.join(' ')).not.toContain('Oil');
  });

  it('flags a product priced below cost, with that product real numbers', () => {
    const store = makeStore({
      products: [{ id: 'p-loss', name: 'Sugar', category: 'Groceries', costPrice: 1000, sellingPrice: 900, quantity: 10 } as any],
    });

    const a = askFlowMarketplace(store, 'are my prices right?');
    expect(a!.text).toMatch(/at or below cost/);
    expect(a!.points.join(' ')).toContain('Sugar');
    expect(a!.points.join(' ')).toContain('1,000');
  });

  it('says there is nothing to answer from rather than inventing a figure', () => {
    const empty = makeStore();

    const selling = askFlowMarketplace(empty, 'what is selling best?');
    expect(selling!.needsMoreData).toBe(true);
    expect(selling!.text).toMatch(/No sales recorded/);

    const forecast = askFlowMarketplace(empty, 'what should I expect next month?');
    expect(forecast!.needsMoreData).toBe(true);

    // Nothing in any answer may contain a currency figure for an empty store.
    for (const a of [selling!, forecast!]) {
      expect([a.text, ...a.points].join(' ')).not.toMatch(/₦[1-9]/);
    }
  });

  it('returns null for a question it cannot ground, so the caller can offer help', () => {
    expect(askFlowMarketplace(makeStore(), 'what is the weather')).toBeNull();
  });

  it('only suggests questions the store can actually answer', () => {
    expect(flowMarketplaceSuggestions(makeStore())).toEqual([]);

    const withSales = makeStore({
      products: [rice as any],
      sales: [{ id: 's1', productId: 'p-rice', productName: 'Rice', quantity: 4, unitPrice: 8000, total: 32000, profit: 4000, date: daysAgo(1) }] as any,
    });
    expect(flowMarketplaceSuggestions(withSales)).toContain('What is selling best?');
  });

  it('ranks customer requests the store actually recorded', () => {
    const store = makeStore({
      customerRequests: [
        { id: 'r1', text: 'Milo', date: daysAgo(1) },
        { id: 'r2', text: 'Milo', date: daysAgo(2) },
        { id: 'r3', text: 'Bread', date: daysAgo(3) },
      ] as any,
    });

    const a = askFlowMarketplace(store, 'what are customers asking for?');
    expect(a!.text).toContain('Milo');
    expect(a!.points[0]).toContain('asked 2 times');
  });
});

describe('the Marketplace hero recommendation', () => {
  it('leads with a product that is selling at a loss, using its real numbers', () => {
    const store = makeStore({
      products: [{ id: 'p-loss', name: 'Sugar', category: 'Groceries', costPrice: 1000, sellingPrice: 900, quantity: 20 } as any],
    });
    const r = flowTopRecommendation(store);
    expect(r.headline).toContain('Sugar');
    expect(r.headline).toMatch(/at a loss/);
    // ₦100 lost per unit — 1000 cost minus 900 selling.
    expect(r.metric?.value).toBe('₦100');
  });

  it('otherwise warns about stock about to run out', () => {
    const store = makeStore({
      products: [{ id: 'p-rice', name: 'Rice', category: 'Groceries', costPrice: 7000, sellingPrice: 9000, quantity: 1 } as any],
      sales: Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`, productId: 'p-rice', productName: 'Rice', quantity: 3,
        unitPrice: 9000, total: 27000, profit: 6000, date: daysAgo(i + 1),
      })) as any,
    });
    const r = flowTopRecommendation(store);
    expect(r.headline).toContain('Rice');
    expect(r.metric?.label).toBe('In stock');
  });

  it('never shows a figure for a store with no records', () => {
    const r = flowTopRecommendation(makeStore());
    expect(r.metric).toBeUndefined();
    expect([r.headline, r.detail].join(' ')).not.toMatch(/₦[1-9]/);
  });
});
