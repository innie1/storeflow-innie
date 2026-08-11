import { describe, expect, it } from 'vitest';
import { buildSmartBuyList } from './flow-smart-buy-list';

const date = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function store() {
  return {
    storeName: 'Test Store',
    accessCode: 'TEST01',
    cashBalance: 100000,
    bankBalance: 0,
    walletBalance: 0,
    products: [
      { id: 'fast', name: 'Fast Item', costPrice: 1000, sellingPrice: 1400, quantity: 1, category: 'Food' },
      { id: 'dead', name: 'Dead Item', costPrice: 1000, sellingPrice: 1400, quantity: 1, category: 'Food' },
      { id: 'recent', name: 'Recent Item', costPrice: 5000, sellingPrice: 7000, quantity: 0, category: 'Food' },
    ],
    sales: [
      ...Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, productId: 'fast', productName: 'Fast Item', quantity: 2, unitPrice: 1400, total: 2800, profit: 800, date: date(i + 1) })),
      { id: 'sr', productId: 'recent', productName: 'Recent Item', quantity: 2, unitPrice: 7000, total: 14000, profit: 4000, date: date(3) },
      { id: 'sd', productId: 'dead', productName: 'Dead Item', quantity: 1, unitPrice: 1400, total: 1400, profit: 400, date: date(90) },
    ],
    restocks: [
      { id: 'r1', productId: 'fast', productName: 'Fast Item', quantity: 12, costPrice: 1000, total: 12000, date: date(8), funding: 'balance' },
      { id: 'r2', productId: 'fast', productName: 'Fast Item', quantity: 10, costPrice: 1000, total: 10000, date: date(25), funding: 'balance' },
      { id: 'r3', productId: 'fast', productName: 'Fast Item', quantity: 12, costPrice: 1000, total: 12000, date: date(45), funding: 'balance' },
    ],
    expenses: [],
  } as any;
}

describe('Flow smart buy list', () => {
  it('does not select a product just because it is low when it is dead stock', () => {
    const result = buildSmartBuyList(store(), 100000);
    expect(result.items.some(item => item.productId === 'dead')).toBe(false);
  });

  it('prioritises recent demand and uses the stated budget', () => {
    const result = buildSmartBuyList(store(), 20000);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.estimatedCost).toBeLessThanOrEqual(20000);
    expect(result.items.some(item => item.productId === 'recent' || item.productId === 'fast')).toBe(true);
  });
});
