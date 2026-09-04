import { useEffect, useMemo, useState } from 'react';
import { MilestoneDef } from '@/lib/milestones';

interface MilestoneCelebrationProps {
  milestone: MilestoneDef;
  onDismiss: () => void;
}

const TIER_CONFIG = {
  small: { particles: 16, waves: 1, duration: 2600, colors: ['#FFD166', '#06D6A0'] },
  medium: { particles: 28, waves: 1, duration: 3200, colors: ['#FFD166', '#06D6A0', '#118AB2'] },
  large: { particles: 40, waves: 2, duration: 3800, colors: ['#FFD166', '#EF476F', '#06D6A0', '#118AB2'] },
  epic: { particles: 50, waves: 3, duration: 4600, colors: ['#FFD166', '#EF476F', '#06D6A0', '#118AB2', '#9B5DE5'] },
} as const;

interface Particle {
  id: number;
  x: number;
  dx: number;
  dy: number;
  color: string;
  delay: number;
  rotate: number;
  wave: number;
}

export default function MilestoneCelebration({ milestone, onDismiss }: MilestoneCelebrationProps) {
  const [visible, setVisible] = useState(false);
  const cfg = TIER_CONFIG[milestone.tier];

  const particles = useMemo<Particle[]>(() => {
    const out: Particle[] = [];
    for (let wave = 0; wave < cfg.waves; wave++) {
      for (let i = 0; i < cfg.particles; i++) {
        out.push({
          id: wave * cfg.particles + i,
          x: 50 + (Math.random() - 0.5) * 70,
          dx: (Math.random() - 0.5) * 220,
          dy: -(120 + Math.random() * 160),
          color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
          delay: wave * 350 + Math.random() * 200,
          rotate: Math.random() * 720 - 360,
          wave,
        });
      }
    }
    return out;
  }, [milestone.id]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    const dismissTimer = setTimeout(() => handleDismiss(), cfg.duration);
    return () => { cancelAnimationFrame(t); clearTimeout(dismissTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestone.id]);

  const handleDismiss = () => {
    setVisible(false);
    setTimeout(onDismiss, 250);
  };

  const tierLabel = milestone.tier === 'epic' ? 'Legendary Milestone' : milestone.tier === 'large' ? 'Major Milestone' : milestone.tier === 'medium' ? 'Great Milestone' : 'Milestone Reached';

  return (
    <div
      onClick={handleDismiss}
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-250 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ background: milestone.tier === 'epic' ? 'radial-gradient(circle at 50% 40%, rgba(155,93,229,0.25), rgba(0,0,0,0.55))' : 'rgba(0,0,0,0.45)' }}
    >
      {/* Confetti particles */}
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-sm pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: '50%',
            width: 8,
            height: 8,
            backgroundColor: p.color,
            opacity: visible ? 0 : 0,
            animation: visible ? `milestone-confetti-${p.id % 2 === 0 ? 'a' : 'b'} 1.4s ease-out forwards` : 'none',
            animationDelay: `${p.delay}ms`,
            // @ts-expect-error custom props read by the keyframes below via inline style vars
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            '--rot': `${p.rotate}deg`,
          } as React.CSSProperties}
        />
      ))}

      {/* Glow rings for medium+ tiers */}
      {milestone.tier !== 'small' && (
        <div className="absolute w-64 h-64 rounded-full animate-ping" style={{ background: `radial-gradient(circle, ${cfg.colors[0]}33, transparent 70%)`, animationDuration: '1.8s' }} />
      )}

      {/* Badge card */}
      <div
        className={`relative mx-6 max-w-xs w-full rounded-3xl p-6 text-center shadow-2xl border transition-all duration-500 ${visible ? 'scale-100 translate-y-0 opacity-100' : 'scale-75 translate-y-4 opacity-0'}`}
        style={{
          background: milestone.tier === 'epic'
            ? 'linear-gradient(160deg, #1a1a2e, #16213e)'
            : milestone.tier === 'large'
            ? 'linear-gradient(160deg, #2d2416, #1a1a2e)'
            : 'var(--card, #1a1a2e)',
          borderColor: cfg.colors[0] + '55',
        }}
        onClick={e => e.stopPropagation()}
      >
        {(milestone.tier === 'large' || milestone.tier === 'epic') && (
          <div
            className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none"
            style={{
              background: `linear-gradient(115deg, transparent 40%, ${cfg.colors[0]}30 50%, transparent 60%)`,
              backgroundSize: '250% 100%',
              animation: visible ? 'milestone-shimmer 2.2s ease-in-out infinite' : 'none',
            }}
          />
        )}

        <p className="text-[10px] uppercase tracking-widest font-display font-bold mb-2" style={{ color: cfg.colors[0] }}>
          {tierLabel}
        </p>

        <div
          className={`mx-auto mb-3 text-6xl leading-none ${milestone.tier === 'epic' ? 'animate-bounce' : ''}`}
          style={{ animationDuration: '1.6s' }}
        >
          {milestone.emoji}
        </div>

        <h2 className="font-display font-extrabold text-2xl text-white mb-1">{milestone.title}</h2>
        <p className="text-sm text-white/70 leading-snug">{milestone.subtitle}</p>

        <button
          onClick={handleDismiss}
          className="mt-5 w-full py-2.5 rounded-xl font-display font-bold text-sm text-white/90"
          style={{ background: `${cfg.colors[0]}25`, border: `1px solid ${cfg.colors[0]}55` }}
        >
          Keep Going 🚀
        </button>
      </div>

      <style>{`
        @keyframes milestone-confetti-a {
          0% { transform: translate(-50%, -50%) rotate(0deg); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy) + 260px)) rotate(var(--rot)); opacity: 0; }
        }
        @keyframes milestone-confetti-b {
          0% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; }
          60% { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx) * 1.2), calc(-50% + var(--dy) * 0.6 + 300px)) scale(0.6) rotate(var(--rot)); opacity: 0; }
        }
        @keyframes milestone-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -50% 0; }
        }
      `}</style>
    </div>
  );
}
