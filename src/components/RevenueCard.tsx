import { useMemo, useState } from 'react';
import { DollarSign } from 'lucide-react';
import type { StoreData } from '@/types/store';

/**
 * Revenue, over whichever stretch is being asked about.
 *
 * The home screen showed "Today's Revenue" and nothing else, which is the one
 * window that is useless first thing in the morning - at eight o'clock it
 * reads zero whatever kind of month the shop is having, and a shop that opens
 * the app to a zero learns to stop opening it.
 *
 * Yesterday says whether the day just gone was any good. Today is the running
 * total. Fourteen days is long enough to see a pattern through a quiet
 * Tuesday. All time is what the shop has taken since it started, which is the
 * number people actually want when they are wondering whether any of this has
 * been worth it.
 *
 * The choice sticks for the session but is not saved: it is a glance, not a
 * setting, and a shop that left it on "all time" a month ago should not open
 * the app to a number it cannot place.
 */

type Range = 'yesterday' | 'today' | 'fortnight' | 'all';

const RANGES: { id: Range; label: string }[] = [
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'today', label: 'Today' },
  { id: 'fortnight', label: '14 days' },
  { id: 'all', label: 'All time' },
];

const DAY = 86400000;

/** Midnight this morning, where the reader is. */
function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function revenueInRange(store: StoreData, range: Range, now: number = Date.now()): number {
  const dayStart = startOfToday(now);
  const windows: Record<Range, { from: number; to: number }> = {
    yesterday: { from: dayStart - DAY, to: dayStart },
    today: { from: dayStart, to: dayStart + DAY },
    // Thirteen days back plus today, so "14 days" is fourteen days.
    fortnight: { from: dayStart - 13 * DAY, to: dayStart + DAY },
    all: { from: 0, to: Number.MAX_SAFE_INTEGER },
  };
  const window = windows[range];

  return (store.sales || []).reduce((sum, sale) => {
    const at = new Date(String(sale.date || '')).getTime();
    if (!Number.isFinite(at) || at < window.from || at >= window.to) return sum;
    return sum + (Number(sale.total) || 0);
  }, 0);
}

interface Props {
  store: StoreData;
}

export default function RevenueCard({ store }: Props) {
  const [range, setRange] = useState<Range>('today');
  const total = useMemo(() => revenueInRange(store, range), [store, range]);

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <DollarSign className="w-4 h-4" /> Revenue
      </div>
      <p className="font-display font-black text-2xl text-primary mt-2">
        ₦{Math.round(total).toLocaleString()}
      </p>

      {/* Scrolls rather than wraps, so four choices do not become two rows on
          a narrow phone and push everything below it down. */}
      <div className="flex gap-1.5 mt-3 -mx-1 px-1 overflow-x-auto no-scrollbar">
        {RANGES.map(option => (
          <button
            key={option.id}
            onClick={() => setRange(option.id)}
            className={`shrink-0 px-2.5 h-7 rounded-lg text-[11px] font-display font-bold border transition-colors ${
              range === option.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-surface-2 text-muted-foreground border-border'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
