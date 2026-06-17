// Flow — StoreFlow's lightweight inline mascot.
// Pure SVG (no images, no Lottie) so app stays small and offline-friendly.
// Theme-aware: smoke uses success token, box uses primary token.

export type MascotMood = 'idle' | 'happy' | 'thinking' | 'warning' | 'celebrating' | 'sleeping';

interface MascotProps {
  size?: number;
  mood?: MascotMood;
  className?: string;
}

export default function Mascot({ size = 64, mood = 'idle', className = '' }: MascotProps) {
  const eyeShape =
    mood === 'sleeping' ? <>
      <path d="M20 26 q3 -3 6 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M38 26 q3 -3 6 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </> : <>
      <circle cx="23" cy="26" r="2.3" fill="currentColor" />
      <circle cx="41" cy="26" r="2.3" fill="currentColor" />
    </>;

  const mouth =
    mood === 'warning' ? <path d="M26 36 q6 -3 12 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    : mood === 'sleeping' ? <path d="M28 36 h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    : mood === 'celebrating' || mood === 'happy'
      ? <path d="M24 33 q8 7 16 0" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      : <path d="M26 34 q6 4 12 0" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />;

  const smoke = mood === 'sleeping'
    ? <g className="opacity-70">
        <text x="44" y="10" fontSize="10" fill="hsl(var(--success))" fontFamily="sans-serif">z</text>
        <text x="38" y="4" fontSize="7" fill="hsl(var(--success))" fontFamily="sans-serif">z</text>
      </g>
    : <g className="opacity-80">
        <path d="M28 12 q-3 -5 0 -9 q3 5 0 9" fill="hsl(var(--success))" opacity="0.6" />
        <path d="M36 10 q-2 -4 1 -7 q2 4 -1 7" fill="hsl(var(--success))" opacity="0.5" />
      </g>;

  const animClass =
    mood === 'sleeping' ? '' :
    mood === 'celebrating' ? 'animate-bounce' :
    'animate-[pulse_3s_ease-in-out_infinite]';

  return (
    <svg
      width={size} height={size} viewBox="0 0 64 64"
      className={`${animClass} ${className}`}
      aria-label={`Flow mascot — ${mood}`}
    >
      {smoke}
      {/* Box body */}
      <rect x="12" y="14" width="40" height="38" rx="3"
        fill="hsl(var(--primary))" opacity="0.95" />
      {/* Tape seam */}
      <line x1="32" y1="14" x2="32" y2="52" stroke="hsl(var(--primary-foreground))" strokeWidth="0.6" opacity="0.4" />
      {/* Arrows */}
      <path d="M46 30 v-6 M44 26 l2 -2 l2 2" stroke="hsl(var(--primary-foreground))" strokeWidth="0.9" fill="none" opacity="0.6" />
      {/* Face — using currentColor inherited from text */}
      <g style={{ color: 'hsl(var(--primary-foreground))' }}>
        {eyeShape}
        {mouth}
      </g>
      {mood === 'thinking' && (
        <circle cx="49" cy="22" r="2.5" fill="hsl(var(--success))" opacity="0.7" />
      )}
      {mood === 'celebrating' && (
        <g fill="hsl(var(--success))">
          <circle cx="8" cy="20" r="1.5" />
          <circle cx="58" cy="36" r="1.5" />
          <circle cx="14" cy="48" r="1.2" />
        </g>
      )}
    </svg>
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
