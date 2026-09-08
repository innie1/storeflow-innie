import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
      <div className="flex items-center justify-between gap-2">
        {/*
          No currency icon. The figure underneath already starts with a naira
          sign, so a dollar next to the word "Revenue" in a Nigerian shop was
          both redundant and the wrong currency.
        */}
        <span className="text-xs text-muted-foreground">Revenue</span>

        {/*
          A real select, not a row of chips.
          
          Four chips took a whole line and still only fit by scrolling. This is
          one control the width of its longest label, and on a phone it opens
          the system's own picker - bigger targets than anything drawn here.
        */}
        <div className="relative shrink-0">
          <select
            value={range}
            onChange={event => setRange(event.target.value as Range)}
            aria-label="Period"
            className="appearance-none bg-surface-2 border border-border rounded-lg h-7 pl-2.5 pr-7 text-[11px] font-display font-bold text-foreground outline-none cursor-pointer"
          >
            {RANGES.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      <p className="font-display font-black text-2xl text-primary mt-2">
        ₦{Math.round(total).toLocaleString()}
      </p>
    </div>
  );
}
