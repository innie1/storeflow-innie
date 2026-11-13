import {
  CircleDollarSign,
  TrendingUp,
  Package,
  ShoppingCart,
} from 'lucide-react';
import { MASCOT_KEYFRAMES } from './mascot/keyframes';
import { MascotMood, MascotProps } from './mascot/model';
import { useMascot } from './mascot/useMascot';
import MascotSpeechBubble from './mascot/MascotSpeechBubble';
import MascotFigure from './mascot/MascotFigure';

/** Kept importable from here, where the rest of the app has always found it. */
export type { MascotMood } from './mascot/model';

export default function Mascot(props: MascotProps) {
  const s = useMascot(props);
  const {
    size, className, message, dodgeClass, floatingReward, confetti, showFlash, showPrintedPhoto,
    containerRef, isTalking, currentMood, handlePressStart, handlePressEnd, walkClass, swellStyle,
    isWalkingOff, walkZIndexStyle,
  } = s;

  return (
    <div 
      ref={containerRef}
      className={`relative inline-block select-none cursor-pointer duration-300 transition-all ${dodgeClass} ${walkClass} ${className}`}
      onMouseDown={handlePressStart}
      onMouseUp={handlePressEnd}
      onTouchStart={handlePressStart}
      onTouchEnd={handlePressEnd}
      style={{ width: size, height: size, position: 'relative', ...swellStyle, ...walkZIndexStyle }}
    >
      <style>{MASCOT_KEYFRAMES}</style>

      {showFlash && (
        <div className="fixed inset-0 bg-white z-[9999] pointer-events-none animate-flash" />
      )}

      {showPrintedPhoto && (
        <div 
          className="absolute top-full left-1/2 z-50 pointer-events-none"
          style={{
            transform: 'translateX(-50%)',
          }}
        >
          <div className="bg-white p-2 shadow-2xl border border-slate-200 rounded text-center rotate-3 animate-[polaroid-slide_7.5s_ease-out_forwards] w-24 text-slate-800">
            <div className="w-20 h-16 bg-gradient-to-tr from-sky-400 via-pink-400 to-yellow-200 border border-slate-300 flex items-center justify-center overflow-hidden relative rounded-sm">
              <span className="text-2xl animate-[bounce_1.5s_infinite]">😊</span>
              <div className="absolute inset-0 bg-white/10" />
            </div>
            <div className="pt-1.5 pb-0.5 text-[8px] font-sans font-black tracking-wide text-slate-500 uppercase">
              YOU! 📸✨
            </div>
          </div>
        </div>
      )}

      {/* Floating Confetti */}
      {confetti.map(c => (
        <div
          key={c.id}
          className="absolute pointer-events-none rounded-full animate-confetti-particle"
          style={{
            left: `calc(50% + ${c.x}px)`,
            top: `calc(50% + ${c.y}px)`,
            width: '6px',
            height: '6px',
            backgroundColor: c.color,
            zIndex: 60,
          }}
        />
      ))}

      {/* Floating Reward Text */}
      {floatingReward && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 font-display font-black text-sm text-yellow-400 animate-float-reward z-50 pointer-events-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] whitespace-nowrap">
          {floatingReward}
        </div>
      )}

      {/* Speech Bubble - Screen Boundary Aware */}
      {message && !isWalkingOff && <MascotSpeechBubble s={s} />}

      {/* Floating ZZZs */}
      {currentMood === 'sleeping' && !isTalking && (
        <div className="absolute -top-3 left-[30%] pointer-events-none font-display font-black text-indigo-400 select-none">
          <span className="absolute text-[12px] animate-zzz-1">Z</span>
          <span className="absolute text-[9px] animate-zzz-2" style={{ left: '6px', top: '-4px' }}>Z</span>
          <span className="absolute text-[7px] animate-zzz-3" style={{ left: '12px', top: '-8px' }}>Z</span>
        </div>
      )}

      {/* Thinking Floating Symbols */}
      {currentMood === 'thinking' && (
        <div className="absolute inset-x-0 -top-6 flex justify-center gap-2 pointer-events-none select-none">
          <CircleDollarSign className="w-3.5 h-3.5 text-yellow-500 animate-[float-symbol_1.6s_infinite]" style={{ animationDelay: '0s' }} />
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 animate-[float-symbol_1.6s_infinite]" style={{ animationDelay: '0.4s' }} />
          <Package className="w-3.5 h-3.5 text-orange-500 animate-[float-symbol_1.6s_infinite]" style={{ animationDelay: '0.8s' }} />
          <ShoppingCart className="w-3.5 h-3.5 text-purple-500 animate-[float-symbol_1.6s_infinite]" style={{ animationDelay: '1.2s' }} />
        </div>
      )}

      {/* Actual SVG Mascot Graphic */}
      <MascotFigure s={s} />
    </div>
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
