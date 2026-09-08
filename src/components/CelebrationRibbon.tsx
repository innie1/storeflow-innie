import { useMemo, useState } from 'react';
import { ChevronDown, Minus } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { activeCelebration, CELEBRATION_DAYS, shouldRainToday } from '@/lib/milestones';

/**
 * The dashboard wearing a recent win.
 *
 * The celebration modal ran for about four seconds and then the shop looked
 * exactly as it had the day before — the biggest moment in the business came
 * and went in the time it takes to blink. A large or epic milestone now leaves
 * a ribbon on the dashboard for a few days.
 *
 * It is deliberately not a modal: nothing blocks the screen, and the confetti
 * falls once per day per device rather than on every render, so it is a lift
 * on opening the app rather than a page that will not settle.
 *
 * It can be made small, though. A full-width card carrying an emoji, a label,
 * a headline and a subtitle is right on the morning it appears and too much on
 * the fourth day, when the shop is trying to get past it to the day's work.
 * Small keeps the win on the screen - which is the whole point of the feature,
 * and why this shrinks rather than closes - in one slim line. The choice is
 * remembered per milestone, because a card that springs back to full size on
 * the next screen has not been made small at all.
 */

interface Props {
  store: StoreData;
}

interface Fleck {
  id: number;
  left: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
}

const COLORS = ['#FFD166', '#EF476F', '#06D6A0', '#118AB2', '#9B5DE5'];

const SMALL_KEY = 'storeflow_celebration_small_';

function wasMadeSmall(milestoneId: string): boolean {
  try { return localStorage.getItem(SMALL_KEY + milestoneId) === '1'; } catch { return false; }
}

function rememberSize(milestoneId: string, small: boolean): void {
  try {
    if (small) localStorage.setItem(SMALL_KEY + milestoneId, '1');
    else localStorage.removeItem(SMALL_KEY + milestoneId);
  } catch { /* private mode */ }
}

export default function CelebrationRibbon({ store }: Props) {
  const milestone = useMemo(() => activeCelebration(store), [store]);
  const [small, setSmall] = useState(() => (milestone ? wasMadeSmall(milestone.id) : false));

  // Read once on mount: whether this device has already had today's confetti.
  const [raining] = useState(() => (milestone ? shouldRainToday(milestone.id) : false));

  const flecks = useMemo<Fleck[]>(() => {
    if (!raining) return [];
    return Array.from({ length: 26 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2.2,
      duration: 2.6 + Math.random() * 2.2,
      color: COLORS[i % COLORS.length],
      size: 5 + Math.random() * 5,
    }));
  }, [raining]);

  if (!milestone) return null;

  const setSize = (next: boolean) => {
    setSmall(next);
    rememberSize(milestone.id, next);
  };

  /*
   * Small: one line, and nothing else.
   *
   * Still the shop's win, still on the screen, still tappable to bring back -
   * but taking the height of a row rather than a card.
   */
  if (small) {
    return (
      <button
        type="button"
        onClick={() => setSize(false)}
        className="w-full flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 h-10 text-left"
        aria-label={`${milestone.title}. Tap to open`}
      >
        <span className="text-base leading-none shrink-0" aria-hidden="true">{milestone.emoji}</span>
        <span className="font-display font-black text-xs text-foreground truncate flex-1">{milestone.title}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-card to-card p-4">
      {/* Falling confetti, behind the words. */}
      {raining && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          {flecks.map(fleck => (
            <span
              key={fleck.id}
              className="absolute top-0 rounded-[1px]"
              style={{
                left: `${fleck.left}%`,
                width: fleck.size,
                height: fleck.size * 1.6,
                background: fleck.color,
                opacity: 0.85,
                animation: `celebration-fall ${fleck.duration}s linear ${fleck.delay}s forwards`,
              }}
            />
          ))}
        </div>
      )}

      {/* The way to make it small, on the card itself. */}
      <button
        type="button"
        onClick={() => setSize(true)}
        aria-label="Make this smaller"
        className="absolute top-2.5 right-2.5 z-10 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground bg-surface-2/80 border border-border"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>

      <div className="relative flex items-center gap-3 pr-8">
        <div className="text-3xl leading-none shrink-0" aria-hidden="true">{milestone.emoji}</div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-black tracking-wider text-primary">
            {milestone.tier === 'epic' ? 'Legendary milestone' : 'Major milestone'}
          </p>
          <p className="font-display font-black text-lg text-foreground leading-tight">{milestone.title}</p>
          <p className="text-xs text-muted-foreground leading-snug">{milestone.subtitle}</p>
        </div>
      </div>

      <style>{`
        @keyframes celebration-fall {
          0%   { transform: translateY(-12px) rotate(0deg); opacity: 0.9; }
          100% { transform: translateY(140px) rotate(320deg); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="celebration-fall"] { animation: none !important; opacity: 0 !important; }
        }
      `}</style>
    </div>
  );
}

export { CELEBRATION_DAYS };
