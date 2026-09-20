import { describe, expect, it, beforeEach } from 'vitest';
import { recordCheckout } from '@/lib/store-data';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * The goods come to 1,500. The customer holds out 2,000.
 *
 * The counter typed 2,000, the screen quietly clamped it back to 1,500 and
 * said the balance was nil - true, and no use to anybody. Nothing worked out
 * the 500 to hand back, and nothing on the record or the receipt said that
 * 2,000 had crossed the counter and 500 had gone back.
 *
 * The shop is paid the price of the goods. The rest is the customer's own
 * money passing through the drawer: it is shown, it is written down, and it is
 * never counted as takings.
 */

const shop = (): StoreData => ({
  storeName: 'Corner Provisions',
  accessCode: 'TEST02',
  createdAt: new Date().toISOString(),
  products: [
    { id: 'p1', name: 'Rice 5kg', costPrice: 1000, sellingPrice: 1500, quantity: 10, category: 'Food' },
    { id: 'p2', name: 'Oil 1L', costPrice: 600, sellingPrice: 900, quantity: 10, category: 'Food' },
  ],
  sales: [],
  customers: [],
  pendingPayments: [],
  cashBalance: 0,
  bankBalance: 0,
  managerSettings: { autoBackupsEnabled: false },
} as unknown as StoreData);

beforeEach(() => { localStorage.clear(); });

describe('a customer who hands over more than the goods cost', () => {
  it('works out the change', () => {
    const result = recordCheckout(shop(), [{ productId: 'p1', quantity: 1 }], { paid: 1500, method: 'cash', tendered: 2000, deferSave: true });

    expect(result.error).toBeUndefined();
    expect(result.total).toBe(1500);
    expect(result.changeGiven).toBe(500);
    expect(result.tendered).toBe(2000);
  });

  it('takes the price of the goods, not what was held out', () => {
    // The 500 is the customer's, on its way back to them. Counting it would
    // overstate a day's takings by every note anybody ever broke.
    const result = recordCheckout(shop(), [{ productId: 'p1', quantity: 1 }], { paid: 1500, method: 'cash', tendered: 2000, deferSave: true });

    expect(result.paid).toBe(1500);
    expect(result.balance).toBe(0);
    expect(result.store.cashBalance).toBe(1500);
    expect(result.sales[0].total).toBe(1500);
    expect(result.sales[0].profit).toBe(500);
  });

  it('books the price of the goods even when the whole amount is offered as payment', () => {
    /*
     * The checkout screen caps what it sends, but it is not the only caller -
     * Simple Mode, Flow and the order screens all record sales - and a caller
     * that hands over the full 2,000 as the payment must not make the shop
     * 500 richer than it is. The books are guarded here, not on one screen.
     */
    const result = recordCheckout(shop(), [{ productId: 'p1', quantity: 1 }], { paid: 2000, method: 'cash', tendered: 2000, deferSave: true });

    expect(result.paid).toBe(1500);
    expect(result.store.cashBalance).toBe(1500);
    expect(result.changeGiven).toBe(500);
  });

  it('writes down what was brought and what went back', () => {
    const result = recordCheckout(shop(), [{ productId: 'p1', quantity: 1 }], { paid: 1500, method: 'cash', tendered: 2000, deferSave: true });

    expect(result.sales[0].amountTendered).toBe(2000);
    expect(result.sales[0].changeGiven).toBe(500);
  });

  it('writes it once for the basket, not once per item', () => {
    // One amount crosses the counter for the whole basket; three lines each
    // claiming the same 2,000 would be three customers' money.
    const result = recordCheckout(shop(), [
      { productId: 'p1', quantity: 1 },
      { productId: 'p2', quantity: 1 },
    ], { paid: 2400, method: 'cash', tendered: 3000, deferSave: true });

    expect(result.changeGiven).toBe(600);
    expect(result.sales.filter(sale => sale.amountTendered !== undefined)).toHaveLength(1);
    expect(result.sales[0].amountTendered).toBe(3000);
  });

  it('says nothing when the money is exact', () => {
    const result = recordCheckout(shop(), [{ productId: 'p1', quantity: 1 }], { paid: 1500, method: 'cash', tendered: 1500, deferSave: true });

    expect(result.changeGiven).toBe(0);
    expect(result.sales[0].amountTendered).toBeUndefined();
    expect(result.sales[0].changeGiven).toBeUndefined();
  });

  it('leaves a part payment alone', () => {
    // Less than the price is a debt, not change, and must still be one.
    const result = recordCheckout(shop(), [{ productId: 'p1', quantity: 1 }], {
      paid: 1000, method: 'cash', tendered: 1000, customerName: 'Ada Obi', deferSave: true,
    });

    expect(result.changeGiven).toBe(0);
    expect(result.balance).toBe(500);
    expect(result.pending?.balance).toBe(500);
  });

  it('behaves as it always did when nothing says what was handed over', () => {
    // Every other caller - Simple Mode, Flow, an online order - passes no
    // tender at all, and none of them should start reporting change.
    const result = recordCheckout(shop(), [{ productId: 'p1', quantity: 1 }], { paid: 1500, method: 'cash', deferSave: true });

    expect(result.changeGiven).toBe(0);
    expect(result.store.cashBalance).toBe(1500);
    expect(result.sales[0].amountTendered).toBeUndefined();
  });
});

describe('the counter is told, and so is the customer', () => {
  const sales = readSource('src/components/Sales.tsx');

  it('shows the change on the checkout, not just a nil balance', () => {
    expect(sales).toContain('const change = money(Math.max(0, tendered - total));');
    expect(sales).toContain('Change to give');
  });

  it('still takes only the price of the goods', () => {
    expect(sales).toContain('const paidNum = Math.min(total, tendered);');
  });

  it('lets the notes handed over add up past the price', () => {
    // These buttons added to the capped figure, so a second note could never
    // take the amount past the total and the change could never be worked out.
    expect(sales).toContain('onClick={() => onPaidChange(String(tendered + v))}');
  });

  it('puts it on the receipt the customer is given', () => {
    const receipt = readSource('src/components/SaleReceipt.tsx');
    expect(receipt).toContain('Cash received:');
    expect(receipt).toContain('Change:');
  });
});
