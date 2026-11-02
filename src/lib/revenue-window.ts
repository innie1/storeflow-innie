/**
 * Revenue over a named stretch of time.
 *
 * This lived inside RevenueCard, which was fine until the day close needed to
 * ask the same question - what did the shop take today - and would have had to
 * work it out again. Two answers to one question is how a shop stops trusting
 * the number, and this one is on two screens at once every evening.
 */

import type { StoreData } from '@/types/store';
import { receivedBetween } from '@/lib/money-figures';

export type Range = 'today' | 'week' | 'month' | 'all';

export const RANGES: { id: Range; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: '1 week' },
  { id: 'month', label: '1 month' },
  { id: 'all', label: 'All time' },
];

const DAY = 86400000;

/** Midnight this morning, where the reader is. */
export function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function revenueInRange(store: StoreData, range: Range, now: number = Date.now()): number {
  const dayStart = startOfToday(now);
  const windows: Record<Range, { from: number; to: number }> = {
    today: { from: dayStart, to: dayStart + DAY },
    // Six days back plus today, so "1 week" is seven days.
    week: { from: dayStart - 6 * DAY, to: dayStart + DAY },
    // And "1 month" is thirty, whichever month it is.
    month: { from: dayStart - 29 * DAY, to: dayStart + DAY },
    all: { from: 0, to: Number.MAX_SAFE_INTEGER },
  };
  const window = windows[range];

  // Money received, from the one definition every screen shares.
  return receivedBetween(store, window.from, window.to);
}
