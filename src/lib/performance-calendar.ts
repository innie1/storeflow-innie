import { StoreData, Sale } from '@/types/store';
import { getSalesTargetStatus } from '@/lib/store-data';

export type PerfStatus = 'achieved' | 'nearly' | 'needs_improvement' | 'no_data' | 'future';

export interface DayPerformance {
  dateStr: string; // YYYY-MM-DD
  date: Date;
  revenue: number;
  profit: number;
  transactionCount: number;
  targetAmount: number;
  percent: number; // 0+ (uncapped, so a big overshoot still shows as a real number in the detail view)
  status: PerfStatus;
}

// A store's real target is daily-or-weekly (see getSalesTargetStatus). For the
// calendar we always need a per-day figure to color individual days, so a
// weekly-cadence store's weekly target is spread evenly across 7 days here.
// This is a deliberate simplification for v1 — see the coder message.
export function getDailyTargetEquivalent(store: StoreData): number {
  const target = getSalesTargetStatus(store);
  return target.period === 'daily' ? target.targetAmount : target.targetAmount / 7;
}

function statusFromPercent(percent: number, hasData: boolean): PerfStatus {
  if (!hasData) return 'no_data';
  if (percent >= 100) return 'achieved';
  if (percent >= 50) return 'nearly';
  return 'needs_improvement';
}

export function getDayPerformance(store: StoreData, date: Date, dailyTarget: number): DayPerformance {
  const dateStr = date.toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];
  const daySales = store.sales.filter(s => s.date.startsWith(dateStr));
  const revenue = daySales.reduce((sum, s) => sum + s.total, 0);
  const profit = daySales.reduce((sum, s) => sum + s.profit, 0);
  const percent = dailyTarget > 0 ? Math.round((revenue / dailyTarget) * 100) : 0;

  let status: PerfStatus;
  if (dateStr > todayStr) {
    status = 'future';
  } else {
    status = statusFromPercent(percent, daySales.length > 0);
  }

  return { dateStr, date, revenue, profit, transactionCount: daySales.length, targetAmount: dailyTarget, percent, status };
}

export interface PeriodPerformance {
  label: string;
  revenue: number;
  profit: number;
  transactionCount: number;
  targetAmount: number;
  percent: number;
  status: PerfStatus;
  bestSellers: { name: string; qty: number }[];
  topCategories: { name: string; revenue: number }[];
  sales: Sale[];
}

export function summarizePeriod(store: StoreData, sales: Sale[], targetAmount: number, label: string, isFuture: boolean): PeriodPerformance {
  const revenue = sales.reduce((sum, s) => sum + s.total, 0);
  const profit = sales.reduce((sum, s) => sum + s.profit, 0);
  const percent = targetAmount > 0 ? Math.round((revenue / targetAmount) * 100) : 0;
  const status: PerfStatus = isFuture ? 'future' : statusFromPercent(percent, sales.length > 0);

  const qtyTally = new Map<string, number>();
  sales.forEach(s => qtyTally.set(s.productName, (qtyTally.get(s.productName) || 0) + s.quantity));
  const bestSellers = [...qtyTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, qty]) => ({ name, qty }));

  const catTally = new Map<string, number>();
  sales.forEach(s => {
    const product = store.products.find(p => p.id === s.productId);
    const cat = product?.category || 'Other';
    catTally.set(cat, (catTally.get(cat) || 0) + s.total);
  });
  const topCategories = [...catTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, revenue]) => ({ name, revenue }));

  return { label, revenue, profit, transactionCount: sales.length, targetAmount, percent, status, bestSellers, topCategories, sales };
}

// Rule-based, not a live model call — consistent with the rest of the app's
// "manager-intel" style heuristics. No external AI dependency.
export function getPerformanceInsight(perf: PeriodPerformance): { insight: string; suggestion: string } {
  if (perf.status === 'no_data') {
    return { insight: 'No sales were recorded in this period.', suggestion: 'If the store was open, check whether sales were logged correctly.' };
  }
  if (perf.status === 'achieved') {
    if (perf.percent >= 150) {
      return { insight: `Target was smashed — ${perf.percent}% of goal, well above expectations.`, suggestion: `${perf.bestSellers[0]?.name || 'Your top product'} carried this period. Consider stocking up ahead of similar days.` };
    }
    return { insight: `Target reached at ${perf.percent}% — a solid, on-plan period.`, suggestion: 'Keep doing what worked here — consistency compounds.' };
  }
  if (perf.status === 'nearly') {
    const gap = perf.targetAmount - perf.revenue;
    return { insight: `Close, but ${perf.percent}% of target — ₦${Math.max(0, Math.round(gap)).toLocaleString()} short.`, suggestion: perf.bestSellers.length > 0 ? `Push ${perf.bestSellers[0].name} a bit harder next time — it was already your best mover.` : 'A small push on your usual best-sellers would likely have closed the gap.' };
  }
  return { insight: `Only ${perf.percent}% of target reached — a quiet period.`, suggestion: perf.transactionCount === 0 ? 'No transactions at all — worth checking if the store was open or short-staffed.' : 'Consider a small promotion or restock check — low sales can follow low stock.' };
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
  daysMetThisMonth: number;
  weeklySuccessRatePct: number;
  monthlyScorePct: number;
}

export function getStreakStats(store: StoreData): StreakStats {
  const dailyTarget = getDailyTargetEquivalent(store);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Walk backward from today (or yesterday if today has no data yet) up to 400 days.
  const days: DayPerformance[] = [];
  for (let i = 0; i < 400; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(getDayPerformance(store, d, dailyTarget));
  }

  // Current streak: consecutive 'achieved' days counting back from the most
  // recent day that actually has data (skip today if it's still in progress).
  let startIdx = 0;
  if (days[0].status === 'no_data') startIdx = 1;
  let currentStreak = 0;
  for (let i = startIdx; i < days.length; i++) {
    if (days[i].status === 'achieved') currentStreak++;
    else break;
  }

  // Longest streak anywhere in the tracked history.
  let longestStreak = 0;
  let run = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].status === 'achieved') { run++; longestStreak = Math.max(longestStreak, run); }
    else run = 0;
  }

  const thisMonth = today.getMonth();
  const thisYear = today.getFullYear();
  const daysMetThisMonth = days.filter(d => d.date.getMonth() === thisMonth && d.date.getFullYear() === thisYear && d.status === 'achieved').length;

  // Weekly success rate over the last 8 full weeks.
  const weeklyTarget = dailyTarget * 7;
  let weeksChecked = 0;
  let weeksMet = 0;
  for (let w = 1; w <= 8; w++) {
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() - (w - 1) * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekEnd.getDate() - 6);
    const weekSales = store.sales.filter(s => {
      const d = new Date(s.date);
      return d >= weekStart && d <= weekEnd;
    });
    if (weekSales.length === 0) continue;
    weeksChecked++;
    const rev = weekSales.reduce((sum, s) => sum + s.total, 0);
    if (weeklyTarget > 0 && rev >= weeklyTarget) weeksMet++;
  }
  const weeklySuccessRatePct = weeksChecked > 0 ? Math.round((weeksMet / weeksChecked) * 100) : 0;

  const monthSales = store.sales.filter(s => {
    const d = new Date(s.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });
  const monthRevenue = monthSales.reduce((sum, s) => sum + s.total, 0);
  const daysSoFarThisMonth = today.getDate();
  const monthlyTargetSoFar = dailyTarget * daysSoFarThisMonth;
  const monthlyScorePct = monthlyTargetSoFar > 0 ? Math.round((monthRevenue / monthlyTargetSoFar) * 100) : 0;

  return { currentStreak, longestStreak, daysMetThisMonth, weeklySuccessRatePct, monthlyScorePct };
}

export interface AchievementDef {
  id: string;
  emoji: string;
  label: string;
  unlocked: boolean;
}

export function getAchievements(store: StoreData, streaks: StreakStats): AchievementDef[] {
  const dailyTarget = getDailyTargetEquivalent(store);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Perfect Week: any of the last 8 weeks where every day with data hit target
  // and at least 5 days had data (avoids a 1-sale week reading as "perfect").
  let perfectWeek = false;
  for (let w = 0; w < 8 && !perfectWeek; w++) {
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() - w * 7);
    const weekStart = new Date(weekEnd); weekStart.setDate(weekEnd.getDate() - 6);
    const daysInWeek: DayPerformance[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      if (d > today) continue;
      daysInWeek.push(getDayPerformance(store, d, dailyTarget));
    }
    const withData = daysInWeek.filter(d => d.status !== 'no_data' && d.status !== 'future');
    if (withData.length >= 5 && withData.every(d => d.status === 'achieved')) perfectWeek = true;
  }

  // Perfect Month: a fully-elapsed month where every day with data hit target.
  let perfectMonth = false;
  for (let m = 1; m <= 6 && !perfectMonth; m++) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    const days: DayPerformance[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(getDayPerformance(store, new Date(monthDate.getFullYear(), monthDate.getMonth(), d), dailyTarget));
    }
    const withData = days.filter(d => d.status !== 'no_data' && d.status !== 'future');
    if (withData.length >= daysInMonth - 3 && withData.every(d => d.status === 'achieved')) perfectMonth = true;
  }

  return [
    { id: 'streak_7', emoji: '🏅', label: '7-Day Target Streak', unlocked: streaks.longestStreak >= 7 },
    { id: 'streak_30', emoji: '🔥', label: '30-Day Consistency', unlocked: streaks.longestStreak >= 30 },
    { id: 'perfect_week', emoji: '⭐', label: 'Perfect Week', unlocked: perfectWeek },
    { id: 'perfect_month', emoji: '👑', label: 'Perfect Month', unlocked: perfectMonth },
  ];
}
