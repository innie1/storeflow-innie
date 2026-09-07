import { useMemo, useState } from 'react';
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
 * It is deliberately not a modal. There is nothing to dismiss, nothing blocks
 * the screen, and the confetti falls once per day per device rather than on
 * every render, so it is a lift on opening the app rather than a page that
 * will not settle.
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

export default function CelebrationRibbon({ store }: Props) {
  const milestone = useMemo(() => activeCelebration(store), [store]);

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

      <div className="relative flex items-center gap-3">
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
