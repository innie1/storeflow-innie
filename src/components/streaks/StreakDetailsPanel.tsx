import { X, Snowflake, Check } from 'lucide-react';
import { StoreData } from '@/types/store';
import { getWeekLog, nextMilestoneAfter } from '@/lib/streaks';
import { healthScore } from '@/lib/manager-intel';
import RewardIcon from './RewardIcon';

function salesTodayCount(store: StoreData): number {
  const todayStr = new Date().toDateString();
  return (store.sales || []).filter(s => new Date(s.date).toDateString() === todayStr).length;
}

export default function StreakDetailsPanel({ store, onClose }: { store: StoreData; onClose: () => void }) {
  const streak = store.streak;
  if (!streak) return null;

  const week = getWeekLog(streak);
  const health = healthScore(store);
  const sales = salesTodayCount(store);
  const freezes = streak.freezesAvailable ?? 0;
  const next = nextMilestoneAfter(streak.count);
  const ownerName = store.storeName || 'there';

  return (
    <>
      {/* Backdrop — tap outside to close */}
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} />

      <div className="fixed left-1/2 -translate-x-1/2 top-24 md:absolute md:left-4 md:translate-x-0 md:top-full md:mt-2 z-50 w-[300px] max-w-[92vw] rounded-2xl border border-border bg-surface-1 shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 text-center bg-gradient-to-b from-orange-500/10 to-transparent">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface-2 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>

          <div className="text-4xl font-display font-black text-orange-500 tracking-tight leading-none">
            {streak.count}
          </div>
          <div className="mt-1 font-display font-bold text-sm">
            {streak.count === 1 ? 'Day' : 'Day'} Streak
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            You're doing great, {ownerName}!
          </div>
        </div>

        {/* Week row */}
        <div className="flex justify-between px-5 pb-4">
          {week.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1.5">
              <span className={`text-[10px] font-bold ${d.isToday ? 'text-orange-500' : 'text-muted-foreground'}`}>
                {d.label}
              </span>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  d.opened
                    ? 'bg-gradient-to-br from-orange-400 to-amber-500 text-white'
                    : d.isToday
                    ? 'border-2 border-orange-400 text-orange-500'
                    : d.isFuture
                    ? 'bg-surface-2 text-muted-foreground/50'
                    : 'bg-surface-2 text-muted-foreground'
                }`}
              >
                {d.opened ? <Check className="w-3 h-3" /> : new Date(d.date + 'T00:00:00').getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Stats card */}
        <div className="mx-4 mb-3 rounded-xl bg-surface-2/60 border border-border/60 px-3 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 text-center">
            Your Stats
          </div>
          <div className="grid grid-cols-4 gap-1 text-center">
            <div>
              <div className="text-base font-display font-black">{streak.count}</div>
              <div className="text-[9px] text-muted-foreground font-semibold">Days</div>
            </div>
            <div>
              <div className="text-base font-display font-black">{sales}</div>
              <div className="text-[9px] text-muted-foreground font-semibold">Sales</div>
            </div>
            <div>
              <div className="text-base font-display font-black">{Math.round(health.overall)}</div>
              <div className="text-[9px] text-muted-foreground font-semibold">Health</div>
            </div>
            <div>
              <div className="text-base font-display font-black flex items-center justify-center gap-0.5">
                <Snowflake className="w-3.5 h-3.5 text-sky-400" />
                {freezes}
              </div>
              <div className="text-[9px] text-muted-foreground font-semibold">Freezes</div>
            </div>
          </div>
        </div>

        {/* Gifts row */}
        {streak.rewards && streak.rewards.length > 0 && (
          <div className="mx-4 mb-4 rounded-xl border border-border/60 px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Gifts Earned
              </span>
              <span className="text-[10px] font-bold text-orange-500">{streak.rewards.length}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {streak.rewards.map((r) => (
                <div
                  key={r.day}
                  title={`Day ${r.day}`}
                  className="shrink-0 w-9 h-9 rounded-lg bg-surface-2 border border-border/60 flex items-center justify-center"
                >
                  <RewardIcon itemId={r.itemId} size={20} />
                </div>
              ))}
            </div>
          </div>
        )}

        {next && (
          <div className="px-5 pb-4 text-center text-[11px] text-muted-foreground">
            {next - streak.count} more day{next - streak.count === 1 ? '' : 's'} to your next gift
          </div>
        )}
      </div>
    </>
  );
}
