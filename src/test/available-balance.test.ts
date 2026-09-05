import { describe, expect, it } from 'vitest';
import {
  addExpense,
  addProduct,
  createStore,
  getAvailableBalance,
  getDashboardStats,
  receiveStock,
  recordCheckout,
} from '@/lib/store-data';
import type { Product, StoreData } from '@/types/store';

/**
 * The merchant's own description of Available Balance, walked step by step:
 *
 *   "Open the app and everything is zero. Record ₦500,000 of inventory — that
 *    is the first investment. Sell ₦10,000 and the available balance is
 *    ₦10,000. Spend ₦2,000 on transport and it is ₦8,000. Restock ₦6,000 from
 *    the balance and it is ₦2,000. Buy ₦10,000 more from the balance and it
 *    goes to −₦8,000, because that is a debt. Buy with new money instead and
 *    the ₦2,000 stays."
 */
function shop(): StoreData {
  return createStore('Balance Spec', 'retail');
}

function stock(store: StoreData, name: string, costPrice: number, quantity: number): StoreData {
  return addProduct(store, { name, costPrice, sellingPrice: costPrice * 2, quantity, category: 'retail' } as Omit<Product, 'id'>);
}

describe('available balance, as the shop owner describes it', () => {
  it('starts at zero on a brand new shop', () => {
    expect(getAvailableBalance(shop())).toBe(0);
  });

  it('stays at zero after recording opening inventory, and books it as capital', () => {
    // ₦500,000 of goods the owner already paid for. Money the shop holds:
    // still nothing. This used to read −₦500,000, because the same cost was
    // written as an expense as well as an investment.
    const store = stock(shop(), 'Opening stock', 500, 1000);

    expect(getAvailableBalance(store)).toBe(0);
    expect((store.investments || []).reduce((s, i) => s + i.amount, 0)).toBe(500_000);
    expect((store.expenses || []).length).toBe(0);
  });

  it('follows the whole week the owner described', () => {
    let store = stock(shop(), 'Rice', 500, 1000);
    const rice = store.products[0].id;

    // Sell ₦10,000 worth. Cost 500, sells for 1000, so 10 units.
    store = recordCheckout(store, [{ productId: rice, quantity: 10 }], { paid: 10_000, method: 'cash' }).store;
    expect(getAvailableBalance(store)).toBe(10_000);
    expect(getDashboardStats(store).totalRevenue).toBe(10_000);

    // Transport ₦2,000.
    store = addExpense(store, { amount: 2_000, category: 'Transport', date: new Date().toISOString() } as never);
    expect(getAvailableBalance(store)).toBe(8_000);

    // Restock ₦6,000 out of the balance.
    store = receiveStock(store, [{ productId: rice, quantity: 12, costPrice: 500 }], 'balance');
    expect(getAvailableBalance(store)).toBe(2_000);

    // Revenue never moved through any of that.
    expect(getDashboardStats(store).totalRevenue).toBe(10_000);
  });

  it('goes negative when the shop spends past the balance, because that is a debt', () => {
    let store = stock(shop(), 'Rice', 500, 1000);
    const rice = store.products[0].id;
    store = recordCheckout(store, [{ productId: rice, quantity: 10 }], { paid: 10_000, method: 'cash' }).store;
    store = addExpense(store, { amount: 2_000, category: 'Transport', date: new Date().toISOString() } as never);
    store = receiveStock(store, [{ productId: rice, quantity: 12, costPrice: 500 }], 'balance');
    expect(getAvailableBalance(store)).toBe(2_000);

    // ₦10,000 of goods against a ₦2,000 balance.
    store = receiveStock(store, [{ productId: rice, quantity: 20, costPrice: 500 }], 'balance');
    expect(getAvailableBalance(store)).toBe(-8_000);
  });

  it('leaves the balance alone when the owner pays with new money', () => {
    let store = stock(shop(), 'Rice', 500, 1000);
    const rice = store.products[0].id;
    store = recordCheckout(store, [{ productId: rice, quantity: 10 }], { paid: 10_000, method: 'cash' }).store;
    store = addExpense(store, { amount: 2_000, category: 'Transport', date: new Date().toISOString() } as never);
    store = receiveStock(store, [{ productId: rice, quantity: 12, costPrice: 500 }], 'balance');
    expect(getAvailableBalance(store)).toBe(2_000);

    const before = (store.investments || []).reduce((s, i) => s + i.amount, 0);
    store = receiveStock(store, [{ productId: rice, quantity: 20, costPrice: 500 }], 'new_money');

    // ₦2,000 stays, and the ₦10,000 is recorded as capital instead.
    expect(getAvailableBalance(store)).toBe(2_000);
    expect((store.investments || []).reduce((s, i) => s + i.amount, 0)).toBe(before + 10_000);
  });

  it('leaves goods sold on credit out until the customer pays', () => {
    let store = stock(shop(), 'Rice', 500, 1000);
    const rice = store.products[0].id;
    // Paid nothing: the whole sale is owed.
    store = recordCheckout(store, [{ productId: rice, quantity: 10 }], {
      paid: 0, method: 'cash', customerName: 'Ada', customerPhone: '08000000000',
    }).store;

    expect(getDashboardStats(store).totalRevenue).toBe(10_000);
    expect(getAvailableBalance(store)).toBe(0);
  });
});
