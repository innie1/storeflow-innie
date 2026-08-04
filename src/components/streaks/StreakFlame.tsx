import React from 'react';

interface StreakFlameProps {
  count: number;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export default function StreakFlame({ count, size = 'sm', onClick }: StreakFlameProps) {
  const lit = count > 0;
  const isSuper = count >= 7;

  // Outer container dimensions
  const dims = size === 'sm' ? 'w-9 h-11' : size === 'lg' ? 'w-16 h-18' : 'w-12 h-14';
  
  // Font sizes for number inside flame (scaled for 1, 2, or 3+ digits)
  const numStr = String(count);
  const digitCount = numStr.length;

  let textSizeClass = 'text-xs';
  if (size === 'sm') {
    if (digitCount >= 3) textSizeClass = 'text-[9px] tracking-tighter';
    else if (digitCount === 2) textSizeClass = 'text-[11px] tracking-tight';
    else textSizeClass = 'text-[13px]';
  } else if (size === 'md') {
    if (digitCount >= 3) textSizeClass = 'text-[11px] tracking-tighter';
    else if (digitCount === 2) textSizeClass = 'text-xs tracking-tight';
    else textSizeClass = 'text-sm';
  } else {
    if (digitCount >= 3) textSizeClass = 'text-sm tracking-tighter';
    else if (digitCount === 2) textSizeClass = 'text-base tracking-tight';
    else textSizeClass = 'text-lg';
  }

  const gradientId = `flame-grad-${size}-${count}`;
  const superGradId = `super-flame-grad-${size}-${count}`;

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      onClick={onClick}
      className={`relative inline-flex items-center justify-center transition-all select-none group ${dims} ${
        onClick ? 'active:scale-95 cursor-pointer' : ''
      }`}
      title={lit ? `${count} day active streak! 🔥 Tap for details` : 'No active streak yet'}
    >
      {/* Background radial glow */}
      {lit && (
        <div
          className="absolute inset-0 rounded-full blur-md opacity-80 animate-pulse pointer-events-none"
          style={{
            background: isSuper
              ? 'radial-gradient(circle, #f59e0b 0%, #d97706 70%, transparent 100%)'
              : 'radial-gradient(circle, #ff7a1c 0%, #ef4444 70%, transparent 100%)'
          }}
        />
      )}

      {/* Floating Ember Particles */}
      {lit && (
        <>
          <span className="absolute -top-1 left-1 w-1 h-1 rounded-full bg-amber-300 animate-ember-1 pointer-events-none" />
          <span className="absolute -top-2 right-1 w-1.5 h-1.5 rounded-full bg-orange-400 animate-ember-2 pointer-events-none" />
        </>
      )}

      {/* Custom SVG Flame */}
      <svg
        viewBox="0 0 100 120"
        className={`w-full h-full relative z-10 transition-transform ${lit ? 'animate-flame-flicker' : 'opacity-40 grayscale'}`}
      >
        <defs>
          {/* Main orange-red gradient */}
          <linearGradient id={gradientId} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="35%" stopColor="#ea580c" />
            <stop offset="70%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#fef08a" />
          </linearGradient>

          {/* Super golden flame gradient */}
          <linearGradient id={superGradId} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="35%" stopColor="#d97706" />
            <stop offset="70%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
        </defs>

        {/* Outer Flame Contour */}
        <path
          d="M50 4 C62 24 88 44 88 70 C88 94 72 116 50 116 C28 116 12 94 12 70 C12 44 38 24 50 4 Z"
          fill={lit ? (isSuper ? `url(#${superGradId})` : `url(#${gradientId})`) : '#475569'}
          stroke={lit ? (isSuper ? '#78350f' : '#7f1d1d') : '#334155'}
          strokeWidth="3"
        />

        {/* Inner Flame Glow Core */}
        {lit && (
          <path
            d="M50 36 C57 48 72 60 72 76 C72 88 62 100 50 100 C38 100 28 88 28 76 C28 60 43 48 50 36 Z"
            fill="#fef08a"
            opacity="0.85"
            className="animate-pulse"
          />
        )}
      </svg>

      {/* Number Centered inside Flame Core */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pt-2.5 pointer-events-none">
        <span
          className={`font-display font-black leading-none drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.95)] ${textSizeClass} ${
            lit ? 'text-white' : 'text-slate-300'
          }`}
        >
          {count}
        </span>
      </div>
    </Tag>
  );
}
