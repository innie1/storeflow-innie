import React from 'react';
import { Flame } from 'lucide-react';

interface StreakFlameProps {
  count: number;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  // Hide the number + "streak" label — used wherever the count is already
  // shown some other way nearby (e.g. the "X Day Streak" heading in the
  // details panel), so it isn't shown twice.
  showCount?: boolean;
}

export default function StreakFlame({ count, size = 'sm', onClick, showCount = true }: StreakFlameProps) {
  const lit = count > 0;
  const Tag = onClick ? 'button' : 'div';

  const flameSize = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-9 h-9' : 'w-7 h-7';
  const numSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base';
  const labelSize = size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-xs' : 'text-[11px]';

  return (
    <Tag
      onClick={onClick}
      className={`inline-flex flex-col items-center justify-center select-none ${
        onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''
      }`}
      title={lit ? `${count} day streak — tap for details` : 'No active streak yet'}
    >
      <div className="flex items-center gap-1 leading-none">
        <Flame
          className={`${flameSize} ${
            lit ? 'text-orange-500 fill-orange-500/20 stroke-[2.25]' : 'text-muted-foreground/60 stroke-[1.75]'
          }`}
        />
        {showCount && (
          <span className={`font-display font-black leading-none ${numSize} ${lit ? 'text-foreground' : 'text-muted-foreground'}`}>
            {count}
          </span>
        )}
      </div>
      {showCount && (
        <span className={`font-semibold tracking-tight text-muted-foreground leading-none mt-0.5 ${labelSize}`}>
          streak
        </span>
      )}
    </Tag>
  );
}
