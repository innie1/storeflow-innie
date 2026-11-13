import { StoreData } from '@/types/store';
import { daysAgo } from './dates';

// ─── Sales Analysis ───────────────────────────────────────────────────────────
export interface SalesAnalysis {
  fastMovers: { name: string; qty: number; revenue: number }[];
  slowMovers: { name: string; qty: number; daysInStock: number }[];
  // costPrice and quantity are here because the "stop reordering this"
  // opportunity multiplies them to show what is tied up in stock that has
  // never moved. Without them that figure was always zero, so the one
  // number that makes the advice worth acting on never appeared.
  neverSold: { id: string; name: string; daysInStock: number; costPrice: number; quantity: number }[];
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
      if (daysInStock > 7) neverSold.push({ id: p.id, name: p.name, daysInStock, costPrice: p.costPrice, quantity: p.quantity });
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
