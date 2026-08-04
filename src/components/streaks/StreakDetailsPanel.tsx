import React, { useRef, useEffect, useState } from 'react';
import { X, Snowflake, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { StoreData } from '@/types/store';
import { getStreakLog, StreakLogDay, nextMilestoneAfter } from '@/lib/streaks';
import { healthScore } from '@/lib/manager-intel';
import RewardIcon from './RewardIcon';
import StreakFlame from './StreakFlame';

function salesTodayCount(store: StoreData): number {
  const todayStr = new Date().toDateString();
  return (store.sales || []).filter(s => new Date(s.date).toDateString() === todayStr).length;
}

export default function StreakDetailsPanel({ store, onClose }: { store: StoreData; onClose: () => void }) {
  const streak = store.streak;
  if (!streak) return null;

  const logDays = getStreakLog(streak, 21, 4, store.createdAt);
  const health = healthScore(store);
  const sales = salesTodayCount(store);
  const freezes = streak.freezesAvailable ?? 0;
  const next = nextMilestoneAfter(streak.count);
  const ownerName = store.storeName || 'there';

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  const [selectedDay, setSelectedDay] = useState<StreakLogDay | null>(null);

  // Auto scroll to today when opened
  useEffect(() => {
    if (todayRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = todayRef.current;
      const scrollLeft = el.offsetLeft - container.clientWidth / 2 + el.clientWidth / 2;
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, []);

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

  const activeDay = selectedDay || logDays.find(d => d.isToday) || logDays[logDays.length - 1];

  const renderStatusIcon = (status: StreakLogDay['status'], dayNum: number) => {
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

  const getStatusColorClass = (status: StreakLogDay['status'], isToday: boolean) => {
    switch (status) {
      case 'completed':
      case 'today_completed':
        return 'bg-gradient-to-br from-emerald-500 to-amber-500 text-white shadow-md shadow-emerald-500/20';
      case 'skipped':
        return 'bg-rose-500/20 border-rose-500/50 text-rose-400 font-bold';
      case 'frozen':
        return 'bg-sky-500/20 border-sky-400/50 text-sky-300 font-bold';
      case 'today_pending':
        return 'border-2 border-orange-400 text-orange-400 bg-orange-500/10 font-bold';
      case 'future':
      default:
        return 'bg-surface-2 text-muted-foreground/40 border border-border/40';
    }
  };

  const getStatusDescription = (day: StreakLogDay) => {
    const formattedDate = new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      weekday: 'short'
    });

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

      <div className="fixed left-1/2 -translate-x-1/2 top-20 md:absolute md:left-0 md:translate-x-0 md:top-full md:mt-2 z-50 w-[320px] max-w-[94vw] rounded-2xl border border-border bg-surface-1 shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
        {/* Header */}
        <div className="relative px-5 pt-5 pb-3 text-center bg-gradient-to-b from-orange-500/15 via-amber-500/5 to-transparent flex flex-col items-center">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center bg-surface-2/80 hover:bg-surface-3 transition-colors text-muted-foreground hover:text-foreground cursor-pointer z-10"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Flame Badge */}
          <div className="mb-2">
            <StreakFlame count={streak.count} size="md" />
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
              className="p-1 rounded-md bg-surface-2 hover:bg-surface-3 transition-colors text-muted-foreground hover:text-foreground"
              title="Scroll back"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleScrollRight}
              className="p-1 rounded-md bg-surface-2 hover:bg-surface-3 transition-colors text-muted-foreground hover:text-foreground"
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
            {logDays.map((d) => {
              const isSelected = activeDay?.date === d.date;
              return (
                <div
                  key={d.date}
                  ref={d.isToday ? todayRef : null}
                  onClick={() => setSelectedDay(d)}
                  className={`flex flex-col items-center gap-1 shrink-0 cursor-pointer transition-transform ${
                    isSelected ? 'scale-105' : 'hover:scale-102'
                  }`}
                >
                  <span className={`text-[10px] font-bold ${d.isToday ? 'text-orange-400 font-extrabold' : 'text-muted-foreground'}`}>
                    {d.shortDay}
                  </span>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${getStatusColorClass(
                      d.status,
                      d.isToday
                    )} ${isSelected ? 'ring-2 ring-orange-400 ring-offset-2 ring-offset-surface-1' : ''}`}
                  >
                    {renderStatusIcon(d.status, d.dayNum)}
                  </div>
                  <span className="text-[9px] text-muted-foreground/80 font-medium">{d.dayNum}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected / Active Day Status Description */}
        <div className="mx-4 my-2 px-3 py-1.5 rounded-lg bg-surface-2/70 border border-border/50 text-[10px] text-center font-semibold text-foreground truncate">
          {getStatusDescription(activeDay)}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 text-[9px] font-bold text-muted-foreground pb-2">
          <span className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[8px]">✓</span>
            Done
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded-full bg-rose-500/30 text-rose-400 border border-rose-500/50 flex items-center justify-center text-[8px]">✕</span>
            Skipped
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3.5 h-3.5 rounded-full bg-sky-500/30 text-sky-300 border border-sky-400/50 flex items-center justify-center text-[8px]">❄</span>
            Freeze
          </span>
        </div>

        {/* Stats card */}
        <div className="mx-4 mb-3 rounded-xl bg-surface-2/60 border border-border/60 px-3 py-2.5">
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
            <div>
              <div className="text-base font-display font-black flex items-center justify-center gap-0.5 text-sky-400">
                <Snowflake className="w-3.5 h-3.5" />
                {freezes}
              </div>
              <div className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Freezes</div>
            </div>
          </div>
        </div>

        {/* Gifts row */}
        {streak.rewards && streak.rewards.length > 0 && (
          <div className="mx-4 mb-3 rounded-xl border border-border/60 px-3 py-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Gifts Earned
              </span>
              <span className="text-[10px] font-bold text-orange-400">{streak.rewards.length}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {streak.rewards.map((r) => (
                <div
                  key={r.day}
                  title={`Day ${r.day} Gift`}
                  className="shrink-0 w-8 h-8 rounded-lg bg-surface-2 border border-border/60 flex items-center justify-center"
                >
                  <RewardIcon itemId={r.itemId} size={18} />
                </div>
              ))}
            </div>
          </div>
        )}

        {next && (
          <div className="px-5 pb-3 text-center text-[11px] font-medium text-muted-foreground">
            <span className="text-orange-400 font-bold">{next - streak.count}</span> more day{next - streak.count === 1 ? '' : 's'} to your next gift
          </div>
        )}
      </div>
    </>
  );
}
