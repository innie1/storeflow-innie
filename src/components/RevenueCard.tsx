import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { RANGES, rangeDates, revenueInRange, type Range } from '@/lib/revenue-window';

/**
 * Revenue, over whichever stretch is being asked about.
 *
 * The home screen showed "Today's Revenue" and nothing else, which is the one
 * window that is useless first thing in the morning - at eight o'clock it
 * reads zero whatever kind of month the shop is having, and a shop that opens
 * the app to a zero learns to stop opening it.
 *
 * So it opens on this week, Monday to Sunday, which is long enough to see a
 * pattern through a quiet Tuesday. Today is the running total, this month (the
 * 1st to the last day) shows how the shop is going over a longer stretch, and
 * last month is a whole month to hold it against. Lifetime is what the
 * shop has taken since it started, which is the number people actually want
 * when they are wondering whether any of this has been worth it. The dates sit
 * under the figure so nobody has to guess which days it covers.
 *
 * The choice sticks for the session but is not saved: it is a glance, not a
 * setting, and a shop that left it on "all time" a month ago should not open
 * the app to a number it cannot place.
 */

interface Props {
  store: StoreData;
  /** Sits in the card's top-right. The month ring goes here on both screens. */
  trailing?: ReactNode;
  /** Lines under the figure that belong with the money: who owes, what is ready. */
  children?: ReactNode;
  /** Half a phone wide on the simple home, where the full-size figure would not fit. */
  compact?: boolean;
}

export default function RevenueCard({ store, trailing, children, compact = false }: Props) {
  const [range, setRange] = useState<Range>('week');
  const total = useMemo(() => revenueInRange(store, range), [store, range]);
  const label = RANGES.find(option => option.id === range)?.label || '';
  const dates = rangeDates(range);

  return (
    <section aria-label="Revenue" className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/*
            The period is the control, and it says which period it is.

            It read "Revenue ⌄", which named the card but not the stretch,
            so the stretch had to be repeated in small print under the
            figure. It is a real select underneath, so a phone opens its own
            picker.
          */}
          <div className="relative inline-flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Revenue · <span className="text-foreground font-bold">{label}</span></span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={range}
              onChange={event => setRange(event.target.value as Range)}
              aria-label="Period"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              {RANGES.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </div>
          <p className={`font-display font-bold ${compact ? 'text-2xl' : 'text-[28px]'} leading-tight mt-1 truncate`}>
            ₦{Math.round(total).toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">Received · {dates}</p>
        </div>
        {trailing}
      </div>
      {children}
    </section>
  );
}
