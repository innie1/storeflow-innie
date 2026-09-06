import { describe, expect, it } from 'vitest';
import { inventoryIntelligence, getTopOpportunities } from '@/lib/manager-intel';
import type { StoreData } from '@/types/store';

/**
 * Restock advice was ranked by days of cover alone, and "has demand" meant
 * "has ever sold".
 *
 * So a product that sold one unit three months ago and then nothing sat at
 * zero stock scoring zero days left — the top of the list — beside a line that
 * shifts twenty a day at a healthy margin. Both were called critical, both
 * were "worth restocking", and the merchant was told to spend money on the
 * dead one first. Days of cover says how soon something runs out; it says
 * nothing about whether running out costs anything.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

interface Line { id: string; name: string; cost: number; price: number; qty: number }

function shop(lines: Line[], sales: { id: string; day: number; qty: number }[]): StoreData {
  return {
    id: 's', storeId: 'SF', storeName: 'S', accessCode: 'A', storeType: 'provision',
    createdAt: daysAgo(200),
    products: lines.map(l => ({
      id: l.id, name: l.name, category: 'x', costPrice: l.cost, sellingPrice: l.price, quantity: l.qty,
    })) as any,
    sales: sales.flatMap(s =>
      Array.from({ length: s.qty }, (_, i) => {
        const line = lines.find(l => l.id === s.id)!;
        return {
          id: `${s.id}-${s.day}-${i}`, productId: s.id, productName: line.name, quantity: 1,
          unitPrice: line.price, total: line.price, profit: line.price - line.cost, date: daysAgo(s.day),
        };
      }),
    ) as any,
    expenses: [],
  } as StoreData;
}

const FAST_EARNER: Line = { id: 'rice', name: 'Rice 50kg', cost: 70000, price: 87500, qty: 0 };
const ONE_OFF: Line = { id: 'lamp', name: 'Kerosene lamp', cost: 3000, price: 3500, qty: 0 };
const THIN: Line = { id: 'sugar', name: 'Sugar 1kg', cost: 1000, price: 1050, qty: 0 };

/** Rice sells every day. The lamp sold once, ninety days back. */
function realisticShop() {
  const sales = [
    ...Array.from({ length: 14 }, (_, d) => ({ id: 'rice', day: d, qty: 6 })),
    { id: 'lamp', day: 90, qty: 1 },
  ];
  return shop([FAST_EARNER, ONE_OFF], sales);
}

describe('one sale a quarter ago is not demand', () => {
  it('does not call a long-dead product worth restocking', () => {
    const lamp = inventoryIntelligence(realisticShop()).find(f => f.product.id === 'lamp');
    expect(lamp?.worthRestocking).toBe(false);
  });

  it('still counts a product that sold within the recent window', () => {
    const recent = shop([ONE_OFF], [{ id: 'lamp', day: 20, qty: 4 }]);
    const lamp = inventoryIntelligence(recent).find(f => f.product.id === 'lamp');
    expect(lamp?.worthRestocking).toBe(true);
  });

  it('suggests no quantity for something with no demand behind it', () => {
    const lamp = inventoryIntelligence(realisticShop()).find(f => f.product.id === 'lamp');
    // This used to propose a flat 10 units for anything with no sales history.
    expect(lamp?.restockQty).toBe(0);
  });
});

describe('what is losing the most money comes first', () => {
  it('puts the fast earner above the one-off, though both are at zero', () => {
    const order = inventoryIntelligence(realisticShop()).map(f => f.product.id);
    expect(order.indexOf('rice')).toBeLessThan(order.indexOf('lamp'));
  });

  it('prefers margin when two products sell at the same rate', () => {
    // Both shift six a day; rice earns ₦17,500 a unit, sugar ₦50.
    const sales = [
      ...Array.from({ length: 14 }, (_, d) => ({ id: 'rice', day: d, qty: 6 })),
      ...Array.from({ length: 14 }, (_, d) => ({ id: 'sugar', day: d, qty: 6 })),
    ];
    const order = inventoryIntelligence(shop([THIN, FAST_EARNER], sales)).map(f => f.product.id);
    expect(order.indexOf('rice')).toBeLessThan(order.indexOf('sugar'));
  });

  it('prices the risk as demand times margin', () => {
    const rice = inventoryIntelligence(realisticShop()).find(f => f.product.id === 'rice');
    expect(rice?.unitProfit).toBe(17_500);
    expect(rice?.dailyProfitAtRisk).toBeGreaterThan(0);
  });

  it('does not drop the dead product from view, only from the top', () => {
    // The merchant should still be able to see the shelf is empty.
    const ids = inventoryIntelligence(realisticShop()).map(f => f.product.id);
    expect(ids).toContain('lamp');
  });
});

describe('the opportunity card recommends something worth buying', () => {
  it('never proposes restocking a product with no recent demand', () => {
    const store = shop([ONE_OFF], [{ id: 'lamp', day: 90, qty: 1 }]);
    const restock = getTopOpportunities(store).find(o => o.title.startsWith('Restock'));
    expect(restock).toBeUndefined();
  });

  it('picks the fast, profitable line when there is one', () => {
    const restock = getTopOpportunities(realisticShop()).find(o => o.title.startsWith('Restock'));
    expect(restock?.title).toContain('Rice 50kg');
    expect(restock?.impactAmount).toBeGreaterThan(0);
  });
});
