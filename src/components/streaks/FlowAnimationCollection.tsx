import React, { useEffect, useState } from 'react';
import {
  FLOW_ANIMATIONS,
  animationDefinition,
  getUnlockedFlowAnimations,
  playFlowAnimation,
  FlowAnimationId,
} from '@/lib/flow-animation-unlocks';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FlowAnimationCollection({ open, onClose }: Props) {
  const [unlocked, setUnlocked] = useState<FlowAnimationId[]>([]);

  const refresh = () => setUnlocked(getUnlockedFlowAnimations());

  useEffect(() => {
    if (!open) return;
    refresh();
    const onUnlock = () => refresh();
    window.addEventListener('storeflow:flow-animation-unlocked', onUnlock);
    return () => window.removeEventListener('storeflow:flow-animation-unlocked', onUnlock);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[82vh] overflow-hidden rounded-t-3xl sm:rounded-3xl border border-border bg-background shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-display font-black text-lg">Flow animations</h2>
            <p className="text-xs text-muted-foreground">Tap an unlocked animation to make Flow perform it.</p>
          </div>
          <button onClick={onClose} className="rounded-full px-3 py-2 text-xs font-semibold border border-border">Done</button>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 overflow-y-auto max-h-[65vh]">
          {FLOW_ANIMATIONS.map(animation => {
            const isUnlocked = unlocked.includes(animation.id);
            return (
              <button
                key={animation.id}
                disabled={!isUnlocked}
                onClick={() => playFlowAnimation(animation.id)}
                className={`text-left rounded-2xl border p-4 transition-all ${isUnlocked ? 'border-primary/30 bg-primary/5 active:scale-[.98]' : 'border-border bg-surface-2/20 opacity-60'}`}
              >
                <div className="text-3xl mb-2">{isUnlocked ? animation.icon : '🔒'}</div>
                <div className="font-display font-bold text-sm">{isUnlocked ? animation.name : 'Locked'}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{isUnlocked ? animation.subtitle : animation.unlockHint}</div>
                {isUnlocked && <div className="mt-3 text-[10px] font-bold uppercase tracking-wide text-primary">Play animation</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
