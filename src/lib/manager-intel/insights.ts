import { StoreData, Product } from '@/types/store';
import { getLowStockThreshold } from '@/lib/settings';
import { productMarkup } from '@/lib/pricing-math';
import { daysAgo, daysBetween, isStoreOnboarding } from './dates';
import { dailySeries } from './forecast';
import { expenseAnalysis, rentAnalysis } from './costs';
import { receivedToNow } from '@/lib/fair-compare';

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
  const curRev = cur.reduce((s, d) => s + d.revenue, 0);
  /*
   * The stretch before, cut at this time of day. "The last 7 days" is today
   * so far and six whole days; against seven whole days it was always a
   * little short, and first thing in the morning it was a day short.
   */
  const prevRev = receivedToNow(store, days).before;
  const periodWord = range === '7d' ? 'week' : range === '1m' ? 'month' : 'period';
  if (prevRev > 0) {
    const pct = ((curRev - prevRev) / prevRev) * 100;
    if (Math.abs(pct) >= 1) {
      out.push({
        id: 'rev', icon: pct >= 0 ? '📈' : '📉',
        text: `Money in is ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct).toFixed(1)}% on the same days of the ${periodWord} before`,
        tone: pct >= 0 ? 'success' : 'warning',
        explain: `The last ${days} days up to now (₦${curRev.toLocaleString()}) against the ${days} days before, up to the same time of day (₦${prevRev.toLocaleString()}).`,
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
      id: 'exp', icon: '🧾', text: `Spending is up ${ea.trendPct.toFixed(0)}% on the 30 days before. Largest: ${ea.largestCategory}`, tone: 'warning',
      explain: `The last 30 days of spending against the 30 days before. ${ea.largestCategory} is the largest part of it.`,
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
