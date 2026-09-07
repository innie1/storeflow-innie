import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activeCelebration,
  checkNewMilestone,
  lifetimeRevenue,
  shouldRainToday,
  CELEBRATION_DAYS,
} from '@/lib/milestones';

/**
 * Celebrating money, not just transactions.
 *
 * Milestones counted `store.sales.length` and nothing else, so ten sales and
 * ten thousand naira were the same achievement and passing ₦1,000,000 went by
 * in complete silence — the number a shop owner actually watches was the one
 * thing never marked.
 */

function storeWith(totals: number[], reached: string[] = []) {
  return {
    name: 'Test Store',
    sales: totals.map((total, i) => ({ id: String(i), total, date: '2026-09-01' })),
    milestonesReached: reached,
  } as any;
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('money milestones', () => {
  it('adds up everything the shop has ever taken', () => {
    expect(lifetimeRevenue(storeWith([3000, 4500, 2500]))).toBe(10_000);
  });

  it('celebrates the first ten thousand', () => {
    expect(checkNewMilestone(storeWith([9_999]))?.id).not.toBe('revenue_10k');
    expect(checkNewMilestone(storeWith([10_000]))?.id).toBe('revenue_10k');
  });

  it('celebrates each of the thresholds asked for', () => {
    const wanted: Array<[number, string]> = [
      [10_000, 'revenue_10k'],
      [100_000, 'revenue_100k'],
      [300_000, 'revenue_300k'],
      [1_000_000, 'revenue_1m'],
    ];
    for (const [amount, id] of wanted) {
      // Everything below this threshold already celebrated, so the next one up
      // is the only candidate left.
      const earlier = ['revenue_10k', 'revenue_50k', 'revenue_100k', 'revenue_300k', 'revenue_500k']
        .filter(other => other !== id);
      const store = storeWith([amount], [...earlier, 'sales_1']);
      expect(checkNewMilestone(store)?.id, id).toBe(id);
    }
  });

  it('picks the bigger moment when a sale crosses both at once', () => {
    // One enormous sale crosses "10 sales" and "₦1,000,000" together. The
    // million is the story, not the tenth transaction.
    const store = storeWith(Array(10).fill(100_000), ['sales_1']);
    expect(checkNewMilestone(store)?.id).toBe('revenue_1m');
  });

  it('never repeats one already celebrated', () => {
    const store = storeWith([10_000], ['sales_1', 'revenue_10k']);
    expect(checkNewMilestone(store)).toBeNull();
  });

  it('still celebrates the counting milestones', () => {
    expect(checkNewMilestone(storeWith([1]))?.id).toBe('sales_1');
  });
});

describe('the dashboard keeps wearing a big win', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.parse('2026-09-07T12:00:00Z');

  function logged(id: string, daysAgo: number) {
    return {
      sales: [],
      milestonesReached: [id],
      milestoneLog: [{ id, at: new Date(now - daysAgo * dayMs).toISOString() }],
    } as any;
  }

  it('wears a milestone hit today', () => {
    expect(activeCelebration(logged('revenue_1m', 0), now)?.id).toBe('revenue_1m');
  });

  it('still wears it four days later', () => {
    expect(activeCelebration(logged('revenue_1m', 4), now)?.id).toBe('revenue_1m');
  });

  it('takes it off after the window closes', () => {
    expect(activeCelebration(logged('revenue_1m', CELEBRATION_DAYS + 1), now)).toBeNull();
  });

  it('does not linger on the small ones', () => {
    // A first sale deserves its popup, not five days of ribbon.
    expect(activeCelebration(logged('sales_1', 0), now)).toBeNull();
    expect(activeCelebration(logged('revenue_10k', 0), now)).toBeNull();
  });

  it('wears the most recent when two are in the window', () => {
    const store = {
      sales: [],
      milestoneLog: [
        { id: 'revenue_100k', at: new Date(now - 3 * dayMs).toISOString() },
        { id: 'revenue_1m', at: new Date(now - 1 * dayMs).toISOString() },
      ],
    } as any;
    expect(activeCelebration(store, now)?.id).toBe('revenue_1m');
  });

  it('survives a log entry with a nonsense date', () => {
    const store = { sales: [], milestoneLog: [{ id: 'revenue_1m', at: 'not a date' }] } as any;
    expect(activeCelebration(store, now)).toBeNull();
  });
});

describe('the confetti falls once a day', () => {
  it('rains the first time and then rests', () => {
    const day = new Date('2026-09-07T09:00:00Z');
    expect(shouldRainToday('revenue_1m', day)).toBe(true);
    expect(shouldRainToday('revenue_1m', day)).toBe(false);
  });

  it('rains again the next day', () => {
    expect(shouldRainToday('revenue_1m', new Date('2026-09-07T09:00:00Z'))).toBe(true);
    expect(shouldRainToday('revenue_1m', new Date('2026-09-08T09:00:00Z'))).toBe(true);
  });

  it('tracks each milestone separately', () => {
    const day = new Date('2026-09-07T09:00:00Z');
    expect(shouldRainToday('revenue_1m', day)).toBe(true);
    expect(shouldRainToday('revenue_100k', day)).toBe(true);
  });
});
