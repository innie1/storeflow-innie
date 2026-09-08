import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { RANGES, revenueInRange, type Range } from '@/lib/revenue-window';

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

interface Props {
  store: StoreData;
  /** Sits in the card's top-right. The month ring goes here on both screens. */
  trailing?: ReactNode;
}

export default function RevenueCard({ store, trailing }: Props) {
  const [range, setRange] = useState<Range>('today');
  const total = useMemo(() => revenueInRange(store, range), [store, range]);
  const label = RANGES.find(option => option.id === range)?.label || '';

  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        {/*
          The word is the control.

          The period used to sit in its own box on the right, which put the
          thing being measured and the thing measuring it at opposite ends of
          the card. The arrow belongs against "Revenue" - that is what it
          changes - and which stretch you are looking at belongs under the
          figure, small, where it reads as a caption rather than a button.

          It is a real select underneath, so a phone opens its own picker.
        */}
        <div className="relative inline-flex items-center gap-1 shrink-0">
          <span className="text-xs text-muted-foreground">Revenue</span>
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

        {trailing}
      </div>

      <p className="font-display font-black text-2xl text-primary mt-1.5">
        ₦{Math.round(total).toLocaleString()}
      </p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
