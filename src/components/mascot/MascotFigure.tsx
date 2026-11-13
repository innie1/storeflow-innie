import type { MascotState } from './useMascot';

/**
 * Flow itself: the drawing, with the eyes, mouth and props for the mood it is in.
 */
export default function MascotFigure({ s }: { s: MascotState }) {
  const {
    sunglassesEasterEgg, isWearingGlasses, isBreathingAir, activity, currentMood, eyeShape, mouth,
    cheeks, sweatDrop, angryStress, renderMascotBody, getGlowFilter, animClass,
  } = s;
  return (
    <svg
      width="100%" height="100%" viewBox="0 0 64 64"
      className={`${animClass} ${getGlowFilter()} transition-all duration-300`}
      aria-label={`Flow mascot — ${currentMood}`}
    >
      <defs>
        <linearGradient id="goldEggGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      {sweatDrop}
      {angryStress}

      {/* Occasional Environment Activity Elements */}
      {activity === 'soccer-ball' && (
        <g className="animate-[soccer-ball-timeline_7s_forwards_ease-in-out]" style={{ transformOrigin: '32px 10px' }}>
          <circle cx="32" cy="10" r="4.5" fill="#ffffff" stroke="#0b0b12" strokeWidth="0.8" />
          <path d="M32 7.5 l1 1 l-0.5 1.5 l-1 0 l-0.5 -1.5 z" fill="#0b0b12" />
          <path d="M29 9 l-1.2 0.4 l-0.2 1.3 l0.8 0.6 l1.1 -0.5 z" fill="#0b0b12" />
          <path d="M35 9 l1.2 0.4 l0.2 1.3 l-0.8 0.6 l-1.1 -0.5 z" fill="#0b0b12" />
          <path d="M30 13 l0.8 -1.2 h1.4 l0.8 1.2 l-1.5 0.5 z" fill="#0b0b12" />
        </g>
      )}

      {currentMood === 'bathing' && (
        <>
          {/* Shower Streams */}
          <g opacity="0.85">
            <line x1="20" y1="2" x2="20" y2="34" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" className="animate-shower-stream" style={{ animationDelay: '0s' }} />
            <line x1="32" y1="2" x2="32" y2="38" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" className="animate-shower-stream" style={{ animationDelay: '0.2s' }} />
            <line x1="44" y1="2" x2="44" y2="34" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" className="animate-shower-stream" style={{ animationDelay: '0.1s' }} />
            <line x1="26" y1="2" x2="26" y2="36" stroke="#7dd3fc" strokeWidth="1.8" strokeLinecap="round" className="animate-shower-stream" style={{ animationDelay: '0.3s' }} />
            <line x1="38" y1="2" x2="38" y2="36" stroke="#7dd3fc" strokeWidth="1.8" strokeLinecap="round" className="animate-shower-stream" style={{ animationDelay: '0.15s' }} />
          </g>
          {/* Floating Bubbles */}
          <g fill="none" stroke="#7dd3fc" strokeWidth="0.8" opacity="0.8">
            <circle cx="12" cy="18" r="3.5" className="animate-bubble-float-1" />
            <circle cx="52" cy="20" r="2.8" className="animate-bubble-float-2" />
            <circle cx="32" cy="16" r="4.2" className="animate-bubble-float-3" />
          </g>
        </>
      )}
      
      <g style={{ transformOrigin: '32px 52px' }}>
        {renderMascotBody()}
        {cheeks}
        {eyeShape}
        {(isWearingGlasses || sunglassesEasterEgg || (new Date().getDay() === 0 || new Date().getDay() === 6)) && currentMood !== 'confident' && currentMood !== 'sleeping' && (
          <g>
            <circle cx="23" cy="33" r="5.5" fill="none" stroke="#eab308" strokeWidth="1.5" />
            <circle cx="41" cy="33" r="5.5" fill="none" stroke="#eab308" strokeWidth="1.5" />
            <line x1="28.5" y1="33" x2="35.5" y2="33" stroke="#eab308" strokeWidth="1.5" />
            <line x1="17.5" y1="33" x2="13" y2="31" stroke="#eab308" strokeWidth="1.2" />
            <line x1="46.5" y1="33" x2="51" y2="31" stroke="#eab308" strokeWidth="1.2" />
          </g>
        )}
        {mouth}
        {isBreathingAir && currentMood !== 'sleeping' && (
          <g fill="none" stroke="#cbd5e1" strokeWidth="1" opacity="0.8">
            <circle cx="32" cy="42" r="1.5" className="animate-[breath-rise_2.5s_ease-out_forwards]" style={{ transformOrigin: '32px 42px' }} />
            <circle cx="32" cy="42" r="2.2" className="animate-[breath-rise_2.5s_ease-out_forwards]" style={{ transformOrigin: '32px 42px', animationDelay: '0.6s' }} />
            <circle cx="32" cy="42" r="3" className="animate-[breath-rise_2.5s_ease-out_forwards]" style={{ transformOrigin: '32px 42px', animationDelay: '1.2s' }} />
          </g>
        )}

        {/* Occasional Body-Attached Activity Elements */}
        {activity === 'drinking-water' && (
          <g className="animate-[drinking-tilt_1.2s_infinite_ease-in-out]" style={{ transformOrigin: '32px 46px' }}>
            {/* Arm holding bottle */}
            <path d="M36 44 Q 40 40 43 41" stroke="#0b0b12" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            {/* Bottle Body (Transparent plastic look) */}
            <rect x="42" y="33" width="7" height="13" rx="1.5" fill="none" stroke="#cbd5e1" strokeWidth="0.8" />
            <path d="M44.5 33 v-2 h2 v2" fill="none" stroke="#cbd5e1" strokeWidth="0.8" />
            {/* Bottle Cap (Blue cap) */}
            <rect x="44" y="29.5" width="3" height="1.5" fill="#3b82f6" rx="0.5" />
            {/* Water inside (Translucent blue) */}
            <rect x="42.5" y="37" width="6" height="8.5" rx="1" fill="#38bdf8" opacity="0.7" />
            {/* Brand Label (White band) */}
            <rect x="42.1" y="35" width="6.8" height="2.5" fill="#ffffff" />
            <rect x="43" y="36.8" width="5" height="1" fill="#22c55e" rx="0.3" />
          </g>
        )}

        {activity === 'shaking-clock' && (
          <g className="animate-[clock-vibrate_0.15s_infinite]" style={{ transformOrigin: '48px 46px' }}>
            <circle cx="48" cy="46" r="4.5" fill="#f43f5e" stroke="#0b0b12" strokeWidth="0.8" />
            <circle cx="44.5" cy="41.5" r="1.5" fill="#94a3b8" />
            <circle cx="51.5" cy="41.5" r="1.5" fill="#94a3b8" />
            <line x1="44.5" y1="41.5" x2="46" y2="43" stroke="#0b0b12" strokeWidth="0.8" />
            <line x1="51.5" y1="41.5" x2="50" y2="43" stroke="#0b0b12" strokeWidth="0.8" />
            <line x1="45" y1="50.5" x2="44" y2="52" stroke="#0b0b12" strokeWidth="1" />
            <line x1="51" y1="50.5" x2="52" y2="52" stroke="#0b0b12" strokeWidth="1" />
            <line x1="48" y1="46" x2="48" y2="43" stroke="#0b0b12" strokeWidth="0.6" />
            <line x1="48" y1="46" x2="50" y2="46" stroke="#0b0b12" strokeWidth="0.6" />
          </g>
        )}

        {activity === 'staring-phone' && (
          <g className="animate-[phone-glow_1.5s_infinite_alternate]" style={{ transformOrigin: '47px 44px' }}>
            {/* Arm holding phone */}
            <path d="M36 45 Q 42 44 45 42" stroke="#0b0b12" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            {/* Phone body */}
            <rect x="44" y="34" width="10" height="16" rx="2" fill="#0f172a" stroke="#d97706" strokeWidth="1.2" />
            {/* Screen */}
            <rect x="45.2" y="35.2" width="7.6" height="13.6" rx="1" fill="#38bdf8" />
            {/* Charts on screen */}
            <rect x="46.5" y="37" width="5" height="2" rx="0.5" fill="#f59e0b" />
            <rect x="46.5" y="40" width="4" height="2" rx="0.5" fill="#10b981" />
            <rect x="46.5" y="43" width="5" height="2" rx="0.5" fill="#ffffff" />
            <circle cx="49" cy="47.5" r="0.6" fill="#ffffff" opacity="0.8" />
          </g>
        )}

        {activity === 'reading-book' && (
          <g className="animate-[book-float_1.5s_infinite_ease-in-out]" style={{ transformOrigin: '32px 50px' }}>
            <path d="M22 50 q10 -3 20 0 l1 4 q-10 -3 -20 0 z" fill="#b45309" />
            <path d="M23 49.5 q9 -2.5 18 0 l-0.5 3.5 q-9 -2.5 -18 0 z" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="0.3" />
            <path d="M23 49.5 v3.5" stroke="#cbd5e1" strokeWidth="0.5" />
            <path d="M41 49.5 v3.5" stroke="#cbd5e1" strokeWidth="0.5" />
            <line x1="25" y1="51" x2="30" y2="51" stroke="#64748b" strokeWidth="0.4" />
            <line x1="25" y1="52" x2="29" y2="52" stroke="#64748b" strokeWidth="0.4" />
            <line x1="33" y1="51" x2="38" y2="51" stroke="#64748b" strokeWidth="0.4" />
            <line x1="33" y1="52" x2="37" y2="52" stroke="#64748b" strokeWidth="0.4" />
          </g>
        )}

        {activity === 'listening-music' && (
          <g>
            {/* Headphone headband */}
            <path d="M12 28 A 20 20 0 0 1 52 28" fill="none" stroke="#1e293b" strokeWidth="1.5" />
            <path d="M11 28 A 21 21 0 0 1 53 28" fill="none" stroke="#f43f5e" strokeWidth="3.2" strokeLinecap="round" />
            {/* Left ear cup */}
            <rect x="7" y="23" width="6" height="12" rx="2.5" fill="#f43f5e" stroke="#991b1b" strokeWidth="1" />
            <rect x="9.5" y="25" width="2.2" height="8" rx="1" fill="#ffffff" opacity="0.35" />
            {/* Right ear cup */}
            <rect x="51" y="23" width="6" height="12" rx="2.5" fill="#f43f5e" stroke="#991b1b" strokeWidth="1" />
            <rect x="52.3" y="25" width="2.2" height="8" rx="1" fill="#ffffff" opacity="0.35" />

            <g opacity="0.9">
              <path d="M12 14 v-4 h3 v1.5 h-3" fill="none" stroke="#6366f1" strokeWidth="0.8" className="animate-[float-note_1.8s_infinite]" style={{ animationDelay: '0s' }} />
              <circle cx="11" cy="14" r="1.2" fill="#6366f1" />
              <path d="M50 12 v-4 h3 v1.5 h-3" fill="none" stroke="#8b5cf6" strokeWidth="0.8" className="animate-[float-note_1.8s_infinite]" style={{ animationDelay: '0.9s' }} />
              <circle cx="49" cy="12" r="1.2" fill="#8b5cf6" />
            </g>
          </g>
        )}

        {/* Occasional Body-Attached Activity Elements */}
        {activity === 'counting-cash' && (
          <g className="animate-[counting-cash-flick_1.2s_infinite]" style={{ transformOrigin: '44px 44px' }}>
            <rect x="36" y="44" width="14" height="8" rx="1.2" fill="#14532d" opacity="0.6" transform="rotate(-6 43 48)" />
            <rect x="37" y="42" width="14" height="8" rx="1.2" fill="#15803d" opacity="0.8" transform="rotate(-3 44 46)" />
            <rect x="38" y="40" width="14" height="8" rx="1.2" fill="#22c55e" stroke="#064e3b" strokeWidth="0.8" />
            <line x1="43" y1="40" x2="43" y2="48" stroke="#f59e0b" strokeWidth="0.8" strokeDasharray="1.5 1" />
            <text x="47.5" y="46" fontSize="5" fontWeight="900" fill="#ffffff" textAnchor="middle" fontFamily="'Inter', sans-serif">₦</text>
            <g className="animate-[note-flick_0.3s_infinite_alternate]" style={{ transformOrigin: '38px 40px' }}>
              <rect x="38" y="38" width="13" height="7.5" rx="1.2" fill="#4ade80" stroke="#064e3b" strokeWidth="0.6" />
              <line x1="42" y1="38" x2="42" y2="45.5" stroke="#f59e0b" strokeWidth="0.7" />
              <text x="46.5" y="43.5" fontSize="4.5" fontWeight="900" fill="#064e3b" textAnchor="middle" fontFamily="'Inter', sans-serif">₦</text>
            </g>
          </g>
        )}

        {currentMood === 'low-stock-peek' && (
          <g className="animate-[shelf-peek_1.5s_infinite_alternate]" style={{ transformOrigin: '52px 36px' }}>
            <line x1="44" y1="45" x2="62" y2="45" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="44" y1="46" x2="62" y2="46" stroke="#451a03" strokeWidth="0.8" strokeLinecap="round" />
            <rect x="46" y="35" width="6" height="10" rx="1" fill="#f59e0b" stroke="#78350f" strokeWidth="0.8" />
            <line x1="49" y1="35" x2="49" y2="45" stroke="#d97706" strokeWidth="0.8" />
            <rect x="54" y="40" width="6" height="5" fill="#ef4444" opacity="0.3" rx="1" stroke="#ef4444" strokeWidth="0.6" strokeDasharray="1.5 1" />
            <circle cx="57" cy="34" r="3" fill="#ef4444" className="animate-pulse" />
            <text x="57" y="36.2" fontSize="4.5" fontWeight="900" fill="#ffffff" textAnchor="middle" fontFamily="sans-serif">!</text>
          </g>
        )}

        {currentMood === 'offline-umbrella' && (
          <g>
            <g stroke="#38bdf8" strokeWidth="1.2" strokeLinecap="round" opacity="0.8">
              <line x1="14" y1="1" x2="12" y2="9" className="animate-[rain-fall_0.7s_infinite_linear]" style={{ animationDelay: '0s' }} />
              <line x1="32" y1="-2" x2="30" y2="7" className="animate-[rain-fall_0.7s_infinite_linear]" style={{ animationDelay: '0.25s' }} />
              <line x1="50" y1="2" x2="48" y2="10" className="animate-[rain-fall_0.7s_infinite_linear]" style={{ animationDelay: '0.5s' }} />
            </g>
            <g style={{ transformOrigin: '32px 13px' }} className="animate-[umbrella-sway_2s_infinite_ease-in-out]">
              <path d="M14 15 Q 32 3 50 15 C 44 13, 38 13, 32 15 C 26 13, 20 13, 14 15 Z" fill="#4f46e5" stroke="#1e1b4b" strokeWidth="1.2" />
              <path d="M20 13.5 Q 32 7 44 13.5" fill="none" stroke="#818cf8" strokeWidth="1" opacity="0.6" />
              <path d="M32 3 v-2" stroke="#1e1b4b" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="32" y1="14" x2="32" y2="29" stroke="#312e81" strokeWidth="1.8" />
              <path d="M32 29 q-2.5 3.5 -5 1" stroke="#312e81" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </g>
          </g>
        )}

        {activity === 'sync-fistpump' && (
          <g className="animate-[fistpump_0.5s_ease-out_forwards]" style={{ transformOrigin: '46px 42px' }}>
            <path d="M40 46 Q 45 34 49 22" stroke="#f59e0b" strokeWidth="1.8" fill="none" strokeDasharray="3 2" opacity="0.9" />
            <path d="M44 48 Q 48 37 52 26" stroke="#38bdf8" strokeWidth="1.5" fill="none" strokeDasharray="2 2" opacity="0.8" />
            <path d="M37 42 Q 44 35 46 25" stroke="#0b0b12" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            <circle cx="46" cy="24" r="4" fill="#f59e0b" stroke="#0b0b12" strokeWidth="1.2" />
            <path d="M46 17 l1.2 2.5 l2.8 0.4 l-2 2 l0.5 2.8 l-2.5 -1.3 l-2.5 1.3 l0.5 -2.8 l-2 -2 l2.8 -0.4 z" fill="#ffffff" stroke="#f59e0b" strokeWidth="0.5" />
          </g>
        )}

        {activity === 'order-doorbell-ears' && (
          <g>
            <g className="animate-[ears-perk_0.5s_infinite_alternate]" style={{ transformOrigin: '32px 14px' }}>
              <path d="M22 18 Q 17 6 19 4" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" fill="none" />
              <circle cx="19" cy="3.5" r="2.5" fill="#ef4444" className="animate-pulse" />
              <path d="M42 18 Q 47 6 45 4" stroke="#f59e0b" strokeWidth="2.8" strokeLinecap="round" fill="none" />
              <circle cx="45" cy="3.5" r="2.5" fill="#ef4444" className="animate-pulse" />
            </g>
            <g className="animate-[bell-shake_0.35s_infinite]" style={{ transformOrigin: '54px 18px' }}>
              <path d="M49 16 q5 -7 10 0 v4 h2 v1.8 h-14 v-1.8 h2 z" fill="#fbbf24" stroke="#78350f" strokeWidth="1" />
              <circle cx="54" cy="23" r="1.5" fill="#78350f" />
              <path d="M60 13 q3 3.5 0 7" stroke="#f59e0b" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              <path d="M62 11 q4.5 5.5 0 11" stroke="#f59e0b" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
            </g>
          </g>
        )}

        {currentMood === 'yawn-stretch' && (
          <g>
            <path d="M14 36 Q 4 28 2 20" stroke="#0b0b12" strokeWidth="3" strokeLinecap="round" fill="none" />
            <circle cx="2" cy="19" r="2.5" fill="#a27b5c" />
            <path d="M50 36 Q 60 28 62 20" stroke="#0b0b12" strokeWidth="3" strokeLinecap="round" fill="none" />
            <circle cx="62" cy="19" r="2.5" fill="#a27b5c" />
          </g>
        )}

        {activity === 'goal-trophy-lift' && (
          <g className="animate-[trophy-lift_1.2s_ease-out_infinite]" style={{ transformOrigin: '32px 14px' }}>
            <path d="M22 36 Q 24 18 28 16" stroke="#0b0b12" strokeWidth="2.8" strokeLinecap="round" fill="none" />
            <path d="M42 36 Q 40 18 36 16" stroke="#0b0b12" strokeWidth="2.8" strokeLinecap="round" fill="none" />
            <path d="M25 6 h14 v7 q0 7 -7 7 q-7 0 -7 -7 z" fill="url(#goldEggGrad)" stroke="#78350f" strokeWidth="1" />
            <path d="M25 8 h-2.5 q-2 0 -2 3.5 q0 3.5 2.5 3.5 h2" fill="none" stroke="#d97706" strokeWidth="1.2" />
            <path d="M39 8 h2.5 q2 0 2 3.5 q0 3.5 -2.5 3.5 h-2" fill="none" stroke="#d97706" strokeWidth="1.2" />
            <rect x="30" y="20" width="4" height="3" fill="#d97706" />
            <rect x="26" y="23" width="12" height="3.5" rx="0.8" fill="#451a03" stroke="#78350f" strokeWidth="0.8" />
            <circle cx="38" cy="5" r="1.8" fill="#ffffff" className="animate-ping" />
          </g>
        )}

        {activity === 'refund-wince' && (
          <g className="animate-[refund-wince-anim_0.35s_ease-out_forwards]" style={{ transformOrigin: '32px 37px' }}>
            <path d="M18 40 Q 24 34 28 42" stroke="#0b0b12" strokeWidth="2.8" strokeLinecap="round" fill="none" />
            <path d="M46 40 Q 40 34 36 42" stroke="#0b0b12" strokeWidth="2.8" strokeLinecap="round" fill="none" />
            <circle cx="20" cy="48" r="3" fill="#f59e0b" stroke="#78350f" strokeWidth="0.8" />
            <text x="20" y="49.5" fontSize="3.5" fontWeight="bold" fill="#78350f" textAnchor="middle">₦</text>
          </g>
        )}

        {activity === 'staff-wave' && (
          <g className="animate-[staff-wave-arm_0.4s_infinite_alternate]" style={{ transformOrigin: '44px 44px' }}>
            <path d="M42 42 Q 49 32 54 24" stroke="#0b0b12" strokeWidth="3" strokeLinecap="round" fill="none" />
            <circle cx="54" cy="23" r="3.2" fill="#a27b5c" stroke="#0b0b12" strokeWidth="0.8" />
            <path d="M57 20 q3 2 0 6" stroke="#f59e0b" strokeWidth="1" fill="none" strokeLinecap="round" />
          </g>
        )}

        {/* Soap bubbles on head when bathing */}
        {currentMood === 'bathing' && (
          <g fill="#ffffff" stroke="#94a3b8" strokeWidth="0.8" opacity="0.95">
            <circle cx="28" cy="16" r="3.5" className="animate-soap-bubble" style={{ animationDelay: '0s' }} />
            <circle cx="34" cy="15" r="4.2" className="animate-soap-bubble" style={{ animationDelay: '0.3s' }} />
            <circle cx="22" cy="18" r="2.8" className="animate-soap-bubble" style={{ animationDelay: '0.6s' }} />
            <circle cx="42" cy="17" r="3" className="animate-soap-bubble" style={{ animationDelay: '0.4s' }} />
            
            <circle cx="15" cy="35" r="2.5" className="animate-soap-bubble" style={{ animationDelay: '0.1s' }} />
            <circle cx="49" cy="35" r="2.5" className="animate-soap-bubble" style={{ animationDelay: '0.5s' }} />
          </g>
        )}
      </g>
    </svg>
  );
}
