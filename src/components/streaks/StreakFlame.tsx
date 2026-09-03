import React from 'react';
import { Flame } from 'lucide-react';
import { maybeRewardRandomAnimation, playFlowAnimation } from '@/lib/flow-animation-unlocks';

interface StreakFlameProps { count: number; size?: 'sm' | 'md' | 'lg'; onClick?: () => void; showCount?: boolean; }

export default function StreakFlame({ count, size = 'sm', onClick, showCount = true }: StreakFlameProps) {
  const lit = count > 0;
  const Tag = onClick ? 'button' : 'div';

  const handleClick = () => {
    // A streak interaction can also grant a small, offline-safe animation reward.
    const reward = maybeRewardRandomAnimation(count);
    if (reward) {
      window.dispatchEvent(new CustomEvent('storeflow:flow-animation-toast', { detail: { name: reward.name, subtitle: reward.subtitle } }));
    }
    // Replay the first unlocked animation event so any mounted Flow mascot bridge can perform it.
    const unlocked = JSON.parse(localStorage.getItem('storeflow_flow_animation_collection_v1') || '["happy-jump"]');
    const selected = unlocked[Math.floor(Math.random() * unlocked.length)];
    if (selected) playFlowAnimation(selected);
    onClick?.();
  };

  const flameSize = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-9 h-9' : 'w-7 h-7';
  const numSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick ? handleClick : undefined} aria-label={lit ? `${count} day streak — tap to view streak details` : 'No active streak'} className={`inline-flex items-center justify-center select-none ${onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`} title={lit ? `${count} day streak — tap for details` : 'No active streak yet'}>
      <div className="flex items-center gap-1 leading-none">
        <Flame className={`${flameSize} ${lit ? 'text-amber-500 fill-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'text-muted-foreground/30'}`} />
        {showCount && <span className={`font-display font-black leading-none ${numSize} ${lit ? 'text-foreground' : 'text-muted-foreground'}`}>{count}</span>}
      </div>
    </Tag>
  );
}
