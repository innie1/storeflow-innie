import { useState, useMemo } from 'react';
import { StoreData } from '@/types/store';
import {
  getDailyTargetEquivalent, getDayPerformance, summarizePeriod, getStreakStats,
  getAchievements, getPerformanceInsight, PerfStatus, PeriodPerformance, DayPerformance,
} from '@/lib/performance-calendar';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

interface PerformanceCalendarProps {
  store: StoreData;
  onClose: () => void;
}

type ViewMode = 'daily' | 'weekly' | 'monthly';

const STATUS_BG: Record<PerfStatus, string> = {
  achieved: 'bg-success text-success-foreground',
  nearly: 'bg-warning text-warning-foreground',
  needs_improvement: 'bg-destructive text-destructive-foreground',
  no_data: 'bg-surface-3 text-muted-foreground',
  future: 'bg-transparent text-muted-foreground/30',
};

const STATUS_LABEL: Record<PerfStatus, string> = {
  achieved: 'Target Achieved',
  nearly: 'Nearly There',
  needs_improvement: 'Needs Improvement',
  no_data: 'No Data',
  future: 'Upcoming',
};

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PerformanceCalendar({ store, onClose }: PerformanceCalendarProps) {
  useBodyScrollLock();
  const [view, setView] = useState<ViewMode>('daily');
  const [cursor, setCursor] = useState(new Date());
  const [detail, setDetail] = useState<PeriodPerformance | null>(null);

  const dailyTarget = useMemo(() => getDailyTargetEquivalent(store), [store]);
  const streaks = useMemo(() => getStreakStats(store), [store]);
  const achievements = useMemo(() => getAchievements(store, streaks), [store, streaks]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // Sunday=0 -> Monday-first grid
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const openDay = (date: Date) => {
    if (date > today) return;
    const dateStr = date.toISOString().split('T')[0];
    const daySales = store.sales.filter(s => s.date.startsWith(dateStr));
    setDetail(summarizePeriod(store, daySales, dailyTarget, date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), false));
  };

  const openWeek = (weekIndex: number) => {
    const startDay = weekIndex * 7 + 1;
    const endDay = Math.min(startDay + 6, daysInMonth);
    if (startDay > daysInMonth) return;
    const weekStart = new Date(year, month, startDay);
    const weekEnd = new Date(year, month, endDay);
    if (weekStart > today) return;
    const weekSales = store.sales.filter(s => {
      const d = new Date(s.date);
      return d >= weekStart && d <= new Date(weekEnd.getTime() + 86399999);
    });
    const numDays = endDay - startDay + 1;
    setDetail(summarizePeriod(store, weekSales, dailyTarget * numDays, `Week ${weekIndex + 1} · ${MONTH_LABELS[month]} ${startDay}–${endDay}`, weekStart > today));
  };

  const openMonth = (monthIndex: number) => {
    const mStart = new Date(year, monthIndex, 1);
    if (mStart > today) return;
    const mDays = new Date(year, monthIndex + 1, 0).getDate();
    const mEnd = new Date(year, monthIndex, mDays);
    const monthSales = store.sales.filter(s => {
      const d = new Date(s.date);
      return d >= mStart && d <= new Date(mEnd.getTime() + 86399999);
    });
    setDetail(summarizePeriod(store, monthSales, dailyTarget * mDays, `${MONTH_LABELS[monthIndex]} ${year}`, mStart > today));
  };

  const weekRows = Array.from({ length: 5 }, (_, i) => i).filter(i => i * 7 + 1 <= daysInMonth);

  return (
    <div className="fixed inset-0 z-[9998] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-background rounded-t-3xl sm:rounded-3xl p-4 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-base">📅 Performance Calendar</h2>
          <button onClick={onClose} className="p-1.5 rounded-full bg-surface-2"><X className="w-4 h-4" /></button>
        </div>

        {/* Quick Summary */}
        <div className="grid grid-cols-2 gap-2">
          <SummaryTile label="Current Streak" value={`${streaks.currentStreak} day${streaks.currentStreak === 1 ? '' : 's'}`} emoji="🔥" />
          <SummaryTile label="Longest Streak" value={`${streaks.longestStreak} day${streaks.longestStreak === 1 ? '' : 's'}`} emoji="🏆" />
          <SummaryTile label="Met This Month" value={`${streaks.daysMetThisMonth} day${streaks.daysMetThisMonth === 1 ? '' : 's'}`} emoji="✅" />
          <SummaryTile label="Weekly Success Rate" value={`${streaks.weeklySuccessRatePct}%`} emoji="📈" />
        </div>

        {/* Achievements */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {achievements.map(a => (
            <div
              key={a.id}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-display font-bold ${a.unlocked ? 'bg-primary/10 border-primary/40 text-primary' : 'bg-surface-2 border-border text-muted-foreground/50'}`}
            >
              <span className={a.unlocked ? '' : 'grayscale opacity-40'}>{a.emoji}</span> {a.label}
            </div>
          ))}
        </div>

        {/* View tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-surface-2">
          {(['daily', 'weekly', 'monthly'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-display font-bold capitalize ${view === v ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
            >
              {v}
            </button>
          ))}
        </div>

        {/* Nav header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCursor(view === 'monthly' ? new Date(year - 1, 0, 1) : new Date(year, month - 1, 1))}
            className="p-1.5 rounded-full bg-surface-2"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="font-display font-bold text-sm">{view === 'monthly' ? year : `${MONTH_LABELS[month]} ${year}`}</p>
          <button
            onClick={() => setCursor(view === 'monthly' ? new Date(year + 1, 0, 1) : new Date(year, month + 1, 1))}
            className="p-1.5 rounded-full bg-surface-2"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Daily view */}
        {view === 'daily' && (
          <div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_LABELS.map((d, i) => <p key={i} className="text-center text-[10px] text-muted-foreground font-bold">{d}</p>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((date, i) => {
                if (!date) return <div key={i} />;
                const perf: DayPerformance = getDayPerformance(store, date, dailyTarget);
                const isToday = date.getTime() === today.getTime();
                return (
                  <button
                    key={i}
                    onClick={() => openDay(date)}
                    disabled={perf.status === 'future'}
                    className={`aspect-square rounded-full text-xs font-display font-bold flex items-center justify-center ${STATUS_BG[perf.status]} ${isToday ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Weekly view */}
        {view === 'weekly' && (
          <div className="space-y-2">
            {weekRows.map(w => {
              const startDay = w * 7 + 1;
              const endDay = Math.min(startDay + 6, daysInMonth);
              const weekStart = new Date(year, month, startDay);
              const weekEnd = new Date(year, month, endDay);
              const isFuture = weekStart > today;
              const numDays = endDay - startDay + 1;
              const weekSales = store.sales.filter(s => {
                const d = new Date(s.date);
                return d >= weekStart && d <= new Date(weekEnd.getTime() + 86399999);
              });
              const revenue = weekSales.reduce((sum, s) => sum + s.total, 0);
              const target = dailyTarget * numDays;
              const percent = target > 0 ? Math.round((revenue / target) * 100) : 0;
              const status: PerfStatus = isFuture ? 'future' : weekSales.length === 0 ? 'no_data' : percent >= 100 ? 'achieved' : percent >= 50 ? 'nearly' : 'needs_improvement';
              return (
                <button
                  key={w}
                  onClick={() => openWeek(w)}
                  disabled={isFuture}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-card border border-border/60"
                >
                  <div className="text-left">
                    <p className="font-display font-bold text-sm">Week {w + 1}</p>
                    <p className="text-[10px] text-muted-foreground">{startDay}–{endDay} {MONTH_LABELS[month]}</p>
                  </div>
                  <span className={`text-[11px] font-display font-bold px-2.5 py-1 rounded-full ${STATUS_BG[status]}`}>
                    {status === 'future' ? '—' : `${percent}%`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Monthly view */}
        {view === 'monthly' && (
          <div className="grid grid-cols-3 gap-2">
            {MONTH_LABELS.map((label, mi) => {
              const mStart = new Date(year, mi, 1);
              const isFuture = mStart > today;
              const mDays = new Date(year, mi + 1, 0).getDate();
              const mEnd = new Date(year, mi, mDays);
              const monthSales = store.sales.filter(s => {
                const d = new Date(s.date);
                return d >= mStart && d <= new Date(mEnd.getTime() + 86399999);
              });
              const revenue = monthSales.reduce((sum, s) => sum + s.total, 0);
              const target = dailyTarget * mDays;
              const percent = target > 0 ? Math.round((revenue / target) * 100) : 0;
              const status: PerfStatus = isFuture ? 'future' : monthSales.length === 0 ? 'no_data' : percent >= 100 ? 'achieved' : percent >= 50 ? 'nearly' : 'needs_improvement';
              return (
                <button
                  key={mi}
                  onClick={() => openMonth(mi)}
                  disabled={isFuture}
                  className={`p-3 rounded-xl flex flex-col items-center gap-1 ${STATUS_BG[status]}`}
                >
                  <span className="text-xs font-display font-bold">{label}</span>
                  <span className="text-[10px] opacity-80">{status === 'future' ? '—' : `${percent}%`}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          <LegendDot color="bg-success" label="Achieved" />
          <LegendDot color="bg-warning" label="Nearly There" />
          <LegendDot color="bg-destructive" label="Needs Improvement" />
          <LegendDot color="bg-surface-3" label="No Data" />
        </div>
      </div>

      {/* Detail drill-down */}
      {detail && (
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setDetail(null)}>
          <div className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto bg-background rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display font-bold text-base">{detail.label}</p>
                <span className={`inline-block mt-1 text-[10px] font-display font-bold px-2 py-0.5 rounded-full ${STATUS_BG[detail.status]}`}>{STATUS_LABEL[detail.status]}</span>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-full bg-surface-2"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <DetailTile label="Target" value={`₦${Math.round(detail.targetAmount).toLocaleString()}`} />
              <DetailTile label="Actual Sales" value={`₦${detail.revenue.toLocaleString()}`} />
              <DetailTile label="Profit" value={`₦${detail.profit.toLocaleString()}`} />
              <DetailTile label="% of Target" value={`${detail.percent}%`} />
              <DetailTile label="Transactions" value={String(detail.transactionCount)} />
            </div>

            {detail.bestSellers.length > 0 && (
              <div>
                <p className="text-[11px] uppercase font-bold text-muted-foreground mb-1.5">Best-Selling Products</p>
                <div className="space-y-1">
                  {detail.bestSellers.map(b => (
                    <div key={b.name} className="flex justify-between text-sm p-2 rounded-lg bg-surface-2">
                      <span className="font-display font-semibold">{b.name}</span>
                      <span className="text-muted-foreground">{b.qty} sold</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.topCategories.length > 0 && (
              <div>
                <p className="text-[11px] uppercase font-bold text-muted-foreground mb-1.5">Top Categories</p>
                <div className="space-y-1">
                  {detail.topCategories.map(c => (
                    <div key={c.name} className="flex justify-between text-sm p-2 rounded-lg bg-surface-2">
                      <span className="font-display font-semibold">{c.name}</span>
                      <span className="text-muted-foreground">₦{c.revenue.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              const { insight, suggestion } = getPerformanceInsight(detail);
              return (
                <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                  <p className="text-xs font-display font-bold text-primary">💡 Why this happened</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{insight}</p>
                  <p className="text-xs font-display font-bold text-primary pt-1">Suggested action</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{suggestion}</p>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="p-3 rounded-xl bg-card border border-border/60">
      <p className="text-[10px] text-muted-foreground">{emoji} {label}</p>
      <p className="font-display font-bold text-base mt-0.5">{value}</p>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-surface-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-display font-bold text-sm">{value}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
