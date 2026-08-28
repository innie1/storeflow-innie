import React from 'react';
import Mascot, { MascotMood } from './Mascot';

interface WeekendFlowMascotProps {
  size?: number;
  mood?: MascotMood;
  className?: string;
  animate?: boolean;
  store?: any;
  role?: string;
  externalMessage?: string | null;
  externalMessageKey?: string | number;
  externalMessageMood?: MascotMood | null;
  externalMessageDuration?: number;
}

/**
 * Weekend presentation wrapper for Flow.
 * Saturday/Sunday adds the black sunglasses without changing Mascot's
 * existing animation/state machine. Weekdays render Flow normally.
 */
export default function WeekendFlowMascot({
  size = 64,
  mood = 'idle',
  className = '',
  animate = true,
  store,
  role,
  externalMessage,
  externalMessageKey,
  externalMessageMood,
  externalMessageDuration,
}: WeekendFlowMascotProps) {
  const weekend = new Date().getDay() === 0 || new Date().getDay() === 6;

  return (
    <span
      className={`relative inline-flex ${className}`}
      data-flow-weekend={weekend ? 'true' : 'false'}
      aria-label={weekend ? 'Flow weekend mode' : 'Flow'}
    >
      <Mascot
        size={size}
        mood={mood}
        animate={animate}
        store={store}
        role={role}
        externalMessage={externalMessage}
        externalMessageKey={externalMessageKey}
        externalMessageMood={externalMessageMood}
        externalMessageDuration={externalMessageDuration}
      />
      {weekend && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-[38%] z-20 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: Math.max(24, size * 0.58),
            height: Math.max(9, size * 0.18),
          }}
        >
          <span
            className="absolute left-0 top-0 rounded-[45%] bg-black shadow-[0_1px_4px_rgba(0,0,0,.45)]"
            style={{ width: '46%', height: '100%' }}
          />
          <span
            className="absolute right-0 top-0 rounded-[45%] bg-black shadow-[0_1px_4px_rgba(0,0,0,.45)]"
            style={{ width: '46%', height: '100%' }}
          />
          <span
            className="absolute left-[43%] top-[35%] h-[18%] w-[14%] rounded-full bg-black"
          />
          <span className="absolute left-[3%] top-[-15%] h-[14%] w-[40%] rotate-[8deg] rounded-full bg-black/80" />
          <span className="absolute right-[3%] top-[-15%] h-[14%] w-[40%] rotate-[-8deg] rounded-full bg-black/80" />
        </span>
      )}
    </span>
  );
}
