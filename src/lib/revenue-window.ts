/**
 * Revenue over a named stretch of time.
 *
 * This lived inside RevenueCard, which was fine until the day close needed to
 * ask the same question - what did the shop take today - and would have had to
 * work it out again. Two answers to one question is how a shop stops trusting
 * the number, and this one is on two screens at once every evening.
 *
 * Each stretch follows the calendar. "This week" starts on Monday and "this
 * month" on the 1st, so the figure matches the dates an owner sees on the wall
 * calendar and in the bank app. A rolling "last seven days" changed every
 * morning and never matched either.
 */

import type { StoreData } from '@/types/store';
import { receivedBetween } from '@/lib/money-figures';

export type Range = 'today' | 'week' | 'month' | 'all';

export const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'all', label: 'Lifetime' },
];

const DAY = 86400000;

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
  const sinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - sinceMonday);
  return date.getTime();
}

/** Midnight on the 1st of this month. */
export function startOfMonth(now: number): number {
  const date = new Date(startOfToday(now));
  date.setDate(1);
  return date.getTime();
}

export function rangeWindow(range: Range, now: number = Date.now()): { from: number; to: number } {
  const to = startOfToday(now) + DAY;
  switch (range) {
    case 'today': return { from: startOfToday(now), to };
    case 'week': return { from: startOfWeek(now), to };
    case 'month': return { from: startOfMonth(now), to };
    default: return { from: 0, to: Number.MAX_SAFE_INTEGER };
  }
}

export function revenueInRange(store: StoreData, range: Range, now: number = Date.now()): number {
  const window = rangeWindow(range, now);
  // Money received, from the one definition every screen shares.
  return receivedBetween(store, window.from, window.to);
}

/** The dates under the figure: "Mon 2 Nov – today", "1 Nov – today". */
export function rangeDates(range: Range, now: number = Date.now()): string {
  const day = (time: number, weekday = false) => new Date(time).toLocaleDateString('en-GB', {
    ...(weekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
  });
  switch (range) {
    case 'today': return day(now, true);
    case 'week': {
      const from = startOfWeek(now);
      return from === startOfToday(now) ? `${day(from, true)} (today)` : `${day(from, true)} – today`;
    }
    case 'month': {
      const from = startOfMonth(now);
      return from === startOfToday(now) ? `${day(from)} (today)` : `${day(from)} – today`;
    }
    default: return 'Since the shop started';
  }
}
