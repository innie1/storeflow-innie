import { StoreData, Product, FlowNotification, TabId } from '@/types/store';
import { getLowStockThreshold } from '@/lib/settings';
import { getPendingSummary, isStockPurchase } from '@/lib/store-data';
import type { AutoFixSpec } from '@/lib/auto-fix';
import type { ProductFocus } from '@/lib/product-focus';
import { productMarkup } from '@/lib/pricing-math';

// ─── Date helpers ─────────────────────────────────────────────────────────────
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function daysAgo(n: number) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; }
function daysBetween(a: Date, b: Date) {
  return Math.max(1, Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000) + 1);
}

export function isStoreOnboarding(store: StoreData): boolean {
  if (!store.createdAt) return false;
  const createdTime = new Date(store.createdAt).getTime();
  if (isNaN(createdTime)) return false;
  const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
  return (Date.now() - createdTime) < threeDaysInMs;
}

// ─── Daily series ─────────────────────────────────────────────────────────────
export interface DailyPoint {
  ts: number; label: string;
  /** Running costs only — stock purchases are tracked separately below. */
  revenue: number; profit: number; expenses: number; stockPurchases: number; salesCount: number;
}

export function dailySeries(store: StoreData, days: number): DailyPoint[] {
  const today = startOfDay(new Date());
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
function linReg(values: number[]) {
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
function projectionBand(
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
const MIN_BAND = 0.08;
const MAX_BAND = 0.6;

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

export function forecastHorizon(store: StoreData, horizonDays: number): Forecast {
  // Only look back as far as the shop has existed.
  //
  // dailySeries always built 30 buckets, so a store open a week was regressed
  // over 23 empty days. Those zeros dragged the daily average down to roughly a
  // quarter of the truth, and — because they all sit at the start of the window
  // — tilted the line upward, producing a confident-looking forecast of growth
  // that was really just the shop opening.
  const openedAt = store.createdAt ? new Date(store.createdAt).getTime() : 0;
  const daysOpen = openedAt
    ? Math.floor((Date.now() - openedAt) / 86400000) + 1
    : 30;
  const window = Math.max(2, Math.min(30, daysOpen));
  const series = dailySeries(store, window);
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
  let confidencePct = Math.round(100 - revenueBand * 100);
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

/** Legacy compat */
export function forecast(store: StoreData, horizonDays: number) { return forecastHorizon(store, horizonDays); }

// ─── Store Health (6-factor per spec) ─────────────────────────────────────────
export interface HealthScore {
  overall: number;
  revenue: number;     // 25%
  profit: number;      // 25%
  inventory: number;   // 15%
  expense: number;     // 15%
  savings: number;     // 10%
  debt: number;        // 10%
  // legacy compat
  sales: number;
  label: string;
  details: Record<string, string>;
}

export function healthScore(store: StoreData): HealthScore {
  const last7 = dailySeries(store, 7);
  const prev7 = dailySeries(store, 14).slice(0, 7);
  const rev7 = last7.reduce((s, d) => s + d.revenue, 0);
  const revPrev = prev7.reduce((s, d) => s + d.revenue, 0);
  const profit7 = last7.reduce((s, d) => s + d.profit, 0);
  const exp7 = last7.reduce((s, d) => s + d.expenses, 0);

  // 25%: Revenue Performance
  let revenueScore = 50;
  if (revPrev > 0) {
    const growth = (rev7 - revPrev) / revPrev;
    revenueScore = Math.max(0, Math.min(100, 60 + growth * 150));
  } else if (rev7 > 0) revenueScore = 65;
  const revDetail = revPrev > 0
    ? `Revenue ${rev7 >= revPrev ? '↑' : '↓'} ${Math.abs(((rev7 - revPrev) / revPrev) * 100).toFixed(1)}% vs last week`
    : rev7 > 0 ? `₦${rev7.toLocaleString()} this week` : 'No sales this week';

  // 25%: Profit Performance
  let profitScore = 50;
  if (rev7 > 0) { const margin = profit7 / rev7; profitScore = Math.max(0, Math.min(100, margin * 200)); }
  const profDetail = rev7 > 0 ? `${((profit7 / rev7) * 100).toFixed(1)}% margin` : 'No sales data';

  // 15%: Inventory Health
  // Previously: healthy = quantity > threshold, score = healthy/total. This
  // treated a dead product sitting fully stocked the same as your best
  // seller, and a store with 20 stocked-but-unsold SKUs could show ~100%
  // "health" while its 2 actual best sellers were completely out of stock.
  // Now: reuses the same velocity-aware urgency data as the restock
  // suggestions (so the two features can't disagree), and weights each
  // product by how much of your recent sales it actually represents —
  // a fast seller going critical hurts the score much more than a slow
  // mover being low, and a slow mover being low barely moves it at all.
  const activeProducts = store.products.filter(p => !p.discontinued);
  const total = activeProducts.length;
  let inventoryScore = 100;
  let invDetail = 'No products in catalog yet';
  if (total > 0) {
    const forecasts = computeStockForecasts(store);
    const last30 = store.sales.filter(s => new Date(s.date) >= daysAgo(30));
    const sold30ByProduct = new Map<string, number>();
    last30.forEach(s => sold30ByProduct.set(s.productId, (sold30ByProduct.get(s.productId) || 0) + s.quantity));

    // Additive smoothing so untested/new products still count a little,
    // instead of being invisible to the score until they've sold something.
    const SMOOTHING = 1;
    const weighted = forecasts.map(f => {
      const unitsSold30 = sold30ByProduct.get(f.product.id) || 0;
      const weight = unitsSold30 * f.product.sellingPrice + SMOOTHING;
      const points = f.product.quantity === 0 ? 0 : f.urgency === 'critical' ? 25 : f.urgency === 'soon' ? 65 : 100;
      return { weight, points, urgency: f.urgency, isOut: f.product.quantity === 0 };
    });
    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0) || 1;
    inventoryScore = Math.round(weighted.reduce((s, w) => s + w.points * (w.weight / totalWeight), 0));

    const outOfStock = weighted.filter(w => w.isOut).length;
    const critical = forecasts.filter(f => f.urgency === 'critical' && f.product.quantity > 0).length;
    const soon = forecasts.filter(f => f.urgency === 'soon').length;
    if (outOfStock > 0) invDetail = `${outOfStock} product${outOfStock === 1 ? '' : 's'} out of stock right now`;
    else if (critical > 0) invDetail = `${critical} fast-moving product${critical === 1 ? '' : 's'} about to run out`;
    else if (soon > 0) invDetail = `${soon} product${soon === 1 ? '' : 's'} running low, none urgent yet`;
    else invDetail = `All ${total} products well-stocked`;
  }

  // 15%: Expense Control
  let expenseScore = 80;
  if (rev7 > 0) { const ratio = exp7 / rev7; expenseScore = Math.max(0, Math.min(100, 100 - ratio * 60)); }
  const expDetail = rev7 > 0 ? `Expenses = ${((exp7 / rev7) * 100).toFixed(0)}% of revenue` : exp7 > 0 ? `₦${exp7.toLocaleString()} expenses this week` : 'No expenses recorded';

  // 10%: Savings Progress
  let savingsScore = 50;
  const sg = store.savingsGoal;
  if (sg && sg.amount > 0) { savingsScore = Math.min(100, Math.round((sg.saved / sg.amount) * 100)); }
  const savDetail = sg ? `₦${sg.saved.toLocaleString()} / ₦${sg.amount.toLocaleString()} saved` : 'No savings goal set';

  // 10%: Customer Debt Management
  let debtScore = 80;
  const pendSum = getPendingSummary(store);
  if (pendSum.totalOwed > 0 && rev7 > 0) {
    const debtRatio = pendSum.totalOwed / (rev7 * 4);
    debtScore = Math.max(0, Math.min(100, 100 - debtRatio * 80));
  } else if (pendSum.totalOwed === 0) debtScore = 100;
  const debtDetail = pendSum.totalOwed > 0 ? `₦${pendSum.totalOwed.toLocaleString()} outstanding · ${pendSum.overdue.length} overdue` : 'No outstanding debts';

  const overall = Math.round(
    revenueScore * 0.25 + profitScore * 0.25 + inventoryScore * 0.15 +
    expenseScore * 0.15 + savingsScore * 0.10 + debtScore * 0.10
  );
  let label = 'Needs Attention';
  if (overall >= 80) label = 'Great Performance';
  else if (overall >= 60) label = 'Healthy';
  else if (overall >= 40) label = 'Average';

  return {
    overall,
    revenue: Math.round(revenueScore),
    profit: Math.round(profitScore),
    inventory: inventoryScore,
    expense: Math.round(expenseScore),
    savings: savingsScore,
    debt: debtScore,
    sales: Math.round(revenueScore), // legacy compat
    label,
    details: { revenue: revDetail, profit: profDetail, inventory: invDetail, expense: expDetail, savings: savDetail, debt: debtDetail },
  };
}

// ─── Sales Analysis ───────────────────────────────────────────────────────────
export interface SalesAnalysis {
  fastMovers: { name: string; qty: number; revenue: number }[];
  slowMovers: { name: string; qty: number; daysInStock: number }[];
  neverSold: { id: string; name: string; daysInStock: number }[];
  coPurchases: { a: string; b: string; count: number }[];
  topDay: string;
  topDayRevenue: number;
}

export function analyzeSales(store: StoreData): SalesAnalysis {
  const last30 = store.sales.filter(s => new Date(s.date) >= daysAgo(30));

  // Fast movers
  const tally = new Map<string, { name: string; qty: number; revenue: number }>();
  last30.forEach(s => {
    const e = tally.get(s.productId) || { name: s.productName, qty: 0, revenue: 0 };
    e.qty += s.quantity; e.revenue += s.total;
    tally.set(s.productId, e);
  });
  const fastMovers = [...tally.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Slow movers / never sold
  const soldIds = new Set(last30.map(s => s.productId));
  const slowMovers: SalesAnalysis['slowMovers'] = [];
  const neverSold: SalesAnalysis['neverSold'] = [];
  store.products.filter(p => !p.discontinued).forEach(p => {
    const daysInStock = p.addedAt ? Math.floor((Date.now() - new Date(p.addedAt).getTime()) / 86400000) : 0;
    if (!soldIds.has(p.id)) {
      if (daysInStock > 7) neverSold.push({ id: p.id, name: p.name, daysInStock });
    } else {
      const qty = tally.get(p.id)?.qty || 0;
      if (qty < 3) slowMovers.push({ name: p.name, qty, daysInStock });
    }
  });

  // Co-purchases: find product pairs actually bought together in the SAME
  // checkout (transactionId), not just sold on the same calendar day. Day-
  // level grouping meant that in any moderately busy store, nearly every
  // product would eventually "co-purchase" with every other product just by
  // both selling at some point that day — a meaningless signal once there's
  // any real foot traffic. Sales without a transactionId (older records, or
  // single standalone sales) are excluded rather than falsely grouped.
  const byTransaction = new Map<string, string[]>();
  last30.forEach(s => {
    if (!s.transactionId) return;
    const arr = byTransaction.get(s.transactionId) || [];
    arr.push(s.productName);
    byTransaction.set(s.transactionId, arr);
  });
  const pairCount = new Map<string, number>();
  byTransaction.forEach(names => {
    const uniqueNames = [...new Set(names)];
    for (let i = 0; i < uniqueNames.length; i++)
      for (let j = i + 1; j < uniqueNames.length; j++) {
        const key = [uniqueNames[i], uniqueNames[j]].sort().join('|||');
        pairCount.set(key, (pairCount.get(key) || 0) + 1);
      }
  });
  const coPurchases = [...pairCount.entries()]
    .filter(([, c]) => c >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([key, count]) => { const [a, b] = key.split('|||'); return { a, b, count }; });

  // Top day (by revenue in last 30d)
  const dayTotals = new Map<string, number>();
  last30.forEach(s => {
    const day = s.date.split('T')[0];
    dayTotals.set(day, (dayTotals.get(day) || 0) + s.total);
  });
  let topDay = '', topDayRevenue = 0;
  dayTotals.forEach((rev, day) => { if (rev > topDayRevenue) { topDayRevenue = rev; topDay = day; } });

  return { fastMovers, slowMovers: slowMovers.slice(0, 5), neverSold: neverSold.slice(0, 5), coPurchases, topDay, topDayRevenue };
}

// ─── Inventory Intelligence ───────────────────────────────────────────────────
export interface StockForecast {
  product: Product;
  perDay: number;
  /**
   * Days of cover at the recent sales rate. Infinity when nothing has sold in
   * the window — there is no rate to divide by. Check `hasVelocity` before
   * showing this to anyone; formatting it directly is what produced
   * "Infinityd left · order 10" on the advice cards.
   */
  daysLeft: number;
  /** False when the product has not sold at all in the last 14 days. */
  hasVelocity: boolean;
  /**
   * Whether reordering is justified by demand.
   *
   * A product sitting on the shelf with no sales for a fortnight is not short
   * of stock, it is short of buyers; reordering converts cash into more dead
   * stock. One that sold out is the exception — it shows no recent sales
   * precisely because there was nothing left to sell, so its own history
   * decides.
   */
  worthRestocking: boolean;
  restockQty: number;
  urgency: 'critical' | 'soon' | 'ok';
  /** Profit on one unit, at the current prices. */
  unitProfit: number;
  /**
   * Profit the shop stops earning for each day this product is unavailable —
   * demand times margin.
   *
   * Ranking used to be days-of-cover alone, which says nothing about whether
   * running out matters. A sold-out product scored 0 days left whether it
   * shifts twenty a day at a good margin or sold one unit last quarter, so
   * the two sat side by side at the top of the restock list.
   */
  dailyProfitAtRisk: number;
}

/**
 * How much cover is left, in words, for anywhere this is shown to a merchant.
 *
 * A product can be low on stock and still have no demand behind it. Saying
 * "Infinity days left" was the visible bug; the quieter one was implying a
 * restock quantity for something that has not sold in a fortnight.
 */
export function stockCoverLabel(f: StockForecast, opts?: { short?: boolean }): string {
  const short = opts?.short === true;
  if (f.product.quantity <= 0) {
    return f.worthRestocking ? 'Sold out' : (short ? 'Sold out · never sold' : 'Sold out, and it has never sold');
  }
  if (!f.hasVelocity) return short ? 'Not selling' : 'Low stock, but nothing sold in the last 14 days';
  const days = Math.max(0, Math.floor(f.daysLeft));
  if (days === 0) return short ? 'Runs out today' : 'Running out today';
  return short ? `${days}d left` : `About ${days} day${days === 1 ? '' : 's'} of stock left`;
}

/** Sorts soonest-to-run-out first. Infinity - Infinity is NaN, which makes a
 *  comparator inconsistent, so equal values are compared, not subtracted. */
function byDaysLeft(a: StockForecast, b: StockForecast) {
  if (a.daysLeft === b.daysLeft) return 0;
  return a.daysLeft < b.daysLeft ? -1 : 1;
}

/**
 * Products worth reordering first, then by what each day without them costs.
 *
 * A product nobody is buying is never urgent however empty the shelf is, so it
 * sorts below everything that is actually moving rather than being dropped —
 * the merchant can still see it is out.
 */
function byMoneyAtRisk(a: StockForecast, b: StockForecast) {
  if (a.worthRestocking !== b.worthRestocking) return a.worthRestocking ? -1 : 1;
  if (a.dailyProfitAtRisk !== b.dailyProfitAtRisk) return b.dailyProfitAtRisk - a.dailyProfitAtRisk;
  return byDaysLeft(a, b);
}

// Shared by inventoryIntelligence() (restock suggestions) AND healthScore()
// (inventory factor) so the two features are always computed from the same
// numbers and can never disagree about whether a product's stock is fine.
// Unlike inventoryIntelligence(), this does NOT filter out 'ok' products —
// callers that need "what's low" should filter the result themselves.
/** How far back a sale still counts as evidence that a product sells. */
const RECENT_DEMAND_DAYS = 60;

function computeStockForecasts(store: StoreData): StockForecast[] {
  const threshold = getLowStockThreshold();
  return store.products
    .filter(p => !p.discontinued)
    .map(p => {
      const sold14 = store.sales
        .filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(13))
        .reduce((sum, s) => sum + s.quantity, 0);
      const sold60 = store.sales
        .filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(RECENT_DEMAND_DAYS - 1))
        .reduce((sum, s) => sum + s.quantity, 0);
      const perDay = sold14 / 14;
      const hasVelocity = perDay > 0;
      // This asked whether the product had EVER sold, so one sale months back
      // made a sold-out item a standing priority for the life of the shop.
      // Demand has to be recent to count as demand.
      const soldRecently = sold60 > 0;
      const worthRestocking = hasVelocity || (p.quantity <= 0 && soldRecently);
      const daysLeft = p.quantity === 0 ? 0 : (hasVelocity ? Math.floor(p.quantity / perDay) : Infinity);
      // A sold-out product shows no recent sales precisely because there was
      // nothing left to sell, so its longer-run rate is the honest one.
      const demandPerDay = hasVelocity
        ? perDay
        : (p.quantity <= 0 && soldRecently ? sold60 / RECENT_DEMAND_DAYS : 0);
      // Fourteen days of cover plus a fifth. Nothing is suggested for a product
      // with no demand behind it — that used to default to a flat 10 units.
      const restockQty = demandPerDay > 0 ? Math.max(1, Math.ceil(demandPerDay * 14 * 1.2)) : 0;
      const unitProfit = Math.max(0, (p.sellingPrice || 0) - (p.costPrice || 0));
      const dailyProfitAtRisk = demandPerDay * unitProfit;

      let urgency: StockForecast['urgency'] = 'ok';
      if (p.quantity === 0) {
        urgency = 'critical';
      } else if (daysLeft <= 3 || p.quantity <= Math.max(1, Math.floor(threshold / 2))) {
        urgency = 'critical';
      } else if (daysLeft <= 7 || p.quantity <= threshold) {
        urgency = 'soon';
      }

      return { product: p, perDay, daysLeft, hasVelocity, worthRestocking, restockQty, urgency, unitProfit, dailyProfitAtRisk };
    });
}

/**
 * Restock candidates, worst first.
 *
 * Sorting on days-of-cover alone put anything at zero stock at the top,
 * regardless of whether it sells — so a product that shifted one unit last
 * quarter outranked a fast mover with three days left. Demand that is real and
 * recent comes first, then the money lost per day it stays unavailable, and
 * cover is only the tie-breaker.
 */
export function inventoryIntelligence(store: StoreData): StockForecast[] {
  return computeStockForecasts(store)
    .filter(f => f.urgency !== 'ok')
    .sort(byMoneyAtRisk);
}

// ─── Expense Analysis ─────────────────────────────────────────────────────────
export interface ExpenseAnalysis {
  byCat: { category: string; total: number; count: number; pct: number; trend: 'up' | 'down' | 'flat' }[];
  totalLast30: number;
  totalPrev30: number;
  trendPct: number;
  largestCategory: string;
}

export function expenseAnalysis(store: StoreData, excludeCategories: string[] = []): ExpenseAnalysis {
  const now = Date.now();
  const pool = excludeCategories.length > 0
    ? (store.expenses || []).filter(e => !excludeCategories.includes(e.category))
    : (store.expenses || []);
  const last30 = pool.filter(e => now - new Date(e.date).getTime() < 30 * 86400000);
  const prev30 = pool.filter(e => {
    const t = now - new Date(e.date).getTime();
    return t >= 30 * 86400000 && t < 60 * 86400000;
  });
  const totalLast30 = last30.reduce((s, e) => s + e.amount, 0);
  const totalPrev30 = prev30.reduce((s, e) => s + e.amount, 0);
  const trendPct = totalPrev30 > 0 ? ((totalLast30 - totalPrev30) / totalPrev30) * 100 : 0;

  const catMap = new Map<string, { total: number; count: number }>();
  const prevCatMap = new Map<string, number>();
  last30.forEach(e => {
    const c = catMap.get(e.category) || { total: 0, count: 0 };
    c.total += e.amount; c.count++;
    catMap.set(e.category, c);
  });
  prev30.forEach(e => prevCatMap.set(e.category, (prevCatMap.get(e.category) || 0) + e.amount));

  const byCat = [...catMap.entries()].map(([category, { total, count }]) => {
    const prev = prevCatMap.get(category) || 0;
    const trend: 'up' | 'down' | 'flat' = prev > 0 ? (total > prev * 1.1 ? 'up' : total < prev * 0.9 ? 'down' : 'flat') : 'flat';
    return { category, total, count, pct: totalLast30 > 0 ? Math.round((total / totalLast30) * 100) : 0, trend };
  }).sort((a, b) => b.total - a.total);

  return { byCat, totalLast30, totalPrev30, trendPct, largestCategory: byCat[0]?.category || '' };
}

// ─── Rent Intelligence ────────────────────────────────────────────────────────
export interface RentAnalysis {
  monthly: number;
  weeklyTarget: number;
  emergencyBuffer: number;
  increaseBuffer: number; // 10% reserve
  affordabilityPct: number; // rent as % of avg monthly revenue
}

export function rentAnalysis(store: StoreData): RentAnalysis | null {
  const rent = store.profile?.rent;
  if (!rent?.isRented || !rent.amount) return null;
  const monthly = rent.frequency === 'yearly' ? rent.amount / 12 : rent.frequency === 'quarterly' ? rent.amount / 3 : rent.amount;
  const weeklyTarget = Math.ceil(monthly / 4.33);
  const emergencyBuffer = Math.ceil(weeklyTarget * 0.1);
  const increaseBuffer = Math.ceil(monthly * 0.1);
  // Avg monthly revenue
  const series = dailySeries(store, 30);
  const monthlyRev = series.reduce((s, d) => s + d.revenue, 0);
  const affordabilityPct = monthlyRev > 0 ? Math.round((monthly / monthlyRev) * 100) : 100;
  return { monthly, weeklyTarget, emergencyBuffer, increaseBuffer, affordabilityPct };
}

// ─── Smart Pricing ────────────────────────────────────────────────────────────
export interface PricingAlert {
  product: Product;
  type: 'underpriced' | 'overpriced' | 'zero_margin';
  currentMarkup: number;
  suggestedPrice: number;
  expectedLift: number;
}

// This works in markup — profit over cost — not margin, and always did. Every
// price it suggests is cost × (1 + target), which is a markup calculation, and
// "what do I add on top of what I paid" is how a shopkeeper prices. Only the
// naming was wrong: it reported these figures to the merchant as "margin",
// which is profit over the selling price and a smaller number.
export function pricingAlerts(store: StoreData, targetMarkup = 0.25): PricingAlert[] {
  return store.products
    .filter(p => p.costPrice > 0 && !p.discontinued)
    .map(p => {
      const markup = productMarkup(p);
      const suggested = Math.round((p.costPrice * (1 + targetMarkup)) / 10) * 10;
      const lift = suggested - p.sellingPrice;
      if (markup <= 0) return { product: p, type: 'zero_margin' as const, currentMarkup: markup, suggestedPrice: suggested, expectedLift: lift };
      if (markup < targetMarkup - 0.05) return { product: p, type: 'underpriced' as const, currentMarkup: markup, suggestedPrice: suggested, expectedLift: lift };
      if (markup > 0.8) return { product: p, type: 'overpriced' as const, currentMarkup: markup, suggestedPrice: Math.round(p.costPrice * 1.4 / 10) * 10, expectedLift: 0 };
      return null;
    })
    .filter(Boolean) as PricingAlert[];
}

// ─── Customer Requests ────────────────────────────────────────────────────────
export function topCustomerRequests(store: StoreData, limit = 5) {
  const reqs = store.customerRequests || [];
  const tally = new Map<string, { text: string; count: number; lastDate: string }>();
  reqs.forEach(r => {
    const key = r.text.trim().toLowerCase();
    const e = tally.get(key) || { text: r.text.trim(), count: 0, lastDate: r.date };
    e.count++;
    if (r.date > e.lastDate) { e.text = r.text.trim(); e.lastDate = r.date; }
    tally.set(key, e);
  });
  return [...tally.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

// ─── Business Advice ──────────────────────────────────────────────────────────
export interface AdviceCard {
  id: string;
  icon: string;
  title: string;
  detail: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  action?: string;
  // When set (2+ entries), the UI renders one card with a compact list
  // instead of a separate full-size card per item.
  items?: { name: string; note: string }[];
  // "Go to Action" — which tab opens the screen needed to act on this advice.
  goTo?: TabId;
  // Which product on that screen, and what the merchant is going there to do.
  // Set whenever the advice names a single product, so the destination can
  // open that product's editor rather than a list to search through.
  focus?: ProductFocus;
  // "Auto Fix" — when present, the UI offers a button that (after the
  // store-code confirmation gate) applies this exact change via
  // lib/auto-fix.ts. Omitted for advice that has no safe automatic fix.
  autoFix?: AutoFixSpec;
}

// Reads the customer-supplied cancellation reason off a marketplace order's
// notes JSON. Notes are stored as a JSON string (see customer_cancel_order
// RPC / Orders.tsx), so this defensively no-ops on anything else.
function getCancelReason(order: any): string | null {
  if (!order?.notes || typeof order.notes !== 'string') return null;
  try {
    const meta = JSON.parse(order.notes);
    return meta?.customer_cancel_reason || null;
  } catch {
    return null;
  }
}

export function generateAdvice(store: StoreData, orders: any[] = []): AdviceCard[] {
  const advice: AdviceCard[] = [];
  const h = healthScore(store);
  const stock = inventoryIntelligence(store);
  // Restocking inventory is a healthy, expected cost of doing business (you're
  // buying assets to resell for profit) — it should never itself count as
  // "overspending". Exclude it here so this only flags genuine operating-cost
  // creep (rent, utilities, salaries, etc.), not merchants restocking well.
  const ea = expenseAnalysis(store, ['Restock']);
  const analysis = analyzeSales(store);
  const pending = getPendingSummary(store);
  const series7 = dailySeries(store, 7);
  const rev7 = series7.reduce((s, d) => s + d.revenue, 0);

  // Critical: running out of fast sellers or completely out of stock
  if (!isStoreOnboarding(store)) {
    // Only what demand justifies gets a reorder recommendation and an Auto Fix
    // purchase order; the rest is reported without a quantity, below.
    const criticalStock = stock.filter(f => f.urgency === 'critical' && f.worthRestocking).slice(0, 5);
    if (criticalStock.length === 1) {
      const f = criticalStock[0];
      const isOut = f.product.quantity === 0;
      advice.push({
        id: `cr-${f.product.id}`,
        icon: '🚨',
        title: isOut ? `Restock ${f.product.name} (Sold Out)` : `Restock ${f.product.name} NOW`,
        detail: isOut
          ? `Out of Stock: ${f.product.name} is completely sold out. Restock at least ${f.restockQty} units immediately to recover lost revenue.`
          : `${stockCoverLabel(f)}. Order at least ${f.restockQty} units.`,
        priority: 'critical',
        goTo: 'inventory',
        focus: { productId: f.product.id, productName: f.product.name, intent: 'restock' },
        autoFix: {
          type: 'generate_purchase_order',
          summary: `Create a draft purchase order for ${f.restockQty} units of ${f.product.name}`,
          payload: { items: [{ productId: f.product.id, name: f.product.name, qty: f.restockQty, costPrice: f.product.costPrice }] },
        },
      });
    } else if (criticalStock.length > 1) {
      advice.push({
        id: 'cr-group',
        icon: '🚨',
        title: `${criticalStock.length} products need restocking now`,
        detail: 'These are critically low or sold out. Restock soon to avoid losing sales.',
        priority: 'critical',
        items: criticalStock.map(f => ({
          name: f.product.name,
          note: stockCoverLabel(f, { short: true }) + (f.hasVelocity ? ` · order ${f.restockQty}` : '')
        })),
        goTo: 'inventory',
        // Group advice could not name a single product, so Open used to drop
        // the merchant on the whole inventory to work out which ones.
        focus: {
          productId: criticalStock[0].product.id,
          productIds: criticalStock.map(f => f.product.id),
          groupLabel: `${criticalStock.length} products need restocking now`,
          intent: 'restock',
        },
        autoFix: {
          type: 'generate_purchase_order',
          summary: `Create a draft purchase order covering all ${criticalStock.length} critical products`,
          payload: { items: criticalStock.map(f => ({ productId: f.product.id, name: f.product.name, qty: f.restockQty, costPrice: f.product.costPrice })) },
        },
      });
    }
  }

  // Critical: no sales this week
  if (!isStoreOnboarding(store) && rev7 === 0 && store.products.length > 0) {
    advice.push({ id: 'no-sales', icon: '⚠️', title: 'No sales recorded this week', detail: 'Record sales to unlock predictions and keep your store health score accurate.', priority: 'critical' });
  }

  // High: large outstanding debts
  if (pending.totalOwed > rev7 * 0.3) {
    advice.push({ id: 'debt', icon: '💳', title: 'Chase outstanding payments', detail: `₦${pending.totalOwed.toLocaleString()} owed. ${pending.overdue.length} customers are overdue. Collect this to improve cash flow.`, priority: 'high' });
  }

  // Medium/High: customers cancelling orders — surface the count and, when
  // available, the most common reason so the store owner can act on it
  // rather than just seeing "Cancelled" with no context.
  if (!isStoreOnboarding(store) && orders.length > 0) {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const recentCancellations = orders.filter(o =>
      (o.status || '').trim().toLowerCase() === 'cancelled' &&
      new Date(o.created_at || o.updated_at || 0).getTime() >= sevenDaysAgo
    );
    if (recentCancellations.length >= 2) {
      const reasonCounts = new Map<string, number>();
      recentCancellations.forEach(o => {
        const reason = getCancelReason(o);
        if (reason) reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      });
      const topReason = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      advice.push({
        id: 'order-cancellations',
        icon: '❌',
        title: `${recentCancellations.length} order${recentCancellations.length === 1 ? '' : 's'} cancelled this week`,
        detail: topReason
          ? `Most common reason: "${topReason[0]}" (${topReason[1]} of ${recentCancellations.length}). Worth looking into.`
          : `Check the Orders tab for details — no reasons were given for these cancellations.`,
        priority: recentCancellations.length >= 5 ? 'high' : 'medium'
      });
    }
  }

  // High: soaring expenses
  if (ea.trendPct > 20 && ea.totalLast30 > 0) {
    advice.push({ id: 'exp-rise', icon: '🧾', title: `${ea.largestCategory} spending up ${ea.trendPct.toFixed(0)}%`, detail: `Your ${ea.largestCategory.toLowerCase()} expenses grew significantly this month. Review and cut where possible.`, priority: 'high' });
  }

  // High: underpriced products
  const alerts = pricingAlerts(store);
  const underpriced = alerts.filter(a => a.type === 'underpriced').slice(0, 1);
  underpriced.forEach(a => {
    advice.push({
      id: `price-${a.product.id}`, icon: '📈', title: `Raise price on ${a.product.name}`,
      detail: `Currently ${(a.currentMarkup * 100).toFixed(0)}% on top of cost. Suggest ₦${a.suggestedPrice.toLocaleString()} — adds ₦${a.expectedLift.toLocaleString()} per unit.`,
      priority: 'high',
      goTo: 'inventory',
      focus: { productId: a.product.id, productName: a.product.name, intent: 'edit' },
      autoFix: {
        type: 'update_price',
        summary: `Set ${a.product.name}'s price to ₦${a.suggestedPrice.toLocaleString()} (from ₦${a.product.sellingPrice.toLocaleString()})`,
        payload: { productId: a.product.id, newPrice: a.suggestedPrice },
      },
    });
  });

  // Medium: restock soon
  if (!isStoreOnboarding(store)) {
    const soonAll = stock.filter(f => f.urgency === 'soon');
    const soonStock = soonAll.filter(f => f.worthRestocking).slice(0, 5);

    // Everything low or gone that demand does not justify reordering, in one
    // place. These were listed as "order 10" each and bundled into the Auto Fix
    // purchase order — the exact move that turns working capital into stock
    // nobody is buying.
    const deadStock = stock.filter(f => !f.worthRestocking).slice(0, 6);
    if (deadStock.length > 0) {
      advice.push({
        id: 'stock-no-demand',
        icon: '🗃️',
        title: deadStock.length === 1
          ? `${deadStock[0].product.name} is low, but not selling`
          : `${deadStock.length} products are low, but not selling`,
        detail: 'Low or sold out with no sales in the last 14 days. Reordering these ties up cash — decide case by case, or clear what you already have.',
        priority: 'low',
        items: deadStock.map(f => ({
          name: f.product.name,
          note: f.product.quantity <= 0 ? 'Sold out · never sold' : `${f.product.quantity} left · no recent sales`,
        })),
        goTo: 'inventory',
        focus: {
          productId: deadStock[0].product.id,
          productIds: deadStock.map(f => f.product.id),
          groupLabel: deadStock.length === 1 ? `${deadStock[0].product.name} is not selling` : `${deadStock.length} products are not selling`,
          intent: 'view',
        },
      });
    }

    if (soonStock.length === 1) {
      const f = soonStock[0];
      advice.push({
        id: `soon-${f.product.id}`, icon: '📦', title: `Order ${f.product.name} this week`,
        detail: `${stockCoverLabel(f)}. Restock ${f.restockQty} units to avoid a gap.`,
        priority: 'medium',
        goTo: 'inventory',
        focus: { productId: f.product.id, productName: f.product.name, intent: 'restock' },
        autoFix: {
          type: 'generate_purchase_order',
          summary: `Create a draft purchase order for ${f.restockQty} units of ${f.product.name}`,
          payload: { items: [{ productId: f.product.id, name: f.product.name, qty: f.restockQty, costPrice: f.product.costPrice }] },
        },
      });
    } else if (soonStock.length > 1) {
      advice.push({
        id: 'soon-group',
        icon: '📦',
        title: `${soonStock.length} products to order this week`,
        detail: 'Running low but not urgent yet — plan a restock order soon.',
        priority: 'medium',
        items: soonStock.map(f => ({ name: f.product.name, note: stockCoverLabel(f, { short: true }) + (f.hasVelocity ? ` · order ${f.restockQty}` : '') })),
        goTo: 'inventory',
        focus: {
          productId: soonStock[0].product.id,
          productIds: soonStock.map(f => f.product.id),
          groupLabel: `${soonStock.length} products to order this week`,
          intent: 'restock',
        },
        autoFix: {
          type: 'generate_purchase_order',
          summary: `Create a draft purchase order covering all ${soonStock.length} products`,
          payload: { items: soonStock.map(f => ({ productId: f.product.id, name: f.product.name, qty: f.restockQty, costPrice: f.product.costPrice })) },
        },
      });
    }
  }

  // Medium: fast-selling products with no reorder level set — Auto Fix can
  // set one to a sensible 7-day-supply default in one tap.
  const missingReorder = store.products
    .filter(p => !p.discontinued && !p.isService && p.reorderLevel == null)
    .map(p => {
      const sold14 = store.sales.filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(13)).reduce((s, sale) => s + sale.quantity, 0);
      const perDay = sold14 / 14;
      return { product: p, perDay, suggested: Math.max(1, Math.ceil(perDay * 7)) };
    })
    .filter(x => x.perDay > 0)
    .sort((a, b) => b.perDay - a.perDay)
    .slice(0, 5);
  if (missingReorder.length >= 2) {
    advice.push({
      id: 'reorder-levels',
      icon: '🔔',
      title: `${missingReorder.length} fast sellers have no reorder level set`,
      detail: `Setting a reorder level triggers a restock alert automatically instead of you noticing stock is low by chance.`,
      priority: 'medium',
      items: missingReorder.map(x => ({ name: x.product.name, note: `suggest ${x.suggested}` })),
      goTo: 'inventory',
      autoFix: {
        type: 'adjust_reorder_level',
        summary: `Set reorder levels (≈7 days of stock) on ${missingReorder.length} products`,
        payload: { items: missingReorder.map(x => ({ productId: x.product.id, reorderLevel: x.suggested })) },
      },
    });
  }

  // Medium: co-purchase opportunity
  if (analysis.coPurchases.length > 0) {
    const cp = analysis.coPurchases[0];
    advice.push({ id: 'copurchase', icon: '🛒', title: 'Bundle opportunity', detail: `Customers often buy ${cp.a} and ${cp.b} together (${cp.count}x). Stock them near each other and consider a combo deal.`, priority: 'medium' });
  }

  // Medium: never-sold products tying up capital
  if (analysis.neverSold.length >= 3) {
    const targets = analysis.neverSold.slice(0, 5);
    advice.push({
      id: 'dead-stock', icon: '😴', title: `${analysis.neverSold.length} products never sold`,
      detail: `${analysis.neverSold.slice(0, 2).map(p => p.name).join(', ')} and others have never sold. Consider discounting or replacing with faster movers.`,
      priority: 'medium',
      goTo: 'inventory',
      autoFix: {
        type: 'create_promotion',
        summary: `Apply a 15% promo price to ${targets.length} never-sold product${targets.length === 1 ? '' : 's'} for 14 days`,
        payload: { productIds: targets.map(p => p.id), discountPct: 15, days: 14, reason: 'Clearing dead stock' },
      },
    });
  }

  // Low: long-dormant products worth archiving — separate from the
  // never-sold discount advice above; this is for products that DID sell
  // once but have gone quiet for a long time, where discounting is less
  // useful than just getting them off the active list.
  const dormantLong = getProductInsightBadges(store, 60).filter(b => b.label === 'Dormant Product');
  if (dormantLong.length > 0 && dormantLong.length <= 4) {
    dormantLong.forEach(b => {
      advice.push({
        id: `archive-${b.productId}`,
        focus: { productId: b.productId, productName: b.productName, intent: 'edit' },
        icon: '🗄️',
        title: `Consider archiving ${b.productName}`,
        detail: `${b.explain} Archiving hides it from active inventory without deleting its sales history.`,
        priority: 'low',
        goTo: 'inventory',
        autoFix: {
          type: 'archive_product',
          summary: `Archive ${b.productName} (mark as discontinued)`,
          payload: { productId: b.productId },
        },
      });
    });
  }

  // Low: health is great
  if (h.overall >= 80) {
    advice.push({ id: 'great', icon: '🌟', title: 'Your store is thriving', detail: `Health score: ${h.overall}/100. Keep maintaining stock levels and expense control.`, priority: 'low' });
  }

  // Low: set a savings goal
  if (!store.savingsGoal) {
    advice.push({ id: 'save', icon: '💰', title: 'Set a savings goal', detail: 'Saving even 5% of revenue weekly builds a safety net for rent, restocking, and emergencies.', priority: 'low' });
  }

  return advice.sort((a, b) => {
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return rank[a.priority] - rank[b.priority];
  });
}

// ─── Flow Personality — Greeting ───────────────────────────────────────────────
export function flowGreeting(store: StoreData): string {
  const hour = new Date().getHours();
  const name = store.storeName;
  const series7 = dailySeries(store, 7);
  const rev7 = series7.reduce((s, d) => s + d.revenue, 0);
  const todaySales = store.sales.filter(s => s.date.startsWith(new Date().toISOString().split('T')[0])).length;

  const greetings: Record<string, string[]> = {
    morning: [
      `Good morning! Let's make today great for ${name}.`,
      `Morning! Your store is ready — let's sell.`,
      `Rise and shine! It's a new day to grow ${name}.`,
    ],
    afternoon: [
      `Good afternoon. How's ${name} doing today?`,
      `Afternoon check-in — keep the momentum going!`,
      todaySales > 0 ? `Nice work — ${todaySales} sale${todaySales > 1 ? 's' : ''} so far today. Keep it up!` : `Afternoon! No sales logged yet — let's change that.`,
    ],
    evening: [
      rev7 > 0 ? `Evening! Your store made ₦${rev7.toLocaleString()} this week.` : `Evening! Record your sales so I can help you track progress.`,
      `Good evening. Let's review how the day went.`,
    ],
    night: [
      `Night shift? I'm here. ${name} is in good hands.`,
      `Late night. Make sure everything is tallied for today.`,
    ],
  };

  const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  const pool = greetings[period];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Restock Quality Check ──────────────────────────────────────────────────
// Restocking is buying inventory to resell for profit — a healthy, expected
// action, not overspending. It should only ever prompt caution when the
// merchant is pouring money into a specific product that isn't actually
// selling. This inspects the most recent restock batch and reacts to what
// was actually restocked, instead of a blanket "spending is high" warning
// that fires just because a restock created a big expense entry.
function latestRestockBatch(store: StoreData): { productNames: string[]; total: number; date: string } | null {
  const restocks = store.restocks || [];
  if (restocks.length === 0) return null;
  const latest = restocks[0]; // newest first
  const batch = latest.batchId ? restocks.filter(r => r.batchId === latest.batchId) : [latest];
  return {
    productNames: [...new Set(batch.map(r => r.productName))],
    total: batch.reduce((s, r) => s + r.total, 0),
    date: latest.date,
  };
}

export function restockQualityNote(store: StoreData): FlowNotification | null {
  const batch = latestRestockBatch(store);
  if (!batch) return null;
  // Feedback on a restock should feel immediate — only react to what just
  // happened, not a restock from days ago.
  if (Date.now() - new Date(batch.date).getTime() > 2 * 86400000) return null;

  const analysis = analyzeSales(store);
  const neverSoldNames = new Set(analysis.neverSold.map(p => p.name));
  const slowMoverNames = new Set(analysis.slowMovers.map(p => p.name));
  const fastMoverNames = new Set(analysis.fastMovers.map(p => p.name));

  const deadRestocked = batch.productNames.filter(n => neverSoldNames.has(n));
  const slowRestocked = batch.productNames.filter(n => slowMoverNames.has(n) && !deadRestocked.includes(n));
  const fastRestocked = batch.productNames.filter(n => fastMoverNames.has(n));

  const now = new Date().toISOString();
  const batchKey = new Date(batch.date).getTime();

  if (deadRestocked.length > 0) {
    return {
      id: `restock-dead-${batchKey}`,
      icon: '😴',
      text: `You restocked ${deadRestocked[0]}${deadRestocked.length > 1 ? ` and ${deadRestocked.length - 1} other item(s)` : ''} that hasn't been selling. Consider holding off until demand picks up.`,
      tone: 'warning',
      date: now,
      read: false,
      title: 'Restock Check',
      description: `${deadRestocked.join(', ')} ${deadRestocked.length > 1 ? "haven't" : "hasn't"} sold in a while. Restocking dead stock ties up cash — a discount to move it might work better than buying more.`,
      actionLabel: 'View Inventory',
      actionTab: 'inventory',
    };
  }

  if (slowRestocked.length > 0 && fastRestocked.length === 0) {
    return {
      id: `restock-slow-${batchKey}`,
      icon: '🤔',
      text: `${slowRestocked[0]} has been moving slowly. Worth watching demand before restocking it again.`,
      tone: 'info',
      date: now,
      read: false,
      title: 'Restock Check',
      description: `${slowRestocked.join(', ')} sold fewer than 3 units in the last 30 days.`,
      actionLabel: 'View Inventory',
      actionTab: 'inventory',
    };
  }

  // Default (and the common case): this was a healthy restock of products
  // that actually sell — this deserves a positive note, not a warning.
  return {
    id: `restock-good-${batchKey}`,
    icon: '✅',
    text: `Nice restocking! ₦${batch.total.toLocaleString()} in fresh stock ready to sell.`,
    tone: 'success',
    date: now,
    read: false,
    title: 'Restock Complete',
    description: `You restocked ${batch.productNames.slice(0, 3).join(', ')}${batch.productNames.length > 3 ? ` +${batch.productNames.length - 3} more` : ''}. Buying stock to resell is good for business.`,
    actionLabel: 'View Inventory',
    actionTab: 'inventory',
  };
}

export interface RestockScoreResult {
  score: number; // 0-100, higher is better
  label: 'Excellent' | 'Good' | 'Fair' | 'Needs Attention';
  totalSpend90d: number;
  wastedSpend90d: number;
  goodSpend90d: number;
  wastedItems: { name: string; spend: number }[];
}

// ─── Weekly Auto Restock Draft ──────────────────────────────────────────────
// Instead of requiring a merchant to remember to open Smart Restock every
// week, this generates a notification once every 7 days (if there's
// actually anything worth restocking) pointing them straight at a fresh
// draft. Tapping it opens Smart Restock Engine directly (see actionParam
// 'openRestock', handled in Index.tsx/Inventory.tsx) rather than just the
// Inventory tab, so there's nothing extra to remember or click through.
export function checkWeeklyRestockDraft(store: StoreData): StoreData | null {
  const settings = store.managerSettings;
  if (!settings?.enabled) return null; // respect the manager/AI features toggle

  const last = settings.lastAutoRestockDraftDate ? new Date(settings.lastAutoRestockDraftDate).getTime() : 0;
  const sevenDays = 7 * 86400000;
  if (Date.now() - last < sevenDays) return null;

  const needsRestock = inventoryIntelligence(store);
  if (needsRestock.length === 0) {
    // Nothing to restock right now — don't nag, but still push the clock
    // forward so we check again in another 7 days rather than every load.
    return {
      ...store,
      managerSettings: { ...settings, lastAutoRestockDraftDate: new Date().toISOString() },
    };
  }

  const topNames = needsRestock.slice(0, 3).map(f => f.product.name).join(', ');
  const notification: FlowNotification = {
    id: `weekly-restock-${Date.now()}`,
    icon: '📦',
    text: `Your weekly restock draft is ready — ${needsRestock.length} product${needsRestock.length > 1 ? 's' : ''} could use restocking.`,
    tone: 'info',
    date: new Date().toISOString(),
    read: false,
    title: 'Weekly Restock Draft',
    description: `Including ${topNames}${needsRestock.length > 3 ? ` and ${needsRestock.length - 3} more` : ''}. Tap to review and approve a buy list.`,
    actionLabel: 'Review Draft',
    actionTab: 'inventory',
    actionParam: 'openRestock',
  };

  return {
    ...store,
    managerSettings: { ...settings, lastAutoRestockDraftDate: new Date().toISOString() },
    flowNotifications: [notification, ...(store.flowNotifications || [])],
  };
}

// ─── Cash Balance Breakdown ─────────────────────────────────────────────────
// Cash/Bank/Wallet balances are a running ledger, not one single event, so
// "why is it this number" has no single answer — it's built from every sale
// payment, expense, restock, loan, investment, and withdrawal ever
// recorded. This reconstructs the contributing totals directly from the
// same source records the app's own balance math reads, so it's an honest,
// independently-checkable answer rather than a vague description.
//
// Two known limits, called out in the UI rather than hidden: loan
// repayments aren't logged as discrete historical events (only the
// loan's remaining balance is tracked), so they can't be totaled after
// the fact; and restocking funded with "new money" currently still draws
// from existing cash/bank/wallet first if there's enough there, so it
// shows up under Restocking like any other restock rather than being kept
// separate.
export interface CashBalanceBreakdown {
  cashSales: number;
  bankSales: number;
  loansReceived: number;
  investmentsAdded: number;
  expensesPaid: number;
  restockSpend: number;
  withdrawals: number;
}

export function cashBalanceBreakdown(store: StoreData): CashBalanceBreakdown {
  let cashSales = 0;
  let bankSales = 0;
  (store.sales || []).forEach(s => {
    if (s.paymentMethod === 'cash' || !s.paymentMethod) cashSales += s.total;
    else if (s.paymentMethod === 'pos' || s.paymentMethod === 'transfer') bankSales += s.total;
    else if (s.paymentMethod === 'mixed') { cashSales += s.total / 2; bankSales += s.total / 2; }
  });

  const loansReceived = (store.loans || []).reduce((sum, l) => sum + l.amount, 0);
  const investmentsAdded = (store.investments || []).reduce((sum, i) => sum + i.amount, 0);
  const expensesPaid = (store.expenses || []).filter(e => e.source !== 'restock').reduce((sum, e) => sum + e.amount, 0);
  const restockSpend = (store.restocks || []).reduce((sum, r) => sum + r.total, 0);
  const withdrawals = (store.withdrawals || []).reduce((sum, w) => sum + w.amount, 0);

  return { cashSales, bankSales, loansReceived, investmentsAdded, expensesPaid, restockSpend, withdrawals };
}

// ─── Restock Score (90-day) ─────────────────────────────────────────────────
// Gives merchants one number for "am I restocking well?" — what % of the
// money spent restocking over the last 90 days went into products that
// actually sell, versus products that were already dead stock or slow
// movers when they got restocked again. Reuses the same neverSold/slowMovers
// classification as restockQualityNote() so the two stay consistent.
export function restockScore(store: StoreData): RestockScoreResult {
  const cutoff = Date.now() - 90 * 86400000;
  const restocks = (store.restocks || []).filter(r => new Date(r.date).getTime() >= cutoff);

  if (restocks.length === 0) {
    return { score: 100, label: 'Excellent', totalSpend90d: 0, wastedSpend90d: 0, goodSpend90d: 0, wastedItems: [] };
  }

  const analysis = analyzeSales(store);
  const neverSoldNames = new Set(analysis.neverSold.map(p => p.name));
  const slowMoverNames = new Set(analysis.slowMovers.map(p => p.name));

  let totalSpend = 0;
  let wastedSpend = 0;
  const wastedMap: Record<string, number> = {};

  restocks.forEach(r => {
    const spend = r.total ?? r.quantity * r.costPrice;
    totalSpend += spend;
    const isDead = neverSoldNames.has(r.productName);
    const isSlow = !isDead && slowMoverNames.has(r.productName);
    if (isDead || isSlow) {
      // Dead stock counts as fully wasted spend; a slow mover is only
      // half-weighted since it's still selling, just not quickly.
      const weightedWaste = spend * (isDead ? 1 : 0.5);
      wastedSpend += weightedWaste;
      wastedMap[r.productName] = (wastedMap[r.productName] || 0) + spend;
    }
  });

  const goodSpend = Math.max(0, totalSpend - wastedSpend);
  const score = totalSpend > 0 ? Math.max(0, Math.min(100, Math.round(100 - (wastedSpend / totalSpend) * 100))) : 100;
  const label: RestockScoreResult['label'] =
    score >= 85 ? 'Excellent' : score >= 65 ? 'Good' : score >= 40 ? 'Fair' : 'Needs Attention';

  const wastedItems = Object.entries(wastedMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, spend]) => ({ name, spend }));

  return { score, label, totalSpend90d: totalSpend, wastedSpend90d: wastedSpend, goodSpend90d: goodSpend, wastedItems };
}

// ─── Notifications Generator ───────────────────────────────────────────────────
export function generateNotifications(store: StoreData): FlowNotification[] {
  if (isStoreOnboarding(store)) {
    return [];
  }
  const notes: FlowNotification[] = [];
  const now = new Date().toISOString();
  const stock = inventoryIntelligence(store);
  const analysis = analyzeSales(store);
  // Restock cost is COGS, not overspending — keep it out of the "expenses
  // spiking" trend so a healthy restock never fires an "Expense Alert".
  const ea = expenseAnalysis(store, ['Restock']);
  const h = healthScore(store);
  const pending = getPendingSummary(store);

  stock.filter(f => f.urgency === 'critical').forEach(f => {
    notes.push({
      id: `low-${f.product.id}`,
      icon: '🚨',
      text: `${f.product.name}: ${stockCoverLabel(f)}.`,
      tone: 'danger',
      date: now,
      read: false,
      title: 'Restock Alert (Critical)',
      description: `${f.product.name}: ${stockCoverLabel(f)}.`,
      // Carries the product, so the alert opens that product rather than
      // dropping the merchant on the inventory list to find it themselves.
      actionLabel: `Open ${f.product.name}`,
      actionTab: 'inventory',
      actionParam: `product:${f.product.id}`
    });
  });
  stock.filter(f => f.urgency === 'soon').slice(0, 3).forEach(f => {
    notes.push({
      id: `soon-${f.product.id}`,
      icon: '📦',
      text: `${f.product.name}: ${stockCoverLabel(f)}.`,
      tone: 'warning',
      date: now,
      read: false,
      title: 'Restock Suggestion',
      description: `${f.product.name}: ${stockCoverLabel(f)}.`,
      actionLabel: `Open ${f.product.name}`,
      actionTab: 'inventory',
      actionParam: `product:${f.product.id}`
    });
  });
  if (ea.trendPct > 25) {
    notes.push({
      id: 'exp-spike',
      icon: '🧾',
      text: `Expenses up ${ea.trendPct.toFixed(0)}% this month. Review your ${ea.largestCategory.toLowerCase()} spending.`,
      tone: 'warning',
      date: now,
      read: false,
      title: 'Expense Alert',
      description: `Expenses up ${ea.trendPct.toFixed(0)}% this month. Review your ${ea.largestCategory.toLowerCase()} spending.`,
      actionLabel: 'View Expenses',
      actionTab: 'expenses'
    });
  }
  // Smart, per-batch restock feedback — praises healthy restocking of
  // products that sell, and only cautions when the restock actually went
  // toward dead/slow stock. Replaces the old blanket "spending is high"
  // reaction that fired on every restock regardless of what was bought.
  const restockNote = restockQualityNote(store);
  if (restockNote) notes.push(restockNote);
  if (h.overall >= 80) {
    notes.push({
      id: 'health-great',
      icon: '🌟',
      text: `Store health is ${h.overall}/100 — great job keeping things on track!`,
      tone: 'success',
      date: now,
      read: false,
      title: 'Store Thriving!',
      description: `Store health is ${h.overall}/100 — great job keeping things on track!`,
      actionLabel: 'View Report',
      actionTab: 'dashboard'
    });
  } else if (h.overall < 40) {
    notes.push({
      id: 'health-low',
      icon: '⚠️',
      text: `Store health dropped to ${h.overall}/100. Check the advice tab.`,
      tone: 'danger',
      date: now,
      read: false,
      title: 'Health Warning',
      description: `Store health dropped to ${h.overall}/100. Check the advice tab.`,
      actionLabel: 'View Advice',
      actionTab: 'dashboard'
    });
  }
  if (pending.overdue.length > 0) {
    notes.push({
      id: 'overdue',
      icon: '💳',
      text: `${pending.overdue.length} customer${pending.overdue.length > 1 ? 's are' : ' is'} overdue on payments.`,
      tone: 'warning',
      date: now,
      read: false,
      title: 'Overdue Debts',
      description: `${pending.overdue.length} customer${pending.overdue.length > 1 ? 's are' : ' is'} overdue on payments.`,
      actionLabel: 'Chase Payments',
      actionTab: 'pending'
    });
  }
  if (analysis.neverSold.length >= 5) {
    notes.push({
      id: 'dead-stock',
      icon: '😴',
      text: `${analysis.neverSold.length} products have never been sold. Consider moving them out.`,
      tone: 'info',
      date: now,
      read: false,
      title: 'Dead Stock Notice',
      description: `${analysis.neverSold.length} products have never been sold. Consider moving them out.`,
      actionLabel: 'Clean Inventory',
      actionTab: 'inventory'
    });
  }
  return notes;
}

// ─── Insights (enhanced) ──────────────────────────────────────────────────────
export interface Insight {
  id: string;
  icon: string;
  text: string;
  tone: 'success' | 'warning' | 'info' | 'danger';
  // One-line reason this insight appeared, shown smaller/muted under `text`.
  explain: string;
}

export function generateInsights(store: StoreData, range: '7d' | '1m' | 'lifetime' = '7d'): Insight[] {
  const out: Insight[] = [];
  const days = range === '7d' ? 7 : range === '1m' ? 30 : 365;
  const cur = dailySeries(store, days);
  const prev = dailySeries(store, days * 2).slice(0, days);
  const curRev = cur.reduce((s, d) => s + d.revenue, 0);
  const prevRev = prev.reduce((s, d) => s + d.revenue, 0);
  const periodWord = range === '7d' ? 'week' : range === '1m' ? 'month' : 'period';
  if (prevRev > 0) {
    const pct = ((curRev - prevRev) / prevRev) * 100;
    if (Math.abs(pct) >= 1) {
      out.push({
        id: 'rev', icon: pct >= 0 ? '📈' : '📉',
        text: `Revenue ${pct >= 0 ? 'increased' : 'decreased'} ${Math.abs(pct).toFixed(1)}% vs previous ${periodWord}`,
        tone: pct >= 0 ? 'success' : 'warning',
        explain: `Compares total revenue this ${periodWord} (₦${curRev.toLocaleString()}) to the previous one (₦${prevRev.toLocaleString()}).`,
      });
    }
  } else if (curRev > 0) {
    out.push({ id: 'rev', icon: '📈', text: `Revenue is growing — keep going!`, tone: 'success', explain: 'No revenue recorded in the prior period to compare against, so growth can\u2019t be zero.' });
  }
  const threshold = getLowStockThreshold();
  const low = store.products.filter(p => !p.discontinued && p.quantity > 0 && p.quantity <= threshold);
  if (!isStoreOnboarding(store) && low.length > 0) {
    out.push({
      id: 'low', icon: '⚠', text: `${low.length} product${low.length === 1 ? '' : 's'} need restocking`, tone: 'warning',
      explain: `${low.length} product${low.length === 1 ? '' : 's'} at or below your low-stock threshold of ${threshold} units.`,
    });
  }
  const tally = new Map<string, number>();
  const tallyValue = new Map<string, number>();
  store.sales
    .filter(s => new Date(s.date) >= daysAgo(days - 1))
    .forEach(s => {
      tally.set(s.productName, (tally.get(s.productName) || 0) + s.quantity);
      tallyValue.set(s.productName, (tallyValue.get(s.productName) || 0) + (s.total || 0));
    });
  // Best seller ranks by sales value first, quantity only as a tiebreaker —
  // matches how "Best Seller" is defined for product badges below.
  const best = [...tallyValue.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return (tally.get(b[0]) || 0) - (tally.get(a[0]) || 0);
  })[0];
  if (best) {
    out.push({
      id: 'best', icon: '⭐', text: `${best[0]} is your best seller ${range === '7d' ? 'this week' : range === '1m' ? 'this month' : 'overall'}`, tone: 'info',
      explain: `Generated the highest sales value (₦${best[1].toLocaleString()}) ${periodWord === 'period' ? 'overall' : `this ${periodWord}`}.`,
    });
  }
  if (curRev > 0) {
    const savable = Math.round(curRev * 0.05 / 100) * 100;
    if (savable >= 500) out.push({
      id: 'save', icon: '💰', text: `Save ₦${savable.toLocaleString()} this ${range === '7d' ? 'week' : 'period'}`, tone: 'info',
      explain: `5% of this ${periodWord}'s revenue (₦${curRev.toLocaleString()}) — a common starting savings rate.`,
    });
  }
  const ea = expenseAnalysis(store, ['Restock']);
  if (ea.trendPct > 20) {
    out.push({
      id: 'exp', icon: '🧾', text: `Expenses rose ${ea.trendPct.toFixed(0)}% this month. Largest: ${ea.largestCategory}`, tone: 'warning',
      explain: `${ea.largestCategory} spending grew ${ea.trendPct.toFixed(0)}% month-over-month, more than any other category.`,
    });
  }
  const rent = rentAnalysis(store);
  if (rent && rent.affordabilityPct > 30) {
    out.push({
      id: 'rent', icon: '🏠', text: `Rent is ${rent.affordabilityPct}% of monthly revenue — high. Consider growing sales.`, tone: rent.affordabilityPct > 50 ? 'danger' : 'warning',
      explain: `Rent divided by this month's revenue. Above 30% is generally considered high for a small retail business.`,
    });
  }
  return out.slice(0, 6);
}

// ─── Product Insight Badges ─────────────────────────────────────────────────
// Per-product labels shown on inventory/product cards, each with a short,
// fixed-format explanation of why the product earned the badge.
export interface ProductInsightBadge {
  productId: string;
  productName: string;
  label: 'Best Seller' | 'Fast Mover' | 'High Sales' | 'Dormant Product';
  explain: string;
}

export function getProductInsightBadges(store: StoreData, dormantDays = 30): ProductInsightBadge[] {
  const badges: ProductInsightBadge[] = [];
  const active = store.products.filter(p => !p.discontinued && !p.isService);
  if (active.length === 0) return badges;

  // Best Seller — this week, ranked by sales value first, quantity as tiebreak.
  const weekCutoff = daysAgo(6);
  const weekValue = new Map<string, number>();
  const weekQty = new Map<string, number>();
  store.sales.filter(s => new Date(s.date) >= weekCutoff).forEach(s => {
    weekValue.set(s.productId, (weekValue.get(s.productId) || 0) + (s.total || 0));
    weekQty.set(s.productId, (weekQty.get(s.productId) || 0) + s.quantity);
  });
  const bestSellerId = [...weekValue.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return (weekQty.get(b[0]) || 0) - (weekQty.get(a[0]) || 0);
  })[0]?.[0];
  if (bestSellerId) {
    const p = active.find(p => p.id === bestSellerId);
    if (p) badges.push({
      productId: p.id, productName: p.name, label: 'Best Seller',
      explain: `Generated the highest sales value this week (₦${(weekValue.get(p.id) || 0).toLocaleString()}). Ties are broken by quantity sold.`,
    });
  }

  // Fast Mover — this month, top 3 by units sold.
  const monthCutoff = daysAgo(29);
  const monthQty = new Map<string, number>();
  const monthValue = new Map<string, number>();
  store.sales.filter(s => new Date(s.date) >= monthCutoff).forEach(s => {
    monthQty.set(s.productId, (monthQty.get(s.productId) || 0) + s.quantity);
    monthValue.set(s.productId, (monthValue.get(s.productId) || 0) + (s.total || 0));
  });
  [...monthQty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([id, qty]) => {
    const p = active.find(p => p.id === id);
    if (p) badges.push({
      productId: p.id, productName: p.name, label: 'Fast Mover',
      explain: `Sold the highest number of units this month (${qty} unit${qty === 1 ? '' : 's'}).`,
    });
  });

  // High Sales — this month, top 3 by revenue.
  [...monthValue.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([id, val]) => {
    const p = active.find(p => p.id === id);
    if (p) badges.push({
      productId: p.id, productName: p.name, label: 'High Sales',
      explain: `Generated the highest revenue this month (₦${val.toLocaleString()}).`,
    });
  });

  // Dormant Product — no sales in dormantDays, regardless of stock level.
  const soldProductIds = new Set(store.sales.map(s => s.productId));
  active.forEach(p => {
    const lastSale = p.last_sold_at ? new Date(p.last_sold_at) : null;
    const daysSince = lastSale ? daysBetween(lastSale, new Date()) : null;
    const neverSold = !soldProductIds.has(p.id) && !lastSale;
    if (neverSold || (daysSince !== null && daysSince >= dormantDays)) {
      badges.push({
        productId: p.id, productName: p.name, label: 'Dormant Product',
        explain: neverSold
          ? `No sales recorded since it was added.`
          : `No sales for ${daysSince} days.`,
      });
    }
  });

  return badges;
}

// ─── Recommendations (original, enhanced) ─────────────────────────────────────
export interface Recommendation {
  id: string; icon: string; title: string; detail: string;
  tone: 'warning' | 'danger' | 'info' | 'success';
  action?: 'restock' | 'price' | 'expense'; productId?: string;
}

export function forecastDaysRemaining(store: StoreData, p: Product): number {
  const totalSold = store.sales
    .filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(13))
    .reduce((sum, s) => sum + s.quantity, 0);
  const perDay = totalSold / 14;
  if (perDay <= 0) return Infinity;
  return Math.floor(p.quantity / perDay);
}

export function generateRecommendations(store: StoreData): Recommendation[] {
  const recs: Recommendation[] = [];
  if (isStoreOnboarding(store)) return [];
  store.products.filter(p => !p.discontinued).forEach(p => {
    const days = forecastDaysRemaining(store, p);
    if (Number.isFinite(days) && days <= 5 && p.quantity > 0) {
      const lostRev = Math.round(p.sellingPrice * (p.quantity / Math.max(1, days)) * 7);
      recs.push({ id: `r-${p.id}`, icon: '📦', title: `Restock ${p.name}`, detail: `Stock will finish in ${days} day${days === 1 ? '' : 's'}. Potential lost revenue: ₦${lostRev.toLocaleString()}`, tone: days <= 2 ? 'danger' : 'warning', action: 'restock', productId: p.id });
    }
  });
  const exp = store.expenses || [];
  if (exp.length >= 4) {
    const byCat = new Map<string, number[]>();
    exp.forEach(e => { const arr = byCat.get(e.category) || []; arr.push(e.amount); byCat.set(e.category, arr); });
    byCat.forEach((amts, cat) => {
      if (amts.length < 3) return;
      const recent = amts[0];
      const avgPrev = amts.slice(1).reduce((s, a) => s + a, 0) / (amts.length - 1);
      if (avgPrev > 0 && recent > avgPrev * 1.2) {
        const pct = Math.round(((recent - avgPrev) / avgPrev) * 100);
        recs.push({ id: `e-${cat}`, icon: '🧾', title: `${cat} Expense Alert`, detail: `Your ${cat.toLowerCase()} cost is ${pct}% higher than usual.`, tone: 'warning', action: 'expense' });
      }
    });
  }
  store.products.filter(p => !p.discontinued).forEach(p => {
    if (!p.costPrice) return;
    const markup = productMarkup(p);
    const sold = store.sales.filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(6)).reduce((sum, s) => sum + s.quantity, 0);
    if (markup > 0 && markup < 0.2 && sold >= 5) {
      const suggested = Math.round((p.costPrice * 1.3) / 10) * 10;
      const lift = suggested - p.sellingPrice;
      if (lift >= 10) recs.push({ id: `p-${p.id}`, icon: '📈', title: 'Price Opportunity', detail: `Increase ${p.name} by ₦${lift.toLocaleString()} for a healthier markup`, tone: 'info', action: 'price', productId: p.id });
    }
  });
  return recs.slice(0, 6);
}

// ─── Activity Graph ────────────────────────────────────────────────────────────
export type ActivityRange = 'today' | '7d' | '30d' | '1y' | 'lifetime';

export interface ActivityBucket {
  minute: number; label: string; shortLabel: string;
  sales: number; revenue: number; profit: number;
}

export interface MostActivePeriods {
  buckets: ActivityBucket[];
  peakWindow?: { startLabel: string; endLabel: string };
  totalSales: number;
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60); const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function mostActivePeriods(store: StoreData, range: ActivityRange = '7d', interval: number = 30): MostActivePeriods {
  let cutoff = 0;
  const now = Date.now();
  if (range === 'today') { const d = new Date(); d.setHours(0, 0, 0, 0); cutoff = d.getTime(); }
  else if (range === '7d') cutoff = now - 7 * 86400000;
  else if (range === '30d') cutoff = now - 30 * 86400000;
  else if (range === '1y') cutoff = now - 365 * 86400000;
  else cutoff = 0;

  const N = Math.floor(1440 / interval);
  const labelInterval = interval === 10 ? 120 : interval === 30 ? 180 : 120;

  const buckets: ActivityBucket[] = [];
  for (let i = 0; i < N; i++) {
    const minute = i * interval; const h = Math.floor(minute / 60);
    const showLabel = minute % labelInterval === 0;
    buckets.push({ minute, label: fmtMin(minute), shortLabel: showLabel ? `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}` : '', sales: 0, revenue: 0, profit: 0 });
  }
  let totalSales = 0;
  store.sales.forEach(s => {
    const t = new Date(s.date).getTime();
    if (t < cutoff) return;
    const d = new Date(t);
    const min = d.getHours() * 60 + d.getMinutes();
    const idx = Math.floor(min / interval);
    const b = buckets[idx]; if (!b) return;
    b.sales += 1; b.revenue += s.total; b.profit += s.profit; totalSales += 1;
  });
  let peakWindow: MostActivePeriods['peakWindow'];
  if (totalSales > 0) {
    const sorted = [...buckets].map(b => b.revenue).sort((a, b) => b - a);
    const cut = sorted[Math.min(8, sorted.length - 1)] || 1;
    let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
    buckets.forEach((b, i) => {
      if (b.revenue >= cut && b.revenue > 0) { if (curStart < 0) curStart = i; curLen++; if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; } }
      else { curStart = -1; curLen = 0; }
    });
    if (bestStart >= 0) peakWindow = { startLabel: buckets[bestStart].label, endLabel: fmtMin(Math.min(1440, (bestStart + bestLen) * interval)) };
  }
  return { buckets, peakWindow, totalSales };
}

// ─── Structured Get Advice report ─────────────────────────────────────────────
//
// The report used to be a fixed run of five markdown sections in a fixed order,
// so a sold-out product was reported below a paragraph saying expenses were
// fine. Sections now carry what they found and how bad it is, and the caller
// sorts on that — a store with nothing wrong reads completely differently to a
// store that is losing sales today.

export type FlowReportTone = 'critical' | 'warning' | 'good' | 'neutral';

export interface FlowReportAction {
  label: string;
  goTo?: TabId;
  autoFix?: AutoFixSpec;
  /** Set when the action concerns exactly one product — see ProductFocus. */
  focus?: ProductFocus;
}

export interface FlowReportSection {
  id: string;
  emoji: string;
  heading: string;
  tone: FlowReportTone;
  /** Sorted on, high to low. Derived from the finding, never from the wording. */
  rank: number;
  /** One line saying what this section found, before any detail. */
  summary: string;
  detail: string[];
  items?: { name: string; note: string }[];
  actions?: FlowReportAction[];
}

export interface FlowReport {
  intro: string;
  /** The single most urgent finding, or null when nothing needs attention. */
  headline: FlowReportSection | null;
  sections: FlowReportSection[];
  onboarding?: string;
}

export function buildFlowReport(store: StoreData): FlowReport {
  if (isStoreOnboarding(store)) {
    return {
      intro: '',
      headline: null,
      sections: [],
      onboarding: 'Get your store ready for business. We are helping you set everything up before monitoring performance.',
    };
  }

  const h = healthScore(store);
  const pending = getPendingSummary(store);
  const forecasts = inventoryIntelligence(store);

  const last7 = dailySeries(store, 7);
  const prev7 = dailySeries(store, 14).slice(0, 7);
  const rev7 = last7.reduce((s, d) => s + d.revenue, 0);
  const revPrev = prev7.reduce((s, d) => s + d.revenue, 0);
  const profit7 = last7.reduce((s, d) => s + d.profit, 0);

  // Restock spend is money turned into resellable stock, not a cost leak, so it
  // stays out of the expense ratio.
  const exp7 = (store.expenses || [])
    .filter(e => e.category !== 'Restock' && new Date(e.date) >= daysAgo(6))
    .reduce((s, e) => s + e.amount, 0);
  const ea = expenseAnalysis(store, ['Restock']);

  const threshold = getLowStockThreshold();
  const live = store.products.filter(p => !p.discontinued);
  const outOfStock = live.filter(p => p.quantity === 0);
  const lowStock = live.filter(p => p.quantity > 0 && p.quantity <= threshold);
  const margin = rev7 > 0 ? (profit7 / rev7) * 100 : 0;
  const money = (n: number) => `₦${Math.round(n).toLocaleString()}`;

  const sections: FlowReportSection[] = [];

  // ── Sales ──
  {
    const detail: string[] = [];
    let tone: FlowReportTone = 'neutral';
    let rank = 20;
    let summary: string;

    if (rev7 === 0) {
      summary = 'No sales recorded this week.';
      detail.push('If you have been opening the shop, record every sale so I can track your revenue. If foot traffic is genuinely low, a weekend promotion is worth trying.');
      tone = 'warning';
      rank = 72;
    } else {
      summary = `${money(rev7)} in revenue this week.`;
      if (revPrev > 0) {
        const growth = ((rev7 - revPrev) / revPrev) * 100;
        if (growth < -10) {
          detail.push(`Down ${Math.abs(growth).toFixed(1)}% on last week (${money(revPrev)}).`);
          tone = 'warning';
          rank = Math.max(rank, 68);
        } else if (growth > 10) {
          detail.push(`Up ${growth.toFixed(1)}% on last week.`);
          tone = 'good';
        } else {
          detail.push('Level with last week.');
        }
      }
      if (margin <= 0) {
        detail.push(`You are selling at a negative margin — ${money(profit7)} profit on ${money(rev7)} of sales. Check your cost prices before you sell any more.`);
        tone = 'critical';
        rank = 96;
      } else if (margin < 15) {
        detail.push(`Net margin is thin at ${margin.toFixed(1)}%. You may be pricing too close to cost, or paying too much wholesale.`);
        tone = 'warning';
        rank = Math.max(rank, 66);
      } else {
        detail.push(`Margin is healthy at ${margin.toFixed(1)}% (${money(profit7)} profit).`);
        if (tone !== 'warning') tone = 'good';
      }
    }

    // Point at whatever the finding actually calls for, rather than one
    // generic link: nothing sold means record a sale, a bad margin means look
    // at prices.
    const salesAction: FlowReportAction = rev7 === 0
      ? { label: 'Record a sale', goTo: 'sales' as TabId }
      : margin < 15
        ? { label: 'Review prices', goTo: 'inventory' as TabId }
        : { label: 'Sales history', goTo: 'history' as TabId };

    sections.push({
      id: 'sales', emoji: '📊', heading: 'Sales & margin', tone, rank, summary, detail,
      actions: [salesAction],
    });
  }

  // ── Inventory ──
  {
    const critical = forecasts.filter(f => f.urgency === 'critical' || f.product.quantity === 0);
    const detail: string[] = [];
    const actions: FlowReportAction[] = [];
    let tone: FlowReportTone = 'good';
    let rank = 15;
    let summary: string;

    if (live.length === 0) {
      summary = 'No products in your inventory yet.';
      detail.push('Add your products so I can track stock levels and tell you what to reorder.');
      tone = 'warning'; rank = 74;
      actions.push({ label: 'Add products', goTo: 'inventory' as TabId });
    } else if (outOfStock.length > 0) {
      summary = `${outOfStock.length} product${outOfStock.length === 1 ? '' : 's'} sold out — you are losing sales right now.`;
      tone = 'critical'; rank = 100;
      if (lowStock.length > 0) detail.push(`${lowStock.length} more ${lowStock.length === 1 ? 'is' : 'are'} below ${threshold} units.`);
    } else if (lowStock.length > 0) {
      summary = `${lowStock.length} product${lowStock.length === 1 ? '' : 's'} running low.`;
      tone = 'warning'; rank = 70;
    } else {
      summary = `All stocked above ${threshold} units.`;
    }

    const listed = [...outOfStock, ...lowStock].slice(0, 6);
    const items = listed.map(p => ({
      name: p.name,
      note: p.quantity === 0 ? 'Sold out' : `${p.quantity} left`,
    }));

    if (critical.length > 0) {
      actions.push({ label: 'Go to Inventory', goTo: 'inventory' as TabId });
      actions.push({
        label: 'Auto Fix',
        autoFix: {
          type: 'generate_purchase_order',
          summary: critical.length === 1
            ? `Create a draft purchase order for ${critical[0].restockQty} units of ${critical[0].product.name}`
            : `Create a draft purchase order covering all ${critical.length} critical products`,
          payload: { items: critical.map(f => ({ productId: f.product.id, name: f.product.name, qty: f.restockQty, costPrice: f.product.costPrice })) },
        },
      });
    } else if (lowStock.length > 0) {
      actions.push({ label: 'Go to Inventory', goTo: 'inventory' as TabId });
    }

    sections.push({
      id: 'inventory', emoji: '📦', heading: 'Stock', tone, rank, summary, detail,
      items: items.length ? items : undefined,
      actions: actions.length ? actions : undefined,
    });
  }

  // ── Expenses ──
  {
    const detail: string[] = [];
    let tone: FlowReportTone = 'neutral';
    let rank = 18;
    let summary: string;

    if (exp7 <= 0) {
      summary = 'No expenses recorded this week.';
      detail.push('Without expenses logged, the profit above only subtracts cost of goods, so it flatters the real number.');
      tone = 'neutral'; rank = 40;
    } else {
      const ratio = rev7 > 0 ? (exp7 / rev7) * 100 : 0;
      summary = `${money(exp7)} spent this week` + (rev7 > 0 ? `, ${ratio.toFixed(0)}% of revenue.` : '.');
      if (rev7 > 0 && ratio > 100) {
        detail.push('You are spending more than you are selling. Freeze anything non-essential.');
        tone = 'critical'; rank = 92;
      } else if (rev7 > 0 && ratio > 40) {
        detail.push('That is a high share of revenue.');
        if (ea.trendPct > 10) detail.push(`The rise is driven by ${ea.largestCategory}.`);
        tone = 'warning'; rank = 62;
      } else if (rev7 > 0) {
        detail.push('Well controlled.');
        tone = 'good';
      }
    }

    sections.push({
      id: 'expenses', emoji: '🧾', heading: 'Expenses', tone, rank, summary, detail,
      actions: [{ label: 'Open Expenses', goTo: 'expenses' as TabId }],
    });
  }

  // ── Money owed ──
  {
    const detail: string[] = [];
    let tone: FlowReportTone = 'good';
    let rank = 12;
    let summary: string;

    if (pending.totalOwed > 0) {
      summary = `Customers owe you ${money(pending.totalOwed)} across ${pending.list.length} payment${pending.list.length === 1 ? '' : 's'}.`;
      if (pending.overdue.length > 0) {
        const overdueAmount = pending.overdue.reduce((s, p) => s + p.balance, 0);
        detail.push(`${pending.overdue.length} ${pending.overdue.length === 1 ? 'is' : 'are'} overdue, worth ${money(overdueAmount)}. That is working capital you cannot restock with.`);
        tone = 'warning'; rank = 76;
      } else {
        detail.push('None overdue yet. Collect on the due dates to keep cash moving.');
        tone = 'neutral'; rank = 25;
      }
    } else {
      summary = 'Nobody owes you anything.';
    }

    sections.push({
      id: 'debts', emoji: '💳', heading: 'Money owed to you', tone, rank, summary, detail,
      actions: pending.totalOwed > 0 ? [{ label: 'Chase payments', goTo: 'pending' as TabId }] : undefined,
    });
  }

  sections.sort((a, b) => b.rank - a.rank);

  const worst = sections[0];
  const headline = worst && (worst.tone === 'critical' || worst.tone === 'warning') ? worst : null;

  const intro = headline
    ? `Health score ${h.overall}/100. The thing worth your attention first:`
    : `Health score ${h.overall}/100. Nothing is going wrong right now — here is where things stand.`;

  return { intro, headline, sections };
}

export function generateFlowReport(store: StoreData): string {
  if (isStoreOnboarding(store)) {
    return "Get your store ready for business. We are helping you set everything up before monitoring performance.";
  }
  const h = healthScore(store);
  const stock = inventoryIntelligence(store);
  const pending = getPendingSummary(store);

  const last7 = dailySeries(store, 7);
  const prev7 = dailySeries(store, 14).slice(0, 7);
  const rev7 = last7.reduce((s, d) => s + d.revenue, 0);
  const revPrev = prev7.reduce((s, d) => s + d.revenue, 0);
  const profit7 = last7.reduce((s, d) => s + d.profit, 0);
  // "Expense Audit" below is about controllable operating costs (rent,
  // utilities, salaries, etc.). Restock spend is money converted into
  // resellable inventory, not a cost leak — exclude it so a big, healthy
  // restock doesn't get flagged as "dangerously high" spending.
  const exp7 = (store.expenses || [])
    .filter(e => e.category !== 'Restock' && new Date(e.date) >= daysAgo(6))
    .reduce((s, e) => s + e.amount, 0);

  const outOfStock = store.products.filter(p => !p.discontinued && p.quantity === 0);
  const threshold = getLowStockThreshold();
  const lowStock = store.products.filter(p => !p.discontinued && p.quantity > 0 && p.quantity <= threshold);

  const ea = expenseAnalysis(store, ['Restock']);

  let text = `Hi, I'm Flow, your business assistant. Here is a tailored analysis for ${store.storeName}. \n\n`;

  // 1. Overall Health & Performance Assessment
  text += `### 📊 Store Performance Summary\n`;
  if (h.overall >= 80) {
    text += `Your store is performing exceptionally well with a health score of **${h.overall}/100** (Great). `;
  } else if (h.overall >= 60) {
    text += `Your store is in healthy standing with a score of **${h.overall}/100**. Operations are stable, but we can optimize. `;
  } else if (h.overall >= 40) {
    text += `Your store performance is average (**${h.overall}/100**). Some financial and inventory metrics are falling behind. `;
  } else {
    text += `⚠️ **Critical Warning:** Your store is underperforming with a health score of **${h.overall}/100** (Needs Immediate Attention). `;
  }

  // Revenue & Profit Trend Analysis
  if (rev7 === 0) {
    text += `You have logged **zero sales** this week. If you've been opening the shop, make sure to record every sale on StoreFlow so I can track your revenue. If foot traffic is low, consider running a weekend promotion. \n\n`;
  } else {
    const margin = rev7 > 0 ? (profit7 / rev7) * 100 : 0;
    text += `This week, you generated **₦${rev7.toLocaleString()}** in revenue. `;
    if (revPrev > 0) {
      const growth = ((rev7 - revPrev) / revPrev) * 100;
      if (growth < -10) {
        text += `This is a significant **decline of ${Math.abs(growth).toFixed(1)}%** compared to last week (₦${revPrev.toLocaleString()}). `;
      } else if (growth > 10) {
        text += `This is a strong **growth of ${growth.toFixed(1)}%** compared to last week! `;
      } else {
        text += `This is stable compared to last week. `;
      }
    }

    if (margin < 15 && margin > 0) {
      text += `However, your net profit margin is thin at **${margin.toFixed(1)}%**. You might be pricing your items too close to their cost price, or facing high wholesale prices. Check the 'Analysis' tab to see which products have low margins. \n\n`;
    } else if (margin <= 0 && rev7 > 0) {
      text += `Critically, you are operating at a **negative profit margin** on sales this week. Review product costs immediately! \n\n`;
    } else {
      text += `Your profit margin is healthy at **${margin.toFixed(1)}%** (₦${profit7.toLocaleString()} profit). \n\n`;
    }
  }

  // 2. Inventory Health (Zero stock / Low stock)
  text += `### 📦 Inventory Diagnostics\n`;
  if (store.products.length === 0) {
    text += `You currently have **0 products** registered in your inventory. To get started, go to the Inventory page and add your products so I can track stock levels. \n\n`;
  } else if (outOfStock.length > 0 || lowStock.length > 0) {
    if (outOfStock.length > 0) {
      const oosNames = outOfStock.slice(0, 3).map(p => p.name).join(', ');
      text += `🚨 **Out of Stock:** You have **${outOfStock.length} product(s) completely sold out** (${oosNames}${outOfStock.length > 3 ? '...' : ''}). When products are at zero, you are actively losing sales. Restock these immediately. \n`;
    }
    if (lowStock.length > 0) {
      const lowNames = lowStock.slice(0, 3).map(p => p.name).join(', ');
      text += `⚠️ **Low Stock:** There are **${lowStock.length} product(s) running low** (below ${threshold} units), including: ${lowNames}. \n`;
    }
    text += `Go to the Marketplace tab to find local suppliers or place quick orders. \n\n`;
  } else {
    text += `Your inventory is fully stocked! All registered products are above the low stock threshold of ${threshold} units. Keep it up! 👍 \n\n`;
  }

  // 3. Expense Control
  text += `### 🧾 Expense Audit\n`;
  if (exp7 > 0) {
    text += `Your recorded expenses total **₦${exp7.toLocaleString()}** this week. `;
    if (rev7 > 0) {
      const expRatio = (exp7 / rev7) * 100;
      if (expRatio > 40) {
        text += `This represents **${expRatio.toFixed(0)}% of your weekly revenue**, which is dangerously high. `;
        if (ea.trendPct > 10) {
          text += `Your monthly spending spike is driven by the **${ea.largestCategory}** category. Audit this category immediately to plug financial leaks. `;
        }
      } else {
        text += `Expenses are well-controlled, taking up only ${expRatio.toFixed(0)}% of your revenue. `;
      }
    }
    text += `\n\n`;
  } else {
    text += `You have **no expenses recorded** this week. Keeping accurate expense logs is crucial for knowing your true net profit. \n\n`;
  }

  // 4. Debt & Cash Flow
  text += `### 💳 Outstanding Debts & Cash Flow\n`;
  if (pending.totalOwed > 0) {
    text += `Customers owe your store **₦${pending.totalOwed.toLocaleString()}** across ${pending.list.length} pending payment(s). `;
    if (pending.overdue.length > 0) {
      text += `Of these, **${pending.overdue.length} payment(s) are overdue**. This is tying up your working capital, making it harder to restock. I suggest sending a WhatsApp reminder directly from the 'Pending' tab to collect these funds. \n\n`;
    } else {
      text += `These balances are not yet overdue. Make sure to collect them on the due dates to maintain healthy cash flow. \n\n`;
    }
  } else {
    text += `Your outstanding customer debt is zero! This is excellent for your cash flow. \n\n`;
  }

  // 5. Tailored Priority Recommendations
  text += `### ⚡ Priority Recommendations\n`;
  let recsAdded = 0;

  if (outOfStock.length > 0) {
    text += `${recsAdded + 1}. **Restock Out-of-Stock Items:** Focus on replenishing ${outOfStock.slice(0, 2).map(p => p.name).join(' and ')} immediately.\n`;
    recsAdded++;
  }
  if (rev7 === 0) {
    text += `${recsAdded + 1}. **Record Sales Activity:** Open your shop and start logging sales daily to generate actionable forecasts.\n`;
    recsAdded++;
  }
  if (pending.overdue.length > 0) {
    const overdueAmount = pending.overdue.reduce((s, p) => s + p.balance, 0);
    text += `${recsAdded + 1}. **Collect Overdue Debts:** Call or message the overdue customer(s) to recover ₦${overdueAmount.toLocaleString()}.\n`;
    recsAdded++;
  }
  if (exp7 > rev7 && rev7 > 0) {
    text += `${recsAdded + 1}. **Reduce Overhead:** Your expenses are outstripping your sales. Freeze non-essential purchases.\n`;
    recsAdded++;
  }
  if (recsAdded === 0) {
    text += `1. **Maintain Steady Operations:** Keep doing what you're doing! Consider setting a higher savings goal or expanding your product listings in the Marketplace.\n`;
  }

  return text;
}

// ─── Top Opportunities ────────────────────────────────────────────────────────

/**
 * Things worth doing, each one somewhere the merchant can actually go.
 *
 * Every card used to end in a chevron and a phrase like "Order Stock" that
 * looked tappable and did nothing — the whole card was plain text. And the
 * badge meant different things on different cards: one showed money, the
 * others showed "High Revenue Boost" and "Free Up Working Capital" in the
 * same pill.
 *
 * The money shown is now gross profit, not gross revenue. Restocking a fast
 * seller was advertised at sellingPrice × units — ₦8.8m for an order that
 * costs ₦7.1m to place, so the number was mostly the merchant's own money
 * being handed back to them.
 */
export interface OpportunityCard {
  title: string;
  description: string;
  /** What it is worth, when that can be said honestly. */
  impactAmount?: number;
  impactLabel: string;
  actionLabel: string;
  /** Where tapping it goes, and what to open when it lands. */
  goTo: TabId;
  focus?: ProductFocus;
}

export function getTopOpportunities(store: StoreData): OpportunityCard[] {
  const opps: OpportunityCard[] = [];

  // 1. Things customers asked for that are not stocked.
  for (const r of topCustomerRequests(store, 2)) {
    opps.push({
      title: `Stock ${r.text}`,
      description: `Asked for ${r.count} times and not in your inventory.`,
      impactLabel: `${r.count} asked`,
      actionLabel: 'Add product',
      goTo: 'inventory',
    });
  }

  // 2. Fast sellers about to run out.
  // Already sorted by money at risk, and only items with real recent demand
  // qualify — restocking something that sold once last quarter is not an
  // opportunity, it is a way to turn cash into shelf ornaments.
  const critical = inventoryIntelligence(store)
    .filter(f => f.urgency === 'critical' && f.worthRestocking && f.restockQty > 0);
  if (critical.length > 0) {
    const item = critical[0];
    // Profit, not revenue: the cost of the order is the merchant's own cash.
    const unitProfit = Math.max(0, item.product.sellingPrice - item.product.costPrice);
    opps.push({
      title: `Restock ${item.product.name}`,
      description: `${stockCoverLabel(item)}. Order ${item.restockQty}.`,
      impactAmount: Math.round(unitProfit * item.restockQty),
      impactLabel: 'profit',
      actionLabel: 'Restock',
      goTo: 'inventory',
      focus: { productId: item.product.id, intent: 'restock', productName: item.product.name },
    });
  }

  // 3. Stock bought and never sold.
  const neverSold = analyzeSales(store).neverSold;
  if (neverSold.length > 0) {
    const p = neverSold[0];
    const tiedUp = Math.round((p.costPrice || 0) * (p.quantity || 0));
    opps.push({
      title: `Stop reordering ${p.name}`,
      description: `${p.daysInStock} days in stock, nothing sold.`,
      impactAmount: tiedUp > 0 ? tiedUp : undefined,
      impactLabel: 'tied up',
      actionLabel: 'Review',
      goTo: 'inventory',
      focus: { productId: p.id, intent: 'edit', productName: p.name },
    });
  }

  // NOTE: This used to pad the list with generic, non-personalized suggestions
  // ("Set Up Branded Receipts", "Expand to Game Services") whenever there
  // weren't enough real opportunities — the same filler for every merchant
  // regardless of what they actually sell. Removed: better to show fewer,
  // honest cards than to dilute real insights with boilerplate.

  return opps.slice(0, 4);
}

// ─── Profit Leak Detector ─────────────────────────────────────────────────────

/**
 * Two different problems, told apart.
 *
 * This used to add five numbers of five different kinds and print the total as
 * a "Leak Index": unpaid invoices, stock on the shelf at cost, a month of
 * foregone margin, a week of excess expenses, and every stock-count shortfall
 * ever recorded. On a shop earning ₦3.2m profit in thirty days it announced a
 * ₦2.19m leak, of which about ₦104,000 was actually money going astray. The
 * rest was either an asset the merchant still owns or a one-off from months
 * earlier being counted forever.
 *
 * `leaking` is money genuinely lost, all of it measured over the same thirty
 * days, and only that is totalled. `stuck` is money the merchant still has but
 * cannot spend — it needs a different action, so it is shown apart and never
 * described as a loss.
 */
export interface ProfitLeak {
  kind: 'leaking' | 'stuck';
  category: 'expense' | 'dead_stock' | 'unpaid_debt' | 'poor_margin' | 'stock_loss';
  title: string;
  description: string;
  amountLeak: number;
  recommendation: string;
}

/** Everything here is measured over the same window, so the parts can be added. */
const LEAK_WINDOW_DAYS = 30;

/** Markup a thin-margin product is compared against. */
const HEALTHY_MARKUP = 0.25;

export function getProfitLeaks(store: StoreData): ProfitLeak[] {
  const leaks: ProfitLeak[] = [];
  const now = Date.now();
  const windowStart = now - LEAK_WINDOW_DAYS * 86400000;
  const recentSales = store.sales.filter(sale => new Date(sale.date).getTime() >= windowStart);
  const active = store.products.filter(p => !p.discontinued);

  const soldUnits = new Map<string, number>();
  for (const sale of recentSales) {
    soldUnits.set(sale.productId, (soldUnits.get(sale.productId) || 0) + sale.quantity);
  }

  // ── Leaking: thin margins ──────────────────────────────────────────────
  // Only products that actually sold can be losing money on price. Compare
  // what each earned against what it would have earned at a healthy markup.
  let thinMarginCount = 0;
  let thinMarginLeak = 0;
  for (const p of active) {
    if (p.costPrice <= 0) continue;
    if (productMarkup(p) >= 0.15) continue;
    const sold = soldUnits.get(p.id) || 0;
    if (sold <= 0) continue;
    thinMarginCount++;
    thinMarginLeak += Math.max(0, p.costPrice * (1 + HEALTHY_MARKUP) - p.sellingPrice) * sold;
  }
  if (thinMarginLeak > 0) {
    leaks.push({
      kind: 'leaking',
      category: 'poor_margin',
      title: `${thinMarginCount} product${thinMarginCount === 1 ? '' : 's'} priced too close to cost`,
      // 25% on top of cost is a 25% markup, which is a 20% margin. The old
      // copy called it a margin while doing markup arithmetic.
      description: `At a ${Math.round(HEALTHY_MARKUP * 100)}% markup these would have earned ₦${Math.round(thinMarginLeak).toLocaleString()} more over the last ${LEAK_WINDOW_DAYS} days.`,
      amountLeak: Math.round(thinMarginLeak),
      recommendation: 'Raise these prices, or drop the lines you cannot price properly.',
    });
  }

  // ── Leaking: overheads ─────────────────────────────────────────────────
  // Was a 7-day figure standing next to 30-day ones. Same window now.
  const series = dailySeries(store, LEAK_WINDOW_DAYS);
  const revenue = series.reduce((sum, d) => sum + d.revenue, 0);
  const expenses = series.reduce((sum, d) => sum + d.expenses, 0);
  if (revenue > 0 && expenses > revenue * 0.4) {
    const excess = expenses - revenue * 0.2;
    leaks.push({
      kind: 'leaking',
      category: 'expense',
      title: 'Overheads are eating the takings',
      description: `Running costs of ₦${Math.round(expenses).toLocaleString()} took ${Math.round((expenses / revenue) * 100)}% of sales over the last ${LEAK_WINDOW_DAYS} days.`,
      amountLeak: Math.round(excess),
      recommendation: 'Check utilities, transport and salaries against what came in.',
    });
  }

  // ── Leaking: shrinkage ─────────────────────────────────────────────────
  // Only counts within the window. A shortfall from months ago used to be
  // carried in the total for the life of the shop.
  const recentShortfalls = (store.stockCountAudits || []).filter(
    a => a.variance < 0 && new Date(a.date).getTime() >= windowStart,
  );
  if (recentShortfalls.length > 0) {
    const withCost = active.filter(p => p.costPrice > 0);
    const avgCost = withCost.length
      ? withCost.reduce((sum, p) => sum + p.costPrice, 0) / withCost.length
      : 0;
    const units = recentShortfalls.reduce((sum, a) => sum + Math.abs(a.variance), 0);
    const value = recentShortfalls.reduce((sum, a) => {
      const match = store.products.find(p => p.name === a.product);
      return sum + Math.abs(a.variance) * (match?.costPrice || avgCost);
    }, 0);
    if (value > 0) {
      leaks.push({
        kind: 'leaking',
        category: 'stock_loss',
        title: 'Stock went missing between counts',
        description: `${units} unit${units === 1 ? '' : 's'} unaccounted for in the last ${LEAK_WINDOW_DAYS} days, worth ₦${Math.round(value).toLocaleString()} at cost.`,
        amountLeak: Math.round(value),
        recommendation: 'Count more often and check who can edit stock.',
      });
    }
  }

  // ── Stuck: money owed past its due date ────────────────────────────────
  // The whole receivable balance used to be called a leak, including invoices
  // raised the day before. Only what is actually late is a problem, and even
  // that is money the merchant is owed, not money lost.
  const pending = getPendingSummary(store);
  const overdue = pending.overdue.reduce((sum, p) => sum + p.balance, 0);
  if (overdue > 0) {
    const names = new Set(pending.overdue.map(p => p.customerName.toLowerCase())).size;
    leaks.push({
      kind: 'stuck',
      category: 'unpaid_debt',
      title: 'Payments past their due date',
      description: `₦${Math.round(overdue).toLocaleString()} is overdue from ${names} customer${names === 1 ? '' : 's'}.`,
      amountLeak: Math.round(overdue),
      recommendation: 'Send a reminder to the oldest balances first.',
    });
  }

  // ── Stuck: capital sitting in stock that is not moving ─────────────────
  // A line that sells steadily but slowly is not dead, and counting it as a
  // total loss was most of the old number. Only stock with no sales at all in
  // the window counts, and the copy says what it is: money you still have.
  let idleValue = 0;
  let idleCount = 0;
  for (const p of active) {
    if (p.quantity <= 0 || p.costPrice <= 0) continue;
    if ((soldUnits.get(p.id) || 0) > 0) continue;
    idleValue += p.costPrice * p.quantity;
    idleCount++;
  }
  if (idleValue > 0) {
    leaks.push({
      kind: 'stuck',
      category: 'dead_stock',
      title: `${idleCount} product${idleCount === 1 ? '' : 's'} have not sold in ${LEAK_WINDOW_DAYS} days`,
      description: `₦${Math.round(idleValue).toLocaleString()} of your cash is sitting in them. It is not lost, but you cannot spend it.`,
      amountLeak: Math.round(idleValue),
      recommendation: 'Discount them, bundle them, or stop reordering them.',
    });
  }

  return leaks;
}

// ─── Seasonal Predictions ─────────────────────────────────────────────────────
export interface SeasonalPrediction {
  periodName: string;
  expectedTrend: 'increase' | 'decrease' | 'stable';
  details: string;
  suggestedItems: string[];
  itemsFromYourCatalog: boolean; // true if these are real products you sell; false if they're generic regional examples because nothing in your catalog matched
}

// Find products this store actually sells that match a season's typical
// demand categories, instead of always suggesting the same hardcoded product
// names regardless of what this merchant actually stocks.
function matchStoreProducts(store: StoreData, keywords: string[], limit = 3): string[] {
  const active = store.products.filter(p => !p.discontinued);
  const matches = active.filter(p => {
    const haystack = `${p.name} ${p.category || ''}`.toLowerCase();
    return keywords.some(k => haystack.includes(k));
  });
  // Prefer the store's own fast movers among the matches, when we have sales history
  const salesQty = new Map<string, number>();
  store.sales.filter(s => new Date(s.date) >= daysAgo(30)).forEach(s => {
    salesQty.set(s.productId, (salesQty.get(s.productId) || 0) + s.quantity);
  });
  matches.sort((a, b) => (salesQty.get(b.id) || 0) - (salesQty.get(a.id) || 0));
  return matches.slice(0, limit).map(p => p.name);
}

export function getSeasonalPredictions(store: StoreData): SeasonalPrediction[] {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11

  const predictions: SeasonalPrediction[] = [];

  // 1. Back to School (August - September)
  if (currentMonth === 7 || currentMonth === 8) {
    const genericFallback = ['Milk Sachet Roll', 'Biscuit Packs', 'Sugar Packet'];
    const fromCatalog = matchStoreProducts(store, ['book', 'pen', 'pencil', 'biscuit', 'milk', 'sugar', 'snack', 'sweet']);
    predictions.push({
      periodName: 'Back-to-School Season',
      expectedTrend: 'increase',
      details: fromCatalog.length
        ? 'Stationery, snacks & drinks in your catalog typically see higher demand as school resumes.'
        : 'Stationery, snacks & drinks typically see higher demand as school resumes.',
      suggestedItems: fromCatalog.length ? fromCatalog : genericFallback,
      itemsFromYourCatalog: fromCatalog.length > 0,
    });
  }

  // 2. Holiday Festive (November - December)
  if (currentMonth === 10 || currentMonth === 11) {
    const genericFallback = ['Macaroni', 'Soft Drinks', 'Stout/Malt Drinks'];
    const fromCatalog = matchStoreProducts(store, ['macaroni', 'rice', 'stout', 'malt', 'wine', 'pepsi', 'drink', 'provision', 'spaghetti']);
    predictions.push({
      periodName: 'Christmas Festive Period',
      expectedTrend: 'increase',
      details: fromCatalog.length
        ? 'Provisions & drinks in your catalog typically see heavy demand for celebrations.'
        : 'Provisions & drinks typically see heavy demand for celebrations.',
      suggestedItems: fromCatalog.length ? fromCatalog : genericFallback,
      itemsFromYourCatalog: fromCatalog.length > 0,
    });
  }

  // 3. Easter/Spring (March - April)
  if (currentMonth === 2 || currentMonth === 3) {
    const genericFallback = ['Bottled/Sachet Water', 'Soft Drinks', 'Packaged Snacks'];
    const fromCatalog = matchStoreProducts(store, ['mineral', 'water', 'juice', 'pack', 'drink', 'snack']);
    predictions.push({
      periodName: 'Easter Festive Season',
      expectedTrend: 'increase',
      details: fromCatalog.length
        ? 'Groceries & drinks in your catalog typically see higher traffic this holiday weekend.'
        : 'Groceries & drinks typically see higher traffic this holiday weekend.',
      suggestedItems: fromCatalog.length ? fromCatalog : genericFallback,
      itemsFromYourCatalog: fromCatalog.length > 0,
    });
  }

  // Fallback default predictions — outside of any specific season window
  if (predictions.length === 0) {
    predictions.push({
      periodName: 'No Specific Seasonal Pattern Right Now',
      expectedTrend: 'stable',
      details: 'Focus on locked-in supplier contracts for stable margins.',
      suggestedItems: [],
      itemsFromYourCatalog: false,
    });
  }

  return predictions;
}

// ─── Seasonal Climate Insights ─────────────────────────────────────────────
// NOTE: There is no live weather API integrated into StoreFlow. This used to
// take a manually-picked "hot/rainy/cold" condition and return fabricated
// precise percentages (e.g. "25-30% increase") that were never actually
// measured from any data. Instead, this now derives a general seasonal
// expectation from Nigeria's known climate calendar (dry/Harmattan roughly
// Nov-Feb, hot dry season Mar-Apr, rainy season May-Oct) and is honest about
// being a general seasonal pattern rather than a live weather reading.
export interface WeatherInsight {
  weatherCondition: string;
  effect: string;
  suggestedAction: string;
}

export function getWeatherInsights(store: StoreData): WeatherInsight {
  const month = new Date().getMonth(); // 0-11

  if (month === 10 || month === 11 || month === 0 || month === 1) {
    // Nov–Feb: Harmattan / cool dry season
    return {
      weatherCondition: 'Harmattan Season (Nov–Feb)',
      effect: 'Cold, dusty air typically increases demand for hot drinks & skincare.',
      suggestedAction: 'Stock more Milo/Nescafé, tea & moisturizers.'
    };
  } else if (month === 2 || month === 3) {
    // Mar–Apr: hot dry season
    return {
      weatherCondition: 'Hot Dry Season (Mar–Apr)',
      effect: 'Rising heat typically increases demand for cold drinks.',
      suggestedAction: 'Keep coolers stocked and ice supply reliable.'
    };
  } else {
    // May–Oct: rainy season
    return {
      weatherCondition: 'Rainy Season (May–Oct)',
      effect: 'Rain can reduce foot traffic; pantry staples tend to hold steady.',
      suggestedAction: 'Offer WhatsApp/phone ordering with delivery.'
    };
  }
}

// ─── Smart Discounts ──────────────────────────────────────────────────────────
export interface DiscountRecommendation {
  productName: string;
  productId: string;
  stockQty: number;
  costPrice: number;
  sellingPrice: number;
  suggestedDiscountPct: number;
  daysDeadStock: number;
  marginImpact: string;
}

export function getSmartDiscounts(store: StoreData): DiscountRecommendation[] {
  const recs: DiscountRecommendation[] = [];
  const now = new Date();

  // Find products that have been in stock for over 14 days with no sales and have quantity > 5
  const last14DaysSales = store.sales.filter(s => (now.getTime() - new Date(s.date).getTime()) < 14 * 86400000);
  const soldIds = new Set(last14DaysSales.map(s => s.productId));

  store.products.filter(p => !p.discontinued).forEach(p => {
    if (!soldIds.has(p.id) && p.quantity > 5 && p.costPrice > 0) {
      const markup = productMarkup(p);
      if (markup > 0.15) {
        // Discount depth scales with how much room is actually available — never
        // suggest cutting into cost price, and never a token 10% regardless of
        // the product. Half the markup, taken off the selling price, always
        // lands above cost.
        const maxSafeDiscountPct = Math.floor(markup * 100 * 0.5);
        const suggestedDiscountPct = Math.max(5, Math.min(25, maxSafeDiscountPct));
        const daysDeadStock = p.addedAt ? Math.floor((now.getTime() - new Date(p.addedAt).getTime()) / 86400000) : 14;
        recs.push({
          productName: p.name,
          productId: p.id,
          stockQty: p.quantity,
          costPrice: p.costPrice,
          sellingPrice: p.sellingPrice,
          suggestedDiscountPct,
          daysDeadStock,
          marginImpact: `Reduces markup from ${Math.round(markup * 100)}% to ${Math.round((markup * 100) - suggestedDiscountPct)}%, while staying above cost price.`
        });
      }
    }
  });

  return recs.slice(0, 3);
}

// ─── Customer Repayment Insights ──────────────────────────────────────────────
export interface CustomerRepaymentInsight {
  customerKey: string;
  customerName: string;
  customerPhone?: string;
  totalDebts: number;           // number of pending records (all-time)
  completedDebts: number;       // fully paid records
  activeDebts: number;          // still pending
  avgDebtSize: number;          // average total per debt (₦)
  largestDebt: number;
  avgDaysToClear: number | null;      // avg days from createdAt → last payment (only for cleared)
  avgDaysBetweenPayments: number | null; // cadence across all events
  onTimeRate: number | null;     // % of cleared debts paid on/before dueDate (null if no due dates)
  reliabilityScore: number;      // 0-100 composite
  currentBalance: number;        // outstanding balance right now
  lastPaymentDate?: string;      // ISO of latest event
  predictedNextPaymentDate?: string; // ISO — only if activeDebts > 0
  predictedFullClearDate?: string;   // ISO — only if activeDebts > 0
  sampleSize: number;            // total payment events used
}

export interface RepaymentInsightsSummary {
  customers: CustomerRepaymentInsight[];
  overallAvgDaysToClear: number | null;
  overallAvgDebtSize: number;
  overallReliability: number;
  mostReliable?: CustomerRepaymentInsight;
  riskiest?: CustomerRepaymentInsight;
}

export function getRepaymentInsights(store: StoreData): RepaymentInsightsSummary {
  const all = store.pendingPayments || [];
  const groups = new Map<string, typeof all>();
  all.forEach(p => {
    // Group by phone number when available — it's a much more reliable
    // unique identifier than name. Grouping by name alone (the previous
    // behavior) meant two different customers who happen to share a common
    // first name (e.g. two different "John"s) would have their debt
    // histories silently merged into one — corrupting both people's
    // reliability scores and payment predictions. Falls back to name only
    // when no phone number was ever recorded for that debt.
    const normalizedPhone = p.customerPhone?.replace(/[^0-9]/g, '');
    const key = normalizedPhone || (p.customerName || 'unknown').trim().toLowerCase();
    if (!key) return;
    const arr = groups.get(key) || [];
    arr.push(p);
    groups.set(key, arr);
  });

  const customers: CustomerRepaymentInsight[] = [];

  groups.forEach((records, key) => {
    const name = records[0].customerName;
    const phone = records.find(r => r.customerPhone)?.customerPhone;
    const completed = records.filter(r => r.status === 'paid');
    const active = records.filter(r => r.status === 'pending');

    const totalOfDebts = records.reduce((s, r) => s + r.total, 0);
    const avgDebtSize = totalOfDebts / records.length;
    const largestDebt = Math.max(...records.map(r => r.total));

    // Days-to-clear per completed debt
    const clearDurations: number[] = [];
    completed.forEach(r => {
      const events = (r.events || []).filter(e => e.amount > 0);
      if (events.length === 0) return;
      const created = new Date(r.createdAt).getTime();
      const last = Math.max(...events.map(e => new Date(e.date).getTime()));
      const days = Math.max(0, (last - created) / 86400000);
      clearDurations.push(days);
    });
    const avgDaysToClear = clearDurations.length
      ? Math.round((clearDurations.reduce((s, x) => s + x, 0) / clearDurations.length) * 10) / 10
      : null;

    // Cadence between successive events (across all records)
    const eventTimes: number[] = [];
    records.forEach(r => {
      (r.events || []).forEach(e => eventTimes.push(new Date(e.date).getTime()));
      eventTimes.push(new Date(r.createdAt).getTime()); // treat debt origination as anchor
    });
    eventTimes.sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < eventTimes.length; i++) {
      const g = (eventTimes[i] - eventTimes[i - 1]) / 86400000;
      if (g > 0.01) gaps.push(g);
    }
    const avgDaysBetweenPayments = gaps.length
      ? Math.round((gaps.reduce((s, x) => s + x, 0) / gaps.length) * 10) / 10
      : null;

    // On-time rate on cleared debts with dueDate
    const withDue = completed.filter(r => r.dueDate);
    const onTime = withDue.filter(r => {
      const events = (r.events || []).filter(e => e.amount > 0);
      if (!events.length) return false;
      const last = Math.max(...events.map(e => new Date(e.date).getTime()));
      return last <= new Date(r.dueDate!).getTime();
    });
    const onTimeRate = withDue.length ? Math.round((onTime.length / withDue.length) * 100) : null;

    // Currently outstanding
    const currentBalance = active.reduce((s, r) => s + r.balance, 0);

    // Last payment date across everything
    const allEvents = records.flatMap(r => r.events || []).filter(e => e.amount > 0);
    const lastPaymentDate = allEvents.length
      ? new Date(Math.max(...allEvents.map(e => new Date(e.date).getTime()))).toISOString()
      : undefined;

    // Predict next payment
    let predictedNextPaymentDate: string | undefined;
    let predictedFullClearDate: string | undefined;
    if (active.length > 0 && avgDaysBetweenPayments) {
      const anchorTime = lastPaymentDate
        ? new Date(lastPaymentDate).getTime()
        : Math.max(...active.map(r => new Date(r.createdAt).getTime()));
      const next = anchorTime + avgDaysBetweenPayments * 86400000;
      predictedNextPaymentDate = new Date(Math.max(next, Date.now() - 86400000)).toISOString();

      // Estimate installment size from historical events
      const avgInstallment = allEvents.length
        ? allEvents.reduce((s, e) => s + e.amount, 0) / allEvents.length
        : currentBalance;
      const installmentsNeeded = avgInstallment > 0 ? Math.ceil(currentBalance / avgInstallment) : 1;
      const clearTime = anchorTime + installmentsNeeded * avgDaysBetweenPayments * 86400000;
      predictedFullClearDate = new Date(clearTime).toISOString();
    }

    // Reliability composite (0-100)
    //   recovery ratio (60%) + on-time (25%) + completion ratio (15%)
    const paidSum = allEvents.reduce((s, e) => s + e.amount, 0);
    const originated = records.reduce((s, r) => s + r.total, 0);
    const recovery = originated > 0 ? paidSum / originated : 0;
    const completion = records.length > 0 ? completed.length / records.length : 0;
    const onTimeNorm = onTimeRate === null ? 0.6 : onTimeRate / 100;
    const reliabilityScore = Math.round((recovery * 0.6 + onTimeNorm * 0.25 + completion * 0.15) * 100);

    customers.push({
      customerKey: key,
      customerName: name,
      customerPhone: phone,
      totalDebts: records.length,
      completedDebts: completed.length,
      activeDebts: active.length,
      avgDebtSize: Math.round(avgDebtSize),
      largestDebt,
      avgDaysToClear,
      avgDaysBetweenPayments,
      onTimeRate,
      reliabilityScore,
      currentBalance,
      lastPaymentDate,
      predictedNextPaymentDate,
      predictedFullClearDate,
      sampleSize: allEvents.length,
    });
  });

  // Sort: active first (highest balance), then by reliability
  customers.sort((a, b) => {
    if ((b.activeDebts > 0 ? 1 : 0) !== (a.activeDebts > 0 ? 1 : 0)) {
      return (b.activeDebts > 0 ? 1 : 0) - (a.activeDebts > 0 ? 1 : 0);
    }
    return b.currentBalance - a.currentBalance;
  });

  const clearDurationsAll: number[] = [];
  customers.forEach(c => { if (c.avgDaysToClear !== null) clearDurationsAll.push(c.avgDaysToClear); });
  const overallAvgDaysToClear = clearDurationsAll.length
    ? Math.round((clearDurationsAll.reduce((s, x) => s + x, 0) / clearDurationsAll.length) * 10) / 10
    : null;
  const overallAvgDebtSize = customers.length
    ? Math.round(customers.reduce((s, c) => s + c.avgDebtSize, 0) / customers.length)
    : 0;
  const overallReliability = customers.length
    ? Math.round(customers.reduce((s, c) => s + c.reliabilityScore, 0) / customers.length)
    : 0;

  const withHistory = customers.filter(c => c.sampleSize >= 2);
  const mostReliable = withHistory.length
    ? [...withHistory].sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0]
    : undefined;
  const riskiest = withHistory.length
    ? [...withHistory].sort((a, b) => a.reliabilityScore - b.reliabilityScore)[0]
    : undefined;

  return { customers, overallAvgDaysToClear, overallAvgDebtSize, overallReliability, mostReliable, riskiest };
}

// ─── Debt & Recurring Bill Reminders ────────────────────────────────────────
// Two independent sources feed into the same reminder stream:
//  1. Recurring bills the merchant set up themselves (rent, subscriptions)
//     with a nextDueDate that auto-advances once marked paid.
//  2. Loans/debts already tracked in ROI Tracker that have a dueDate set.
// Both start reminding 3 days before due, keep reminding at most once a
// day if it slips past due (so it doesn't get buried and forgotten), and
// go quiet again once paid/repaid.
function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function dueLabel(days: number): string {
  if (days > 0) return `due in ${days} day${days === 1 ? '' : 's'}`;
  if (days === 0) return 'due today';
  return `overdue by ${-days} day${-days === 1 ? '' : 's'}`;
}

export function checkDebtExpenseReminders(store: StoreData): StoreData | null {
  let changed = false;
  const newNotifications: FlowNotification[] = [];
  const now = new Date().toISOString();

  const remindedToday = (last?: string) => !!last && (Date.now() - new Date(last).getTime() < 86400000);

  const bills = (store.recurringBills || []).map(bill => {
    if (!bill.active) return bill;
    const days = daysUntil(bill.nextDueDate);
    if (days > 3 || remindedToday(bill.lastReminderDate)) return bill;
    changed = true;
    newNotifications.push({
      id: `bill-${bill.id}-${bill.nextDueDate}`,
      icon: '💸',
      text: `${bill.label} is ${dueLabel(days)} — ₦${bill.amount.toLocaleString()}`,
      tone: days < 0 ? 'danger' : days === 0 ? 'warning' : 'info',
      date: now,
      read: false,
      title: 'Bill Reminder',
      description: `${bill.label} (₦${bill.amount.toLocaleString()}) is ${dueLabel(days)}. Mark it paid from Expenses once settled.`,
      actionLabel: 'View Expenses',
      actionTab: 'expenses',
    });
    return { ...bill, lastReminderDate: now };
  });

  const loans = (store.loans || []).map(loan => {
    if (loan.status !== 'active' || !loan.dueDate) return loan;
    const days = daysUntil(loan.dueDate);
    if (days > 3 || remindedToday(loan.lastReminderDate)) return loan;
    changed = true;
    newNotifications.push({
      id: `loan-${loan.id}-${loan.dueDate}`,
      icon: '🏦',
      text: `Loan repayment to ${loan.source} is ${dueLabel(days)} — ₦${loan.amount.toLocaleString()} remaining`,
      tone: days < 0 ? 'danger' : days === 0 ? 'warning' : 'info',
      date: now,
      read: false,
      title: 'Loan Repayment Reminder',
      description: `₦${loan.amount.toLocaleString()} owed to ${loan.source} is ${dueLabel(days)}.`,
      actionLabel: 'View Loans',
      actionTab: 'roi',
    });
    return { ...loan, lastReminderDate: now };
  });

  if (!changed) return null;

  return {
    ...store,
    recurringBills: bills,
    loans,
    flowNotifications: [...newNotifications, ...(store.flowNotifications || [])],
  };
}


// ─── Weekly Recap ──────────────────────────────────────────────────────────
// A short "how last week went" summary — gated behind Settings > Flow >
// Weekly Recaps, since it was previously a toggle with nothing behind it.
export interface WeeklyRecap {
  weekLabel: string;
  revenue: number;
  profit: number;
  salesCount: number;
  revenuePctVsPrevWeek: number | null;
  bestSeller: string | null;
}

export function generateWeeklyRecap(store: StoreData): WeeklyRecap | null {
  if (store.sales.length === 0) return null;

  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek - 7); // start of last full week (Sun-Sat)
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(weekStart.getDate() - 7);

  const lastWeekSales = store.sales.filter(s => {
    const d = new Date(s.date);
    return d >= weekStart && d < weekEnd;
  });
  if (lastWeekSales.length === 0) return null;

  const prevWeekSales = store.sales.filter(s => {
    const d = new Date(s.date);
    return d >= prevWeekStart && d < weekStart;
  });

  const revenue = lastWeekSales.reduce((sum, s) => sum + s.total, 0);
  const profit = lastWeekSales.reduce((sum, s) => sum + s.profit, 0);
  const prevRevenue = prevWeekSales.reduce((sum, s) => sum + s.total, 0);
  const revenuePctVsPrevWeek = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;

  const tally = new Map<string, number>();
  lastWeekSales.forEach(s => tally.set(s.productName, (tally.get(s.productName) || 0) + s.quantity));
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    weekLabel: `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${new Date(weekEnd.getTime() - 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
    revenue,
    profit,
    salesCount: lastWeekSales.length,
    revenuePctVsPrevWeek,
    bestSeller: best ? best[0] : null,
  };
}

// ─── Advice Feedback ────────────────────────────────────────────────────────
// generateAdvice() already re-evaluates live off current data every call, so
// a resolved problem naturally stops producing its card — no caching to go
// stale. What was missing: a way to say "I saw this, not useful for me"
// for something that's still technically true (e.g. the merchant knows
// about the underpriced item and has chosen not to change it). Dismissals
// expire after 14 days so a real Auto Fix or manual change elsewhere isn't
// the only way a suppressed card can come back.
const DISMISS_KEY = 'storeflow_dismissed_advice';
const DISMISS_DAYS = 14;

function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function dismissAdvice(id: string) {
  const map = readDismissed();
  map[id] = new Date().toISOString();
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(map)); } catch {}
}

export function markAdviceHelpful(id: string) {
  // Helpful feedback doesn't need to change future output — the card was
  // already correct — but recording it keeps a signal available for future
  // tuning without pretending there's a learning model doing something with
  // it today.
  try {
    const key = 'storeflow_advice_helpful_count';
    const n = Number(localStorage.getItem(key) || '0');
    localStorage.setItem(key, String(n + 1));
  } catch {}
}

export function filterDismissedAdvice(cards: AdviceCard[]): AdviceCard[] {
  const dismissed = readDismissed();
  const cutoff = Date.now() - DISMISS_DAYS * 86400000;
  return cards.filter(c => {
    const at = dismissed[c.id];
    if (!at) return true;
    return new Date(at).getTime() < cutoff;
  });
}

// ─── Product Intelligence ───────────────────────────────────────────────────
export interface ProductIntelligence {
  product: Product;
  currentStock: number;
  qtySoldLast30: number;
  qtySoldAllTime: number;
  revenueLast30: number;
  revenueAllTime: number;
  profitAllTime: number;
  restockCount: number;
  trendPct: number | null; // this 14d window vs previous 14d window, by units
  trendDirection: 'up' | 'down' | 'flat' | 'unknown';
  recommendations: string[]; // short, reuses pricingAlerts/inventoryIntelligence for just this product
  priceChangeEffects: string[]; // one line per priceHistory entry describing before/after velocity
}

export function getProductIntelligence(store: StoreData, productId: string): ProductIntelligence | null {
  const product = store.products.find(p => p.id === productId);
  if (!product) return null;

  const sales = store.sales.filter(s => s.productId === productId);
  const last30 = sales.filter(s => new Date(s.date) >= daysAgo(29));
  const qtySoldLast30 = last30.reduce((s, x) => s + x.quantity, 0);
  const qtySoldAllTime = sales.reduce((s, x) => s + x.quantity, 0);
  const revenueLast30 = last30.reduce((s, x) => s + (x.total || 0), 0);
  const revenueAllTime = product.total_revenue ?? sales.reduce((s, x) => s + (x.total || 0), 0);
  const profitAllTime = product.total_profit ?? 0;

  // 14d vs previous 14d, by units — simple, readable trend signal.
  const win = sales.filter(s => new Date(s.date) >= daysAgo(13));
  const prevWin = sales.filter(s => new Date(s.date) >= daysAgo(27) && new Date(s.date) < daysAgo(13));
  const winQty = win.reduce((s, x) => s + x.quantity, 0);
  const prevQty = prevWin.reduce((s, x) => s + x.quantity, 0);
  let trendPct: number | null = null;
  let trendDirection: ProductIntelligence['trendDirection'] = 'unknown';
  if (prevQty > 0) {
    trendPct = ((winQty - prevQty) / prevQty) * 100;
    trendDirection = trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'flat';
  } else if (winQty > 0) {
    trendDirection = 'up';
  }

  // Recommendations — same engines as the Advice tab, filtered to this product.
  const recommendations: string[] = [];
  const priceAlert = pricingAlerts(store).find(a => a.product.id === productId);
  if (priceAlert) {
    recommendations.push(`Underpriced — only ${(priceAlert.currentMarkup * 100).toFixed(0)}% on top of cost. Try ₦${priceAlert.suggestedPrice.toLocaleString()}.`);
  }
  const stockEntry = inventoryIntelligence(store).find(f => f.product.id === productId);
  if (stockEntry) {
    recommendations.push(stockEntry.product.quantity === 0
      ? 'Out of stock — restock to recover lost sales.'
      : `${stockCoverLabel(stockEntry)} — order ${stockEntry.restockQty} units.`);
  }
  if (product.reorderLevel != null && product.quantity <= product.reorderLevel) {
    recommendations.push(`At or below its reorder level (${product.reorderLevel}).`);
  }
  if (recommendations.length === 0) {
    recommendations.push(qtySoldLast30 === 0 ? 'No sales in 30 days — consider a promotion or discontinuing it.' : "No issues found — this product's doing fine.");
  }

  // Price change effects — for each recorded price change, compare average
  // daily units sold in the 14 days before vs after that date.
  const priceChangeEffects: string[] = [];
  const history = (product.priceHistory || []).slice(-3); // last 3 changes is plenty for a chat answer
  history.forEach(entry => {
    const changeDate = new Date(entry.date);
    const before = sales.filter(s => new Date(s.date) >= new Date(changeDate.getTime() - 14 * 86400000) && new Date(s.date) < changeDate);
    const after = sales.filter(s => new Date(s.date) >= changeDate && new Date(s.date) < new Date(changeDate.getTime() + 14 * 86400000));
    const beforeAvg = before.reduce((s, x) => s + x.quantity, 0) / 14;
    const afterAvg = after.reduce((s, x) => s + x.quantity, 0) / 14;
    if (before.length === 0 && after.length === 0) return;
    if (beforeAvg === 0 && afterAvg === 0) return;
    const pct = beforeAvg > 0 ? ((afterAvg - beforeAvg) / beforeAvg) * 100 : null;
    const dateStr = changeDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
    if (pct === null) {
      priceChangeEffects.push(`Cost updated to ₦${entry.costPrice.toLocaleString()} on ${dateStr} — not enough sales before that date to compare.`);
    } else {
      priceChangeEffects.push(`After the ${dateStr} price change, daily sales ${pct >= 0 ? 'rose' : 'dropped'} ${Math.abs(pct).toFixed(0)}%.`);
    }
  });

  return {
    product,
    currentStock: product.quantity,
    qtySoldLast30,
    qtySoldAllTime,
    revenueLast30,
    revenueAllTime,
    profitAllTime,
    restockCount: product.restock_count || 0,
    trendPct,
    trendDirection,
    recommendations,
    priceChangeEffects,
  };
}

// Finds a product by loose name match — used by chat lookups like
// "how is Indomie performing", where the user won't type the exact name.
export function findProductByName(store: StoreData, query: string): Product | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const active = store.products.filter(p => !p.discontinued);
  const exact = active.find(p => p.name.toLowerCase() === q);
  if (exact) return exact;
  const starts = active.find(p => p.name.toLowerCase().startsWith(q) || q.startsWith(p.name.toLowerCase()));
  if (starts) return starts;
  const contains = active.filter(p => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()));
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) {
    // Prefer the one whose name is closest in length to the query — cheap
    // proxy for "most specific match" without pulling in a fuzzy-match lib.
    return contains.sort((a, b) => Math.abs(a.name.length - q.length) - Math.abs(b.name.length - q.length))[0];
  }
  return null;
}
