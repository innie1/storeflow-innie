import { describe, expect, it } from 'vitest';
import {
  createStore,
  getDashboardStats,
  getOperatingExpenses,
  isStockPurchase,
  receiveStock,
  recordCheckout,
  sumOperatingExpenses,
  sumStockPurchases,
} from '@/lib/store-data';
import type { Product, StoreData } from '@/types/store';

function newShop(): StoreData {
  const store = createStore('Accounting Test', 'retail');
  const product = {
    id: 'p1',
    name: 'Rice 50kg',
    costPrice: 600,
    sellingPrice: 1000,
    quantity: 0,
    category: 'retail',
  } as Product;
  return { ...store, products: [...store.products, product], cashBalance: 100_000 };
}

/**
 * A shop that is actually trading: opening stock in, one sale made. The very
 * first restock is treated as opening capital rather than a purchase, so this
 * is the state a real merchant is in when they reorder.
 */
function tradingShop(): StoreData {
  let store = receiveStock(newShop(), [{ productId: 'p1', quantity: 100, costPrice: 600 }]);
  store = recordCheckout(store, [{ productId: 'p1', quantity: 50 }], { paid: 50_000, method: 'cash' }).store;
  return store;
}

describe('buying stock is not an operating expense', () => {
  it('classifies a supplier payment as a stock purchase, not a running cost', () => {
    expect(isStockPurchase({ category: 'Restock', source: 'restock' })).toBe(true);
    expect(isStockPurchase({ category: 'Restock', source: 'manual' })).toBe(true);
    expect(isStockPurchase({ category: 'Rent', source: 'manual' })).toBe(false);
    expect(isStockPurchase({ category: 'Salaries', source: 'manual' })).toBe(false);
  });

  it('books opening stock as capital, not as a purchase', () => {
    const store = receiveStock(newShop(), [{ productId: 'p1', quantity: 100, costPrice: 600 }]);
    expect(store.products.find(p => p.id === 'p1')?.quantity).toBe(100);
    expect((store.investments || []).reduce((s, i) => s + i.amount, 0)).toBe(60_000);
    expect(sumStockPurchases(store)).toBe(0);
  });

  it('takes reorder money out of cash — the shop really did pay the supplier', () => {
    const before = tradingShop();
    const after = receiveStock(before, [{ productId: 'p1', quantity: 50, costPrice: 600 }]);

    expect((before.cashBalance ?? 0) - (after.cashBalance ?? 0)).toBe(30_000);
    expect(after.products.find(p => p.id === 'p1')?.quantity).toBe(100);
  });

  it('keeps that reorder out of profit, so restocking never reads as a loss', () => {
    const store = receiveStock(tradingShop(), [{ productId: 'p1', quantity: 50, costPrice: 600 }]);

    // The supplier payment is recorded and stays visible...
    expect(sumStockPurchases(store)).toBe(30_000);
    // ...but it is not a running cost.
    expect(sumOperatingExpenses(store)).toBe(0);
  });

  it('charges stock to the books once, when it sells', () => {
    const store = receiveStock(tradingShop(), [{ productId: 'p1', quantity: 50, costPrice: 600 }]);
    const stats = getDashboardStats(store);

    expect(stats.totalRevenue).toBe(50_000);
    // Cost of the 50 units sold is already inside profit.
    expect(stats.totalProfit).toBe(20_000);
    // Before the fix this was 20,000: the 30,000 reorder was subtracted here
    // as well as inside each sale's profit — the same stock charged twice.
    expect(stats.netIncome).toBe(50_000);
    expect(stats.stockPurchases).toBe(30_000);
  });

  it('still counts genuine running costs against profit', () => {
    let store = tradingShop();
    store = { ...store, expenses: [
      { id: 'r1', amount: 15_000, category: 'Rent', date: new Date().toISOString(), source: 'manual' },
      ...(store.expenses || []),
    ] };

    expect(sumOperatingExpenses(store)).toBe(15_000);
    expect(getOperatingExpenses(store).map(e => e.category)).toEqual(['Rent']);
    expect(getDashboardStats(store).netIncome).toBe(35_000);
  });

  it('can narrow either figure to a period', () => {
    const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const now = new Date().toISOString();
    const store = { expenses: [
      { id: 'a', amount: 5_000, category: 'Rent', date: old, source: 'manual' },
      { id: 'b', amount: 7_000, category: 'Rent', date: now, source: 'manual' },
      { id: 'c', amount: 90_000, category: 'Restock', date: now, source: 'restock' },
    ] } as any;

    const recent = (d: string) => Date.now() - new Date(d).getTime() < 30 * 86_400_000;
    expect(sumOperatingExpenses(store, recent)).toBe(7_000);
    expect(sumStockPurchases(store, recent)).toBe(90_000);
  });
});
