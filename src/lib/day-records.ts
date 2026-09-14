import type { StoreData } from '@/types/store';
import { getLocalLaundryRecords, type LocalLaundryRecord } from '@/lib/laundry-offline';
import { receivedBetween } from '@/lib/money-figures';
import { laundryBalance } from '@/lib/laundry-money';

/**
 * Every day the laundry worked, recorded by its date.
 *
 * There used to be an evening card - "How today went" - that appeared once a
 * day after five and went away when it was marked done. Asked for from the
 * shop: it should not appear at all; the day should be recorded by itself,
 * by date.
 *
 * So nothing is shown and nothing is asked. Whenever the shop's data changes,
 * today's record is brought up to date, and any earlier day that was worked
 * but never recorded - the phone was not opened that evening - is filled in
 * from the dates on the bundles and payments. The days are read back in
 * Analysis.
 *
 * What a day records, and why:
 *   - bundles and pieces taken in that day: pieces, because every costing in
 *     the app divides by pieces, and a shirt and a bundle of twenty are not the
 *     same day's work;
 *   - money received that day, from the one definition every screen shares -
 *     payments by the day they were made, including a debt from last week
 *     settled today;
 *   - the price of the work taken in, which is not money received;
 *   - what is still owed on that day's bundles.
 *
 * A day is counted as it goes and settled once it is over. Its dated figures
 * are then complete, and what was owed stays as it was last seen on the day,
 * because a payment the next morning is the next day's news. A settled day is
 * not rewritten. A day filled in later, having never been seen, can only say
 * what is owed when it is filled in.
 *
 * Kept on this phone, like the month report, with no database change.
 */

const HISTORY_KEY = 'storeflow_day_history_';
const CHECKED_KEY = 'storeflow_day_history_checked_';

/** How far back a first run looks for days worked but never recorded. */
export const BACKFILL_DAYS = 60;
/** A little over a year of days. */
export const KEEP_DAYS = 400;

export interface DayRecord {
  /** "2026-09-14", the date the day is filed under. */
  key: string;
  bundlesIn: number;
  piecesIn: number;
  /** What the work taken in that day is priced at, paid or not. */
  workTakenIn: number;
  /** Money that came in that day. */
  received: number;
  /** Still owed on that day's bundles, as last seen on the day. */
  owedOnDay: number;
  recordedAt: string;
  /** Over and settled; never rewritten. Today is not final. */
  final: boolean;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** The date a moment falls on, in the shop's own time. */
export function dayKey(at: Date | number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function nextDay(start: number): number {
  const date = new Date(start);
  date.setDate(date.getDate() + 1);
  return date.getTime();
}

function startOfKey(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1).getTime();
}

/** "Mon, 15 Sep 2026", for a date key. */
export function describeDay(key: string): string {
  return new Date(startOfKey(key)).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function time(value: unknown): number {
  const at = new Date(String(value || '')).getTime();
  return Number.isFinite(at) ? at : 0;
}

function localRecords(accessCode: string): LocalLaundryRecord[] {
  try {
    return getLocalLaundryRecords(accessCode);
  } catch {
    return [];
  }
}

/** One day's figures, from the bundles on this phone and the money recorded. */
export function measureDay(
  store: StoreData,
  records: Pick<LocalLaundryRecord, 'clientRef' | 'createdAt' | 'pieceCount' | 'total'>[],
  dayStart: number,
  now: number = Date.now(),
): DayRecord {
  const dayEnd = nextDay(dayStart);
  const bundles = records.filter(record => {
    const at = time(record.createdAt);
    return at >= dayStart && at < dayEnd;
  });
  return {
    key: dayKey(dayStart),
    bundlesIn: bundles.length,
    piecesIn: bundles.reduce((sum, record) => sum + (Number(record.pieceCount) || 0), 0),
    workTakenIn: Math.round(bundles.reduce((sum, record) => sum + (Number(record.total) || 0), 0)),
    received: Math.round(receivedBetween(store, dayStart, dayEnd)),
    owedOnDay: Math.round(bundles.reduce((sum, record) => sum + Math.max(0, laundryBalance(store, record.clientRef)), 0)),
    recordedAt: new Date(now).toISOString(),
    final: false,
  };
}

const worked = (day: Pick<DayRecord, 'bundlesIn' | 'received'>) => day.bundlesIn > 0 || day.received > 0;

const sameFigures = (a: DayRecord, b: DayRecord) =>
  a.bundlesIn === b.bundlesIn && a.piecesIn === b.piecesIn && a.workTakenIn === b.workTakenIn
  && a.received === b.received && a.owedOnDay === b.owedOnDay && a.final === b.final;

export function getDayHistory(accessCode: string): DayRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY + String(accessCode || '').toUpperCase());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(day => day && typeof day.key === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Bring the record of days up to date. Safe to call as often as the shop's
 * data changes: it only writes when a figure has actually changed.
 */
export function recordDays(store: StoreData, now: number = Date.now()): DayRecord[] {
  const accessCode = String(store.accessCode || '').toUpperCase();
  if (!accessCode) return [];

  const history = getDayHistory(accessCode);
  const byKey = new Map(history.map(day => [day.key, day]));
  const records = localRecords(accessCode);
  const today = startOfDay(now);

  // Where the last run got to, so the days already settled are not walked again.
  let checked: string | null = null;
  try { checked = localStorage.getItem(CHECKED_KEY + accessCode); } catch { /* private mode */ }

  let start = startOfDay(today - BACKFILL_DAYS * 86400000);
  if (checked) start = Math.max(start, nextDay(startOfKey(checked)));

  for (; start < today; start = nextDay(start)) {
    const key = dayKey(start);
    const existing = byKey.get(key);
    if (existing?.final) continue;

    const measured = measureDay(store, records, start, now);
    // Counted while it was going: keep what was owed as last seen that day.
    const settled: DayRecord = { ...measured, owedOnDay: existing ? existing.owedOnDay : measured.owedOnDay, final: true };
    if (worked(settled)) byKey.set(key, settled);
    else byKey.delete(key);
  }

  const live = measureDay(store, records, today, now);
  const previous = byKey.get(live.key);
  if (!worked(live)) byKey.delete(live.key);
  else if (!previous || !sameFigures(previous, live)) byKey.set(live.key, live);

  const next = [...byKey.values()].sort((a, b) => b.key.localeCompare(a.key)).slice(0, KEEP_DAYS);
  const yesterday = dayKey(today - 1);

  try {
    if (next.length !== history.length || next.some((day, index) => day !== history[index])) {
      localStorage.setItem(HISTORY_KEY + accessCode, JSON.stringify(next));
    }
    if (checked !== yesterday) localStorage.setItem(CHECKED_KEY + accessCode, yesterday);
  } catch { /* private mode: the days are still returned for this screen */ }

  return next;
}
