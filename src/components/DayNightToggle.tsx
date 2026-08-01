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

  const cycleMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (mode === 'light') choose('system');
    else if (mode === 'system') choose('dark');
    else choose('light');
  };

  const getKnobLeft = () => {
    if (mode === 'light') return '6px';
    if (mode === 'system') return 'calc(50% - 26px)';
    return 'calc(100% - 58px)';
  };

  const getTrackBackground = () => {
    if (mode === 'light') return 'linear-gradient(180deg, #4fb8f0 0%, #a8dcf7 100%)';
    if (mode === 'system') return 'linear-gradient(90deg, #4fb8f0 0%, #4fb8f0 40%, #0b1220 60%, #16213e 100%)';
    return 'linear-gradient(180deg, #0b1220 0%, #16213e 100%)';
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 3-Position Animated Track with Seamless In-line Transition Sync */}
      <div
        className="relative w-48 h-16 rounded-full overflow-hidden shadow-inner mx-auto block cursor-pointer select-none"
        style={{
          background: getTrackBackground(),
          transition: 'background 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Sky decorations — clouds (light) or stars (dark) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: mode === 'light' ? 1 : mode === 'system' ? 1 : 0,
            transition: 'opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {/* Only show these when light or system (system shows on left side) */}
          <div style={{ opacity: mode === 'system' ? 0.6 : 1, transition: 'opacity 0.45s' }}>
            <span className="absolute rounded-full bg-white/80" style={{ width: 22, height: 10, top: 14, left: 24 }} />
            <span className="absolute rounded-full bg-white/70" style={{ width: 14, height: 8, top: 10, left: 40 }} />
            <span className="absolute rounded-full bg-white/60" style={{ width: 16, height: 8, top: 40, left: 16 }} />
            
            {/* Animated Clouds & Birds */}
            <div className="absolute top-2 left-0 animate-cloud">
              <span className="absolute rounded-full bg-white/40" style={{ width: 30, height: 12 }} />
              <span className="absolute rounded-full bg-white/40" style={{ width: 20, height: 10, top: -4, left: 5 }} />
            </div>
            <div className="absolute top-6 left-0 animate-cloud-delayed">
              <span className="absolute rounded-full bg-white/30" style={{ width: 24, height: 8 }} />
            </div>
            <div className="absolute animate-bird"><div className="bird-shape" /></div>
            <div className="absolute top-4 animate-bird-delayed"><div className="bird-shape" /></div>
          </div>
        </div>

        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: mode === 'dark' ? 1 : mode === 'system' ? 1 : 0,
            transition: 'opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div style={{ opacity: mode === 'system' ? 0.6 : 1, transition: 'opacity 0.45s' }}>
            {[
              { top: 10, left: 125, s: 2 },
              { top: 22, left: 140, s: 1.5 },
              { top: 14, left: 155, s: 2 },
              { top: 34, left: 130, s: 1.5 },
              { top: 44, left: 160, s: 2 },
              { top: 48, left: 140, s: 1.5 },
            ].map((s, i) => (
              <span
                key={i}
                className="absolute rounded-full bg-white"
                style={{
                  width: s.s * 4,
                  height: s.s * 4,
                  top: s.top,
                  left: s.left,
                  opacity: 0.5 + (i % 3) * 0.15,
                }}
              />
            ))}
            
            {/* Animated Dark Clouds & Shooting Stars */}
            <div className="absolute top-3 left-0 animate-dark-cloud">
              <span className="absolute rounded-full bg-black/30" style={{ width: 35, height: 14 }} />
              <span className="absolute rounded-full bg-black/20" style={{ width: 25, height: 12, top: -4, left: 5 }} />
            </div>
            
            <div className="absolute animate-shooting-star"><div className="shooting-star-shape" /></div>
            <div className="absolute animate-shooting-star-delayed"><div className="shooting-star-shape" /></div>
          </div>
        </div>

        {/* Clickable Tap Areas across track */}
        <div className="absolute inset-0 flex z-20">
          <button
            onClick={() => choose('light')}
            aria-label="Light mode"
            className="flex-1 h-full cursor-pointer focus:outline-none"
            title="Light Mode"
          />
          <button
            onClick={() => choose('system')}
            aria-label="System mode"
            className="flex-1 h-full cursor-pointer focus:outline-none"
            title="System Mode (Half Sun / Half Moon)"
          />
          <button
            onClick={() => choose('dark')}
            aria-label="Dark mode"
            className="flex-1 h-full cursor-pointer focus:outline-none"
            title="Dark Mode"
          />
        </div>

        <div
          onClick={cycleMode}
          className="absolute top-1.5 w-13 h-13 rounded-full shadow-lg z-30 cursor-pointer overflow-hidden"
          style={{
            width: 52,
            height: 52,
            left: getKnobLeft(),
            transform: mode === 'light' ? 'rotate(0deg)' : mode === 'system' ? 'rotate(90deg)' : 'rotate(180deg)',
            transition: 'left 0.45s cubic-bezier(0.4, 0, 0.2, 1), transform 0.45s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.45s ease',
            boxShadow:
              mode === 'light'
                ? '0 0 18px rgba(255,210,63,0.7)'
                : mode === 'system'
                ? '0 0 16px rgba(255,210,63,0.4)'
                : '0 0 14px rgba(214,221,232,0.5)',
          }}
        >
          {/* Light Mode: Original Golden Radial Sun */}
          <div
            className="absolute inset-0 w-full h-full rounded-full transition-opacity duration-500"
            style={{
              background: 'radial-gradient(circle at 35% 30%, #fff6b0, #ffd23f 75%)',
              opacity: mode === 'light' ? 1 : 0
            }}
          />

          {/* Dark Mode: Original Silver Radial Moon with Craters */}
          <div
            className="absolute inset-0 w-full h-full rounded-full transition-opacity duration-500"
            style={{
              background: 'radial-gradient(circle at 35% 30%, #f4f6fa, #d6dde8 70%)',
              opacity: mode === 'dark' ? 1 : 0
            }}
          >
            <span className="absolute rounded-full bg-black/10" style={{ width: 10, height: 10, top: 12, left: 10 }} />
            <span className="absolute rounded-full bg-black/10" style={{ width: 6, height: 6, top: 26, left: 24 }} />
            <span className="absolute rounded-full bg-black/10" style={{ width: 5, height: 5, top: 14, left: 30 }} />
          </div>

          {/* System Mode: Half Sun / Half Moon Split Knob */}
          <div 
            className="absolute inset-0 w-full h-full rounded-full flex transition-opacity duration-500"
            style={{ opacity: mode === 'system' ? 1 : 0 }}
          >
            {/* Left Half: Original Sun Radial Gradient */}
            <div
              className="w-1/2 h-full relative"
              style={{
                background: 'radial-gradient(circle at 70% 30%, #fff6b0, #ffd23f 80%)',
                borderRight: '1px solid rgba(0,0,0,0.1)',
              }}
            />
            {/* Right Half: Original Moon Radial Gradient with Crater */}
            <div
              className="w-1/2 h-full relative"
              style={{
                background: 'radial-gradient(circle at 30% 30%, #f4f6fa, #d6dde8 80%)',
              }}
            >
              <span className="absolute rounded-full bg-black/10" style={{ width: 6, height: 6, top: 14, right: 6 }} />
              <span className="absolute rounded-full bg-black/10" style={{ width: 5, height: 5, top: 28, right: 8 }} />
            </div>
          </div>
        </div>
      </div>

      {/* Mode Selector Buttons */}
      <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-full border border-border">
        <button
          onClick={() => choose('light')}
          className={`px-3 py-1 rounded-full text-xs font-display font-bold transition-colors ${
            mode === 'light' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Light
        </button>
        <button
          onClick={() => choose('system')}
          className={`px-3 py-1 rounded-full text-xs font-display font-bold transition-colors ${
            mode === 'system' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          System
        </button>
        <button
          onClick={() => choose('dark')}
          className={`px-3 py-1 rounded-full text-xs font-display font-bold transition-colors ${
            mode === 'dark' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Dark
        </button>
      </div>
    </div>
  );
}
