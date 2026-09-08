import { useEffect, useMemo, useState } from 'react';

/**
 * The moment a shop's costs are covered for the month.
 *
 * Everything taken from here is the shop's own, and that is worth a moment -
 * it is the only day in the month where something genuinely changes and
 * nothing on the screen would otherwise say so.
 *
 * Small on purpose. It appears once a month, over a working screen, and a
 * merchant who is mid-drop-off should be able to carry on around it.
 */

interface Props {
  surplus: number;
  onDone: () => void;
}

const GOLD = ['#FFD166', '#F4C430', '#E6B325', '#FFE29A'];

export default function BreakEvenReached({ surplus, onDone }: Props) {
  const [leaving, setLeaving] = useState(false);

  // Gold only. The setup celebration is the colourful one; this is money.
  const flecks = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.5,
      duration: 1.6 + Math.random() * 1.1,
      color: GOLD[i % GOLD.length],
      size: 4 + Math.random() * 4,
    })),
    [],
  );

  const close = () => {
    setLeaving(true);
    setTimeout(onDone, 260);
  };

  // Goes on its own. Nobody should have to dismiss good news mid-job.
  useEffect(() => {
    const timer = setTimeout(close, 5200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4 pointer-events-none transition-all duration-300 ${
        leaving ? 'opacity-0 translate-y-2' : 'opacity-100'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="relative w-full max-w-sm">
        <div className="absolute inset-0 overflow-hidden rounded-2xl">
          {flecks.map(fleck => (
            <span
              key={fleck.id}
              className="absolute rounded-[1px]"
              style={{
                left: `${fleck.left}%`,
                top: '-10%',
                width: fleck.size,
                height: fleck.size * 2,
                background: fleck.color,
                animation: `breakeven-fall ${fleck.duration}s ${fleck.delay}s ease-in forwards`,
              }}
            />
          ))}
        </div>

        <button
          onClick={close}
          className="relative w-full pointer-events-auto rounded-2xl border border-primary/40 bg-card/95 backdrop-blur p-4 text-left shadow-xl"
        >
          <p className="text-[10px] uppercase font-black text-primary">Costs covered</p>
          <p className="font-display font-black text-base mt-0.5">This month has paid for itself</p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            {surplus > 0
              ? `Everything from here is yours. ${`₦${Math.round(surplus).toLocaleString()}`} so far.`
              : 'Rent, salaries and the washing are covered. Everything from here is yours.'}
          </p>
        </button>
      </div>

      <style>{`
        @keyframes breakeven-fall {
          0%   { transform: translateY(-20px) rotate(0deg); opacity: 0; }
          15%  { opacity: 1; }
          100% { transform: translateY(160px) rotate(220deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
