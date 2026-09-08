import { useMemo } from 'react';
import type { StoreData } from '@/types/store';
import { breakEven } from '@/lib/service-breakeven';

/**
 * How far through the month, in the corner.
 *
 * The full figure had a card of its own on the home screen and it was too
 * much - a number that size, every time the app opens, for something an owner
 * checks now and then rather than every visit. It lives on the Flow page now.
 *
 * What is left here is the one thing worth knowing at a glance: whether this
 * month is covered. A ring, a percentage, and nothing else.
 */

interface Props {
  store: StoreData;
  canSeeMoney: boolean;
  onOpen?: () => void;
}

export default function BreakEvenPip({ store, canSeeMoney, onOpen }: Props) {
  const state = useMemo(() => breakEven(store), [store]);

  // Nothing to show before the shop has said what its month costs.
  if (!canSeeMoney || state.target <= 0) return null;

  const percent = Math.round(state.progress * 100);
  const covered = state.reached;
  const close = !covered && percent >= 80;

  const tone = covered ? 'text-success' : close ? 'text-primary' : 'text-muted-foreground';
  const ring = covered ? 'stroke-success' : close ? 'stroke-primary' : 'stroke-muted-foreground';

  // 20px circle, so the ring reads as a ring rather than a smudge.
  const radius = 9;
  const circumference = 2 * Math.PI * radius;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-1.5 h-9 px-2 rounded-xl bg-surface-2 border border-border shrink-0"
      title={covered ? "This month's costs are covered" : `${percent}% of what this month must take`}
      aria-label={covered ? "This month's costs are covered" : `${percent} percent of this month's target`}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 -rotate-90 shrink-0">
        <circle cx="12" cy="12" r={radius} className="stroke-border" strokeWidth="3" fill="none" />
        <circle
          cx="12"
          cy="12"
          r={radius}
          className={`${ring} transition-[stroke-dashoffset] duration-700`}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, state.progress))}
        />
      </svg>
      <span className={`text-[11px] font-display font-black ${tone}`}>
        {covered ? 'Covered' : `${percent}%`}
      </span>
    </button>
  );
}
