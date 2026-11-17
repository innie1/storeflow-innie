/**
 * Comparing a stretch that is still running with one that has finished.
 *
 * "The last 7 days" is today so far plus six whole days. Set against the seven
 * whole days before it, it is always a little short - and at nine on a Monday
 * morning it is a day short, so a shop doing exactly as well as last week was
 * told its revenue was down. A week that had only just begun read as a
 * collapse.
 *
 * The rule, everywhere a figure is set against an earlier one: the earlier
 * stretch is cut at the same point. This Monday up to now against last Monday
 * up to the same time; the month to the 16th at noon against last month to its
 * 16th at noon. Same days of the week, same hours of the day, so the only
 * thing that differs is how the shop did.
 *
 * A stretch that has finished is set against the whole of the one before it,
 * which is already a fair comparison.
 */

import type { StoreData } from '@/types/store';
import { receivedBetween } from '@/lib/money-figures';

export interface FairWindows {
  /** The stretch so far. */
  from: number;
  to: number;
  /** The same stretch, one step back, cut at the same time of day. */
  beforeFrom: number;
  beforeTo: number;
}

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** The same clock time `days` days away. Calendar days, so a clock change does not shift it. */
export function shiftDays(at: number, days: number): number {
  const date = new Date(at);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/**
 * The last `days` days up to now - today so far and the days before it - and
 * the same number of days before that, cut at the same time of day.
 */
export function daysToNow(days: number, now: number = Date.now()): FairWindows {
  const from = shiftDays(startOfDay(now), -(days - 1));
  return { from, to: now, beforeFrom: shiftDays(from, -days), beforeTo: shiftDays(now, -days) };
}

export interface FairPair {
  now: number;
  before: number;
  /** Percent up or down on the earlier stretch, or null when it had nothing. */
  percent: number | null;
  windows: FairWindows;
}

/** Money received in the last `days` days, against the same stretch before. */
export function receivedToNow(store: Pick<StoreData, 'sales'>, days: number, now: number = Date.now()): FairPair {
  const windows = daysToNow(days, now);
  // A payment stamped this very millisecond still belongs to now.
  const current = receivedBetween(store, windows.from, windows.to + 1);
  const before = receivedBetween(store, windows.beforeFrom, windows.beforeTo + 1);
  return { now: current, before, percent: before > 0 ? ((current - before) / before) * 100 : null, windows };
}

/** "9:14am", "12pm". */
export function clockTime(at: number): string {
  const date = new Date(at);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}${hours < 12 ? 'am' : 'pm'}`;
}
