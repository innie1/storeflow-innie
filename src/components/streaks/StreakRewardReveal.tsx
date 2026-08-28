import { useEffect, useState } from 'react';
import { StreakReward } from '@/types/store';
import { STREAK_REWARD_POOL, getRewardLine } from '@/lib/streaks';
import RewardIcon from './RewardIcon';
import Mascot from '../Mascot';
import { Sparkles } from 'lucide-react';

export default function StreakRewardReveal({ reward, onClose }: { reward: StreakReward; onClose: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const item = STREAK_REWARD_POOL.find(i => i.id === reward.itemId);
  const itemName = item?.name || 'Mystery Item';

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 550);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-[80] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={revealed ? onClose : undefined}>
      <div
        className="w-full max-w-sm rounded-3xl bg-card border border-border shadow-2xl p-6 text-center relative overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute inset-0 pointer-events-none opacity-[0.15]" style={{ background: 'radial-gradient(circle at 50% 0%, #ff8a3d, transparent 60%)' }} />

        <p className="text-[11px] uppercase tracking-widest font-bold text-orange-500 mb-1">Day {reward.day} Streak</p>
        <h2 className="font-display font-black text-xl mb-4">Reward Unlocked!</h2>

        <div className="flex justify-center mb-4">
          <Mascot size={80} mood={revealed ? 'celebrating' : 'happy'} />
        </div>

        <div
          className={`mx-auto mb-4 w-28 h-28 rounded-2xl bg-surface-2 border border-border flex items-center justify-center transition-all duration-500 ${
            revealed ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        >
          <RewardIcon itemId={reward.itemId} size={56} className="text-primary" />
        </div>

        {revealed && (
          <>
            <p className="font-display font-bold text-lg mb-2 flex items-center justify-center gap-1.5">
              <Sparkles className="w-4 h-4 text-orange-400" />
              {itemName}
            </p>
            <p className="text-sm text-muted-foreground italic mb-5">"{getRewardLine(reward, itemName)}"</p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold cursor-pointer active:scale-[0.98] transition-transform"
            >
              Nice!
            </button>
          </>
        )}
      </div>
    </div>
  );
}
