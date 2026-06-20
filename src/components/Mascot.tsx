import { useState, useEffect } from 'react';

// Flow — StoreFlow's lightweight inline mascot.
// Pure SVG (no images, no Lottie) so app stays small and offline-friendly.
// Theme-aware: renders different box shapes/colors matching the theme.

export type MascotMood =
  | 'idle'
  | 'happy'
  | 'thinking'
  | 'warning'
  | 'celebrating'
  | 'sleeping'
  | 'confident'
  | 'neutral'
  | 'concerned'
  | 'worried';

interface MascotProps {
  size?: number;
  mood?: MascotMood;
  className?: string;
  animate?: boolean;
}

export default function Mascot({ size = 64, mood = 'idle', className = '', animate = true }: MascotProps) {
  const [activeTheme, setActiveTheme] = useState<'graphite' | 'blue' | 'forest'>('graphite');

  useEffect(() => {
    const checkTheme = () => {
      const isBlue = document.documentElement.classList.contains('theme-blue');
      const isForest = document.documentElement.classList.contains('theme-forest');
      if (isBlue) setActiveTheme('blue');
      else if (isForest) setActiveTheme('forest');
      else setActiveTheme('graphite');
    };
    checkTheme();

    const observer = new MutationObserver(() => {
      checkTheme();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const eyeShape =
    mood === 'sleeping' ? (
      <>
        <path d="M20 35 q3 -3 6 0" stroke="#0b0b12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M38 35 q3 -3 6 0" stroke="#0b0b12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </>
    ) : mood === 'confident' ? (
      <>
        {/* Sunglasses */}
        <path d="M16 30 h12 v5 c0 3.5 -2.5 6.5 -6 6.5 h-1 c-3.5 0 -6 -3 -6 -6.5 z" fill="#0b0b12" />
        <path d="M36 30 h12 v5 c0 3.5 -2.5 6.5 -6 6.5 h-1 c-3.5 0 -6 -3 -6 -6.5 z" fill="#0b0b12" />
        <line x1="28" y1="32" x2="36" y2="32" stroke="#0b0b12" strokeWidth="2" />
        {/* Reflection glare on glass */}
        <line x1="18" y1="32" x2="22" y2="36" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
        <line x1="38" y1="32" x2="42" y2="36" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      </>
    ) : mood === 'concerned' || mood === 'warning' ? (
      <g className={animate ? "animate-[eye-blink_4.5s_infinite]" : ""} style={{ transformOrigin: 'center 33px' }}>
        {/* Concerned slanted eyebrows */}
        <line x1="17" y1="27" x2="25" y2="29" stroke="#0b0b12" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="47" y1="27" x2="39" y2="29" stroke="#0b0b12" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="23" cy="33" r="3.5" fill="#0b0b12" />
        <circle cx="41" cy="33" r="3.5" fill="#0b0b12" />
        <circle cx="21.5" cy="31.5" r="1" fill="#ffffff" />
        <circle cx="39.5" cy="31.5" r="1" fill="#ffffff" />
      </g>
    ) : mood === 'worried' ? (
      <g className={animate ? "animate-[eye-blink_4.5s_infinite]" : ""} style={{ transformOrigin: 'center 33px' }}>
        {/* Worried raised eyebrows */}
        <line x1="17" y1="29" x2="25" y2="27" stroke="#0b0b12" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="47" y1="29" x2="39" y2="27" stroke="#0b0b12" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="23" cy="33" r="3.5" fill="#0b0b12" />
        <circle cx="41" cy="33" r="3.5" fill="#0b0b12" />
        <circle cx="21.5" cy="31.5" r="1" fill="#ffffff" />
        <circle cx="39.5" cy="31.5" r="1" fill="#ffffff" />
      </g>
    ) : (
      <g className={animate ? "animate-[eye-blink_4.5s_infinite]" : ""} style={{ transformOrigin: 'center 33px' }}>
        <circle cx="23" cy="33" r="3.5" fill="#0b0b12" />
        <circle cx="41" cy="33" r="3.5" fill="#0b0b12" />
        <circle cx="21.5" cy="31.5" r="1" fill="#ffffff" />
        <circle cx="39.5" cy="31.5" r="1" fill="#ffffff" />
      </g>
    );

  const mouth =
    mood === 'warning' || mood === 'concerned' || mood === 'worried' ? (
      <path d="M26 43 q6 -3 12 0" stroke="#0b0b12" strokeWidth="2" fill="none" strokeLinecap="round" />
    ) : mood === 'sleeping' ? (
      <path d="M28 43 h8" stroke="#0b0b12" strokeWidth="2" strokeLinecap="round" />
    ) : mood === 'celebrating' || mood === 'happy' || mood === 'confident' ? (
      <path d="M23 40 q9 8 18 0" stroke="#0b0b12" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    ) : (
      <path d="M25 41 q7 4 14 0" stroke="#0b0b12" strokeWidth="2" fill="none" strokeLinecap="round" />
    );

  const cheeks = (
    <>
      <circle cx="16" cy="37" r="2.2" fill="#f43f5e" opacity="0.6" />
      <circle cx="48" cy="37" r="2.2" fill="#f43f5e" opacity="0.6" />
    </>
  );

  const smoke = mood === 'sleeping'
    ? <g className="opacity-70">
        <text x="44" y="10" fontSize="10" fill="hsl(var(--success))" fontFamily="sans-serif">z</text>
        <text x="38" y="4" fontSize="7" fill="hsl(var(--success))" fontFamily="sans-serif">z</text>
      </g>
    : <g className="opacity-80">
        <path d="M28 12 q-3 -5 0 -9 q3 5 0 9" fill="hsl(var(--success))" opacity="0.6" />
        <path d="M36 10 q-2 -4 1 -7 q2 4 -1 7" fill="hsl(var(--success))" opacity="0.5" />
      </g>;

  const animClass = !animate ? '' :
    mood === 'sleeping' ? 'mascot-float-anim' :
    mood === 'celebrating' ? 'animate-bounce' :
    mood === 'thinking' ? 'mascot-bounce-anim' :
    mood === 'idle' || mood === 'neutral' || mood === 'confident' || mood === 'happy' ? 'mascot-float-anim' :
    'animate-[pulse_3s_ease-in-out_infinite]';

  const renderMascotBody = () => {
    if (activeTheme === 'blue') {
      return (
        <g>
          <ellipse cx="32" cy="52" rx="20" ry="4" fill="black" opacity="0.2" />
          <rect x="12" y="24" width="40" height="26" rx="6" fill="#1e40af" stroke="#172554" strokeWidth="1.5" />
          <g opacity="0.8" transform="translate(14, 38) scale(0.6)">
            <path d="M2 2 h8 v2.5 l-3 3 v4.5 h2 v1.5 h-6 v-1.5 h2 v-4.5 l-3 -3 z" fill="#ffffff" />
            <line x1="1" y1="2" x2="11" y2="2" stroke="#ffffff" strokeWidth="1" />
          </g>
          <rect x="10" y="14" width="44" height="12" rx="4" fill="#2563eb" stroke="#172554" strokeWidth="1.5" />
          <rect x="26" y="14" width="12" height="12" fill="#ffffff" />
          <text x="32" y="24" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="11" fontWeight="900" textAnchor="middle" fill="#eab308">F</text>
          <rect x="29" y="23" width="6" height="4" rx="1" fill="#eab308" stroke="#172554" strokeWidth="0.8" />
        </g>
      );
    } else if (activeTheme === 'forest') {
      return (
        <g>
          <ellipse cx="32" cy="52" rx="20" ry="4" fill="black" opacity="0.2" />
          <rect x="12" y="24" width="40" height="26" rx="6" fill="#15803d" stroke="#14532d" strokeWidth="1.5" />
          <g opacity="0.8" transform="translate(15, 36) scale(0.7)">
            <rect x="1" y="8" width="2" height="4" fill="#4ade80" />
            <rect x="4" y="6" width="2" height="6" fill="#4ade80" />
            <rect x="7" y="3" width="2" height="9" fill="#4ade80" />
            <path d="M1 10 L8 3 M8 3 h-3.5 M8 3 v3.5" stroke="#4ade80" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <rect x="10" y="14" width="44" height="12" rx="4" fill="#16a34a" stroke="#14532d" strokeWidth="1.5" />
          <rect x="26" y="14" width="12" height="12" fill="#22c55e" />
          <text x="32" y="24" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="11" fontWeight="900" textAnchor="middle" fill="#ffffff">F</text>
          <rect x="29" y="23" width="6" height="4" rx="1" fill="#eab308" stroke="#14532d" strokeWidth="0.8" />
        </g>
      );
    } else {
      return (
        <g>
          <ellipse cx="32" cy="52" rx="20" ry="4" fill="black" opacity="0.2" />
          <rect x="12" y="24" width="40" height="26" rx="6" fill="#a27b5c" stroke="#3f2305" strokeWidth="1.5" />
          <g opacity="0.8" transform="translate(15, 36) scale(0.7)">
            <rect x="1" y="2" width="8" height="8" stroke="#ffffff" strokeWidth="1" fill="none" rx="1" />
            <line x1="1" y1="6" x2="9" y2="6" stroke="#ffffff" strokeWidth="0.8" />
          </g>
          <rect x="10" y="14" width="44" height="12" rx="4" fill="#bd9a7a" stroke="#3f2305" strokeWidth="1.5" />
          <rect x="26" y="14" width="12" height="12" fill="#ffffff" />
          <text x="32" y="24" fontFamily="'Outfit', 'Inter', sans-serif" fontSize="11" fontWeight="900" textAnchor="middle" fill="#f97316">F</text>
          <rect x="29" y="23" width="6" height="4" rx="1" fill="#f97316" stroke="#3f2305" strokeWidth="0.8" />
        </g>
      );
    }
  };

  return (
    <>
      <style>{`
        @keyframes mascot-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes mascot-bounce {
          0%, 100% { transform: scale(1) translateY(0); }
          20% { transform: scale(1.08, 0.92) translateY(0); }
          50% { transform: scale(0.92, 1.08) translateY(-8px); }
          80% { transform: scale(1.03, 0.97) translateY(-2px); }
        }
        @keyframes mascot-wiggle {
          0%, 15%, 23%, 55%, 63%, 80%, 88%, 100% { transform: rotate(0deg) translate(0, 0); }
          17% { transform: rotate(-5deg) translate(-2px, 0); }
          20% { transform: rotate(-4deg) translate(-3px, -1px); }
          57% { transform: rotate(5deg) translate(2px, 0); }
          60% { transform: rotate(4deg) translate(3px, -1px); }
          82% { transform: rotate(-3deg) translate(-1px, -1px); }
          84% { transform: rotate(3deg) translate(1px, -1px); }
          86% { transform: rotate(-1.5deg) translate(0, 0); }
        }
        @keyframes eye-blink {
          0%, 95%, 100% { transform: scaleY(1); }
          97.5% { transform: scaleY(0.1); }
        }
        .mascot-float-anim {
          animation: mascot-float 3s ease-in-out infinite;
        }
        .mascot-bounce-anim {
          animation: mascot-bounce 1s ease-in-out infinite;
          transform-origin: bottom center;
        }
        .mascot-wiggle-anim {
          animation: mascot-wiggle 10s ease-in-out infinite;
        }
      `}</style>
      <svg
        width={size} height={size} viewBox="0 0 64 64"
        className={`${animClass} ${className} transition-all duration-300`}
        aria-label={`Flow mascot — ${mood}`}
      >
        {smoke}
        <g className={animate && mood !== 'sleeping' && mood !== 'thinking' ? 'mascot-wiggle-anim' : ''} style={{ transformOrigin: '32px 52px' }}>
          {renderMascotBody()}
          {cheeks}
          {eyeShape}
          {mouth}
        </g>
        {(mood === 'thinking' || mood === 'idle') && (
          <circle cx="49" cy="22" r="2.5" fill="hsl(var(--success))" opacity="0.7" />
        )}
        {(mood === 'celebrating' || mood === 'happy') && (
          <g fill="hsl(var(--success))">
            <circle cx="8" cy="20" r="1.5" className={animate ? "animate-ping" : ""} />
            <circle cx="58" cy="36" r="1.5" />
            <circle cx="14" cy="48" r="1.2" />
          </g>
        )}
      </svg>
    </>
  );
}

export function MascotBadge({ on }: { on: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-display font-bold uppercase tracking-wide ${
      on ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-success' : 'bg-muted-foreground'}`} />
      Flow • {on ? 'Active' : 'Disabled'}
    </span>
  );
}
