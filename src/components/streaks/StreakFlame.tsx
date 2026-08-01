import { Flame } from 'lucide-react';

export default function StreakFlame({ count, size = 'md' }: { count: number; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 28 : size === 'lg' ? 56 : 40;
  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-2xl' : 'text-base';
  const lit = count > 0;

  return (
    <div className="inline-flex items-center gap-1.5 select-none" title={`${count} day streak`}>
      <div className="relative flex items-center justify-center">
        {lit && (
          <div
            className="absolute inset-0 rounded-full blur-md opacity-60 animate-pulse"
            style={{ background: 'radial-gradient(circle, #ff8a3d 0%, #ff5b1f 55%, transparent 75%)' }}
          />
        )}
        <Flame
          size={dims}
          className="relative"
          fill={lit ? 'url(#streak-flame-grad)' : 'none'}
          stroke={lit ? '#c2410c' : '#8a8a95'}
          strokeWidth={1.75}
        />
        <svg width="0" height="0" className="absolute">
          <defs>
            <linearGradient id="streak-flame-grad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#ff5b1f" />
              <stop offset="55%" stopColor="#ff8a3d" />
              <stop offset="100%" stopColor="#ffd166" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <span className={`font-display font-black ${textSize} ${lit ? 'text-orange-500' : 'text-muted-foreground'}`}>
        {count}
      </span>
    </div>
  );
}
