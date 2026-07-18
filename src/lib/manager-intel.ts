import { StoreData, Product, FlowNotification } from '@/types/store';
import { getLowStockThreshold } from '@/lib/settings';
import { getPendingSummary } from '@/lib/store-data';

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
  revenue: number; profit: number; expenses: number; salesCount: number;
}

export function dailySeries(store: StoreData, days: number): DailyPoint[] {
  const today = startOfDay(new Date());
  const buckets: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    buckets.push({ ts: d.getTime(), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), revenue: 0, profit: 0, expenses: 0, salesCount: 0 });
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
    if (b) b.expenses += e.amount;
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
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0, totSS = 0;
  xs.forEach((x, i) => { num += (x - meanX) * (values[i] - meanY); den += (x - meanX) ** 2; });
  const slope = den ? num / den : 0;
  const intercept = meanY - slope * meanX;
  values.forEach(y => { totSS += (y - meanY) ** 2; });
  let resSS = 0;
  values.forEach((y, i) => { const yh = slope * i + intercept; resSS += (y - yh) ** 2; });
  const r2 = totSS ? Math.max(0, 1 - resSS / totSS) : 0;
  return { slope, intercept, r2 };
}

// ─── Forecast ─────────────────────────────────────────────────────────────────
export interface Forecast {
  horizonDays: number;
  label: string;
  expectedRevenue: number;
  expectedProfit: number;
  expectedExpenses: number;
  confidencePct: number;
  confidence: 'High' | 'Medium' | 'Low';
}

export function forecastHorizon(store: StoreData, horizonDays: number): Forecast {
  const series = dailySeries(store, 30);
  const rev = linReg(series.map(s => s.revenue));
  const prof = linReg(series.map(s => s.profit));
  const exp = linReg(series.map(s => s.expenses));
  let expectedRevenue = 0, expectedProfit = 0, expectedExpenses = 0;
  for (let i = 30; i < 30 + horizonDays; i++) {
    expectedRevenue += Math.max(0, rev.slope * i + rev.intercept);
    expectedProfit += Math.max(0, prof.slope * i + prof.intercept);
    expectedExpenses += Math.max(0, exp.slope * i + exp.intercept);
  }
  const avgR2 = (rev.r2 + prof.r2 + exp.r2) / 3;
  const totalSales = store.sales.length;
  let confidence: Forecast['confidence'] = 'Low';
  let confidencePct = 55;
  if (totalSales >= 30 && avgR2 > 0.5) { confidence = 'High'; confidencePct = 80 + Math.round(avgR2 * 15); }
  else if (totalSales >= 10 && avgR2 > 0.25) { confidence = 'Medium'; confidencePct = 65 + Math.round(avgR2 * 20); }
  const horizonLabel: Record<number, string> = { 1: 'Tomorrow', 7: '7 Days', 14: '14 Days', 30: '1 Month', 90: '3 Months', 180: '6 Months', 365: '1 Year' };
  return { horizonDays, label: horizonLabel[horizonDays] ?? `${horizonDays}d`, expectedRevenue, expectedProfit, expectedExpenses, confidencePct: Math.min(95, confidencePct), confidence };
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
  const threshold = getLowStockThreshold();
  const activeProducts = store.products.filter(p => !p.discontinued);
  const total = activeProducts.length || 1;
  const healthy = activeProducts.filter(p => p.quantity > threshold).length;
  const inventoryScore = Math.round((healthy / total) * 100);
  const invDetail = `${healthy}/${total} products well-stocked`;

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
  neverSold: { name: string; daysInStock: number }[];
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
      if (daysInStock > 7) neverSold.push({ name: p.name, daysInStock });
    } else {
      const qty = tally.get(p.id)?.qty || 0;
      if (qty < 3) slowMovers.push({ name: p.name, qty, daysInStock });
    }
  });

  // Co-purchases: find product pairs in same-day sales
  const byDay = new Map<string, string[]>();
  last30.forEach(s => {
    const day = s.date.split('T')[0];
    const arr = byDay.get(day) || [];
    arr.push(s.productName);
    byDay.set(day, arr);
  });
  const pairCount = new Map<string, number>();
  byDay.forEach(names => {
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const key = [names[i], names[j]].sort().join('|||');
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
  daysLeft: number;
  restockQty: number;
  urgency: 'critical' | 'soon' | 'ok';
}

export function inventoryIntelligence(store: StoreData): StockForecast[] {
  const threshold = getLowStockThreshold();
  return store.products
    .filter(p => !p.discontinued)
    .map(p => {
      const sold14 = store.sales
        .filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(13))
        .reduce((sum, s) => sum + s.quantity, 0);
      const perDay = sold14 / 14;
      const daysLeft = p.quantity === 0 ? 0 : (perDay > 0 ? Math.floor(p.quantity / perDay) : Infinity);
      // Recommend 14-day supply + 20% buffer, default to 10 if no sales history
      const restockQty = perDay > 0 ? Math.ceil(perDay * 14 * 1.2) : 10;
      
      let urgency: StockForecast['urgency'] = 'ok';
      if (p.quantity === 0) {
        urgency = 'critical';
      } else if (daysLeft <= 3 || p.quantity <= Math.max(1, Math.floor(threshold / 2))) {
        urgency = 'critical';
      } else if (daysLeft <= 7 || p.quantity <= threshold) {
        urgency = 'soon';
      }
      
      return { product: p, perDay, daysLeft, restockQty, urgency };
    })
    .filter(f => f.urgency !== 'ok')
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ─── Expense Analysis ─────────────────────────────────────────────────────────
export interface ExpenseAnalysis {
  byCat: { category: string; total: number; count: number; pct: number; trend: 'up' | 'down' | 'flat' }[];
  totalLast30: number;
  totalPrev30: number;
  trendPct: number;
  largestCategory: string;
}

export function expenseAnalysis(store: StoreData): ExpenseAnalysis {
  const now = Date.now();
  const last30 = (store.expenses || []).filter(e => now - new Date(e.date).getTime() < 30 * 86400000);
  const prev30 = (store.expenses || []).filter(e => {
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
  currentMargin: number;
  suggestedPrice: number;
  expectedLift: number;
}

export function pricingAlerts(store: StoreData, targetMargin = 0.25): PricingAlert[] {
  return store.products
    .filter(p => p.costPrice > 0 && !p.discontinued)
    .map(p => {
      const margin = (p.sellingPrice - p.costPrice) / p.costPrice;
      const suggested = Math.round((p.costPrice * (1 + targetMargin)) / 10) * 10;
      const lift = suggested - p.sellingPrice;
      if (margin <= 0) return { product: p, type: 'zero_margin' as const, currentMargin: margin, suggestedPrice: suggested, expectedLift: lift };
      if (margin < targetMargin - 0.05) return { product: p, type: 'underpriced' as const, currentMargin: margin, suggestedPrice: suggested, expectedLift: lift };
      if (margin > 0.8) return { product: p, type: 'overpriced' as const, currentMargin: margin, suggestedPrice: Math.round(p.costPrice * 1.4 / 10) * 10, expectedLift: 0 };
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
}

export function generateAdvice(store: StoreData): AdviceCard[] {
  const advice: AdviceCard[] = [];
  const h = healthScore(store);
  const stock = inventoryIntelligence(store);
  const ea = expenseAnalysis(store);
  const analysis = analyzeSales(store);
  const pending = getPendingSummary(store);
  const series7 = dailySeries(store, 7);
  const rev7 = series7.reduce((s, d) => s + d.revenue, 0);

  // Critical: running out of fast sellers or completely out of stock
  if (!isStoreOnboarding(store)) {
    stock.filter(f => f.urgency === 'critical').slice(0, 3).forEach(f => {
      const isOut = f.product.quantity === 0;
      advice.push({ 
        id: `cr-${f.product.id}`, 
        icon: '🚨', 
        title: isOut ? `Restock ${f.product.name} (Sold Out)` : `Restock ${f.product.name} NOW`, 
        detail: isOut
          ? `Out of Stock: ${f.product.name} is completely sold out. Restock at least ${f.restockQty} units immediately to recover lost revenue.`
          : `Only ${f.daysLeft} day${f.daysLeft === 1 ? '' : 's'} of stock left. Order at least ${f.restockQty} units.`, 
        priority: 'critical' 
      });
    });
  }

  // Critical: no sales this week
  if (!isStoreOnboarding(store) && rev7 === 0 && store.products.length > 0) {
    advice.push({ id: 'no-sales', icon: '⚠️', title: 'No sales recorded this week', detail: 'Record sales to unlock predictions and keep your store health score accurate.', priority: 'critical' });
  }

  // High: large outstanding debts
  if (pending.totalOwed > rev7 * 0.3) {
    advice.push({ id: 'debt', icon: '💳', title: 'Chase outstanding payments', detail: `₦${pending.totalOwed.toLocaleString()} owed. ${pending.overdue.length} customers are overdue. Collect this to improve cash flow.`, priority: 'high' });
  }

  // High: soaring expenses
  if (ea.trendPct > 20 && ea.totalLast30 > 0) {
    advice.push({ id: 'exp-rise', icon: '🧾', title: `${ea.largestCategory} spending up ${ea.trendPct.toFixed(0)}%`, detail: `Your ${ea.largestCategory.toLowerCase()} expenses grew significantly this month. Review and cut where possible.`, priority: 'high' });
  }

  // High: underpriced products
  const alerts = pricingAlerts(store);
  const underpriced = alerts.filter(a => a.type === 'underpriced').slice(0, 1);
  underpriced.forEach(a => {
    advice.push({ id: `price-${a.product.id}`, icon: '📈', title: `Raise price on ${a.product.name}`, detail: `Current margin: ${(a.currentMargin * 100).toFixed(0)}%. Suggest ₦${a.suggestedPrice.toLocaleString()} — adds ₦${a.expectedLift.toLocaleString()} per unit.`, priority: 'high' });
  });

  // Medium: restock soon
  if (!isStoreOnboarding(store)) {
    stock.filter(f => f.urgency === 'soon').slice(0, 2).forEach(f => {
      advice.push({ id: `soon-${f.product.id}`, icon: '📦', title: `Order ${f.product.name} this week`, detail: `About ${f.daysLeft} days of stock left. Restock ${f.restockQty} units to avoid a gap.`, priority: 'medium' });
    });
  }

  // Medium: co-purchase opportunity
  if (analysis.coPurchases.length > 0) {
    const cp = analysis.coPurchases[0];
    advice.push({ id: 'copurchase', icon: '🛒', title: 'Bundle opportunity', detail: `Customers often buy ${cp.a} and ${cp.b} together (${cp.count}x). Stock them near each other and consider a combo deal.`, priority: 'medium' });
  }

  // Medium: never-sold products tying up capital
  if (analysis.neverSold.length >= 3) {
    advice.push({ id: 'dead-stock', icon: '😴', title: `${analysis.neverSold.length} products never sold`, detail: `${analysis.neverSold.slice(0, 2).map(p => p.name).join(', ')} and others have never sold. Consider discounting or replacing with faster movers.`, priority: 'medium' });
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

// ─── Notifications Generator ───────────────────────────────────────────────────
export function generateNotifications(store: StoreData): FlowNotification[] {
  if (isStoreOnboarding(store)) {
    return [];
  }
  const notes: FlowNotification[] = [];
  const now = new Date().toISOString();
  const stock = inventoryIntelligence(store);
  const analysis = analyzeSales(store);
  const ea = expenseAnalysis(store);
  const h = healthScore(store);
  const pending = getPendingSummary(store);

  stock.filter(f => f.urgency === 'critical').forEach(f => {
    notes.push({
      id: `low-${f.product.id}`,
      icon: '🚨',
      text: `${f.product.name} runs out in ${f.daysLeft} day${f.daysLeft === 1 ? '' : 's'}.`,
      tone: 'danger',
      date: now,
      read: false,
      title: 'Restock Alert (Critical)',
      description: `${f.product.name} runs out in ${f.daysLeft} day${f.daysLeft === 1 ? '' : 's'}.`,
      actionLabel: 'Go to Inventory',
      actionTab: 'inventory'
    });
  });
  stock.filter(f => f.urgency === 'soon').slice(0, 3).forEach(f => {
    notes.push({
      id: `soon-${f.product.id}`,
      icon: '📦',
      text: `${f.product.name} will need restocking in ${f.daysLeft} days.`,
      tone: 'warning',
      date: now,
      read: false,
      title: 'Restock Suggestion',
      description: `${f.product.name} will need restocking in ${f.daysLeft} days.`,
      actionLabel: 'Go to Inventory',
      actionTab: 'inventory'
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
}

export function generateInsights(store: StoreData, range: '7d' | '1m' | 'lifetime' = '7d'): Insight[] {
  const out: Insight[] = [];
  const days = range === '7d' ? 7 : range === '1m' ? 30 : 365;
  const cur = dailySeries(store, days);
  const prev = dailySeries(store, days * 2).slice(0, days);
  const curRev = cur.reduce((s, d) => s + d.revenue, 0);
  const prevRev = prev.reduce((s, d) => s + d.revenue, 0);
  if (prevRev > 0) {
    const pct = ((curRev - prevRev) / prevRev) * 100;
    if (Math.abs(pct) >= 1) {
      out.push({ id: 'rev', icon: pct >= 0 ? '📈' : '📉', text: `Revenue ${pct >= 0 ? 'increased' : 'decreased'} ${Math.abs(pct).toFixed(1)}% vs previous ${range === '7d' ? 'week' : range === '1m' ? 'month' : 'period'}`, tone: pct >= 0 ? 'success' : 'warning' });
    }
  } else if (curRev > 0) {
    out.push({ id: 'rev', icon: '📈', text: `Revenue is growing — keep going!`, tone: 'success' });
  }
  const threshold = getLowStockThreshold();
  const low = store.products.filter(p => !p.discontinued && p.quantity > 0 && p.quantity <= threshold);
  if (!isStoreOnboarding(store) && low.length > 0) {
    out.push({ id: 'low', icon: '⚠', text: `${low.length} product${low.length === 1 ? '' : 's'} need restocking`, tone: 'warning' });
  }
  const tally = new Map<string, number>();
  store.sales.forEach(s => tally.set(s.productName, (tally.get(s.productName) || 0) + s.quantity));
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) out.push({ id: 'best', icon: '⭐', text: `${best[0]} is your best seller`, tone: 'info' });
  if (curRev > 0) {
    const savable = Math.round(curRev * 0.05 / 100) * 100;
    if (savable >= 500) out.push({ id: 'save', icon: '💰', text: `Save ₦${savable.toLocaleString()} this ${range === '7d' ? 'week' : 'period'}`, tone: 'info' });
  }
  const ea = expenseAnalysis(store);
  if (ea.trendPct > 20) {
    out.push({ id: 'exp', icon: '🧾', text: `Expenses rose ${ea.trendPct.toFixed(0)}% this month. Largest: ${ea.largestCategory}`, tone: 'warning' });
  }
  const rent = rentAnalysis(store);
  if (rent && rent.affordabilityPct > 30) {
    out.push({ id: 'rent', icon: '🏠', text: `Rent is ${rent.affordabilityPct}% of monthly revenue — high. Consider growing sales.`, tone: rent.affordabilityPct > 50 ? 'danger' : 'warning' });
  }
  return out.slice(0, 6);
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
    const margin = (p.sellingPrice - p.costPrice) / p.costPrice;
    const sold = store.sales.filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(6)).reduce((sum, s) => sum + s.quantity, 0);
    if (margin > 0 && margin < 0.2 && sold >= 5) {
      const suggested = Math.round((p.costPrice * 1.3) / 10) * 10;
      const lift = suggested - p.sellingPrice;
      if (lift >= 10) recs.push({ id: `p-${p.id}`, icon: '📈', title: 'Price Opportunity', detail: `Increase ${p.name} by ₦${lift.toLocaleString()} for a better margin`, tone: 'info', action: 'price', productId: p.id });
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
  const exp7 = last7.reduce((s, d) => s + d.expenses, 0);
  
  const outOfStock = store.products.filter(p => !p.discontinued && p.quantity === 0);
  const threshold = getLowStockThreshold();
  const lowStock = store.products.filter(p => !p.discontinued && p.quantity > 0 && p.quantity <= threshold);
  
  const ea = expenseAnalysis(store);
  
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
    text += `Customers owe your store **₦${pending.totalOwed.toLocaleString()}** across ${pending.pendingCount} pending payment(s). `;
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
    text += `${recsAdded + 1}. **Collect Overdue Debts:** Call or message the overdue customer(s) to recover ₦${pending.totalOwed.toLocaleString()}.\n`;
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
export interface OpportunityCard {
  title: string;
  description: string;
  impact: string;
  actionLabel: string;
}

export function getTopOpportunities(store: StoreData): OpportunityCard[] {
  const opps: OpportunityCard[] = [];
  
  // 1. High request volume items
  const reqs = topCustomerRequests(store, 2);
  reqs.forEach(r => {
    opps.push({
      title: `Stock Requested Item: ${r.text}`,
      description: `Customers requested this item ${r.count} times. Adding it to inventory can capture direct unmet demand.`,
      impact: "High Revenue Boost",
      actionLabel: "Add to Inventory"
    });
  });

  // 2. Fast sellers running low on stock
  const stock = inventoryIntelligence(store);
  const criticalRestocks = stock.filter(f => f.urgency === 'critical');
  if (criticalRestocks.length > 0) {
    const item = criticalRestocks[0];
    opps.push({
      title: `Restock Fast Mover: ${item.product.name}`,
      description: `Only ${item.daysLeft === Infinity ? 0 : item.daysLeft} days of stock remaining based on recent sales. Restock ${item.restockQty} units.`,
      impact: `₦${(item.product.sellingPrice * item.restockQty).toLocaleString()} Revenue`,
      actionLabel: "Order Stock"
    });
  }

  // 3. Reduce spending on dead stock
  const neverSold = analyzeSales(store).neverSold;
  if (neverSold.length > 0) {
    opps.push({
      title: `Reduce spending on ${neverSold[0].name}`,
      description: `This product has been in stock for ${neverSold[0].daysInStock} days with zero sales. Avoid bulk restocking this item.`,
      impact: "Free Up Working Capital",
      actionLabel: "Adjust Buying"
    });
  }

  // 4. Default opportunities if list is short
  if (opps.length < 3) {
    opps.push({
      title: "Set Up Branded Receipts",
      description: "Customize receipt headers, footer messages, and QR codes to drive customer loyalty and brand retention.",
      impact: "Brand Equity Grow",
      actionLabel: "Customize Receipts"
    });
    opps.push({
      title: "Expand to Game Services",
      description: "Launch snooker, PlayStation, or table tennis sessions during slow retail periods to optimize space utility.",
      impact: "₦15,000+ Extra Profit/wk",
      actionLabel: "Enable Game Services"
    });
  }

  return opps.slice(0, 4);
}

// ─── Profit Leak Detector ─────────────────────────────────────────────────────
export interface ProfitLeak {
  category: 'expense' | 'dead_stock' | 'unpaid_debt' | 'poor_margin' | 'stock_loss';
  title: string;
  description: string;
  amountLeak: number;
  recommendation: string;
}

export function getProfitLeaks(store: StoreData): ProfitLeak[] {
  const leaks: ProfitLeak[] = [];
  const now = new Date();
  
  // 1. Unpaid customer debts
  const pending = getPendingSummary(store);
  if (pending.totalOwed > 0) {
    leaks.push({
      category: 'unpaid_debt',
      title: 'Outstanding Customer Debts',
      description: `You have ₦${pending.totalOwed.toLocaleString()} tied up in unpaid invoices across ${pending.customerCount} customers.`,
      amountLeak: pending.totalOwed,
      recommendation: 'Send direct WhatsApp reminders to customers with overdue balances.'
    });
  }

  // 2. Dead stock tying up capital
  let deadStockValue = 0;
  const last30 = store.sales.filter(s => (now.getTime() - new Date(s.date).getTime()) < 30 * 86400000);
  const soldIds = new Set(last30.map(s => s.productId));
  store.products.filter(p => !p.discontinued).forEach(p => {
    if (!soldIds.has(p.id) && p.quantity > 0) {
      deadStockValue += p.costPrice * p.quantity;
    }
  });
  if (deadStockValue > 0) {
    leaks.push({
      category: 'dead_stock',
      title: 'Dormant Inventory Assets',
      description: `₦${deadStockValue.toLocaleString()} in working capital is locked in inventory items that haven't sold in 30 days.`,
      amountLeak: deadStockValue,
      recommendation: 'Initiate a clearance discount or bundle slow movers with fast-selling products.'
    });
  }

  // 3. Poor profit margins
  let thinMarginCount = 0;
  store.products.filter(p => !p.discontinued).forEach(p => {
    if (p.costPrice > 0) {
      const margin = (p.sellingPrice - p.costPrice) / p.costPrice;
      if (margin < 0.15) thinMarginCount++;
    }
  });
  if (thinMarginCount > 0) {
    leaks.push({
      category: 'poor_margin',
      title: `${thinMarginCount} Products with Low Margin`,
      description: 'Multiple items are priced too close to cost, eroding potential profits after overhead expenses.',
      amountLeak: thinMarginCount * 500, // estimated leak index
      recommendation: 'Review item price margins and adjust target margin markup to at least 25%.'
    });
  }

  // 4. Excessive expenses
  const series7 = dailySeries(store, 7);
  const rev7 = series7.reduce((s, d) => s + d.revenue, 0);
  const exp7 = series7.reduce((s, d) => s + d.expenses, 0);
  if (exp7 > rev7 * 0.40 && rev7 > 0) {
    leaks.push({
      category: 'expense',
      title: 'High Overhead-to-Sales Ratio',
      description: `Weekly operating expenses (₦${exp7.toLocaleString()}) consume ${Math.round(exp7 / rev7 * 100)}% of sales revenue.`,
      amountLeak: exp7 - (rev7 * 0.20),
      recommendation: 'Evaluate utilities, salaries, or transport costs and cap discretionary spending.'
    });
  }

  // 5. Stock losses from Audits
  const audits = store.stockCountAudits || [];
  const negativeVarianceTotal = audits
    .filter(a => a.variance < 0)
    .reduce((sum, a) => sum + Math.abs(a.variance), 0);
  if (negativeVarianceTotal > 0) {
    leaks.push({
      category: 'stock_loss',
      title: 'Recurring Physical Inventory Shrinkage',
      description: `${negativeVarianceTotal} units have been recorded as lost during stock counts.`,
      amountLeak: negativeVarianceTotal * 1000, // estimated cost
      recommendation: 'Audit cash registers regularly and limit staff edit permissions on products.'
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
}

export function getSeasonalPredictions(store: StoreData): SeasonalPrediction[] {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11
  
  const predictions: SeasonalPrediction[] = [];

  // 1. Back to School (August - September)
  if (currentMonth === 7 || currentMonth === 8) {
    predictions.push({
      periodName: 'Back-to-School Season',
      expectedTrend: 'increase',
      details: 'Stationery, notebooks, snacks, and beverage rolls experience higher local demand as school terms resume.',
      suggestedItems: ['Peak Milk Sachet Roll', 'Cabin Biscuit', 'Sugar Packet']
    });
  }

  // 2. Holiday Festive (November - December)
  if (currentMonth === 10 || currentMonth === 11) {
    predictions.push({
      periodName: 'Christmas Festive Period',
      expectedTrend: 'increase',
      details: 'Heavy demand on provisions, soft drinks (Minerals), alcoholic drinks, and bulk ingredients for celebrations.',
      suggestedItems: ['Macaroni', 'Rice Mango', 'Guinness Stout', 'Pepsi']
    });
  }

  // 3. Easter/Spring (March - April)
  if (currentMonth === 2 || currentMonth === 3) {
    predictions.push({
      periodName: 'Easter Festive Season',
      expectedTrend: 'increase',
      details: 'Higher local retail traffic for groceries, soft drinks, and packaged items during public holiday weekends.',
      suggestedItems: ['Mineral', 'Super Pack Carton', 'Viju Baked']
    });
  }

  // Fallback default predictions
  predictions.push({
    periodName: 'Mid-Year Supplier Adjustments',
    expectedTrend: 'stable',
    details: 'General wholesale prices tend to shift. Focus on locked-in supplier contracts for stable margins.',
    suggestedItems: ['Garri Mix', 'Palm Oil', 'Egg Crate']
  });

  return predictions;
}

// ─── Weather Impact Insights ──────────────────────────────────────────────────
export interface WeatherInsight {
  weatherCondition: string;
  effect: string;
  impactDetails: string;
  suggestedAction: string;
}

export function getWeatherInsights(store: StoreData, activeCondition: 'hot' | 'rainy' | 'cold'): WeatherInsight {
  if (activeCondition === 'hot') {
    return {
      weatherCondition: 'Sunny / Hot Weather ☀️',
      effect: 'Beverages and cold liquids demand increases by estimated 25-30%.',
      impactDetails: 'High temperature drives foot traffic to coolers. Sachet water, carbonated cans, and bottled juices turn over faster.',
      suggestedAction: 'Ensure drink coolers are active, restocked, and ice levels are maintained.'
    };
  } else if (activeCondition === 'rainy') {
    return {
      weatherCondition: 'Rainy Weather 🌧️',
      effect: 'Local store drop-ins decrease; indoor grocery items dominate.',
      impactDetails: 'Rain limits walking customers. Delivery, WhatsApp ordering, or bulk food purchases (rice, garri) rise relative to single cold drinks.',
      suggestedAction: 'Offer WhatsApp order deliveries and promote home-cooking pantry essentials.'
    };
  } else {
    return {
      weatherCondition: 'Cold / Harmattan Weather 🍃',
      effect: 'Hot beverages, tea packs, and moisturizers demand spikes.',
      impactDetails: 'Harmattan winds drive demand for hot Milo/Nescafé, butter rolls, and skincare products.',
      suggestedAction: 'Increase stock of powdered tea, coffee, and dry skin protection items.'
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
  expectedLiftPct: number;
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
      const margin = (p.sellingPrice - p.costPrice) / p.costPrice;
      if (margin > 0.15) {
        recs.push({
          productName: p.name,
          productId: p.id,
          stockQty: p.quantity,
          costPrice: p.costPrice,
          sellingPrice: p.sellingPrice,
          suggestedDiscountPct: 10,
          expectedLiftPct: 40,
          marginImpact: `Reduces markup margin from ${Math.round(margin * 100)}% to ${Math.round((margin - 0.10) * 100)}%.`
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
    const key = (p.customerName || 'unknown').trim().toLowerCase();
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
