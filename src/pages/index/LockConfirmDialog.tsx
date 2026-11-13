import { showToast } from '@/components/Toast';
import ScrollLock from '@/components/ScrollLock';
import type { IndexScreenReady } from './useIndexScreen';

/**
 * Asks before locking the shop.
 */
export default function LockConfirmDialog({ s }: { s: IndexScreenReady }) {
  const { store, setShowLockConfirm, handleLock } = s;
  return (
    <div className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setShowLockConfirm(false)}><ScrollLock />
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-4" onClick={e => e.stopPropagation()}>
        <div className="text-center space-y-2">
          <div className="text-3xl">🔒</div>
          <h3 className="font-display font-bold text-lg">Lock your store?</h3>
          <p className="text-sm text-muted-foreground">You'll need to re-enter your access code to get back in.</p>
        </div>

        <div className="bg-surface-2 border border-border rounded-xl p-3 flex items-center justify-between gap-3">
          <div className="text-left">
            <span className="text-[10px] text-muted-foreground uppercase font-sans font-bold tracking-wider block mb-0.5">Store Access Code</span>
            <span className="text-sm font-mono font-bold text-primary tracking-wider">{store.accessCode}</span>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(store.accessCode);
              showToast('✓ Access code copied');
            }}
            className="p-2.5 rounded-lg bg-surface-3 hover:bg-surface-4 border border-border text-muted-foreground hover:text-primary transition-all duration-200 flex items-center justify-center active:scale-95 cursor-pointer"
            title="Copy Access Code"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setShowLockConfirm(false)} className="flex-1 p-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm cursor-pointer">Cancel</button>
          <button onClick={() => { setShowLockConfirm(false); handleLock(); }} className="flex-1 p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm cursor-pointer">Lock Store</button>
        </div>
      </div>
    </div>
  );
}
