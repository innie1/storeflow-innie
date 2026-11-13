import { Key } from 'lucide-react';
import type { StoreAccessState } from './useStoreAccess';

/**
 * Signing in to a shop with a PIN.
 */
export default function PinLoginStep({ s }: { s: StoreAccessState }) {
  const { setMode, selectedUser, pinBuffer, setPinBuffer, handlePinKeyPress } = s;
  return (
    <div className="space-y-4 text-left">
      <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
        <Key className="w-4 h-4 text-yellow-500" />
        <span>PIN Code Required: {selectedUser.name}</span>
      </h3>
      
      <div className="flex justify-center gap-2.5 py-4">
        {[0, 1, 2, 3].map(idx => {
          const filled = pinBuffer.length > idx;
          return (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border border-border transition-all ${
                filled ? 'bg-primary border-primary scale-110 gold-glow' : 'bg-surface-2'
              }`}
            />
          );
        })}
      </div>

      {/* Numeric PIN Pad Grid */}
      <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto pt-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
          <button
            key={digit}
            onClick={() => handlePinKeyPress(digit)}
            className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 text-foreground font-display font-bold text-lg active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
          >
            {digit}
          </button>
        ))}
        <button
          onClick={() => setPinBuffer('')}
          className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 text-destructive text-xs font-bold active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
        >
          Clear
        </button>
        <button
          onClick={() => handlePinKeyPress('0')}
          className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 text-foreground font-display font-bold text-lg active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
        >
          0
        </button>
        <button
          onClick={() => setPinBuffer(p => p.slice(0, -1))}
          className="p-4 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border/80 text-foreground text-sm font-bold active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none"
        >
          ⌫
        </button>
      </div>

      <button
        onClick={() => setMode('login-select')}
        className="w-full mt-4 p-2 text-muted-foreground text-sm hover:text-foreground text-center cursor-pointer"
      >
        ← Back to Profiles
      </button>
    </div>
  );
}
