import { describe, expect, it } from 'vitest';
import { forecastHorizon } from '@/lib/manager-intel';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * Confidence was rated by the R² of a straight line through the daily figures,
 * averaged across revenue, profit and expenses.
 *
 * R² says how well a *sloped* line explains the data, which is not the same
 * question as how predictable a shop is. A shop taking the same money every day
 * has no slope to explain, so it scored near zero and was rated Low at 55%,
 * while a shop whose takings were sliding away in a tidy line scored near one
 * and was rated High at 90%. The rating was inverted for the case that matters
 * most, and because expense R² is near zero almost always — rent, restocks and
 * repairs are lumpy — the blend pinned every realistic shop to the 55% floor
 * and a flat ±45%. It never moved with the data at all.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function shop(perDay: (day: number) => number, days = 30, openedDaysAgo = 120): StoreData {
  const sales: any[] = [];
  for (let day = 0; day < days; day++) {
    for (let i = 0; i < Math.max(0, Math.round(perDay(day))); i++) {
      sales.push({
        id: `s-${day}-${i}`, productId: 'p', productName: 'Rice', quantity: 1,
        unitPrice: 1000, total: 1000, profit: 300, date: daysAgo(day),
      });
    }
  }
  return {
    id: 's', storeId: 'SF', storeName: 'S', accessCode: 'A', storeType: 'provision',
    createdAt: daysAgo(openedDaysAgo),
    products: [{ id: 'p', name: 'Rice', category: 'x', costPrice: 700, sellingPrice: 1000, quantity: 50 } as any],
    expenses: [],
    sales: sales as any,
  } as StoreData;
}

const STEADY = () => 10;
const CLOSED_SUNDAYS = (d: number) => (d % 7 === 0 ? 0 : 10);
const ERRATIC = (d: number) => (d % 5 === 0 ? 40 : 2);
const RAMP = (d: number) => Math.max(0, 20 - d * 0.6);

describe('a steady shop is rated as predictable', () => {
  it('does not call the most predictable shop possible Low', () => {
    const f = forecastHorizon(shop(STEADY), 7);
    expect(f.confidencePct).toBeGreaterThanOrEqual(80);
    expect(f.confidence).toBe('High');
  });

  it('is not punished for closing on Sundays', () => {
    // A weekly rhythm is perfectly predictable, so whole weeks are compared
    // rather than days. This shop used to look as erratic as a random one.
    const closed = forecastHorizon(shop(CLOSED_SUNDAYS), 7);
    const open = forecastHorizon(shop(STEADY), 7);
    expect(closed.confidencePct).toBeGreaterThanOrEqual(open.confidencePct - 5);
  });

  it('rates a shop on a clean trend well too', () => {
    // Spread is measured around the fitted line, so a real trend is not
    // mistaken for noise.
    expect(forecastHorizon(shop(RAMP), 7).confidencePct).toBeGreaterThanOrEqual(80);
  });
});

describe('an erratic shop is rated lower than a steady one', () => {
  it('separates them, where the old rating gave both 55%', () => {
    const steady = forecastHorizon(shop(STEADY), 7);
    const erratic = forecastHorizon(shop(ERRATIC), 7);
    expect(erratic.confidencePct).toBeLessThan(steady.confidencePct);
  });

  it('widens the range as the horizon runs past what was observed', () => {
    const near = forecastHorizon(shop(ERRATIC), 7);
    const far = forecastHorizon(shop(ERRATIC), 90);
    expect(far.confidencePct).toBeLessThan(near.confidencePct);
  });
});

describe('the rating is no longer a constant', () => {
  it('produces different numbers for different shops', () => {
    const pcts = [STEADY, CLOSED_SUNDAYS, ERRATIC, RAMP]
      .map(fn => forecastHorizon(shop(fn), 90).confidencePct);
    expect(new Set(pcts).size).toBeGreaterThan(1);
  });

  it('never claims certainty a sample cannot support', () => {
    // No history can rule out a price shock or a new competitor next door.
    for (const fn of [STEADY, CLOSED_SUNDAYS, RAMP]) {
      expect(forecastHorizon(shop(fn), 7).confidencePct).toBeLessThanOrEqual(92);
    }
  });
});

describe('expenses no longer rate the revenue forecast', () => {
  it('does not blend the three series into one number', () => {
    const src = readSource('src/lib/manager-intel.ts');
    expect(src).not.toContain('(rev.r2 + prof.r2 + exp.r2) / 3');
    expect(src).not.toContain('avgR2');
  });

  it('rates revenue and profit separately', () => {
    const src = readSource('src/lib/manager-intel.ts');
    expect(src).toContain('const revenueBand = projectionBand(');
    expect(src).toContain('const profitBand = projectionBand(');
  });

  it('recording expenses does not change the revenue rating', () => {
    const bare = shop(STEADY);
    const withExpenses: StoreData = {
      ...bare,
      expenses: [
        { id: 'e1', amount: 40000, note: 'rent', category: 'other', date: daysAgo(2) },
        { id: 'e2', amount: 120000, note: 'stock', category: 'other', date: daysAgo(15) },
      ] as any,
    };
    expect(forecastHorizon(withExpenses, 7).confidencePct)
      .toBe(forecastHorizon(bare, 7).confidencePct);
  });
});

describe('the range and the percentage come from the same calculation', () => {
  it('cannot disagree with each other', () => {
    for (const fn of [STEADY, ERRATIC, RAMP]) {
      const f = forecastHorizon(shop(fn), 30);
      const halfWidth = (f.revenueHigh - f.expectedRevenue) / (f.expectedRevenue || 1);
      expect(Math.round(100 - halfWidth * 100)).toBe(f.confidencePct);
    }
  });

  it('brackets profit as well as revenue', () => {
    const f = forecastHorizon(shop(ERRATIC), 30);
    expect(f.profitLow).toBeGreaterThanOrEqual(0);
    expect(f.profitHigh).toBeGreaterThan(f.expectedProfit);
  });
});
