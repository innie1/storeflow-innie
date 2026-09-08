/**
 * Revenue over a named stretch of time.
 *
 * This lived inside RevenueCard, which was fine until the day close needed to
 * ask the same question - what did the shop take today - and would have had to
 * work it out again. Two answers to one question is how a shop stops trusting
 * the number, and this one is on two screens at once every evening.
 */

import type { StoreData } from '@/types/store';

export type Range = 'yesterday' | 'today' | 'fortnight' | 'all';

export const RANGES: { id: Range; label: string }[] = [
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'today', label: 'Today' },
  { id: 'fortnight', label: '14 days' },
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
    yesterday: { from: dayStart - DAY, to: dayStart },
    today: { from: dayStart, to: dayStart + DAY },
    // Thirteen days back plus today, so "14 days" is fourteen days.
    fortnight: { from: dayStart - 13 * DAY, to: dayStart + DAY },
    all: { from: 0, to: Number.MAX_SAFE_INTEGER },
  };
  const window = windows[range];

  return (store.sales || []).reduce((sum, sale) => {
    const at = new Date(String(sale.date || '')).getTime();
    if (!Number.isFinite(at) || at < window.from || at >= window.to) return sum;
    return sum + (Number(sale.total) || 0);
  }, 0);
}
