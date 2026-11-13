import { StoreData } from '@/types/store';
import { isStockPurchase } from '@/lib/store-data';
import { startOfDay, daysBetween } from './dates';

// ─── Daily series ─────────────────────────────────────────────────────────────
export interface DailyPoint {
  ts: number; label: string;
  /** Running costs only — stock purchases are tracked separately below. */
  revenue: number; profit: number; expenses: number; stockPurchases: number; salesCount: number;
}

export function dailySeries(store: StoreData, days: number, now: Date = new Date()): DailyPoint[] {
  const today = startOfDay(now);
  const buckets: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    buckets.push({ ts: d.getTime(), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), revenue: 0, profit: 0, expenses: 0, stockPurchases: 0, salesCount: 0 });
  }
  const minTs = buckets[0].ts;
  store.sales.forEach(s => {
    const d = startOfDay(new Date(s.date)).getTime();
    if (d < minTs) return;
    const b = buckets.find(x => x.ts === d);
    if (b) { b.revenue += s.total; b.profit += s.profit; b.salesCount += 1; }
  });
  (store.expenses || []).forEach(e => {
    const d = startOfDay(new Date(e.date)).getTime();
    if (d < minTs) return;
    const b = buckets.find(x => x.ts === d);
    // Paying a supplier is not overhead. Keeping it out of `expenses` is what
    // stops "your expenses are outstripping your sales" firing on a restock.
    if (b) {
      if (isStockPurchase(e)) b.stockPurchases += e.amount;
      else b.expenses += e.amount;
    }
  });
  return buckets;
}

export function lifetimeSeries(store: StoreData): DailyPoint[] {
  const start = startOfDay(new Date(store.createdAt));
  const days = Math.max(7, daysBetween(new Date(), start));
  return dailySeries(store, Math.min(days, 365));
}

// ─── Linear Regression ────────────────────────────────────────────────────────
export function linReg(values: number[]) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - meanX) * (values[i] - meanY); den += (x - meanX) ** 2; });
  const slope = den ? num / den : 0;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

/**
 * How tightly the observed history pins down a future total, returned as a
 * relative half-width: 0.08 means the estimate is worth ±8%.
 *
 * This replaces an R² reading that was measuring the wrong thing. R² says how
 * well a *sloped* line explains the daily figures, so a shop taking the same
 * money every day — the most predictable business there is — has no slope to
 * explain and scored near zero, while a shop whose takings were sliding in a
 * tidy line scored near one. Every realistic shop landed on the 55% floor and
 * a flat ±45%, so the rating never moved with the data, and where it did move
 * it moved backwards.
 *
 * What matters instead is how well the sample fixes the rate the forecast
 * projects forward: the standard error of the mean, measured around the fitted
 * trend so a shop with a genuine trend is not punished for having one, and
 * taken over whole weeks so a shop that closes on Sundays is not punished for
 * a rhythm that is perfectly predictable.
 */
export function projectionBand(
  daily: number[],
  horizonDays: number,
  totalSales: number,
): number {
  const n = daily.length;

  // Whole weeks once there are at least two of them; otherwise the raw days.
  const buckets: number[] = [];
  if (n >= 14) {
    for (let i = 0; i + 7 <= n; i += 7) {
      buckets.push(daily.slice(i, i + 7).reduce((a, b) => a + b, 0));
    }
  } else {
    buckets.push(...daily);
  }

  const k = buckets.length;
  const mean = k ? buckets.reduce((a, b) => a + b, 0) / k : 0;
  // Nothing to go on: no trading, or a single bucket that cannot show spread.
  if (!mean || k < 2) return MAX_BAND;

  // Spread around the fitted line, falling back to spread around the flat mean
  // when there are too few buckets to fit one.
  let variance: number;
  if (k >= 3) {
    const xs = buckets.map((_, i) => i);
    const meanX = xs.reduce((a, b) => a + b, 0) / k;
    let num = 0, den = 0;
    for (let i = 0; i < k; i++) {
      num += (xs[i] - meanX) * (buckets[i] - mean);
      den += (xs[i] - meanX) ** 2;
    }
    const slope = den ? num / den : 0;
    const intercept = mean - slope * meanX;
    let resSS = 0;
    for (let i = 0; i < k; i++) resSS += (buckets[i] - (slope * xs[i] + intercept)) ** 2;
    variance = resSS / (k - 2);           // two parameters fitted
  } else {
    let totSS = 0;
    for (const b of buckets) totSS += (b - mean) ** 2;
    variance = totSS / (k - 1);
  }

  const relStdErr = Math.sqrt(variance) / mean / Math.sqrt(k);
  // The further the horizon runs past what was observed, the less the sample
  // can promise about it.
  const horizonFactor = Math.sqrt(1 + horizonDays / Math.max(7, n));
  let band = 1.28 * relStdErr * horizonFactor;   // roughly an 80% interval

  // Rails. However tidy the numbers look, a sample cannot see a price shock, a
  // new competitor or a burst pipe coming, and a handful of sales over a few
  // days cannot support a tight answer at all.
  band = Math.max(band, MIN_BAND);
  if (totalSales < 10) band = Math.max(band, 0.6 - totalSales * 0.03);
  if (n < 14) band = Math.max(band, 0.35);
  if (horizonDays >= 180) band = Math.max(band, 0.4);
  else if (horizonDays >= 90) band = Math.max(band, 0.25);

  return Math.min(MAX_BAND, Math.max(MIN_BAND, band));
}

/** Tightest and loosest the range is ever allowed to be. */
export const MIN_BAND = 0.08;

export const MAX_BAND = 0.6;

// ─── Forecast ─────────────────────────────────────────────────────────────────
export interface Forecast {
  horizonDays: number;
  label: string;
  expectedRevenue: number;
  expectedProfit: number;
  expectedExpenses: number;
  confidencePct: number;
  confidence: 'High' | 'Medium' | 'Low';
  /** Low and high ends of the estimate, widened when confidence is low. */
  revenueLow: number;
  revenueHigh: number;
  /** The same for profit, which swings wider than revenue and matters more. */
  profitLow: number;
  profitHigh: number;
  /** Days of trading the estimate was built from, capped at the 30-day window. */
  daysObserved: number;
  caveat?: string; // shown for long horizons where the estimate is necessarily rougher
}

export function forecastHorizon(store: StoreData, horizonDays: number, now: Date = new Date()): Forecast {
  // Only look back as far as the shop has existed.
  //
  // dailySeries always built 30 buckets, so a store open a week was regressed
  // over 23 empty days. Those zeros dragged the daily average down to roughly a
  // quarter of the truth, and — because they all sit at the start of the window
  // — tilted the line upward, producing a confident-looking forecast of growth
  // that was really just the shop opening.
  //
  // From the first sale when that is earlier than the store record. A shop
  // that moved to a new phone, restored a backup or brought its history in
  // has a store record days old and months of takings, and the forecast was
  // built on those few days alone.
  const openedAt = tradingSince(store);
  const daysOpen = openedAt
    ? Math.floor((now.getTime() - openedAt) / 86400000) + 1
    : 30;
  const window = Math.max(2, Math.min(30, daysOpen));
  const series = dailySeries(store, window, now);
  const rev = linReg(series.map(s => s.revenue));
  const prof = linReg(series.map(s => s.profit));
  const exp = linReg(series.map(s => s.expenses));

  // Straight-line trend extrapolation gets unreliable the further out you go —
  // 30 days of data doesn't justify a full year of unbroken linear growth or
  // decline. Beyond the observed 30-day window, we exponentially dampen the
  // trend's influence so the projection settles toward the recent daily
  // average instead of running away in a straight line. Near-term forecasts
  // (tomorrow, 7 days) are barely affected; only 90d/180d/365d are pulled in.
  const DAMPING_DAYS = 45;
  const avgRevPerDay = series.reduce((s, d) => s + d.revenue, 0) / series.length;
  const avgProfPerDay = series.reduce((s, d) => s + d.profit, 0) / series.length;
  const avgExpPerDay = series.reduce((s, d) => s + d.expenses, 0) / series.length;

  let expectedRevenue = 0, expectedProfit = 0, expectedExpenses = 0;
  for (let i = window; i < window + horizonDays; i++) {
    const daysPastWindow = i - (window - 1);
    const damp = Math.exp(-daysPastWindow / DAMPING_DAYS);
    const rawRev = rev.slope * i + rev.intercept;
    const rawProf = prof.slope * i + prof.intercept;
    const rawExp = exp.slope * i + exp.intercept;
    expectedRevenue += Math.max(0, avgRevPerDay + (rawRev - avgRevPerDay) * damp);
    expectedProfit += Math.max(0, avgProfPerDay + (rawProf - avgProfPerDay) * damp);
    expectedExpenses += Math.max(0, avgExpPerDay + (rawExp - avgExpPerDay) * damp);
  }

  const totalSales = store.sales.length;

  // Each series is rated on its own history. Expenses used to be averaged into
  // this: they are lumpy by nature — rent, a restock, a repair — so a straight
  // line through them almost never fits, and that near-zero reading was pulling
  // down the rating shown against revenue, which it says nothing about.
  const revenueBand = projectionBand(series.map(d => d.revenue), horizonDays, totalSales);
  const profitBand = projectionBand(series.map(d => d.profit), horizonDays, totalSales);

  // The headline rating is the revenue one, since that is the figure it sits
  // under. The range and the percentage now come from the same calculation, so
  // they can no longer disagree.
  const spread = revenueBand;
  const confidencePct = Math.round(100 - revenueBand * 100);
  const confidence: Forecast['confidence'] =
    confidencePct >= 80 ? 'High' : confidencePct >= 60 ? 'Medium' : 'Low';

  const horizonLabel: Record<number, string> = { 1: 'Tomorrow', 7: '7 Days', 14: '14 Days', 30: '1 Month', 90: '3 Months', 180: '6 Months', 365: '1 Year' };
  // Say how much history it is actually built on, rather than always claiming
  // thirty days.
  const basis = `your last ${window} day${window === 1 ? '' : 's'} of activity`;
  const caveat = horizonDays >= 90
    ? `Based on ${basis}. Long-range estimates settle toward your recent average rather than assuming today's trend continues in a straight line — treat this as a rough planning number, not a guarantee.`
    : window < 14
      ? `Based on ${basis} only. It will sharpen as you record more days.`
      : undefined;

  const finalPct = Math.min(95, Math.max(5, confidencePct));
  return {
    horizonDays,
    label: horizonLabel[horizonDays] ?? `${horizonDays}d`,
    expectedRevenue, expectedProfit, expectedExpenses,
    confidencePct: finalPct,
    confidence,
    revenueLow: Math.max(0, expectedRevenue * (1 - spread)),
    revenueHigh: expectedRevenue * (1 + spread),
    profitLow: Math.max(0, expectedProfit * (1 - profitBand)),
    profitHigh: expectedProfit * (1 + profitBand),
    daysObserved: window,
    caveat,
  };
}

/** When the shop's records begin: the store record, or an earlier first sale. */
function tradingSince(store: StoreData): number {
  let earliest = store.createdAt ? new Date(store.createdAt).getTime() : Infinity;
  for (const sale of store.sales || []) {
    const at = new Date(sale.date).getTime();
    if (Number.isFinite(at) && at < earliest) earliest = at;
  }
  return Number.isFinite(earliest) ? earliest : 0;
}

// ─── Track record ─────────────────────────────────────────────────────────────
export interface ForecastCheck {
  /** First day the forecast was about. */
  from: number;
  /** The day after its last. */
  to: number;
  predicted: number;
  low: number;
  high: number;
  actual: number;
  /** The real figure landed inside the range the forecast gave. */
  withinRange: boolean;
  /** How far off, as a share of what was predicted. */
  errorPct: number;
}

export interface ForecastTrackRecord {
  checks: ForecastCheck[];
  /** Average closeness, 0-100, or null with nothing to check yet. */
  accuracyPct: number | null;
  hits: number;
}

/**
 * How right this forecast has been, worked out rather than asked.
 *
 * The page used to end every forecast with "Was this accurate? Correct /
 * Incorrect", which asks the owner to remember a number and do the sum. The
 * app has both halves already: it can make the same forecast as it would
 * have made on an earlier day, from only what was recorded by then, and set
 * it beside what actually came in afterwards. Up to four stretches back, the
 * latest first, each ending before today so a half-finished day never counts.
 */
export function forecastTrackRecord(store: StoreData, horizonDays: number, now: Date = new Date(), rounds = 4): ForecastTrackRecord {
  const DAY = 86400000;
  const today = startOfDay(now).getTime();
  // Judged from the first sale: a forecast made before there were any takings
  // to go on says nothing about how good the forecast is.
  let since = Infinity;
  for (const sale of store.sales || []) {
    const at = new Date(sale.date).getTime();
    if (Number.isFinite(at) && at < since) since = at;
  }
  const checks: ForecastCheck[] = [];
  for (let k = 1; k <= rounds; k++) {
    const from = today - k * horizonDays * DAY;
    const to = from + horizonDays * DAY;
    // A forecast needs a week of history behind it to be worth judging.
    if (!Number.isFinite(since) || from - 7 * DAY < startOfDay(new Date(since)).getTime()) break;
    const before = (date: unknown) => new Date(String(date)).getTime() < from;
    const then: StoreData = {
      ...store,
      sales: (store.sales || []).filter(sale => before(sale.date)),
      expenses: (store.expenses || []).filter(expense => before(expense.date)),
    };
    const made = forecastHorizon(then, horizonDays, new Date(from - 1));
    const actual = (store.sales || [])
      .filter(sale => {
        const at = new Date(sale.date).getTime();
        return at >= from && at < to;
      })
      .reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
    if (made.expectedRevenue <= 0 && actual <= 0) continue;
    const errorPct = made.expectedRevenue > 0
      ? Math.abs(actual - made.expectedRevenue) / made.expectedRevenue * 100
      : 100;
    checks.push({
      from,
      to,
      predicted: made.expectedRevenue,
      low: made.revenueLow,
      high: made.revenueHigh,
      actual,
      withinRange: actual >= made.revenueLow && actual <= made.revenueHigh,
      errorPct,
    });
  }
  const accuracyPct = checks.length
    ? Math.round(checks.reduce((sum, check) => sum + Math.max(0, 100 - check.errorPct), 0) / checks.length)
    : null;
  return { checks, accuracyPct, hits: checks.filter(check => check.withinRange).length };
}

/** Legacy compat */
export function forecast(store: StoreData, horizonDays: number) { return forecastHorizon(store, horizonDays); }
