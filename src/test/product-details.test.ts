import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * The product details sheet, audited.
 *
 * Four statistics each wrote out their own copy of the same ten-line if/else
 * chain deciding where "today", "this week" and "this month" begin. Four of
 * the sheet's computations were never rendered at all. The profit card
 * reported markup under the word margin. And the Flow insight card was
 * hardcoded to a purple gradient with #0f1117 and slate-200 text, so it
 * ignored the merchant's theme entirely.
 */

const source = () => readSource('src/components/Inventory.tsx');
const withoutComments = () =>
  source().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('one definition of the reporting period', () => {
  it('derives every period statistic from a single boundary', () => {
    const code = withoutComments();
    expect(code).toContain('const periodStart = useMemo(');
    // The copies each began by rebuilding local midnight by hand.
    const midnightRebuilds = code.match(/new Date\(now\.getFullYear\(\), now\.getMonth\(\), now\.getDate\(\)\)\.getTime\(\)/g) || [];
    expect(midnightRebuilds.length).toBeLessThanOrEqual(1);
  });

  it('walks back to the start of the week by date, not by subtracting fixed days', () => {
    // `midnight - getDay() * 86400000` assumes every day is exactly 24 hours.
    expect(withoutComments()).not.toContain('now.getDay() * 24 * 60 * 60 * 1000');
    expect(source()).toContain('now.getDate() - now.getDay()');
  });
});

describe('nothing is computed that nothing shows', () => {
  it('has dropped the four statistics the sheet never rendered', () => {
    const code = source();
    // Each of these ran on every period change — productRankInfo sorted every
    // product in the store — and none of them reached the screen.
    for (const dead of ['productRankInfo', 'avgSalesSpeed', 'filteredRestocksCount', 'salesSummary']) {
      expect(code, `${dead} is computed but never rendered`).not.toContain(dead);
    }
  });

  it('keeps the ones that are actually displayed', () => {
    const code = source();
    for (const live of ['unitsSold', 'totalRevenue', 'totalProfit', 'contributionPct', 'flowInsights']) {
      expect(code).toContain(live);
    }
  });
});

describe('the profit card says what it measures', () => {
  it('no longer prints markup under the word margin', () => {
    const code = source();
    // profit / cost is markup; profit / selling price is margin. At ₦70,000
    // cost and ₦87,500 selling the two are 25% and 20%, and the card used to
    // show the 25% labelled "Profit Margin".
    expect(code).toContain('% margin · ');
    expect(code).toContain('markupPct');
    expect(code).toContain('marginPct');
    expect(code).not.toContain('uppercase font-bold">Profit Margin<');
  });
});

describe('the sheet follows the app theme', () => {
  it('does not hardcode a dark palette the merchant cannot change', () => {
    const code = withoutComments();
    const sheet = code.slice(code.indexOf('{selectedDetailProduct && ('));
    for (const hardcoded of ['from-purple-900', 'to-indigo-900', 'text-purple-300', 'text-purple-400', 'text-slate-200', '#0f1117', 'text-emerald-500']) {
      expect(sheet, `${hardcoded} ignores the theme`).not.toContain(hardcoded);
    }
  });

  it('uses the semantic tokens the rest of the app uses', () => {
    const code = source();
    const sheet = code.slice(code.indexOf('{selectedDetailProduct && ('));
    expect(sheet).toContain('text-success');
    expect(sheet).toContain('bg-primary/5');
  });
});
