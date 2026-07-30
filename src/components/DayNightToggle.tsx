import { useEffect, useState } from 'react';
import { ThemeMode, getThemeMode, setThemeMode } from '@/lib/theme';

interface DayNightToggleProps {
  onChange?: (mode: ThemeMode) => void;
}

export default function DayNightToggle({ onChange }: DayNightToggleProps) {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode());
  const [isDark, setIsDark] = useState(() => {
    const m = getThemeMode();
    if (m === 'dark') return true;
    if (m === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mq.matches);
    const listener = () => setIsDark(mq.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [mode]);

  const choose = (next: ThemeMode) => {
    setMode(next);
    setIsDark(next === 'dark' || (next === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));
    setThemeMode(next);
    onChange?.(next);
  };

  const handleFlip = () => choose(isDark ? 'light' : 'dark');

  return (
    <div className="space-y-2.5">
      <button
        onClick={handleFlip}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="relative w-32 h-16 rounded-full overflow-hidden shadow-inner mx-auto block"
        style={{
          background: isDark
            ? 'linear-gradient(180deg, #0b1220 0%, #16213e 100%)'
            : 'linear-gradient(180deg, #4fb8f0 0%, #a8dcf7 100%)',
          transition: 'background 0.5s ease',
        }}
      >
        {/* Sky decorations — clouds (light) or stars (dark), original CSS shapes */}
        <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: isDark ? 0 : 1 }}>
          <span className="absolute rounded-full bg-white/80" style={{ width: 22, height: 10, top: 14, left: 62 }} />
          <span className="absolute rounded-full bg-white/70" style={{ width: 14, height: 8, top: 10, left: 76 }} />
          <span className="absolute rounded-full bg-white/60" style={{ width: 16, height: 8, top: 40, left: 68 }} />
        </div>
        <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: isDark ? 1 : 0 }}>
          {[
            { top: 10, left: 20, s: 2 }, { top: 22, left: 34, s: 1.5 }, { top: 14, left: 44, s: 2 },
            { top: 34, left: 24, s: 1.5 }, { top: 44, left: 40, s: 2 }, { top: 48, left: 20, s: 1.5 },
            { top: 8, left: 30, s: 1.5 }, { top: 28, left: 14, s: 1.5 },
          ].map((s, i) => (
            <span key={i} className="absolute rounded-full bg-white" style={{ width: s.s * 4, height: s.s * 4, top: s.top, left: s.left, opacity: 0.5 + (i % 3) * 0.15 }} />
          ))}
        </div>

        {/* Sliding sun / moon knob */}
        <div
          className="absolute top-1.5 w-13 h-13 rounded-full shadow-lg"
          style={{
            width: 52, height: 52,
            left: isDark ? 6 : 'calc(100% - 58px)',
            transition: 'left 0.5s cubic-bezier(0.68, -0.4, 0.32, 1.4), background 0.4s ease',
            background: isDark
              ? 'radial-gradient(circle at 35% 30%, #f4f6fa, #d6dde8 70%)'
              : 'radial-gradient(circle at 35% 30%, #fff6b0, #ffd23f 75%)',
            boxShadow: isDark ? '0 0 14px rgba(214,221,232,0.5)' : '0 0 18px rgba(255,210,63,0.7)',
          }}
        >
          {isDark && (
            <>
              <span className="absolute rounded-full bg-black/10" style={{ width: 10, height: 10, top: 12, left: 10 }} />
              <span className="absolute rounded-full bg-black/10" style={{ width: 6, height: 6, top: 26, left: 24 }} />
              <span className="absolute rounded-full bg-black/10" style={{ width: 5, height: 5, top: 14, left: 30 }} />
            </>
          )}
        </div>
      </button>

      <div className="flex justify-center">
        <button
          onClick={() => choose('system')}
          className={`text-[11px] font-display font-bold px-3 py-1.5 rounded-full border transition-colors ${mode === 'system' ? 'bg-primary/10 text-primary border-primary/40' : 'bg-surface-2 text-muted-foreground border-border'}`}
        >
          {mode === 'system' ? '✓ Matching System' : 'Match System'}
        </button>
      </div>
    </div>
  );
}
