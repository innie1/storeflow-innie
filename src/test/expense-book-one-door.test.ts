import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { StoreData } from '@/types/store';
import { importProducts, receiveStock } from '@/lib/store-data';
import { markSupplyPurchased } from '@/lib/consumables';
import { setCurrentActor } from '@/lib/current-actor';

/**
 * Every expense comes into the book through expense-log.
 *
 * It used to arrive by four roads, each writing the book its own way, and
 * only one could log who spent the money - when its caller remembered, which
 * none did. This fails if new code adds to the book any other way, so the
 * next screen that records an expense cannot quietly skip the log.
 */

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('the expense book has one door', () => {
  it('is never added to except through enterExpenses', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file).replace(/\\/g, '/');
      if (rel === 'lib/expense-log.ts') continue;
      const text = readFileSync(file, 'utf-8');
      // An entry put into the book - `expenses: [newOne, ...old]` or
      // `expenses: [...old, newOne]` - or pushed onto it. A list of menu
      // items that happens to be called `expenses` starts with `{` or a
      // string, and is not the book.
      const writes = /\bexpenses:\s*\[\s*(\.\.\.|\w+\s*,)|\bexpenses\??\.(push|unshift)\(/g;
      for (const match of text.matchAll(writes)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${rel}:${line}: ${text.split('\n')[line - 1].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  }, 30000);
});

describe('every road says who spent it', () => {
  const shop = (): StoreData => ({
    storeName: 'Corner', accessCode: 'DOOR01', products: [{ id: 'p1', name: 'Rice', costPrice: 100, sellingPrice: 150, quantity: 1 }],
    sales: [{ id: 'x' }], expenses: [], customers: [], cashBalance: 50000, bankBalance: 0, walletBalance: 0,
    createdAt: new Date(0).toISOString(),
  } as unknown as StoreData);

  it('a restock', () => {
    setCurrentActor({ id: 's1', name: 'Faith', role: 'inventory' });
    const next = receiveStock(shop(), [{ productId: 'p1', quantity: 10, costPrice: 100 }], 'balance');
    expect(next.expenses![0]).toMatchObject({ category: 'Restock', recordedBy: { name: 'Faith' } });
    expect(next.activityLogs?.some(log => log.user === 'Faith' && log.action.startsWith('Recorded expense: Restock'))).toBe(true);
    setCurrentActor(null);
  });

  it('a bulk import', () => {
    const next = importProducts(shop(), [{ name: 'Beans', costPrice: 50, sellingPrice: 80, quantity: 4 }] as never);
    expect(next.expenses![0]).toMatchObject({ category: 'Restock', recordedBy: { name: 'Owner' } });
  });

  it('a supply bought', () => {
    const supply = { id: 'soap', name: 'Soap', unit: 'bag' };
    const next = markSupplyPurchased(shop(), { supply, amount: 1200 } as never);
    expect(next.expenses![0].recordedBy).toMatchObject({ name: 'Owner' });
    expect(next.activityLogs?.[0].action).toContain('₦1,200');
  });
});
