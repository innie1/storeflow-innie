import { describe, expect, it } from 'vitest';
import { getProfitLeaks, getTopOpportunities } from '@/lib/manager-intel';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * The "Leak Index" added five numbers of five different kinds.
 *
 * Unpaid invoices (an asset, including ones raised the day before), stock on
 * the shelf at cost (an asset), a month of foregone margin (a rate), a week of
 * excess overheads (a different rate), and every stock-count shortfall ever
 * recorded (cumulative, forever). On a shop earning ₦3.2m profit in thirty
 * days it announced a ₦2.19m leak — of which about ₦104,000 was money actually
 * going astray. Nearly three quarters of it was stock sitting on the shelf,
 * including a line that sells twice a month at a 50% markup.
 *
 * Top Opportunities had its own version of the problem: every card ended in a
 * chevron and a phrase like "Order Stock" that looked tappable and did
 * nothing, and the money badge showed gross revenue — ₦8.8m for a restock that
 * costs ₦7.1m to place.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function shop(): StoreData {
  const sales: any[] = [];
  for (let day = 0; day < 30; day++) {
    for (let i = 0; i < 6; i++) {
      sales.push({ id: `r-${day}-${i}`, productId: 'rice', productName: 'Rice 50kg', quantity: 1,
        unitPrice: 87500, total: 87500, profit: 17500, date: daysAgo(day) });
    }
    for (let i = 0; i < 20; i++) {
      sales.push({ id: `s-${day}-${i}`, productId: 'sugar', productName: 'Sugar 1kg', quantity: 1,
        unitPrice: 1080, total: 1080, profit: 80, date: daysAgo(day) });
    }
  }
  return {
    id: 's', storeId: 'SF', storeName: 'Probe', accessCode: 'A', storeType: 'provision',
    createdAt: daysAgo(200),
    products: [
      { id: 'rice', name: 'Rice 50kg', category: 'Grains', costPrice: 70000, sellingPrice: 87500, quantity: 20 },
      { id: 'sugar', name: 'Sugar 1kg', category: 'Grains', costPrice: 1000, sellingPrice: 1080, quantity: 60 },
      { id: 'gener', name: 'Generator', category: 'Hardware', costPrice: 450000, sellingPrice: 560000, quantity: 3 },
      { id: 'paint', name: 'Paint 20L', category: 'Hardware', costPrice: 30000, sellingPrice: 45000, quantity: 8 },
    ] as any,
    sales: sales as any,
    expenses: [{ id: 'e1', amount: 250000, note: 'Rent', category: 'rent', date: daysAgo(3) }] as any,
    pendingPayments: [
      // Long overdue.
      { id: 'p1', customerName: 'Ada', items: [], total: 300000, paid: 100000, balance: 200000,
        dueDate: daysAgo(20), createdAt: daysAgo(40), status: 'pending', events: [] },
      // Raised two days ago, not due yet — never a "leak".
      { id: 'p2', customerName: 'Bola', items: [], total: 90000, paid: 0, balance: 90000,
        dueDate: daysAgo(-10), createdAt: daysAgo(2), status: 'pending', events: [] },
    ] as any,
    stockCountAudits: [
      // 200 days old — was counted in the total forever.
      { id: 'a1', date: daysAgo(200), expected: 12, actual: 9, variance: -3, product: 'Rice 50kg' },
      { id: 'a2', date: daysAgo(5), expected: 40, actual: 38, variance: -2, product: 'Sugar 1kg' },
    ],
  } as StoreData;
}

const leaks = () => getProfitLeaks(shop());
const totalOf = (kind: 'leaking' | 'stuck') =>
  leaks().filter(l => l.kind === kind).reduce((s, l) => s + l.amountLeak, 0);

describe('money lost and money stuck are not added together', () => {
  it('marks every item as one or the other', () => {
    for (const l of leaks()) expect(['leaking', 'stuck']).toContain(l.kind);
  });

  it('does not count stock on the shelf as lost money', () => {
    const dead = leaks().find(l => l.category === 'dead_stock');
    expect(dead?.kind).toBe('stuck');
  });

  it('does not count what customers owe as lost money', () => {
    const debt = leaks().find(l => l.category === 'unpaid_debt');
    expect(debt?.kind).toBe('stuck');
  });

  it('keeps the lost figure to a fraction of what it used to claim', () => {
    // The old index was ₦2,194,000 on this shop.
    expect(totalOf('leaking')).toBeLessThan(500_000);
    expect(totalOf('leaking')).toBeGreaterThan(0);
  });
});

describe('only real problems are counted', () => {
  it('ignores an invoice that is not due yet', () => {
    const debt = leaks().find(l => l.category === 'unpaid_debt');
    // Ada's ₦200,000 is overdue; Bola's ₦90,000 is not due for ten days.
    expect(debt?.amountLeak).toBe(200_000);
  });

  it('ignores a stock count from months ago', () => {
    const loss = leaks().find(l => l.category === 'stock_loss');
    // Only the 2 sugar units from five days ago: 2 x ₦1,000.
    expect(loss?.amountLeak).toBe(2_000);
  });

  it('only counts thin margins on products that actually sold', () => {
    const margin = leaks().find(l => l.category === 'poor_margin');
    expect(margin).toBeTruthy();
    expect(margin?.kind).toBe('leaking');
  });

  it('says markup where it means markup', () => {
    const margin = leaks().find(l => l.category === 'poor_margin');
    // 25% on top of cost is a 25% markup and a 20% margin; the copy used to
    // call it a margin while doing markup arithmetic.
    expect(margin?.description).toContain('markup');
    expect(margin?.description).not.toContain('margin');
  });
});

describe('everything lost is measured over the same period', () => {
  it('does not mix a 7-day overhead figure with 30-day ones', () => {
    const src = readSource('src/lib/manager-intel.ts');
    const fn = src.slice(src.indexOf('export function getProfitLeaks'), src.indexOf('// ─── Seasonal Predictions'));
    expect(fn).toContain('LEAK_WINDOW_DAYS');
    expect(fn).not.toMatch(/dailySeries\(store,\s*7\)/);
  });
});

describe('opportunities go somewhere when tapped', () => {
  it('gives every card a destination', () => {
    for (const o of getTopOpportunities(shop())) expect(o.goTo).toBeTruthy();
  });

  it('renders them as buttons that navigate', () => {
    const manager = readSource('src/components/Manager.tsx');
    const card = manager.slice(
      manager.indexOf('{/* Top Opportunities Card */}'),
      manager.indexOf('{/* Profit Leak Detector Card */}'),
    );
    expect(card).toContain('onClick={() => onNavigate?.(o.goTo, o.focus)}');
    expect(card).toContain('<button');
  });

  it('opens the named product rather than a list to search', () => {
    const restock = getTopOpportunities(shop()).find(o => o.title.startsWith('Restock'));
    expect(restock?.focus?.productId).toBeTruthy();
    expect(restock?.focus?.intent).toBe('restock');
  });
});

describe('the money on an opportunity is money the merchant gains', () => {
  it('shows profit on a restock, not the sale value of the whole order', () => {
    const restock = getTopOpportunities(shop()).find(o => o.title.startsWith('Restock'));
    if (!restock) return;
    // Rice: ₦17,500 profit a bag, not ₦87,500 of revenue a bag.
    const units = Number(restock.description.match(/Order (\d+)/)?.[1]);
    expect(restock.impactAmount).toBe(17_500 * units);
  });

  it('does not dress a slogan up as a figure', () => {
    for (const o of getTopOpportunities(shop())) {
      expect(o.impactLabel).not.toMatch(/Boost|Free Up Working Capital/i);
    }
  });
});
