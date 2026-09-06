import { beforeEach, describe, expect, it } from 'vitest';
import {
  acknowledgeStockLoss,
  getStockLossNotice,
  markStockLossRaised,
  resetStockLossNotice,
} from '@/lib/stock-loss-notice';
import type { StoreData } from '@/types/store';

/**
 * Shrinkage was recorded by stock counts and then never mentioned — it only
 * appeared as a line inside the leak detector, which the merchant has to go
 * looking for.
 *
 * Raising it has to be cheap for them, though. A shortfall does not become
 * more true by being repeated, so this says nothing until the loss is worth
 * an interruption, says it at most once a week, and stops entirely once the
 * merchant says they understand.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const DAY = 86400000;

function shop(audits: Array<{ id: string; day: number; variance: number; product: string }>): StoreData {
  const sales: any[] = [];
  // ₦20,000 profit a day, so a day's profit is a meaningful yardstick.
  for (let day = 0; day < 30; day++) {
    sales.push({ id: `s-${day}`, productId: 'rice', productName: 'Rice 50kg', quantity: 1,
      unitPrice: 100000, total: 100000, profit: 20000, date: daysAgo(day) });
  }
  return {
    id: 's', storeId: 'SF', storeName: 'S', accessCode: 'A', storeType: 'provision',
    createdAt: daysAgo(200),
    products: [
      { id: 'rice', name: 'Rice 50kg', category: 'x', costPrice: 70000, sellingPrice: 87500, quantity: 10 },
      { id: 'sugar', name: 'Sugar 1kg', category: 'x', costPrice: 1000, sellingPrice: 1200, quantity: 40 },
    ] as any,
    sales: sales as any,
    expenses: [],
    stockCountAudits: audits.map(a => ({
      id: a.id, date: daysAgo(a.day), expected: 10, actual: 10 + a.variance,
      variance: a.variance, product: a.product,
    })),
  } as StoreData;
}

const BIG_LOSS = [{ id: 'a1', day: 3, variance: -2, product: 'Rice 50kg' }];      // ₦140,000
const TINY_LOSS = [{ id: 'a2', day: 3, variance: -1, product: 'Sugar 1kg' }];    // ₦1,000

beforeEach(() => resetStockLossNotice());

describe('it speaks up when stock actually goes missing', () => {
  it('reports the units and what they were worth', () => {
    const notice = getStockLossNotice(shop(BIG_LOSS));
    expect(notice).toBeTruthy();
    expect(notice!.units).toBe(2);
    expect(notice!.value).toBe(140_000);
    expect(notice!.body).toContain('140,000');
  });

  it('says nothing when nothing is missing', () => {
    expect(getStockLossNotice(shop([]))).toBeNull();
  });

  it('ignores a shortfall from months ago', () => {
    expect(getStockLossNotice(shop([{ id: 'old', day: 120, variance: -5, product: 'Rice 50kg' }]))).toBeNull();
  });
});

describe('it does not interrupt over something trivial', () => {
  it('stays quiet for a loss worth a fraction of a day', () => {
    // ₦1,000 against ₦20,000 of daily profit.
    expect(getStockLossNotice(shop(TINY_LOSS))).toBeNull();
  });
});

describe('it does not repeat itself', () => {
  it('holds its tongue for a week after raising the subject', () => {
    const store = shop(BIG_LOSS);
    expect(getStockLossNotice(store)).toBeTruthy();
    markStockLossRaised(store);
    expect(getStockLossNotice(store)).toBeNull();
  });

  it('is willing to mention it again after the quiet period', () => {
    const store = shop(BIG_LOSS);
    markStockLossRaised(store);
    expect(getStockLossNotice(store, Date.now() + 8 * DAY)).toBeTruthy();
  });
});

describe('"I understand" ends it', () => {
  it('never raises the same shortfall again once acknowledged', () => {
    const store = shop(BIG_LOSS);
    markStockLossRaised(store);
    acknowledgeStockLoss();
    expect(getStockLossNotice(store)).toBeNull();
    // Not even much later — the merchant has dealt with it.
    expect(getStockLossNotice(store, Date.now() + 90 * DAY)).toBeNull();
  });

  it('still speaks up about a different shortfall later', () => {
    const store = shop(BIG_LOSS);
    markStockLossRaised(store);
    acknowledgeStockLoss();
    expect(getStockLossNotice(store)).toBeNull();

    // Stock goes missing again — a new subject, not the acknowledged one.
    const worse = shop([...BIG_LOSS, { id: 'a3', day: 1, variance: -3, product: 'Rice 50kg' }]);
    expect(getStockLossNotice(worse)).toBeTruthy();
  });
});

describe('it survives a browser that refuses to store anything', () => {
  it('does not throw when localStorage is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('blocked'); },
    });
    try {
      expect(() => getStockLossNotice(shop(BIG_LOSS))).not.toThrow();
      expect(() => acknowledgeStockLoss()).not.toThrow();
      expect(() => markStockLossRaised(shop(BIG_LOSS))).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});
