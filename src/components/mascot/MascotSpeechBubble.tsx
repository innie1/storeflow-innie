import type { MascotState } from './useMascot';

/**
 * What Flow is saying, in a bubble beside it.
 */
export default function MascotSpeechBubble({ s }: { s: MascotState }) {
  const { message, bubbleShiftX, bubblePosition, bubbleShiftY, bubbleRef, isBeside } = s;
  return (
    <div 
      ref={bubbleRef}
      className={`absolute z-50 pointer-events-none ${
        bubblePosition === 'above' ? 'bottom-full mb-3 left-1/2'
          : bubblePosition === 'below' ? 'top-full mt-3 left-1/2'
          : bubblePosition === 'right' ? 'left-full ml-3 top-1/2'
          : 'right-full mr-3 top-1/2'
      }`}
      style={{
        transform: isBeside
          // Beside him: centred on his middle, nudged only to stay on screen.
          ? `translateY(calc(-50% + ${bubbleShiftY}px))`
          : `translate(calc(-50% + ${bubbleShiftX}px), ${bubbleShiftY}px)`,
      }}
    >
      <div className="bg-card border border-border px-3 py-1.5 rounded-xl text-xs text-foreground font-display font-bold shadow-lg animate-bounce-subtle select-none whitespace-normal text-center min-w-[130px] max-w-[210px] relative">
        <p className="leading-snug">{message}</p>
        {bubblePosition === 'above' && (
          <div
            className="absolute top-full -mt-1 w-2.5 h-2.5 bg-card border-r border-b border-border rotate-45"
            style={{
              left: `clamp(10px, calc(50% - ${bubbleShiftX}px), calc(100% - 10px))`,
              transform: 'translateX(-50%) rotate(45deg)'
            }}
          />
        )}
        {bubblePosition === 'below' && (
          <div
            className="absolute bottom-full -mb-1 w-2.5 h-2.5 bg-card border-l border-t border-border rotate-45"
            style={{
              left: `clamp(10px, calc(50% - ${bubbleShiftX}px), calc(100% - 10px))`,
              transform: 'translateX(-50%) rotate(45deg)'
            }}
          />
        )}
        {bubblePosition === 'right' && (
          <div
            className="absolute right-full -mr-1 w-2.5 h-2.5 bg-card border-l border-b border-border"
            style={{ top: '50%', transform: 'translateY(-50%) rotate(45deg)' }}
          />
        )}
        {bubblePosition === 'left' && (
          <div
            className="absolute left-full -ml-1 w-2.5 h-2.5 bg-card border-r border-t border-border"
            style={{ top: '50%', transform: 'translateY(-50%) rotate(45deg)' }}
          />
        )}
      </div>
    </div>
  );
}
