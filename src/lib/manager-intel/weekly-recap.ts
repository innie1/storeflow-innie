import { StoreData } from '@/types/store';
import { periodStart, shiftPeriod } from '@/lib/period-report';

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

export function generateWeeklyRecap(store: StoreData, now: number = Date.now()): WeeklyRecap | null {
  if (store.sales.length === 0) return null;

  /*
   * The last whole week, Monday to Sunday, against the whole week before it.
   * Two finished weeks are a fair comparison as they stand. It used to run
   * Sunday to Saturday while Clothes and money ran Monday to Sunday, so the
   * shop had two different figures both called "last week".
   */
  const thisWeek = periodStart('week', now);
  const weekStart = new Date(shiftPeriod('week', thisWeek, -1));
  const weekEnd = new Date(thisWeek);
  const prevWeekStart = new Date(shiftPeriod('week', thisWeek, -2));

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
