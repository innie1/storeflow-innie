import { StoreData } from '@/types/store';

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
