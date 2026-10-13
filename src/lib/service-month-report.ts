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
import { shopLaundryRecords } from '@/lib/shop-laundry';

import { breakEven, monthWindow, monthlyFixedCosts, type MonthWindow } from '@/lib/service-breakeven';
import { estimateUnitCost } from '@/lib/cost-estimator';
import { receivedBetween } from '@/lib/money-figures';
import { laundryBalance } from '@/lib/laundry-money';

const HISTORY_KEY = 'storeflow_month_history_';
const CELEBRATED_KEY = 'storeflow_breakeven_celebrated_';

/** "2026-09" — the key a month is filed under. */
export function monthKey(at: Date = new Date()): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
}

export interface MonthReport {
  key: string;
  label: string;
  /** Money received this month - payments, by the day they were paid. */
  revenue: number;
  /** The price of the drop-offs taken in this month, paid or not. */
  workTakenIn: number;
  /** Still owed on this month's drop-offs. */
  owed: number;
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
 * The day the money received first cleared the month's target.
 *
 * Measured against the month's finished target rather than a target that moves
 * day by day. The margin is only known once the month has traded, so a
 * running target would keep rewriting the past - and the date somebody wants
 * is "when did we cover it", answered from where the month ended up.
 */
export function breakEvenDate(store: StoreData, window: MonthWindow, target: number): string | null {
  if (target <= 0) return null;
  // Payments, in the order they came in: the costs are covered by money in
  // hand, not by work still owed.
  const payments = (store.sales || [])
    .filter(sale => {
      const at = new Date(String(sale.date || '')).getTime();
      return Number.isFinite(at) && at >= window.start && at < window.end;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  for (const sale of payments) {
    running += Number(sale.total) || 0;
    if (running >= target) return sale.date;
  }
  return null;
}

export function monthReport(store: StoreData, at: Date = new Date()): MonthReport {
  const window = monthWindow(at);
  const key = monthKey(at);
  const accessCode = String(store.accessCode || '');

  const records = (accessCode ? shopLaundryRecords(accessCode) : []).filter(record => {
    const time = new Date(record.createdAt || '').getTime();
    return Number.isFinite(time) && time >= window.start && time < window.end;
  });

  /*
   * Money received this month, not the price of the drop-offs. A month that
   * took in plenty of work and was paid for little of it has not earned what
   * it took in, and "you kept" must not say it has.
   */
  const revenue = receivedBetween(store, window.start, window.end);
  const workTakenIn = records.reduce((sum, record) => sum + (Number(record.total) || 0), 0);
  const owed = records.reduce((sum, record) => sum + laundryBalance(store, record.clientRef), 0);
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
    workTakenIn,
    owed,
    pieces,
    jobs,
    // What a drop-off is priced at - the work, not the payments for it.
    averageJob: jobs > 0 ? workTakenIn / jobs : 0,
    fixedCosts,
    variableCosts,
    profit,
    target,
    breakEvenOn,
    summary: summarise({ revenue, workTakenIn, owed, pieces, jobs, fixedCosts, variableCosts, profit, breakEvenOn }),
  };
}

/** Said the way somebody would say it, not as a table read aloud. */
function summarise(part: {
  revenue: number; workTakenIn: number; owed: number; pieces: number; jobs: number;
  fixedCosts: number; variableCosts: number; profit: number; breakEvenOn: string | null;
}): string {
  if (part.jobs === 0 && part.revenue === 0) return 'No work recorded this month.';

  const work = part.jobs > 0
    ? ` You took in ${part.jobs} ${part.jobs === 1 ? 'drop-off' : 'drop-offs'} (${part.pieces} ${part.pieces === 1 ? 'piece' : 'pieces'}) worth ${money(part.workTakenIn)}${part.owed > 0 ? `, ${money(part.owed)} of it still owed` : ''}.`
    : '';
  const took = `You received ${money(part.revenue)} this month.${work}`;
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
 * The past months, worked out again from the shop's records each time.
 *
 * A month used to be filed once when it ended and never touched again. That
 * froze every mistake: a calculation fixed later never reached the months
 * already filed, and a month the phone did not see close (a new phone, a shop
 * opened late in the month) was simply missing. The records are the shop's
 * own now - every bundle in the cloud plus every payment in the books - so a
 * month is recomputed from them, with the latest rules, whenever it is shown.
 *
 * The filed copy is still kept, and used only for a month whose records are no
 * longer anywhere this phone can read, so history never quietly shrinks.
 */
export function monthHistory(store: StoreData, at: Date = new Date(), months = 24): MonthReport[] {
  const accessCode = String(store.accessCode || '').toUpperCase();
  if (!accessCode) return [];
  const filed = new Map(getMonthHistory(accessCode).map(entry => [entry.key, entry]));
  const history: MonthReport[] = [];
  for (let back = 1; back <= months; back++) {
    const month = new Date(at.getFullYear(), at.getMonth() - back, 1);
    const live = monthReport(store, month);
    const hasRecords = live.jobs > 0 || live.revenue > 0;
    const report = hasRecords ? live : filed.get(live.key);
    if (report) history.push(report);
  }
  // Keep the newest figures as the fallback for the day the records are gone,
  // and any older filed month this view does not reach.
  const shown = new Set(history.map(entry => entry.key));
  const kept = [...history, ...[...filed.values()].filter(entry => !shown.has(entry.key))]
    .sort((a, b) => b.key.localeCompare(a.key))
    .slice(0, 36);
  try { localStorage.setItem(HISTORY_KEY + accessCode, JSON.stringify(kept)); } catch { /* private mode */ }
  return history;
}

/**
 * File a finished month, once - kept as the fallback copy only. What is shown
 * is monthHistory, which works each month out again from the records.
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
  // A month with payments but no new drop-offs still took in money worth keeping.
  if (report.jobs === 0 && report.revenue === 0) return history;

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
