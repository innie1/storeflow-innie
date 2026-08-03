import { Flame } from 'lucide-react';

export default function StreakFlame({ count, size = 'md', onClick }: { count: number; size?: 'sm' | 'md' | 'lg'; onClick?: () => void }) {
  const dims = size === 'sm' ? 22 : size === 'lg' ? 44 : 30;
  const badgePadding = size === 'sm' ? 'px-2 py-0.5' : size === 'lg' ? 'px-4 py-2' : 'px-3 py-1';
  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-xl' : 'text-sm';
  const lit = count > 0;

  // Flame tier colors & gradients
  const isSuper = count >= 7;
  const gradientId = `streak-flame-grad-${size}`;
  const superGradientId = `super-streak-flame-grad-${size}`;

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border backdrop-blur-md transition-all select-none ${badgePadding} ${onClick ? 'active:scale-95 cursor-pointer' : ''} ${
        lit 
          ? isSuper
            ? 'bg-amber-500/10 border-amber-500/40 shadow-lg shadow-amber-500/10'
            : 'bg-orange-500/10 border-orange-500/30 shadow-md shadow-orange-500/10'
          : 'bg-surface-2/80 border-border text-muted-foreground'
      }`} 
      title={lit ? `${count} day active streak! 🔥 Tap for details` : 'No active streak yet'}
    >
      <div className="relative flex items-center justify-center">
        {/* Glow halo behind flame */}
        {lit && (
          <div
            className="absolute -inset-1 rounded-full blur-md opacity-70 animate-pulse"
            style={{
              background: isSuper
                ? 'radial-gradient(circle, #f59e0b 0%, #d97706 60%, transparent 80%)'
                : 'radial-gradient(circle, #ff8a3d 0%, #ff5b1f 60%, transparent 80%)'
            }}
          />
        )}

        {/* Floating Ember Particles */}
        {lit && (
          <>
            <span className="absolute -top-1 left-0 w-1 h-1 rounded-full bg-amber-300 animate-ember-1 pointer-events-none" />
            <span className="absolute -top-2 right-1 w-1.5 h-1.5 rounded-full bg-orange-400 animate-ember-2 pointer-events-none" />
          </>
        )}

        {/* Outer Flame */}
        <Flame
          size={dims}
          className={`relative z-10 transition-transform ${lit ? 'animate-flame-flicker' : ''}`}
          fill={lit ? (isSuper ? `url(#${superGradientId})` : `url(#${gradientId})`) : 'none'}
          stroke={lit ? (isSuper ? '#b45309' : '#c2410c') : '#94a3b8'}
          strokeWidth={1.75}
        />

        {/* Inner Flame Core overlay for 3D depth */}
        {lit && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none scale-75 animate-pulse">
            <Flame
              size={dims * 0.65}
              fill="#ffffff"
              stroke="#ffd166"
              strokeWidth={1}
              className="opacity-80"
            />
          </div>
        )}

        <svg width="0" height="0" className="absolute">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="45%" stopColor="#f97316" />
              <stop offset="85%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#fef08a" />
            </linearGradient>

            <linearGradient id={superGradientId} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#d97706" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="85%" stopColor="#fef08a" />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="flex items-center gap-1">
        <span className={`font-display font-black tracking-tight ${textSize} ${
          lit 
            ? isSuper 
              ? 'text-amber-400 drop-shadow-xs' 
              : 'text-orange-500 drop-shadow-xs' 
            : 'text-muted-foreground'
        }`}>
          {count}
        </span>
        {lit && (
          <span className="text-[10px] uppercase font-bold text-orange-400/90 tracking-wider">
            {count === 1 ? 'Day' : 'Days'}
          </span>
        )}
      </div>
    </Tag>
  );
}
