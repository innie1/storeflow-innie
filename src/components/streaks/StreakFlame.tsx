import React, { useState, useEffect, useRef } from 'react';
import { Flame } from 'lucide-react';

// State-of-the-art cinematic plasma lightning component with stepped leader, explosive return stroke flash, and frame-by-frame crackle
function CinematicLightning({ progress }: { progress: number }) {
  // progress goes from 0 to 1 over ~2000ms
  // We divide into 40 discrete animation frames to create a true organic, high-force plasma discharge
  const step = Math.floor(progress * 40);

  // 4 distinct intricate electrical geometries representing real ionization re-strikes along a plasma channel
  const geometries = [
    {
      // Shape A: Classic massive branched strike matching reference photo
      trunk: "M50 2 L42 24 L56 26 L36 54 L52 55 L28 88 L40 68 L26 66 L42 38 L30 36 L50 2 Z",
      branches: [
        "M42 24 L24 30 L12 42 M24 30 L16 28",
        "M56 26 L74 20 L88 28 M74 20 L78 12",
        "M36 54 L18 60 L8 74 M18 60 L14 68",
        "M52 55 L72 62 L86 74 M72 62 L82 56",
        "M40 38 L22 46 L10 52",
        "M28 88 L16 94 M28 88 L38 96"
      ]
    },
    {
      // Shape B: Violent lateral electrical spread
      trunk: "M52 2 L38 28 L58 32 L32 62 L48 64 L24 92 L38 72 L22 70 L46 40 L34 36 L52 2 Z",
      branches: [
        "M52 14 L70 12 L84 20",
        "M38 28 L18 24 L8 32",
        "M58 32 L78 38 L92 34",
        "M32 62 L14 66 L4 78",
        "M48 64 L66 70 L80 82",
        "M24 92 L14 98 M24 92 L32 96"
      ]
    },
    {
      // Shape C: Forked twin thunderbolt
      trunk: "M46 2 L44 30 L60 28 L38 66 L52 65 L22 95 L36 74 L24 72 L48 38 L34 38 L46 2 Z",
      branches: [
        "M46 16 L28 20 L16 16",
        "M60 28 L78 22 L90 32",
        "M44 30 L26 38 L14 48",
        "M38 66 L20 72 L12 84",
        "M52 65 L70 74 L84 80",
        "M22 95 L14 99 M22 95 L32 98"
      ]
    },
    {
      // Shape D: Concentrated core plasma re-ignition
      trunk: "M50 2 L40 26 L54 28 L34 58 L50 60 L26 90 L38 70 L24 68 L44 36 L32 34 L50 2 Z",
      branches: [
        "M40 26 L22 32 L10 38",
        "M54 28 L72 26 L86 36",
        "M34 58 L16 64 L6 76",
        "M50 60 L68 66 L82 76",
        "M26 90 L16 96 M26 90 L34 98"
      ]
    }
  ];

  // Determine current frame's visual behavior by lifecycle phase
  const isLeader = step < 4; // 0-200ms: Stepped leader reaching down
  const isExplosion = step >= 4 && step < 10; // 200-500ms: Return stroke explosion (maximum brightness & force)
  const isCrackle = step >= 10 && step < 33; // 500-1650ms: High-voltage crackle & jitter
  const isDissolving = step >= 33; // 1650-2000ms: Fading back into fire

  // Pick geometry dynamically with jitter during crackle
  const geoIndex = isLeader ? 0 : isExplosion ? 0 : (step * 7 + 3) % 4;
  const currentGeo = geometries[geoIndex];

  // Dynamic opacity, scale, and glow intensity
  const trunkOpacity = isLeader ? 0.75 : isExplosion ? 1 : isDissolving ? Math.max(0, (40 - step) / 7) : 0.95;
  const branchOpacity = isLeader ? 0.35 : isExplosion ? 1 : isDissolving ? 0 : 0.8;
  const scale = isLeader ? 'scale-95' : isExplosion ? 'scale-125' : isCrackle && step % 2 === 0 ? 'scale-110 -translate-x-[0.5px] translate-y-[0.5px]' : 'scale-105';
  const filterGlow = isExplosion ? 'drop-shadow(0 0 16px #facc15) brightness(2.4)' : 'drop-shadow(0 0 8px #f59e0b) brightness(1.4)';

  return (
    <div className={`relative w-full h-full flex items-center justify-center transition-all duration-75 ${scale}`}>
      {/* No localized flash */}

      <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible pointer-events-none" fill="none" style={{ filter: filterGlow }}>
        <defs>
          <filter id="ultraPlasmaGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur1" />
            <feGaussianBlur stdDeviation="6" result="blur2" />
            <feGaussianBlur stdDeviation="10" result="blur3" />
            <feMerge>
              <feMergeNode in="blur3" />
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="corePlasmaGrad" x1="0%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor="#fef08a" />
            <stop offset="75%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="branchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="60%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#eab308" />
          </linearGradient>
        </defs>

        {/* Deep Amber Atmospheric Halo */}
        <g opacity={trunkOpacity * 0.6} filter="url(#ultraPlasmaGlow)">
          <path d={currentGeo.trunk} fill="#d97706" stroke="#d97706" strokeWidth="7" strokeLinejoin="round" />
          {currentGeo.branches.map((b, idx) => (
            <path key={`halo-${idx}`} d={b} stroke="#f59e0b" strokeWidth="4.5" strokeLinecap="round" opacity={branchOpacity} />
          ))}
        </g>

        {/* Golden Plasma Middle Layer */}
        <g opacity={trunkOpacity * 0.95} filter="drop-shadow(0 0 5px #facc15)">
          <path d={currentGeo.trunk} fill="#facc15" stroke="#facc15" strokeWidth="3" strokeLinejoin="round" />
          {currentGeo.branches.map((b, idx) => (
            <path key={`mid-${idx}`} d={b} stroke="url(#branchGrad)" strokeWidth="2.4" strokeLinecap="round" opacity={branchOpacity} />
          ))}
        </g>

        {/* White-Hot Pure Voltage Core */}
        <g opacity={trunkOpacity}>
          <path d={currentGeo.trunk} fill="url(#corePlasmaGrad)" stroke="#ffffff" strokeWidth="1.2" strokeLinejoin="round" />
          {currentGeo.branches.map((b, idx) => (
            <path key={`core-${idx}`} d={b} stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" opacity={branchOpacity * 0.95} />
          ))}
        </g>

        {/* High-voltage cyan ionization arcs flashing across frames */}
        {!isLeader && !isDissolving && step % 3 === 0 && (
          <g stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" opacity="0.85" filter="drop-shadow(0 0 4px #00f0ff)">
            <path d={`M${32 + (step % 35)} ${18 + (step % 45)} L${16 + (step % 25)} ${32 + (step % 35)}`} />
            <path d={`M${58 - (step % 18)} ${38 + (step % 25)} L${82 - (step % 12)} ${52 + (step % 20)}`} />
          </g>
        )}
      </svg>
    </div>
  );
}

interface StreakFlameProps {
  count: number;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  showCount?: boolean;
}

export default function StreakFlame({ count, size = 'sm', onClick, showCount = true }: StreakFlameProps) {
  const lit = count > 0;
  const Tag = onClick ? 'button' : 'div';

  const [isZap, setIsZap] = useState(false);
  const [zapProgress, setZapProgress] = useState(0);
  const animRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const triggerLightning = () => {
      setIsZap(true);
      setZapProgress(0);
      startTimeRef.current = performance.now();

      const animate = (now: number) => {
        const elapsed = now - (startTimeRef.current || now);
        const duration = 2000; // 2.0 seconds full sequence
        const progress = Math.min(1, elapsed / duration);
        setZapProgress(progress);

        if (progress < 1) {
          animRef.current = requestAnimationFrame(animate);
        } else {
          setIsZap(false);
          scheduleNext();
        }
      };

      animRef.current = requestAnimationFrame(animate);
    };

    const scheduleNext = () => {
      // Random time between 15 and 45 seconds
      const nextDelay = 15000 + Math.random() * 30000;
      timeoutId = setTimeout(triggerLightning, nextDelay);
    };

    scheduleNext();

    return () => {
      clearTimeout(timeoutId);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const flameSize = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-9 h-9' : 'w-7 h-7';
  const numSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base';

  return (
    <Tag
      onClick={onClick}
      className={`inline-flex items-center justify-center select-none ${
        onClick ? 'cursor-pointer active:scale-95 transition-transform' : ''
      }`}
      title={lit ? `${count} day streak — tap for details` : 'No active streak yet'}
    >
      <style>{`
        /* Circular effect removed */
        @keyframes spark-burst-1 {
          0% { transform: translate(0, 0) scale(1.4); opacity: 1; }
          100% { transform: translate(-32px, -28px) scale(0); opacity: 0; }
        }
        @keyframes spark-burst-2 {
          0% { transform: translate(0, 0) scale(1.4); opacity: 1; }
          100% { transform: translate(32px, -30px) scale(0); opacity: 0; }
        }
        @keyframes spark-burst-3 {
          0% { transform: translate(0, 0) scale(1.4); opacity: 1; }
          100% { transform: translate(-30px, 28px) scale(0); opacity: 0; }
        }
        @keyframes spark-burst-4 {
          0% { transform: translate(0, 0) scale(1.4); opacity: 1; }
          100% { transform: translate(32px, 26px) scale(0); opacity: 0; }
        }
        @keyframes spark-burst-5 {
          0% { transform: translate(0, 0) scale(1.4); opacity: 1; }
          100% { transform: translate(0px, -36px) scale(0); opacity: 0; }
        }
        @keyframes spark-burst-6 {
          0% { transform: translate(0, 0) scale(1.4); opacity: 1; }
          100% { transform: translate(0px, 34px) scale(0); opacity: 0; }
        }
        @keyframes spark-burst-7 {
          0% { transform: translate(0, 0) scale(1.3); opacity: 1; }
          100% { transform: translate(-36px, 0px) scale(0); opacity: 0; }
        }
        @keyframes spark-burst-8 {
          0% { transform: translate(0, 0) scale(1.3); opacity: 1; }
          100% { transform: translate(36px, 0px) scale(0); opacity: 0; }
        }
      `}</style>
      <div className="flex items-center gap-1 leading-none">
        <div className="relative flex items-center justify-center">
          <Flame
            className={`${flameSize} ${
              lit ? 'text-amber-500 fill-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'text-muted-foreground/30'
            } transition-all duration-500 ${isZap ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`}
          />
          
          {isZap && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`${flameSize} z-10`}>
                <CinematicLightning progress={zapProgress} />
              </div>

              {/* 8 Directional High-Velocity Electric Sparks Scattering */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                <span className="absolute w-2 h-2 rounded-full bg-white shadow-[0_0_10px_#ffffff] animate-[spark-burst-1_1.1s_cubic-bezier(0.1,0.9,0.2,1)_forwards]" />
                <span className="absolute w-2 h-2 rounded-full bg-yellow-300 shadow-[0_0_10px_#fde047] animate-[spark-burst-2_1.1s_cubic-bezier(0.1,0.9,0.2,1)_forwards]" />
                <span className="absolute w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_10px_#fb923c] animate-[spark-burst-3_1.1s_cubic-bezier(0.1,0.9,0.2,1)_forwards]" />
                <span className="absolute w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9] animate-[spark-burst-4_1.1s_cubic-bezier(0.1,0.9,0.2,1)_forwards]" />
                
                <span className="absolute w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_10px_#ffffff] animate-[spark-burst-5_0.9s_cubic-bezier(0.1,0.9,0.2,1)_forwards]" />
                <span className="absolute w-1.5 h-1.5 rounded-full bg-yellow-400 shadow-[0_0_10px_#facc15] animate-[spark-burst-6_0.9s_cubic-bezier(0.1,0.9,0.2,1)_forwards]" />
                <span className="absolute w-1.5 h-1.5 rounded-full bg-cyan-200 shadow-[0_0_10px_#a5f3fc] animate-[spark-burst-7_0.9s_cubic-bezier(0.1,0.9,0.2,1)_forwards]" />
                <span className="absolute w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_10px_#f59e0b] animate-[spark-burst-8_0.9s_cubic-bezier(0.1,0.9,0.2,1)_forwards]" />
              </div>
            </div>
          )}
        </div>
        {showCount && (
          <span className={`font-display font-black leading-none ${numSize} ${lit ? 'text-foreground' : 'text-muted-foreground'}`}>
            {count}
          </span>
        )}
      </div>
    </Tag>
  );
}
