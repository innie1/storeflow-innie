import { describe, expect, it } from 'vitest';
import type { Customer } from '@/types/store';
import {
  customerStanding,
  explainStanding,
  quietAfterDays,
  usualGapDays,
  DEFAULT_QUIET_DAYS,
  MAX_QUIET_DAYS,
  MIN_QUIET_DAYS,
} from '@/lib/customer-rhythm';

const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

/** Someone who comes every `every` days, `visits` times, last seen `lastSeen` days ago. */
const rhythmic = (every: number, visits: number, lastSeen: number): Pick<Customer, 'purchaseHistory' | 'lastPurchaseDate'> => ({
  purchaseHistory: Array.from({ length: visits }, (_, i) => ({
    date: daysAgo(lastSeen + (visits - 1 - i) * every),
    amount: 1000,
    items: 'Shirt',
  })),
  lastPurchaseDate: daysAgo(lastSeen),
});

describe('judging a customer against their own habit', () => {
  /**
   * The whole point. A monthly customer at four weeks is behaving perfectly; a
   * weekly customer at four weeks has gone somewhere else. One fixed number
   * cannot say both, and it used to say the same thing to each.
   */
  it('leaves a monthly customer alone at a month', () => {
    expect(customerStanding(rhythmic(30, 4, 30))).toBe('regular');
  });

  it('flags a weekly customer who has not come for a month', () => {
    expect(customerStanding(rhythmic(7, 5, 30))).toBe('quiet');
  });

  it('learns the gap from the shop’s own record', () => {
    expect(Math.round(usualGapDays(rhythmic(7, 5, 3))!)).toBe(7);
    expect(Math.round(usualGapDays(rhythmic(30, 4, 3))!)).toBe(30);
  });

  /** One long absence should not permanently redefine normal, so: median. */
  it('is not thrown by a single long absence', () => {
    const customer = {
      purchaseHistory: [
        { date: daysAgo(200), amount: 1, items: '' },
        { date: daysAgo(28), amount: 1, items: '' },
        { date: daysAgo(21), amount: 1, items: '' },
        { date: daysAgo(14), amount: 1, items: '' },
        { date: daysAgo(7), amount: 1, items: '' },
      ],
      lastPurchaseDate: daysAgo(7),
    };
    expect(Math.round(usualGapDays(customer)!)).toBe(7);
  });
});

describe('when the habit is not known yet', () => {
  it('gives anyone with too few visits a month', () => {
    // Two visits is one gap, and one gap is a coincidence, not a habit.
    expect(usualGapDays(rhythmic(7, 2, 3))).toBeNull();
    expect(quietAfterDays(rhythmic(7, 2, 3))).toBe(DEFAULT_QUIET_DAYS);
  });

  /**
   * A number taken at the counter this morning is not a lapsed customer. The
   * book used to call every customer with no purchase date inactive, which put
   * a warning on the one person the shop was actively winning.
   */
  it('calls a customer who has never bought anything new, not quiet', () => {
    expect(customerStanding({ purchaseHistory: [], lastPurchaseDate: undefined })).toBe('new');
    expect(explainStanding({ purchaseHistory: [] })).toContain('No purchase recorded');
  });
});

describe('the window the threshold is held inside', () => {
  it('does not chase a twice-weekly customer after four days', () => {
    expect(quietAfterDays(rhythmic(3, 6, 1))).toBe(MIN_QUIET_DAYS);
  });

  it('does not wait for ever on a very relaxed customer', () => {
    // Past six weeks the shop has lost them however slow their habit was.
    expect(quietAfterDays(rhythmic(90, 4, 1))).toBe(MAX_QUIET_DAYS);
  });

  it('scales in between rather than snapping to a default', () => {
    expect(quietAfterDays(rhythmic(14, 4, 1))).toBe(28);
  });
});

describe('saying why', () => {
  it('gives the habit and the absence, not just a label', () => {
    const line = explainStanding(rhythmic(7, 5, 34));
    expect(line).toContain('every 7 days');
    expect(line).toContain('34 days ago');
  });

  it('admits when it does not know the habit', () => {
    expect(explainStanding(rhythmic(7, 2, 5))).toContain('Not enough visits');
  });
});
