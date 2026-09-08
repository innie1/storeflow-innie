import { useEffect, useMemo, useState } from 'react';

/**
 * The moment the shop is actually open.
 *
 * Setup finished with nothing — the last step was done and the app simply
 * carried on. This is the wow: the screen fills with colour, the sign goes up,
 * and the merchant is told in as many words that they are ready to trade.
 */

interface Props {
  storeName: string;
  /**
   * Whether the walk was finished by rehearsing rather than by real work.
   *
   * The line said "your first job is recorded", which after a rehearsal is
   * simply untrue - and the whole point of the rehearsal is that nothing was.
   */
  practised?: boolean;
  onDone: () => void;
}

const COLORS = ['#FFD166', '#EF476F', '#06D6A0', '#118AB2', '#9B5DE5', '#F97316'];

export default function ReadyForBusiness({ storeName, practised = false, onDone }: Props) {
  const [leaving, setLeaving] = useState(false);

  const bursts = useMemo(
    () => Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.6,
      duration: 2.4 + Math.random() * 2.4,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 8,
      drift: (Math.random() - 0.5) * 120,
    })),
    [],
  );

  useEffect(() => {
    const fade = window.setTimeout(() => setLeaving(true), 5200);
    const close = window.setTimeout(onDone, 6000);
    return () => { window.clearTimeout(fade); window.clearTimeout(close); };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[95] flex items-center justify-center p-6 transition-opacity duration-700 ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        // A solid dark base with the glow laid over it. As a single radial
        // gradient the centre was nearly transparent, so the page underneath
        // read straight through the words.
        background: 'radial-gradient(circle at 50% 38%, rgba(250,204,21,0.20), transparent 62%), rgba(2,6,23,0.94)',
        backdropFilter: 'blur(3px)',
      }}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {bursts.map(fleck => (
          <span
            key={fleck.id}
            className="absolute rounded-[1px]"
            style={{
              left: `${fleck.left}%`,
              top: '-5%',
              width: fleck.size,
              height: fleck.size * 1.5,
              background: fleck.color,
              ['--drift' as string]: `${fleck.drift}px`,
              animation: `ready-fall ${fleck.duration}s linear ${fleck.delay}s forwards`,
            }}
          />
        ))}
      </div>

      <div className="relative text-center space-y-3 max-w-sm">
        <div className="text-6xl animate-bounce" aria-hidden="true">🎉</div>
        <p className="text-[11px] uppercase font-black tracking-[0.2em] text-primary">Setup complete</p>
        <h2 className="font-display font-black text-3xl text-foreground leading-tight">
          {storeName} is ready for business
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {practised
            ? 'Your prices are set and you know how to take a bundle in. Everything from here is real money.'
            : 'Your prices are set and your first job is recorded. Everything from here is real money.'}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-2 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm active:scale-95 transition"
        >
          Let's go
        </button>
      </div>

      <style>{`
        @keyframes ready-fall {
          0%   { transform: translate(0, -10vh) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--drift, 0px), 105vh) rotate(540deg); opacity: 0.15; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="ready-fall"] { animation: none !important; opacity: 0 !important; }
        }
      `}</style>
    </div>
  );
}
