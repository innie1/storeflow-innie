/**
 * How the month actually went, and a record of it that outlives the month.
 *
 * A shop that never closes its books cannot tell a good month from a busy one.
 * Takings feel like profit right up to the day the rent is due, and by then
 * the month it came from is gone.
 *
 * Everything is computed from what was recorded, and then kept: laundry
 * records sync and are eventually pruned, so a month left uncounted is a month
 * lost for good. The snapshot is written once the month is over and never
 * rewritten - a closed month is history, not a live figure.
 */

import type { StoreData } from '@/types/store';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';
import { breakEven, monthWindow, monthlyFixedCosts, type MonthWindow } from '@/lib/laundry-breakeven';
import { estimateUnitCost } from '@/lib/cost-estimator';

const HISTORY_KEY = 'storeflow_month_history_';
const CELEBRATED_KEY = 'storeflow_breakeven_celebrated_';

/** "2026-09" — the key a month is filed under. */
export function monthKey(at: Date = new Date()): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
}

export interface MonthReport {
  key: string;
  label: string;
  revenue: number;
  pieces: number;
  /** Drop-offs, which is not the same as pieces and is not used for costing. */
  jobs: number;
  averageJob: number;
  fixedCosts: number;
  variableCosts: number;
  /** Revenue less everything. Negative is a loss, and is said as one. */
  profit: number;
  target: number;
  /** The day the month's costs were first covered, or null if they were not. */
  breakEvenOn: string | null;
  summary: string;
}

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * The day cumulative takings first cleared the month's target.
 *
 * Measured against the month's finished target rather than a target that moves
 * day by day. The margin is only known once the month has traded, so a
 * running target would keep rewriting the past - and the date somebody wants
 * is "when did we cover it", answered from where the month ended up.
 */
export function breakEvenDate(store: StoreData, window: MonthWindow, target: number): string | null {
  if (target <= 0) return null;
  const accessCode = String(store.accessCode || '');
  const records = (accessCode ? getLocalLaundryRecords(accessCode) : [])
    .filter(record => {
      const at = new Date(record.createdAt || '').getTime();
      return Number.isFinite(at) && at >= window.start && at < window.end;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let running = 0;
  for (const record of records) {
    running += Number(record.total) || 0;
    if (running >= target) return record.createdAt;
  }
  return null;
}

export function monthReport(store: StoreData, at: Date = new Date()): MonthReport {
  const window = monthWindow(at);
  const key = monthKey(at);
  const accessCode = String(store.accessCode || '');

  const records = (accessCode ? getLocalLaundryRecords(accessCode) : []).filter(record => {
    const time = new Date(record.createdAt || '').getTime();
    return Number.isFinite(time) && time >= window.start && time < window.end;
  });

  const revenue = records.reduce((sum, record) => sum + (Number(record.total) || 0), 0);
  const pieces = records.reduce((sum, record) => sum + (Number(record.pieceCount) || 0), 0);
  const jobs = records.length;

  const fixedCosts = monthlyFixedCosts(store, window);
  const perPiece = estimateUnitCost(store).perPiece;
  const variableCosts = perPiece === null ? 0 : perPiece * pieces;
  const profit = revenue - fixedCosts - variableCosts;

  const target = breakEven(store, at).target;
  const breakEvenOn = breakEvenDate(store, window, target);

  return {
    key,
    label: monthLabel(key),
    revenue,
    pieces,
    jobs,
    averageJob: jobs > 0 ? revenue / jobs : 0,
    fixedCosts,
    variableCosts,
    profit,
    target,
    breakEvenOn,
    summary: summarise({ revenue, pieces, jobs, fixedCosts, variableCosts, profit, breakEvenOn }),
  };
}

/** Said the way somebody would say it, not as a table read aloud. */
function summarise(part: {
  revenue: number; pieces: number; jobs: number;
  fixedCosts: number; variableCosts: number; profit: number; breakEvenOn: string | null;
}): string {
  if (part.jobs === 0) return 'No work recorded this month.';

  const took = `You took ${money(part.revenue)} across ${part.jobs} ${part.jobs === 1 ? 'drop-off' : 'drop-offs'} and ${part.pieces} ${part.pieces === 1 ? 'piece' : 'pieces'}.`;
  const costs = `Running the shop cost ${money(part.fixedCosts)}, and the washing itself ${money(part.variableCosts)}.`;

  if (part.profit >= 0) {
    const when = part.breakEvenOn
      ? ` You covered your costs on the ${new Date(part.breakEvenOn).getDate()}${ordinal(new Date(part.breakEvenOn).getDate())}.`
      : '';
    return `${took} ${costs} You kept ${money(part.profit)}.${when}`;
  }

  return `${took} ${costs} That is ${money(Math.abs(part.profit))} short — the month did not cover itself.`;
}

function ordinal(day: number): string {
  if (day > 3 && day < 21) return 'th';
  return ['th', 'st', 'nd', 'rd'][day % 10] || 'th';
}

/* ---------------------------------------------------------------- history */

export function getMonthHistory(accessCode: string): MonthReport[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY + String(accessCode || '').toUpperCase());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * File a finished month, once.
 *
 * Only a month that has ended, and never rewritten: the records it was
 * computed from are synced and eventually pruned, so a figure recomputed later
 * would quietly shrink. A closed month is history.
 */
export function recordMonthSnapshot(store: StoreData, at: Date = new Date()): MonthReport[] {
  const accessCode = String(store.accessCode || '').toUpperCase();
  if (!accessCode) return [];

  const thisMonth = monthKey(at);
  const history = getMonthHistory(accessCode);

  const previous = new Date(at.getFullYear(), at.getMonth() - 1, 1);
  const closedKey = monthKey(previous);
  if (closedKey === thisMonth) return history;
  if (history.some(entry => entry.key === closedKey)) return history;

  const report = monthReport(store, previous);
  // Nothing happened in it, so there is nothing worth keeping.
  if (report.jobs === 0) return history;

  const next = [report, ...history].slice(0, 24);
  try { localStorage.setItem(HISTORY_KEY + accessCode, JSON.stringify(next)); } catch { /* private mode */ }
  return next;
}

/* ------------------------------------------------------------ celebration */

/**
 * Whether this month's "we have covered our costs" moment has been shown.
 *
 * Per month and per shop, so it happens once when it is earned and does not
 * come back every time the screen is opened - and next month it is available
 * to be earned again.
 */
export function breakEvenCelebrated(accessCode: string, at: Date = new Date()): boolean {
  try {
    return localStorage.getItem(`${CELEBRATED_KEY}${String(accessCode || '').toUpperCase()}_${monthKey(at)}`) === '1';
  } catch {
    return false;
  }
}

export function markBreakEvenCelebrated(accessCode: string, at: Date = new Date()): void {
  try {
    localStorage.setItem(`${CELEBRATED_KEY}${String(accessCode || '').toUpperCase()}_${monthKey(at)}`, '1');
  } catch { /* private mode */ }
}
