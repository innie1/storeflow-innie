import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore, recordCheckout, recordSale, getAvailableBalance, deleteSale, restoreTrashItem, addPaymentToPending, deletePendingPayment, deleteProduct, receiveStock, syncBackorder, updateProduct, transferStock, saveStore, loadStore, syncProductPerformance } from '@/lib/store-data';
import { salePrice, stockBase } from '@/lib/inventory-sale-math';
import type { Product, StoreData } from '@/types/store';

function shop(pack = 1): StoreData {
  const s = createStore('Integrity test', 'retail');
  return { ...s, storeId: undefined, managerSettings: { ...s.managerSettings!, autoBackupsEnabled: false, multiDeviceSync: false }, cashBalance: 0, bankBalance: 0, products: [{ id: 'p', name: 'Soap', quantity: 10, costPrice: 600, sellingPrice: 1000, category: 'Goods', isCartonSingleEnabled: pack > 1, singlesPerCarton: pack, singleSellingPrice: 100 }], sales: [], expenses: [], investments: [], restocks: [], customers: [], pendingPayments: [] };
}
function buy(s: StoreData, paid = 1000, opts = {}) {
  const result = recordCheckout(s, [{ productId: 'p', quantity: 1 }], { paid, method: 'cash', ...opts });
  expect(result.error).toBeUndefined();
  return result;
}
beforeEach(() => localStorage.clear());

describe('inventory checkout integrity', () => {
  it.each([6, 12, 24])('sells every piece in a %i-piece carton exactly', pack => {
    let s = shop(pack); s.products[0].quantity = 1;
    for (let i = 0; i < pack; i++) {
      const r = recordCheckout(s, [{ productId: 'p', quantity: 1, saleType: 'single' }], { paid: 100, method: 'cash' });
      expect(r.error).toBeUndefined(); s = r.store;
    }
    expect(stockBase(s.products[0])).toBe(0); expect(s.products[0].quantity).toBe(0);
    expect(s.products[0].units_sold).toBe(pack);
  });
  it('rejects an entire cart when one line is unavailable, with no persisted side effects', () => {
    const s = shop(); s.products.push({ ...s.products[0], id: 'empty', quantity: 0 });
    const spy = vi.spyOn(typeof Storage !== 'undefined' && localStorage instanceof Storage ? Storage.prototype : localStorage, 'setItem'); spy.mockClear();
    const r = recordCheckout(s, [{ productId: 'p', quantity: 1 }, { productId: 'empty', quantity: 1 }], { paid: 2000, method: 'cash' });
    expect(r.error).toContain('Not enough'); expect(r.store).toBe(s); expect(s.sales).toHaveLength(0); expect(spy).not.toHaveBeenCalled(); spy.mockRestore();
  });
  it('validates combined carton and piece quantities', () => {
    const s = shop(12); s.products[0].quantity = 1;
    expect(recordCheckout(s, [{ productId: 'p', quantity: 1 }, { productId: 'p', quantity: 1, saleType: 'single' }], { paid: 1100, method: 'cash' }).error).toContain('Not enough');
  });
  it('rejects invalid quantities, missing products and stale prices', () => {
    for (const quantity of [NaN, Infinity, -1, 0]) expect(recordCheckout(shop(), [{ productId: 'p', quantity }], { paid: 1000, method: 'cash' }).error).toBeTruthy();
    expect(recordCheckout(shop(), [{ productId: 'missing', quantity: 1 }], { paid: 1000, method: 'cash' }).error).toBeTruthy();
    expect(recordCheckout(shop(), [{ productId: 'p', quantity: 1, expectedUnitPrice: 500 }], { paid: 1000, method: 'cash' }).error).toContain('price');
  });
  it('persists checkout once, after discount and payment are complete', () => {
    const s = shop(); const spy = vi.spyOn(typeof Storage !== 'undefined' && localStorage instanceof Storage ? Storage.prototype : localStorage, 'setItem'); spy.mockClear();
    const r = buy(s, 900, { discount: 100 });
    const saves = spy.mock.calls.filter(([key]) => key === `storeflow_${s.accessCode}`);
    expect(saves).toHaveLength(1); expect(JSON.parse(saves[0][1]).sales[0].total).toBe(900);
    expect(r.subtotal).toBe(1000); expect(r.total).toBe(900); expect(r.discount).toBe(100); spy.mockRestore();
  });
  it('allocates rounding remainders so discounted lines and cash match the receipt', () => {
    const s = shop(); s.products[0].sellingPrice = 1;
    const r = recordCheckout(s, Array.from({ length: 3 }, () => ({ productId: 'p', quantity: 1 })), { paid: 2.99, discount: 0.01, method: 'cash' });
    expect(r.sales.reduce((sum, sale) => sum + sale.total, 0)).toBeCloseTo(2.99);
    expect(r.sales.reduce((sum, sale) => sum + sale.paymentAllocation!.cash, 0)).toBeCloseTo(2.99);
  });
  it('uses the same two-decimal single price everywhere', () => {
    const s = shop(12); s.products[0].singleSellingPrice = undefined;
    const r = recordCheckout(s, [{ productId: 'p', quantity: 1, saleType: 'single' }], { paid: salePrice(s.products[0], 'single'), method: 'cash' });
    expect(r.total).toBe(83.33); expect(r.balance).toBe(0);
  });
  it('includes both deposits and later repayments in available balance', () => {
    let s = buy(shop(), 200, { customerName: 'Ada' }).store;
    expect(getAvailableBalance(s)).toBe(200);
    s = addPaymentToPending(s, s.pendingPayments![0].id, 800, 'transfer');
    expect(getAvailableBalance(s)).toBe(1000); expect(s.cashBalance).toBe(200); expect(s.bankBalance).toBe(800);
  });
  it('rejects overpayments, missing debts and duplicate settlement', () => {
    const s = buy(shop(), 200, { customerName: 'Ada' }).store;
    expect(() => addPaymentToPending(s, s.pendingPayments![0].id, 1000)).toThrow();
    expect(() => addPaymentToPending(s, 'missing', 10)).toThrow();
    const paid = addPaymentToPending(s, s.pendingPayments![0].id, 800);
    expect(() => addPaymentToPending(paid, s.pendingPayments![0].id, 800)).toThrow();
  });
  it('records and reverses the actual mixed split', () => {
    const s = buy(shop(), 1000, { method: 'mixed', allocation: { cash: 200, bank: 800 } }).store;
    expect(s.cashBalance).toBe(200); expect(s.bankBalance).toBe(800);
    const reversed = deleteSale(s, s.sales[0].id);
    expect(reversed.cashBalance).toBe(0); expect(reversed.bankBalance).toBe(0);
    expect(recordCheckout(shop(), [{ productId: 'p', quantity: 1 }], { paid: 1000, method: 'mixed' }).error).toContain('cash and bank');
  });
  it('reverses and restores a credit transaction with later payments', () => {
    let s = buy(shop(), 200, { customerName: 'Ada' }).store;
    s = addPaymentToPending(s, s.pendingPayments![0].id, 300, 'transfer');
    const reversed = deleteSale(s, s.sales[0].id);
    expect(reversed.products[0].quantity).toBe(10); expect(reversed.cashBalance).toBe(0); expect(reversed.bankBalance).toBe(0);
    expect(reversed.customers![0].purchaseHistory).toHaveLength(0);
    expect(reversed.pendingPayments).toHaveLength(0); expect(reversed.customers![0].outstandingDebt).toBe(0);
    const restored = restoreTrashItem(reversed, reversed.trash![0].id);
    expect(restored.products[0].quantity).toBe(9); expect(restored.cashBalance).toBe(200); expect(restored.bankBalance).toBe(300);
    expect(restored.customers![0].purchaseHistory).toHaveLength(1);
    expect(restored.pendingPayments![0].balance).toBe(500); expect(restored.customers![0].outstandingDebt).toBe(500);
  });
  it('archives a product without erasing history and restores its availability', () => {
    const s = buy(shop()).store; const archived = deleteProduct(s, 'p');
    expect(archived.sales).toEqual(s.sales); expect(archived.products[0].discontinued).toBe(true);
    expect(recordCheckout(archived, [{ productId: 'p', quantity: 1 }], { paid: 1000, method: 'cash' }).error).toBeTruthy();
    expect(restoreTrashItem(archived, archived.trash![0].id).products[0].discontinued).toBe(false);
  });
  it('keeps historical piece conversion after carton size changes', () => {
    const s = shop(12);
    const sold = recordCheckout(s, [{ productId: 'p', quantity: 1, saleType: 'single' }], { paid: 100, method: 'cash' }).store;
    const changed = updateProduct(sold, 'p', { singlesPerCarton: 24 });
    expect(stockBase(changed.products[0])).toBe(119);
    const restored = deleteSale(changed, changed.sales[0].id);
    expect(stockBase(restored.products[0])).toBe(120);
  });
  it('honours balance funding before the first sale and weights costs', () => {
    const s = shop(); s.cashBalance = 20000;
    const r = receiveStock(s, [{ productId: 'p', quantity: 10, costPrice: 800 }], 'balance');
    expect(r.cashBalance).toBe(12000); expect(r.investments).toHaveLength(0); expect(r.products[0].costPrice).toBe(700);
    const r2 = receiveStock(r, [{ productId: 'p', quantity: 10, costPrice: 800 }], 'balance');
    expect(r2.cashBalance).toBe(4000);
  });
  it('aggregates repeated restock lines without losing quantity', () => {
    const r = receiveStock(shop(), [{ productId: 'p', quantity: 1, costPrice: 600 }, { productId: 'p', quantity: 2, costPrice: 900 }]);
    expect(r.products[0].quantity).toBe(13); expect(r.restocks![0].total).toBe(2400);
  });
  it('fulfils only available backorder stock and reverses only delivered stock', () => {
    const s = shop(); s.products[0].quantity = 0; s.managerSettings!.backorderSellingEnabled = true;
    const r = recordCheckout(s, [{ productId: 'p', quantity: 5 }], { paid: 5000, method: 'cash' });
    expect(r.error).toBeUndefined();
    const stocked = receiveStock(r.store, [{ productId: 'p', quantity: 2, costPrice: 600 }], 'new_money');
    const fulfilled = syncBackorder(stocked, 'p');
    expect(fulfilled.products[0].backorderedQty).toBe(3); expect(fulfilled.sales[0].backorderQuantity).toBe(3);
    const reversed = deleteSale(fulfilled, fulfilled.sales[0].id);
    expect(reversed.products[0].quantity).toBe(2); expect(reversed.products[0].backorderedQty).toBe(0);
  });
  it('uses selected customer identity and never merges different phone numbers by name', () => {
    const first = buy(shop(), 0, { customerName: 'Ada', customerPhone: '0801' }).store;
    const second = buy(first, 0, { customerName: 'Ada', customerPhone: '0802' }).store;
    expect(second.customers).toHaveLength(2);
    const third = buy(second, 0, { customerName: 'Ada', customerId: first.customers![0].id }).store;
    expect(third.pendingPayments![0].customerId).toBe(first.customers![0].id);
    expect(recordCheckout(second, [{ productId: 'p', quantity: 1 }], { paid: 0, method: 'cash', customerName: 'Ada' }).error).toContain('More than one');
  });
  it('writes off debt while retaining payments and invoice history', () => {
    const s = buy(shop(), 200, { customerName: 'Ada' }).store;
    const r = deletePendingPayment(s, s.pendingPayments![0].id);
    expect(r.pendingPayments![0].status).toBe('written_off'); expect(r.pendingPayments![0].writtenOffAmount).toBe(800); expect(r.pendingPayments![0].paid).toBe(200);
    expect(r.customers![0].outstandingDebt).toBe(0); expect(getAvailableBalance(r)).toBe(200);
  });
  it('refuses missing or same-store transfer destinations without removing stock', () => {
    const s = shop(); expect(() => transferStock(s, 'p', 1, 'MISSING')).toThrow(); expect(() => transferStock(s, 'p', 1, s.accessCode)).toThrow(); expect(s.products[0].quantity).toBe(10);
  });
  it('preserves pack settings and pieces across a transfer', () => {
    const source = shop(12); const dest = shop(); dest.products = []; saveStore(dest);
    const result = transferStock(source, 'p', 1, dest.accessCode);
    expect(stockBase(result.products[0])).toBe(108);
    const received = loadStore(dest.accessCode)!;
    expect(received.products[0].singlesPerCarton).toBe(12); expect(stockBase(received.products[0])).toBe(12);
    expect(localStorage.getItem('storeflow_transfer_journal')).toBeNull();
  });
  it('normalizes wholesale and retail performance to pieces', () => {
    let s = shop(12); s = recordSale(s, 'p', 1); s = recordSale(s, 'p', 1, undefined, undefined, undefined, 'single');
    expect(syncProductPerformance(s).products[0].units_sold).toBe(13);
  });
});
