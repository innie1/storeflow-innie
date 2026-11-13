import { StoreData, Product } from '@/types/store';
import { productMarkup } from '@/lib/pricing-math';
import { monthlyRent } from '@/lib/rent';
import { dailySeries } from './forecast';

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
  const monthly = Math.round(monthlyRent(rent));
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
