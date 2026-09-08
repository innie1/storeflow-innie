/**
 * When a customer has gone quiet, judged against their own habit.
 *
 * A single number cannot answer this. Someone who brings washing every month
 * is behaving perfectly at four weeks; someone who comes every Friday and has
 * not been seen for a month has gone somewhere else. Measured against a fixed
 * threshold the first is nagged constantly and the second is noticed far too
 * late, and a warning that is always on is a warning nobody reads.
 *
 * So the shop's own record decides: learn the gap this customer usually
 * leaves, and call it quiet at roughly twice that.
 *
 * Two rules also disagreed before this existed. The customer book called
 * anyone unseen for 14 days inactive; Flow and the insights used 30. The same
 * person could read "gone quiet" on one screen and be counted as healthy on
 * the next.
 */

import type { Customer } from '@/types/store';

const DAY = 86400000;

/** A month, for anyone whose habit is not yet known. */
export const DEFAULT_QUIET_DAYS = 30;

/**
 * Three visits, because two only gives one gap — and one gap is a coincidence,
 * not a habit. A customer who happened to come twice in a week would otherwise
 * be expected back weekly for ever.
 */
export const MIN_VISITS_FOR_RHYTHM = 3;

/**
 * The window the learned threshold is held inside.
 *
 * The floor stops a twice-weekly customer being chased after four days. The
 * ceiling is six weeks: past that a shop has lost someone regardless of how
 * relaxed their habit was, and waiting longer helps nobody.
 */
export const MIN_QUIET_DAYS = 21;
export const MAX_QUIET_DAYS = 45;

export type CustomerStanding = 'new' | 'regular' | 'quiet';

/**
 * The distinct days this customer came in.
 *
 * By day, not by timestamp, for two reasons. Someone who brings two bundles in
 * one morning has visited once, and counting it twice inserts a zero-length
 * gap that drags the median down and makes them look far more frequent than
 * they are. And lastPurchaseDate usually repeats the newest history entry — it
 * was being de-duplicated by exact millisecond, so the same visit recorded a
 * moment apart counted as two, which was enough to make a customer with two
 * visits look like one with a known habit.
 */
function visitDates(customer: Pick<Customer, 'purchaseHistory' | 'lastPurchaseDate'>): number[] {
  const history = Array.isArray(customer.purchaseHistory) ? customer.purchaseHistory : [];
  const stamps = [...history.map(entry => entry?.date), customer.lastPurchaseDate]
    .map(value => new Date(value || '').getTime())
    .filter(time => Number.isFinite(time));

  const byDay = new Map<number, number>();
  for (const time of stamps) {
    const day = Math.floor(time / DAY);
    // Keep the earliest moment on a day, so a gap is measured day to day.
    if (!byDay.has(day) || time < byDay.get(day)!) byDay.set(day, time);
  }
  return Array.from(byDay.values()).sort((a, b) => a - b);
}

/**
 * The gap this customer usually leaves between visits, in days.
 *
 * The median rather than the average, so one long absence — a trip, an illness
 * — does not permanently redefine what normal looks like for them.
 */
export function usualGapDays(customer: Pick<Customer, 'purchaseHistory' | 'lastPurchaseDate'>): number | null {
  const dates = visitDates(customer);
  if (dates.length < MIN_VISITS_FOR_RHYTHM) return null;

  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i += 1) gaps.push((dates[i] - dates[i - 1]) / DAY);
  if (!gaps.length) return null;

  gaps.sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2;
  return median > 0 ? median : null;
}

/** How long this particular customer may be away before it means something. */
export function quietAfterDays(customer: Pick<Customer, 'purchaseHistory' | 'lastPurchaseDate'>): number {
  const usual = usualGapDays(customer);
  if (usual === null) return DEFAULT_QUIET_DAYS;
  return Math.min(MAX_QUIET_DAYS, Math.max(MIN_QUIET_DAYS, Math.round(usual * 2)));
}

export function daysAway(customer: Pick<Customer, 'lastPurchaseDate'>): number | null {
  const last = new Date(customer.lastPurchaseDate || '').getTime();
  if (!Number.isFinite(last)) return null;
  return Math.floor((Date.now() - last) / DAY);
}

/**
 * Where this customer stands.
 *
 * 'new' is not a soft way of saying quiet. Someone whose number was taken at
 * the counter this morning has never been active, and calling them lapsed —
 * which the customer book did, for every customer with no purchase date — puts
 * a warning on the one person the shop is actively winning.
 */
export function customerStanding(customer: Pick<Customer, 'purchaseHistory' | 'lastPurchaseDate'>): CustomerStanding {
  const away = daysAway(customer);
  if (away === null) return 'new';
  return away >= quietAfterDays(customer) ? 'quiet' : 'regular';
}

export function hasGoneQuiet(customer: Pick<Customer, 'purchaseHistory' | 'lastPurchaseDate'>): boolean {
  return customerStanding(customer) === 'quiet';
}

/** "Usually every 7 days, not seen for 34" — the sentence behind the label. */
export function explainStanding(customer: Pick<Customer, 'purchaseHistory' | 'lastPurchaseDate'>): string {
  const away = daysAway(customer);
  if (away === null) return 'No purchase recorded yet.';
  const usual = usualGapDays(customer);
  const rhythm = usual === null
    ? 'Not enough visits yet to know their habit'
    : `Usually every ${Math.round(usual)} ${Math.round(usual) === 1 ? 'day' : 'days'}`;
  return `${rhythm} · last seen ${away} ${away === 1 ? 'day' : 'days'} ago`;
}
