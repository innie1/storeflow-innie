import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SmartRestockEngine from '@/components/SmartRestockEngine';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * Smart Restock decided how much to buy with:
 *
 *   const minStock    = p.minimumStock || 5;
 *   const targetStock = buyOnlyToMin ? minStock : (p.maximumStock || minStock * 2);
 *
 * Neither minimumStock nor maximumStock exists on Product — not set anywhere,
 * not even declared on the type. Both were always undefined, so every product
 * in every store fell through to the same target of 10 units, and the
 * suggestion was 10 minus whatever was on the shelf.
 *
 * A product selling fifty a day and one that had never sold got the same
 * order. The five-factor priority score above it — stock urgency, velocity,
 * recency, margin, customer requests — only ever changed the sort order and
 * the colour of a label. It never reached the quantity.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const fastMover = { id: 'p-fast', name: 'Mineral', category: 'Drinks', costPrice: 100, sellingPrice: 150, quantity: 2 };
const slowMover = { id: 'p-slow', name: 'Candle', category: 'Home', costPrice: 100, sellingPrice: 150, quantity: 2 };

function store(): StoreData {
  return {
    id: 's1', storeId: 'SF-T', storeName: 'T', accessCode: 'T1', storeType: 'provision',
    createdAt: daysAgo(60),
    products: [fastMover as any, slowMover as any],
    // Mineral sells 10 a day; Candle has sold nothing in a month.
    sales: Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`, productId: 'p-fast', productName: 'Mineral', quantity: 10,
      unitPrice: 150, total: 1500, profit: 500, date: daysAgo(i),
    })) as any,
    expenses: [], suppliers: [], customerRequests: [], restocks: [],
  } as StoreData;
}

/** The suggested quantity shown on a product's row. */
function suggestedFor(name: string): number {
  const row = screen.getByText(name).closest('div[class*="rounded"]');
  const qty = row?.querySelector('input[type="number"]') as HTMLInputElement | null;
  return qty ? Number(qty.value) : NaN;
}

describe('how much Smart Restock says to buy', () => {
  it('orders for what a product actually sells, not a fixed shelf number', () => {
    render(<SmartRestockEngine store={store()} onUpdate={() => {}} onClose={() => {}} />);

    const fast = suggestedFor('Mineral');
    const slow = suggestedFor('Candle');

    // Mineral sells ~10/day. Over the default 14-day cover that is ~140, less
    // the 2 on the shelf. The old engine said 8 for this and 8 for Candle.
    expect(fast).toBeGreaterThan(100);
    // Candle sells nothing, so it is only brought back to its reorder level.
    expect(slow).toBeLessThan(20);
    expect(fast).toBeGreaterThan(slow * 5);
  });

  it('explains the quantity in terms of the demand behind it', () => {
    const { container } = render(<SmartRestockEngine store={store()} onUpdate={() => {}} onClose={() => {}} />);
    // Asserted on the whole container: the reason sits in a table cell and the
    // figures are interpolated, so getByText can miss it on element splits.
    expect(container.textContent).toMatch(/Sells about 10\.0 a day/);
    expect(container.textContent).toMatch(/14 days of cover/);
  });
});

describe('the engine reads fields that exist', () => {
  const source = () => readSource('src/components/SmartRestockEngine.tsx');

  it('no longer reads minimumStock or maximumStock, which Product does not have', () => {
    const code = source().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('p.minimumStock');
    expect(code).not.toContain('p.maximumStock');
  });

  it('uses reorderLevel, the field the merchant and Auto Fix actually set', () => {
    expect(source()).toContain('p.reorderLevel ?? lowStockThreshold');
  });

  it('lets the merchant choose the coverage window that sizes the order', () => {
    const code = source();
    // coverageDays sat in state from the beginning, never read and never shown.
    expect(code).toContain('avgDailySales * coverageDays');
    expect(code).toContain('setCoverageDays(Number(e.target.value))');
  });

  it('measures velocity over the history the store actually has', () => {
    const code = source();
    expect(code).toContain('totalQtySold / observedDays');
    expect(code).not.toContain('totalQtySold / 30');
  });
});
