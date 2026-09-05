import { describe, expect, it } from 'vitest';
import { forecastHorizon } from '@/lib/manager-intel';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * The forecast regressed over a fixed 30-day window whatever the store's age.
 *
 * A shop open a week was fitted through 23 empty days. Those zeros dragged the
 * daily average to roughly a quarter of the truth and — because they all sit at
 * the start of the window — tilted the line upward, so a new store was shown a
 * confident-looking projection of growth that was really just it opening.
 *
 * Two smaller things: the range under the figure was a flat ±20% written into
 * the markup, identical whether the estimate came from three sales or a year of
 * steady trading; and confidence never fell below 55%, so a shop with two sales
 * on record was told the same as one with twenty-nine.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function store(opts: { openedDaysAgo: number; dailySales: number; days: number }): StoreData {
  return {
    id: 's', storeId: 'SF', storeName: 'S', accessCode: 'A', storeType: 'provision',
    createdAt: daysAgo(opts.openedDaysAgo),
    products: [{ id: 'p', name: 'Rice', category: 'x', costPrice: 700, sellingPrice: 1000, quantity: 50 } as any],
    expenses: [],
    sales: Array.from({ length: opts.days }, (_, day) =>
      Array.from({ length: opts.dailySales }, (_, i) => ({
        id: `s-${day}-${i}`, productId: 'p', productName: 'Rice', quantity: 1,
        unitPrice: 1000, total: 1000, profit: 300, date: daysAgo(day),
      }))
    ).flat() as any,
  } as StoreData;
}

describe('the forecast only looks back as far as the shop has traded', () => {
  it('does not average a young store against days it did not exist', () => {
    // Open 6 days, selling 10 a day. A 30-day window would divide by 30.
    const young = forecastHorizon(store({ openedDaysAgo: 6, dailySales: 10, days: 6 }), 7);
    expect(young.daysObserved).toBeLessThanOrEqual(7);

    // Roughly a week of the same trading, not a quarter of it.
    expect(young.expectedRevenue).toBeGreaterThan(40_000);
  });

  it('uses the full window once the store is old enough', () => {
    const mature = forecastHorizon(store({ openedDaysAgo: 120, dailySales: 10, days: 30 }), 7);
    expect(mature.daysObserved).toBe(30);
  });

  it('says how much history it actually used', () => {
    const young = forecastHorizon(store({ openedDaysAgo: 5, dailySales: 4, days: 5 }), 7);
    expect(young.caveat).toMatch(/last \d+ days? of activity/);
  });
});

describe('confidence reflects how much there is to go on', () => {
  it('does not claim the old 55% floor for a shop with almost no sales', () => {
    const barely = forecastHorizon(store({ openedDaysAgo: 3, dailySales: 1, days: 2 }), 7);
    expect(barely.confidencePct).toBeLessThan(55);
  });

  it('stays capped for long horizons however tidy the trend', () => {
    const year = forecastHorizon(store({ openedDaysAgo: 120, dailySales: 10, days: 30 }), 365);
    expect(year.confidencePct).toBeLessThanOrEqual(60);
  });
});

describe('the range widens when the estimate is weaker', () => {
  it('brackets the estimate more loosely at low confidence', () => {
    const weak = forecastHorizon(store({ openedDaysAgo: 3, dailySales: 1, days: 2 }), 7);
    const strong = forecastHorizon(store({ openedDaysAgo: 120, dailySales: 10, days: 30 }), 7);

    const width = (f: { revenueLow: number; revenueHigh: number; expectedRevenue: number }) =>
      f.expectedRevenue > 0 ? (f.revenueHigh - f.revenueLow) / f.expectedRevenue : 0;

    expect(width(weak)).toBeGreaterThan(width(strong));
  });

  it('never dips below zero revenue', () => {
    const f = forecastHorizon(store({ openedDaysAgo: 40, dailySales: 0, days: 0 }), 30);
    expect(f.revenueLow).toBeGreaterThanOrEqual(0);
  });

  it('is no longer a flat ±20% written into the markup', () => {
    const manager = readSource('src/components/Manager.tsx');
    expect(manager).not.toContain('expectedRevenue * 0.8');
    expect(manager).not.toContain('expectedRevenue * 1.2');
    expect(manager).toContain('f.revenueLow');
    expect(manager).toContain('f.revenueHigh');
  });
});

describe('the forecast page is one card, not seven', () => {
  it('picks a horizon instead of drawing every one of them', () => {
    const manager = readSource('src/components/Manager.tsx');
    expect(manager).toContain('setForecastHorizonDays');
    // Seven horizons each rendered a card with its own figures, confidence bar,
    // range, caveat and pair of feedback buttons.
    expect(manager).not.toContain('{horizons.map(h => {\n                const f = forecastHorizon(store, h);');
  });
});
