import { StoreData } from '@/types/store';

// ─── Sales Target ──────────────────────────────────────────────────────────
// Auto mode looks at the last 14 days of selling activity to decide whether
// this is a "sells every day" store (daily target) or a "sells a few times a
// week" store (weekly target), then sets the target a bit above the trailing
// average so it's a stretch goal, not just a mirror of what already happened.
// Manual mode just uses whatever the owner set in Settings.
export interface SalesTargetStatus {
  mode: 'auto' | 'manual';
  period: 'daily' | 'weekly';
  targetAmount: number;
  progressAmount: number;
  progressPercent: number; // 0-100, capped
}

export function roundToNiceNumber(n: number): number {
  if (n <= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / magnitude) * magnitude;
}

export function getSalesTargetStatus(store: StoreData): SalesTargetStatus {
  const manual = store.salesTarget?.mode === 'manual' ? store.salesTarget : null;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const recentSales = store.sales.filter(s => new Date(s.date) >= fourteenDaysAgo);
  const daysWithSales = new Set(recentSales.map(s => s.date.split('T')[0])).size;
  // Selling on at least 5 of the last 14 tracked days reads as a "daily" store.
  const detectedPeriod: 'daily' | 'weekly' = daysWithSales >= 5 ? 'daily' : 'weekly';

  const period = manual?.period || detectedPeriod;

  let targetAmount: number;
  if (manual?.amount) {
    targetAmount = manual.amount;
  } else {
    const totalRecent = recentSales.reduce((sum, s) => sum + s.total, 0);
    const trailingAverage = period === 'daily'
      ? totalRecent / 14
      : totalRecent / 2; // 14 days ≈ 2 weeks
    // 15% stretch above the trailing average, rounded to a clean number.
    targetAmount = roundToNiceNumber(Math.max(trailingAverage * 1.15, 1000));
  }

  let progressAmount: number;
  if (period === 'daily') {
    progressAmount = store.sales
      .filter(s => s.date.startsWith(todayStr))
      .reduce((sum, s) => sum + s.total, 0);
  } else {
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    progressAmount = store.sales
      .filter(s => new Date(s.date) >= weekStart)
      .reduce((sum, s) => sum + s.total, 0);
  }

  const progressPercent = targetAmount > 0 ? Math.min(100, Math.round((progressAmount / targetAmount) * 100)) : 0;

  return {
    mode: manual ? 'manual' : 'auto',
    period,
    targetAmount,
    progressAmount,
    progressPercent,
  };
}
