// Flow — StoreFlow's lightweight inline mascot.
// Pure SVG (no images, no Lottie) so app stays small and offline-friendly.
// Theme-aware: smoke uses success token, box uses primary token.

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
  const eyeShape =
    mood === 'sleeping' ? (
      <>
        <path d="M20 28 q3 -3 6 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M38 28 q3 -3 6 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </>
    ) : mood === 'confident' ? (
      <>
        {/* Gold sunglasses for a confident vibe 😎 */}
        <path d="M17 22 h10 v4.5 c0 3.5 -2.5 6.5 -5.5 6.5 h-1.5 c-3 0 -5.5 -3 -5.5 -6.5 z" fill="#E8C34E" stroke="hsl(var(--primary-foreground))" strokeWidth="0.8" />
        <path d="M37 22 h10 v4.5 c0 3.5 -2.5 6.5 -5.5 6.5 h-1.5 c-3 0 -5.5 -3 -5.5 -6.5 z" fill="#E8C34E" stroke="hsl(var(--primary-foreground))" strokeWidth="0.8" />
        <line x1="27" y1="23.5" x2="37" y2="23.5" stroke="#E8C34E" strokeWidth="1.5" />
      </>
    ) : mood === 'concerned' || mood === 'warning' ? (
      <g className={animate ? "animate-[eye-blink_4.5s_infinite]" : ""} style={{ transformOrigin: 'center 26px' }}>
        {/* Concerned slanted eyebrows */}
        <line x1="18" y1="21" x2="26" y2="23" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="46" y1="21" x2="38" y2="23" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="23" cy="26" r="2.3" fill="currentColor" />
        <circle cx="41" cy="26" r="2.3" fill="currentColor" />
      </g>
    ) : mood === 'worried' ? (
      <g className={animate ? "animate-[eye-blink_4.5s_infinite]" : ""} style={{ transformOrigin: 'center 26px' }}>
        {/* Worried raised eyebrows */}
        <line x1="18" y1="23" x2="26" y2="21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="46" y1="23" x2="38" y2="21" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="23" cy="26" r="2.3" fill="currentColor" />
        <circle cx="41" cy="26" r="2.3" fill="currentColor" />
      </g>
    ) : (
      <g className={animate ? "animate-[eye-blink_4.5s_infinite]" : ""} style={{ transformOrigin: 'center 26px' }}>
        <circle cx="23" cy="26" r="2.3" fill="currentColor" />
        <circle cx="41" cy="26" r="2.3" fill="currentColor" />
      </g>
    );

  const mouth =
    mood === 'warning' || mood === 'concerned' || mood === 'worried' ? (
      <path d="M26 36 q6 -3 12 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    ) : mood === 'sleeping' ? (
      <path d="M28 36 h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    ) : mood === 'celebrating' || mood === 'happy' || mood === 'confident' ? (
      <path d="M24 33 q8 7 16 0" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    ) : (
      <path d="M26 34 q6 4 12 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
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

  return (
    <>
      <style>{`
        @keyframes mascot-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes mascot-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
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
        }
      `}</style>
      <svg
        width={size} height={size} viewBox="0 0 64 64"
        className={`${animClass} ${className} transition-all duration-300`}
        aria-label={`Flow mascot — ${mood}`}
      >
        {smoke}
        {/* Box body */}
        <rect x="12" y="14" width="40" height="38" rx="3"
          fill="hsl(var(--primary))" opacity="0.95" />
        {/* Seam */}
        <line x1="32" y1="14" x2="32" y2="52" stroke="hsl(var(--primary-foreground))" strokeWidth="0.6" opacity="0.4" />
        {/* Arrows */}
        <path d="M46 30 v-6 M44 26 l2 -2 l2 2" stroke="hsl(var(--primary-foreground))" strokeWidth="0.9" fill="none" opacity="0.6" />
        {/* Face */}
        <g style={{ color: 'hsl(var(--primary-foreground))' }}>
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
