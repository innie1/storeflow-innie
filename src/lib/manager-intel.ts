import { StoreData, Product } from '@/types/store';
import { getLowStockThreshold } from '@/lib/settings';

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function daysAgo(n: number) { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - n); return d; }
function daysBetween(a: Date, b: Date) {
  return Math.max(1, Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000) + 1);
}

export interface DailyPoint {
  ts: number;
  label: string;
  revenue: number;
  profit: number;
  expenses: number;
  salesCount: number;
}

export function dailySeries(store: StoreData, days: number): DailyPoint[] {
  const today = startOfDay(new Date());
  const buckets: DailyPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets.push({
      ts: d.getTime(),
      label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      revenue: 0, profit: 0, expenses: 0, salesCount: 0,
    });
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

export interface Forecast {
  expectedRevenue: number;
  expectedProfit: number;
  expectedExpenses: number;
  confidence: 'High' | 'Medium' | 'Low';
}

function linReg(values: number[]) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((a,b)=>a+b,0)/n;
  const meanY = values.reduce((a,b)=>a+b,0)/n;
  let num=0, den=0, totSS=0;
  xs.forEach((x,i) => { num += (x-meanX)*(values[i]-meanY); den += (x-meanX)**2; });
  const slope = den ? num/den : 0;
  const intercept = meanY - slope*meanX;
  values.forEach(y => { totSS += (y-meanY)**2; });
  let resSS = 0;
  values.forEach((y,i) => { const yh = slope*i + intercept; resSS += (y-yh)**2; });
  const r2 = totSS ? Math.max(0, 1 - resSS/totSS) : 0;
  return { slope, intercept, r2 };
}

export function forecast(store: StoreData, horizonDays: number): Forecast {
  const series = dailySeries(store, 30);
  const rev = linReg(series.map(s => s.revenue));
  const prof = linReg(series.map(s => s.profit));
  const exp = linReg(series.map(s => s.expenses));
  let expectedRevenue = 0, expectedProfit = 0, expectedExpenses = 0;
  for (let i = 30; i < 30 + horizonDays; i++) {
    expectedRevenue += Math.max(0, rev.slope*i + rev.intercept);
    expectedProfit += Math.max(0, prof.slope*i + prof.intercept);
    expectedExpenses += Math.max(0, exp.slope*i + exp.intercept);
  }
  const avgR2 = (rev.r2 + prof.r2 + exp.r2) / 3;
  const totalSales = store.sales.length;
  let confidence: Forecast['confidence'] = 'Low';
  if (totalSales >= 30 && avgR2 > 0.5) confidence = 'High';
  else if (totalSales >= 10 && avgR2 > 0.25) confidence = 'Medium';
  return { expectedRevenue, expectedProfit, expectedExpenses, confidence };
}

export interface HealthScore {
  overall: number;
  sales: number;
  inventory: number;
  expense: number;
  profit: number;
  label: string;
}

export function healthScore(store: StoreData): HealthScore {
  const last7 = dailySeries(store, 7);
  const prev7 = dailySeries(store, 14).slice(0, 7);
  const rev7 = last7.reduce((s,d)=>s+d.revenue,0);
  const revPrev = prev7.reduce((s,d)=>s+d.revenue,0);
  const profit7 = last7.reduce((s,d)=>s+d.profit,0);
  const exp7 = last7.reduce((s,d)=>s+d.expenses,0);

  let salesScore = 50;
  if (revPrev > 0) {
    const growth = (rev7 - revPrev) / revPrev;
    salesScore = Math.max(0, Math.min(100, 60 + growth * 100));
  } else if (rev7 > 0) salesScore = 70;

  const threshold = getLowStockThreshold();
  const total = store.products.length || 1;
  const healthy = store.products.filter(p => p.quantity > threshold).length;
  const inventoryScore = Math.round((healthy / total) * 100);

  let expenseScore = 80;
  if (rev7 > 0) {
    const ratio = exp7 / rev7;
    expenseScore = Math.max(0, Math.min(100, 100 - ratio * 60));
  }

  let profitScore = 50;
  if (rev7 > 0) {
    const margin = profit7 / rev7;
    profitScore = Math.max(0, Math.min(100, margin * 200));
  }

  const overall = Math.round(salesScore*0.3 + inventoryScore*0.25 + expenseScore*0.2 + profitScore*0.25);
  let label = 'Needs Attention';
  if (overall >= 80) label = 'Great Performance';
  else if (overall >= 60) label = 'Healthy';
  else if (overall >= 40) label = 'Average';

  return {
    overall,
    sales: Math.round(salesScore),
    inventory: inventoryScore,
    expense: Math.round(expenseScore),
    profit: Math.round(profitScore),
    label,
  };
}

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
  const curRev = cur.reduce((s,d)=>s+d.revenue,0);
  const prevRev = prev.reduce((s,d)=>s+d.revenue,0);
  if (prevRev > 0) {
    const pct = ((curRev - prevRev) / prevRev) * 100;
    if (Math.abs(pct) >= 1) {
      out.push({
        id: 'rev',
        icon: pct >= 0 ? '📈' : '📉',
        text: `Revenue ${pct >= 0 ? 'increased' : 'decreased'} ${Math.abs(pct).toFixed(1)}% this ${range === '7d' ? 'week' : range === '1m' ? 'month' : 'period'}`,
        tone: pct >= 0 ? 'success' : 'warning',
      });
    }
  } else if (curRev > 0) {
    out.push({ id: 'rev', icon: '📈', text: `Revenue is up — keep going!`, tone: 'success' });
  }

  const threshold = getLowStockThreshold();
  const low = store.products.filter(p => p.quantity > 0 && p.quantity <= threshold);
  if (low.length > 0) {
    out.push({
      id: 'low',
      icon: '⚠',
      text: `${low.length} product${low.length === 1 ? '' : 's'} need restocking`,
      tone: 'warning',
    });
  }

  const tally = new Map<string, number>();
  store.sales.forEach(s => tally.set(s.productName, (tally.get(s.productName) || 0) + s.quantity));
  const best = [...tally.entries()].sort((a,b) => b[1]-a[1])[0];
  if (best) out.push({ id: 'best', icon: '⭐', text: `${best[0]} is your best seller`, tone: 'info' });

  if (curRev > 0) {
    const savable = Math.round(curRev * 0.05 / 100) * 100;
    if (savable >= 500) {
      out.push({
        id: 'save',
        icon: '💰',
        text: `Save ₦${savable.toLocaleString()} this ${range === '7d' ? 'week' : 'period'}`,
        tone: 'info',
      });
    }
  }

  return out.slice(0, 4);
}

export interface Recommendation {
  id: string;
  icon: string;
  title: string;
  detail: string;
  tone: 'warning' | 'danger' | 'info' | 'success';
  action?: 'restock' | 'price' | 'expense';
  productId?: string;
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
  store.products.forEach(p => {
    const days = forecastDaysRemaining(store, p);
    if (Number.isFinite(days) && days <= 5 && p.quantity > 0) {
      const lostRev = Math.round(p.sellingPrice * (p.quantity / Math.max(1, days)) * 7);
      recs.push({
        id: `r-${p.id}`,
        icon: '📦',
        title: `Restock ${p.name}`,
        detail: `Stock will finish in ${days} day${days === 1 ? '' : 's'}. Potential lost revenue: ₦${lostRev.toLocaleString()}`,
        tone: days <= 2 ? 'danger' : 'warning',
        action: 'restock',
        productId: p.id,
      });
    }
  });

  const exp = store.expenses || [];
  if (exp.length >= 4) {
    const byCat = new Map<string, number[]>();
    exp.forEach(e => {
      const arr = byCat.get(e.category) || [];
      arr.push(e.amount);
      byCat.set(e.category, arr);
    });
    byCat.forEach((amts, cat) => {
      if (amts.length < 3) return;
      const recent = amts[0];
      const avgPrev = amts.slice(1).reduce((s,a)=>s+a,0) / (amts.length-1);
      if (avgPrev > 0 && recent > avgPrev * 1.2) {
        const pct = Math.round(((recent - avgPrev) / avgPrev) * 100);
        recs.push({
          id: `e-${cat}`,
          icon: '🧾',
          title: `${cat} Expense Alert`,
          detail: `Your ${cat.toLowerCase()} cost is ${pct}% higher than usual. Consider alternative options.`,
          tone: 'warning',
          action: 'expense',
        });
      }
    });
  }

  store.products.forEach(p => {
    if (!p.costPrice) return;
    const margin = (p.sellingPrice - p.costPrice) / p.costPrice;
    const sold = store.sales.filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(6))
      .reduce((sum, s) => sum + s.quantity, 0);
    if (margin > 0 && margin < 0.2 && sold >= 5) {
      const suggested = Math.round((p.costPrice * 1.3) / 10) * 10;
      const lift = suggested - p.sellingPrice;
      if (lift >= 10) {
        recs.push({
          id: `p-${p.id}`,
          icon: '📈',
          title: 'Price Opportunity',
          detail: `You can increase price on ${p.name} by ₦${lift.toLocaleString()}`,
          tone: 'info',
          action: 'price',
          productId: p.id,
        });
      }
    }
  });
  return recs.slice(0, 6);
}

export function topCustomerRequests(store: StoreData, limit = 5) {
  const reqs = store.customerRequests || [];
  const tally = new Map<string, number>();
  reqs.forEach(r => {
    const key = r.text.trim().toLowerCase();
    tally.set(key, (tally.get(key) || 0) + 1);
  });
  return [...tally.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a,b) => b.count - a.count)
    .slice(0, limit);
}

export type ActivityRange = 'today' | '7d' | '30d' | '1y' | 'lifetime';

export interface ActivityBucket {
  /** minute-of-day at bucket start, 0..1410 step 30 */
  minute: number;
  label: string;       // "12:00 AM"
  shortLabel: string;  // "12 AM" / blank for in-between
  sales: number;
  revenue: number;
  profit: number;
}

export interface MostActivePeriods {
  buckets: ActivityBucket[];
  peakWindow?: { startLabel: string; endLabel: string };
  totalSales: number;
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function mostActivePeriods(store: StoreData, range: ActivityRange = '7d'): MostActivePeriods {
  let cutoff = 0;
  const now = Date.now();
  if (range === 'today') {
    const d = new Date(); d.setHours(0,0,0,0); cutoff = d.getTime();
  } else if (range === '7d') cutoff = now - 7 * 86400000;
  else if (range === '30d') cutoff = now - 30 * 86400000;
  else if (range === '1y') cutoff = now - 365 * 86400000;
  else cutoff = 0;

  const buckets: ActivityBucket[] = [];
  for (let i = 0; i < 48; i++) {
    const minute = i * 30;
    const h = Math.floor(minute / 60);
    buckets.push({
      minute,
      label: fmtMin(minute),
      shortLabel: minute % 180 === 0 ? `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? 'PM' : 'AM'}` : '',
      sales: 0, revenue: 0, profit: 0,
    });
  }

  let totalSales = 0;
  store.sales.forEach(s => {
    const t = new Date(s.date).getTime();
    if (t < cutoff) return;
    const d = new Date(t);
    const min = d.getHours() * 60 + d.getMinutes();
    const idx = Math.floor(min / 30);
    const b = buckets[idx];
    if (!b) return;
    b.sales += 1; b.revenue += s.total; b.profit += s.profit;
    totalSales += 1;
  });

  // peak window: contiguous run of top-quartile buckets
  let peakWindow: MostActivePeriods['peakWindow'];
  if (totalSales > 0) {
    const sorted = [...buckets].map(b => b.sales).sort((a,b)=>b-a);
    const cut = sorted[Math.min(8, sorted.length - 1)] || 1;
    let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
    buckets.forEach((b, i) => {
      if (b.sales >= cut && b.sales > 0) {
        if (curStart < 0) curStart = i;
        curLen++;
        if (curLen > bestLen) { bestLen = curLen; bestStart = curStart; }
      } else { curStart = -1; curLen = 0; }
    });
    if (bestStart >= 0) {
      peakWindow = {
        startLabel: buckets[bestStart].label,
        endLabel: fmtMin(Math.min(1440, (bestStart + bestLen) * 30)),
      };
    }
  }

  return { buckets, peakWindow, totalSales };
}

