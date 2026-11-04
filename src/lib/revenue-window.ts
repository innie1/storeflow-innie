/**
 * Revenue over a named stretch of time.
 *
 * This lived inside RevenueCard, which was fine until the day close needed to
 * ask the same question - what did the shop take today - and would have had to
 * work it out again. Two answers to one question is how a shop stops trusting
 * the number, and this one is on two screens at once every evening.
 *
 * Each stretch is a calendar one. This week is Monday to Sunday, this month
 * the 1st to the last day, last month the whole of the month before. A
 * rolling "last seven days" changed every morning and matched no date an
 * owner counts by.
 */

import type { StoreData } from '@/types/store';
import { receivedBetween } from '@/lib/money-figures';

export type Range = 'today' | 'week' | 'month' | 'lastMonth' | 'all';

export const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'all', label: 'Lifetime' },
];

/** Midnight this morning, where the reader is. */
export function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Midnight on Monday of this week. */
export function startOfWeek(now: number): number {
  const date = new Date(startOfToday(now));
  // getDay() is 0 on Sunday; Sunday belongs to the week that began six days before.
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date.getTime();
}

/** Midnight on the 1st of the month, `offset` months from this one. */
export function startOfMonth(now: number, offset = 0): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth() + offset, 1).getTime();
}

/** From midnight on the first day to midnight after the last. */
export function rangeWindow(range: Range, now: number = Date.now()): { from: number; to: number } {
  switch (range) {
    case 'today': {
      const from = startOfToday(now);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      return { from, to: to.getTime() };
    }
    case 'week': {
      const from = startOfWeek(now);
      const to = new Date(from);
      to.setDate(to.getDate() + 7);
      return { from, to: to.getTime() };
    }
    case 'month': return { from: startOfMonth(now), to: startOfMonth(now, 1) };
    case 'lastMonth': return { from: startOfMonth(now, -1), to: startOfMonth(now) };
    default: return { from: 0, to: Number.MAX_SAFE_INTEGER };
  }
}

export function revenueInRange(store: StoreData, range: Range, now: number = Date.now()): number {
  const window = rangeWindow(range, now);
  // Money received, from the one definition every screen shares.
  return receivedBetween(store, window.from, window.to);
}

/** The dates under the figure: "Mon 2 Nov – Sun 8 Nov", "1 Nov – 30 Nov". */
export function rangeDates(range: Range, now: number = Date.now()): string {
  if (range === 'all') return 'Since the shop started';
  const day = (time: number) => new Date(time).toLocaleDateString('en-GB', {
    ...(range === 'today' || range === 'week' ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
  });
  const { from, to } = rangeWindow(range, now);
  if (range === 'today') return day(from);
  // The last day is the one before `to`; an hour back steps over midnight
  // whatever the clocks did that night.
  return `${day(from)} – ${day(to - 3600000)}`;
}
