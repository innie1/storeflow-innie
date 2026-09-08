import { useMemo } from 'react';
import type { StoreData } from '@/types/store';
import { breakEven } from '@/lib/service-breakeven';

/**
 * How the month is going, in the corner.
 *
 * A ring, a word, and nothing else. The full figures have a card of their own
 * on the Flow page; this is the glance - is the shop covering itself this
 * month, and is it keeping up.
 *
 * It used to return null whenever the shop had not recorded what its month
 * costs, which is every shop on its first day and most shops for a good while
 * after - so the thing meant to be always in the corner was almost never
 * there, and nobody knew it existed. A grey ring reading "Set costs" is worth
 * far more than nothing: it is the only place in the app that explains why
 * there is no target.
 *
 * The colour is the message:
 *   grey  - no target yet, nothing to judge against
 *   green - covered, or on pace to be
 *   amber - slipping
 *   red   - behind the pace the month needs
 */

interface Props {
  store: StoreData;
  canSeeMoney: boolean;
  onOpen?: () => void;
}

/** Ring and text colour for how the month is going. */
export function tones(state: ReturnType<typeof breakEven>): { ring: string; text: string } {
  if (state.target <= 0) return { ring: 'stroke-muted-foreground/50', text: 'text-muted-foreground' };
  if (state.reached) return { ring: 'stroke-success', text: 'text-success' };

  switch (state.pace) {
    case 'ahead':
    case 'on track':
      return { ring: 'stroke-success', text: 'text-success' };
    case 'slightly behind':
      return { ring: 'stroke-amber-500', text: 'text-amber-500' };
    case 'behind':
      // Red, and only red, for a month the shop will not cover at this rate.
      // It is the one state worth interrupting somebody about.
      return { ring: 'stroke-destructive', text: 'text-destructive' };
    default:
      return { ring: 'stroke-muted-foreground/50', text: 'text-muted-foreground' };
  }
}

export default function BreakEvenPip({ store, canSeeMoney, onOpen }: Props) {
  const state = useMemo(() => breakEven(store), [store]);

  // Money is the owner's business. That is the only reason to hide this.
  if (!canSeeMoney) return null;

  const hasTarget = state.target > 0;
  const percent = Math.round(state.progress * 100);
  const { ring, text } = tones(state);

  // 20px circle, so the ring reads as a ring rather than a smudge.
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  // A shop with no target still gets a ring - an empty one, which is honest,
  // and is what makes "Set costs" legible as a thing to go and fix.
  const filled = hasTarget ? Math.min(1, state.progress) : 0;

  const label = !hasTarget ? 'Set costs' : state.reached ? 'Covered' : `${percent}%`;

  const title = !hasTarget
    ? 'Record your rent and monthly costs to see what this month must take'
    : state.reached
      ? "This month's costs are covered"
      : `${percent}% of what this month must take · ${state.pace}`;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-1.5 h-9 px-2 rounded-xl bg-surface-2 border border-border shrink-0"
      /*
       * No `title`. The browser's own tooltip is a strip of unstyled text
       * placed wherever it likes, and against the right edge of a phone-width
       * layout it ran off the screen. Nothing is lost by dropping it: tapping
       * the ring goes to the full figures and lights them up, which explains
       * far more than a line of hover text, and the label stays for anybody
       * using a screen reader.
       */
      aria-label={title}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5 -rotate-90 shrink-0">
        {/* The track, always grey, so it is a ring before it is a gauge. */}
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
          strokeDashoffset={circumference * (1 - filled)}
        />
      </svg>
      <span className={`text-[11px] font-display font-black ${text}`}>{label}</span>
    </button>
  );
}
