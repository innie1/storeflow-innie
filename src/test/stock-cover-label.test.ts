import { describe, expect, it } from 'vitest';
import { inventoryIntelligence, stockCoverLabel, generateAdvice, generateNotifications } from '@/lib/manager-intel';
import type { StoreData } from '@/types/store';

/**
 * A product that has not sold in the sampling window has no sales rate to
 * divide its stock by, so days-of-cover came out as Infinity. Only one of the
 * fifteen places that formatted it guarded against that, so the advice cards
 * read "Infinityd left · order 10" and the restock notification said a product
 * "runs out in Infinity days".
 *
 * The quieter half of the same bug: those products were also being bundled
 * into the Auto Fix purchase order at 10 units each. They are low on stock
 * precisely because nothing is moving, so reordering turns cash into more dead
 * stock — which is the mistake the smart buy list exists to avoid.
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
    expenses: [],
    createdAt: new Date(0).toISOString(),
    ...overrides,
  } as StoreData;
}

/** Low on stock, and nothing has sold — the case that produced "Infinityd". */
const stale = { id: 'p-stale', name: 'Predator', category: 'Drinks', costPrice: 200, sellingPrice: 300, quantity: 2 };
/** Low on stock, but genuinely selling. */
const moving = { id: 'p-move', name: 'Bigi', category: 'Drinks', costPrice: 200, sellingPrice: 300, quantity: 3 };

const movingSales = Array.from({ length: 14 }, (_, i) => ({
  id: `s${i}`, productId: 'p-move', productName: 'Bigi', quantity: 2,
  unitPrice: 300, total: 600, profit: 200, date: daysAgo(i),
}));

describe('days of cover is never shown as Infinity', () => {
  it('says the product is not selling instead of printing Infinity', () => {
    const store = makeStore({ products: [stale as any] });
    const forecast = inventoryIntelligence(store).find(f => f.product.id === 'p-stale')!;

    expect(forecast.hasVelocity).toBe(false);
    expect(stockCoverLabel(forecast)).toBe('Low stock, but nothing sold in the last 14 days');
    expect(stockCoverLabel(forecast, { short: true })).toBe('Not selling');
    expect(stockCoverLabel(forecast)).not.toMatch(/Infinity/);
  });

  it('still gives a real number when there is a real sales rate', () => {
    const store = makeStore({ products: [moving as any], sales: movingSales as any });
    const forecast = inventoryIntelligence(store).find(f => f.product.id === 'p-move')!;

    expect(forecast.hasVelocity).toBe(true);
    expect(stockCoverLabel(forecast, { short: true })).toMatch(/^\d+d left$|^Runs out today$/);
  });

  it('separates sold out from sold out and never wanted', () => {
    const neverSold = makeStore({ products: [{ ...stale, quantity: 0 } as any] });
    expect(stockCoverLabel(inventoryIntelligence(neverSold)[0])).toBe('Sold out, and it has never sold');

    const soldBefore = makeStore({
      products: [{ ...stale, quantity: 0 } as any],
      sales: [{ id: 'old', productId: 'p-stale', productName: 'Predator', quantity: 3, unitPrice: 300, total: 900, profit: 300, date: daysAgo(40) }] as any,
    });
    expect(stockCoverLabel(inventoryIntelligence(soldBefore)[0])).toBe('Sold out');
  });

  it('keeps Infinity out of every advice card and notification', () => {
    const store = makeStore({
      products: [stale as any, moving as any, { id: 'p2', name: 'Fearless', category: 'Drinks', costPrice: 200, sellingPrice: 300, quantity: 1 } as any],
      sales: movingSales as any,
    });

    const text = [
      ...generateAdvice(store, []).flatMap(a => [a.title, a.detail, ...(a.items || []).map(i => `${i.name} ${i.note}`)]),
      ...generateNotifications(store).flatMap(n => [n.text, n.title, n.description].filter(Boolean) as string[]),
    ].join(' | ');

    expect(text).not.toMatch(/Infinity/);
    expect(text).not.toMatch(/NaN/);
  });
});

describe('restock advice follows demand, not just stock level', () => {
  it('does not put a product with no sales into the Auto Fix purchase order', () => {
    const store = makeStore({
      products: [stale as any, moving as any],
      sales: movingSales as any,
    });

    const purchaseOrders = generateAdvice(store, [])
      .map(a => a.autoFix)
      .filter(f => f?.type === 'generate_purchase_order');

    const ordered = purchaseOrders.flatMap(f => (f!.payload.items as any[]).map(i => i.productId));
    expect(ordered).not.toContain('p-stale');
    // Asserting only the absence would also pass if restock advice stopped
    // being produced at all, which is exactly how a half-applied version of
    // this change slipped through — the product that IS selling must still be
    // ordered.
    expect(ordered).toContain('p-move');
  });

  it('still restocks something that sold out but has a sales history', () => {
    const store = makeStore({
      products: [{ ...moving, quantity: 0 } as any],
      sales: [{ id: 'old', productId: 'p-move', productName: 'Bigi', quantity: 5, unitPrice: 300, total: 1500, profit: 500, date: daysAgo(40) }] as any,
    });

    const forecast = inventoryIntelligence(store)[0];
    // No sales in the 14-day window, but only because there was nothing left
    // to sell — that must not be read as "nobody wants it".
    expect(forecast.hasVelocity).toBe(false);
    expect(forecast.worthRestocking).toBe(true);
    expect(stockCoverLabel(forecast)).toBe('Sold out');

    const ordered = generateAdvice(store, [])
      .map(a => a.autoFix)
      .filter(f => f?.type === 'generate_purchase_order')
      .flatMap(f => (f!.payload.items as any[]).map(i => i.productId));
    expect(ordered).toContain('p-move');
  });

  it('surfaces the not-selling stock separately, without a quantity to order', () => {
    const store = makeStore({ products: [stale as any] });
    const card = generateAdvice(store, []).find(a => a.id === 'stock-no-demand');

    expect(card).toBeTruthy();
    expect(card!.title).toMatch(/not selling/);
    expect(card!.autoFix).toBeUndefined();
    expect(card!.items![0].note).toMatch(/no recent sales/);
  });
});
