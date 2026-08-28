import React, { useRef, useEffect, useState } from 'react';
import { X, Snowflake, Check, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { StoreData } from '@/types/store';
import { getStreakLog, StreakLogDay, nextMilestoneAfter, STREAK_MILESTONES } from '@/lib/streaks';
import { healthScore } from '@/lib/manager-intel';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';
import RewardIcon from './RewardIcon';
import StreakFlame from './StreakFlame';

function salesTodayCount(store: StoreData): number {
  const todayStr = new Date().toDateString();
  return (store.sales || []).filter(s => new Date(s.date).toDateString() === todayStr).length;
}

export default function StreakDetailsPanel({ store, onClose }: { store: StoreData; onClose: () => void }) {
  const streak = store.streak;
  useBodyScrollLock(!!streak);

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const [selectedDay, setSelectedDay] = useState<StreakLogDay | null>(null);
  const [showFreezeInfo, setShowFreezeInfo] = useState(false);

  // Auto scroll to today when opened
  useEffect(() => {
    if (todayRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = todayRef.current;
      const scrollLeft = el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, []);

  if (!streak) return null;

  const logDays = getStreakLog(streak, 21, 4, store.createdAt);
  const health = healthScore(store);
  const sales = salesTodayCount(store);
  const freezes = streak.freezesAvailable ?? 0;
  const next = nextMilestoneAfter(streak.count);
  const ownerName = store.storeName || 'there';

  const handleScrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -160, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 160, behavior: 'smooth' });
    }
  };

  // Compute projected/actual streak count for each log day to check milestones
  const todayIdx = logDays.findIndex(d => d.isToday);
  const dayCounts = new Array(logDays.length).fill(0);
  
  if (todayIdx !== -1) {
    const isTodayDone = logDays[todayIdx].status === 'today_completed';
    const currentCount = streak.count;
    
    // 1. Project future/today counts
    if (isTodayDone) {
      dayCounts[todayIdx] = currentCount;
      for (let i = todayIdx + 1; i < logDays.length; i++) {
        dayCounts[i] = currentCount + (i - todayIdx);
      }
    } else {
      const nextCountToday = currentCount === 0 ? 1 : currentCount + 1;
      dayCounts[todayIdx] = nextCountToday;
      for (let i = todayIdx + 1; i < logDays.length; i++) {
        dayCounts[i] = nextCountToday + (i - todayIdx);
      }
    }
    
    // 2. Trace past counts backwards
    let lastKnownCompletedIdx = -1;
    let lastKnownCount = 0;
    
    if (isTodayDone) {
      lastKnownCompletedIdx = todayIdx;
      lastKnownCount = currentCount;
    } else {
      const lastOpenIdx = logDays.findIndex(d => d.date === streak.lastOpenDate);
      if (lastOpenIdx !== -1) {
        lastKnownCompletedIdx = lastOpenIdx;
        lastKnownCount = currentCount;
        dayCounts[lastOpenIdx] = currentCount;
      }
    }
    
    if (lastKnownCompletedIdx !== -1) {
      let tempCount = lastKnownCount;
      for (let i = lastKnownCompletedIdx - 1; i >= 0; i--) {
        const status = logDays[i].status;
        if (status === 'completed' || status === 'frozen') {
          if (status === 'completed') {
            tempCount = tempCount - 1;
          }
          dayCounts[i] = Math.max(1, tempCount);
        } else {
          tempCount = 0;
          dayCounts[i] = 0;
        }
      }
    }
  }

  const activeDay = selectedDay || logDays.find(d => d.isToday) || logDays[logDays.length - 1];
  const activeDayIdx = logDays.findIndex(d => d.date === activeDay.date);
  const activeDayCount = activeDayIdx !== -1 ? dayCounts[activeDayIdx] : 0;
  const isActiveMilestone = STREAK_MILESTONES.includes(activeDayCount);

  const renderStatusIcon = (status: StreakLogDay['status'], dayNum: number, isMilestone: boolean) => {
    if (isMilestone) {
      switch (status) {
        case 'completed':
        case 'today_completed':
          return <Star className="w-3.5 h-3.5 fill-current stroke-[2.25] text-amber-950" />;
        case 'frozen':
          return <Snowflake className="w-3.5 h-3.5 text-sky-400" />;
        case 'skipped':
          return <X className="w-3.5 h-3.5 stroke-[3.5] text-rose-500" />;
        case 'today_pending':
        case 'future':
        default:
          return <Star className="w-3.5 h-3.5 fill-none stroke-[2.5]" />;
      }
    }

    switch (status) {
      case 'completed':
      case 'today_completed':
        return <Check className="w-3.5 h-3.5 stroke-[3]" />;
      case 'skipped':
        return <X className="w-3.5 h-3.5 stroke-[3]" />;
      case 'frozen':
        return <Snowflake className="w-3.5 h-3.5" />;
      case 'today_pending':
        return <span className="font-bold text-[10px] animate-pulse">!</span>;
      case 'future':
      default:
        return <span className="text-[10px] font-bold">{dayNum}</span>;
    }
  };

  const getStatusColorClass = (status: StreakLogDay['status'], isToday: boolean, isMilestone: boolean) => {
    if (isMilestone) {
      switch (status) {
        case 'completed':
        case 'today_completed':
          return 'bg-gradient-to-br from-amber-400 to-yellow-500 text-amber-950 shadow-md shadow-amber-500/30 ring-2 ring-yellow-400 border border-yellow-500';
        case 'skipped':
          return 'bg-rose-500/10 border border-rose-500/50 text-rose-400';
        case 'frozen':
          return 'bg-sky-500/20 border border-sky-400/50 text-sky-300';
        case 'today_pending':
          return 'border border-amber-400 text-amber-400 bg-amber-500/10 font-bold animate-pulse';
        case 'future':
        default:
          return 'border border-amber-500/40 text-amber-500/60 bg-transparent';
      }
    }

    switch (status) {
      case 'completed':
      case 'today_completed':
        return 'bg-primary/25 text-primary border border-primary/40 shadow-sm shadow-primary/10 font-bold';
      case 'skipped':
        return 'bg-rose-500/20 border border-rose-500/50 text-rose-400 font-bold';
      case 'frozen':
        return 'bg-sky-500/20 border border-sky-400/50 text-sky-300 font-bold';
      case 'today_pending':
        return 'border-2 border-primary text-primary bg-primary/10 font-bold animate-pulse';
      case 'future':
      default:
        return 'bg-surface-3 text-muted-foreground/40 border border-border/40';
    }
  };

  const getStatusDescription = (day: StreakLogDay, countOnDay: number, isMilestone: boolean) => {
    const formattedDate = new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    });

    if (isMilestone) {
      switch (day.status) {
        case 'completed':
        case 'today_completed':
          return `⭐ ${formattedDate} — Milestone reached! Surprise reward unlocked!`;
        case 'skipped':
          return `✕ ${formattedDate} — Missed milestone surprise`;
        case 'frozen':
          return `❄ ${formattedDate} — Milestone saved by Streak Freeze!`;
        case 'today_pending':
          return `🎁 ${formattedDate} — Complete today to unlock a surprise milestone reward!`;
        case 'future':
        default:
          return `🎁 ${formattedDate} — Projected milestone surprise day!`;
      }
    }

    switch (day.status) {
      case 'completed':
      case 'today_completed':
        return `✓ ${formattedDate} — Store activity logged`;
      case 'skipped':
        return `✕ ${formattedDate} — Day skipped`;
      case 'frozen':
        return `❄ ${formattedDate} — Protected by Streak Freeze`;
      case 'today_pending':
        return `🔥 ${formattedDate} — Open shop today to extend streak`;
      case 'future':
      default:
        return `📅 ${formattedDate} — Upcoming`;
    }
  };

  return (
    <>
      {/* Backdrop — tap outside to close */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-in fade-in-0 duration-200" onClick={onClose} />

      <div className="fixed inset-x-3 top-20 md:inset-x-auto md:absolute md:right-0 md:top-full md:mt-2 z-50 md:w-[340px] rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200 md:origin-top-right">
        {/* Header */}
        <div className="relative px-5 pt-5 pb-3 text-center bg-gradient-to-b from-primary/20 via-primary/5 to-transparent flex flex-col items-center">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center bg-surface-3/80 hover:bg-surface-3 transition-colors text-muted-foreground hover:text-foreground cursor-pointer z-10"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Flame Badge — bigger, no duplicate number */}
          <div className="mb-2">
            <StreakFlame count={streak.count} size="lg" showCount={false} />
          </div>

          <div className="font-display font-black text-xl text-foreground tracking-tight">
            {streak.count} {streak.count === 1 ? 'Day' : 'Days'} Streak
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 font-medium">
            You're doing great, {ownerName}!
          </div>
        </div>

        {/* Scrollable Day Log Header + Navigation */}
        <div className="px-4 pt-2 pb-1 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
          <span className="uppercase tracking-wider">Streak Calendar Log</span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleScrollLeft}
              className="p-1 rounded-md bg-surface-3 hover:bg-surface-3/70 transition-colors text-muted-foreground hover:text-foreground"
              title="Scroll back"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleScrollRight}
              className="p-1 rounded-md bg-surface-3 hover:bg-surface-3/70 transition-colors text-muted-foreground hover:text-foreground"
              title="Scroll forward"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Day log track */}
        <div className="relative px-2">
          <div
            ref={scrollRef}
            className="flex items-center gap-2 overflow-x-auto px-2 py-2 no-scrollbar scroll-smooth"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {logDays.map((d, index) => {
              const isSelected = activeDay?.date === d.date;
              const dayCount = dayCounts[index] || 0;
              const isMilestone = STREAK_MILESTONES.includes(dayCount);
              return (
                <div
                  key={d.date}
                  ref={d.isToday ? todayRef : null}
                  onClick={() => setSelectedDay(d)}
                  className={`flex flex-col items-center gap-1 shrink-0 cursor-pointer transition-transform ${
                    isSelected ? 'scale-105' : 'hover:scale-102'
                  }`}
                >
                  <span className={`text-[10px] font-bold ${d.isToday ? 'text-primary font-extrabold' : 'text-muted-foreground'}`}>
                    {d.shortDay}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${getStatusColorClass(
                      d.status,
                      d.isToday,
                      isMilestone
                    )} ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-1' : ''}`}
                  >
                    {renderStatusIcon(d.status, d.dayNum, isMilestone)}
                  </div>
                  <span className="text-[9px] text-muted-foreground/80 font-medium">{d.dayNum}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats card */}
        <div className="mx-4 mb-3 rounded-xl bg-surface-3/60 border border-border/60 px-3 py-2.5">
          <div className="grid grid-cols-4 gap-1 text-center">
            <div>
              <div className="text-base font-display font-black text-foreground">{streak.count}</div>
              <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Days</div>
            </div>
            <div>
              <div className="text-base font-display font-black text-foreground">{sales}</div>
              <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Sales</div>
            </div>
            <div>
              <div className="text-base font-display font-black text-foreground">{Math.round(health.overall)}</div>
              <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Health</div>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowFreezeInfo(v => !v)}
                className="w-full cursor-pointer"
              >
                <div className="text-base font-display font-black flex items-center justify-center gap-0.5 text-sky-400">
                  <Snowflake className="w-3.5 h-3.5" />
                  {freezes}
                </div>
                <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Freezes</div>
              </button>
              {showFreezeInfo && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-40 rounded-lg bg-surface-3 border border-border/60 px-2.5 py-1.5 text-[10px] text-center text-foreground shadow-lg z-10">
                  Used automatically when you miss a day
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Gifts row */}
        {streak.rewards && streak.rewards.length > 0 && (
          <div className="mx-4 mb-3 rounded-xl border border-border/60 px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Gifts Earned (Tap to use!)
              </span>
              <span className="text-[10px] font-bold text-primary">{streak.rewards.length}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {streak.rewards.map((r) => (
                <button
                  key={r.day}
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('storeflow-use-item', { detail: { itemId: r.itemId } }));
                    onClose();
                  }}
                  title={`Tap Flow to use Day ${r.day} Gift!`}
                  className="shrink-0 w-9 h-9 rounded-lg bg-surface-3 hover:bg-primary/20 border border-border/80 hover:border-primary/50 flex items-center justify-center transition-all cursor-pointer active:scale-90"
                >
                  <RewardIcon itemId={r.itemId} size={18} />
                </button>
              ))}
            </div>
          </div>
        )}

        {next && (
          <div className="px-5 pb-3 text-center text-[11px] font-medium text-muted-foreground">
            <span className="text-primary font-bold">{next - streak.count}</span> more day{next - streak.count === 1 ? '' : 's'} to your next gift
          </div>
        )}
      </div>
    </>
  );
}
