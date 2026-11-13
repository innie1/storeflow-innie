import { showToast } from '@/components/Toast';
import type { InventoryState } from './useInventory';

/**
 * Two products that look like the same thing: merge them or keep both.
 */
export default function DuplicateMergeSheet({ s }: { s: InventoryState }) {
  const {
    highConfidencePair, renameVal, setRenameVal, isRenaming, setIsRenaming,
    handleResolveSimilarPair,
  } = s;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => handleResolveSimilarPair(highConfidencePair.p1, highConfidencePair.p2, 'separate')}>
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 shadow-2xl animate-scale-in space-y-4 text-left" onClick={e => e.stopPropagation()}>
        <div className="text-center space-y-2">
          <div className="text-3xl">🔀</div>
          <h3 className="font-display font-bold text-lg text-white">Possible Duplicate Found</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            These products look very similar. What would you like to do?
          </p>
        </div>

        <div className="bg-surface-2/40 border border-border/80 rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground font-semibold">Existing Product:</span>
            <span className="font-bold text-white text-right max-w-[150px] truncate">{highConfidencePair.p1.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground font-semibold">New Product:</span>
            <span className="font-bold text-white text-right max-w-[150px] truncate">{highConfidencePair.p2.name}</span>
          </div>
          <div className="flex justify-between border-t border-border/40 pt-2 font-mono">
            <span className="text-muted-foreground font-semibold">Similarity:</span>
            <span className="font-extrabold text-primary">{highConfidencePair.score}%</span>
          </div>
        </div>

        {isRenaming ? (
          <div className="space-y-2 pt-1.5 animate-fade-in">
            <input
              type="text"
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-surface-2 border border-border text-xs text-white placeholder:text-muted-foreground"
              placeholder="Enter new product name..."
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsRenaming(false);
                  setRenameVal('');
                }}
                className="flex-1 py-2 rounded-lg bg-surface-3 border border-border text-[11px] font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!renameVal.trim()) return showToast('Please enter a valid name', 'error');
                  handleResolveSimilarPair(highConfidencePair.p1, highConfidencePair.p2, 'rename', renameVal.trim());
                  setIsRenaming(false);
                  setRenameVal('');
                }}
                className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold"
              >
                Confirm Rename
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={() => handleResolveSimilarPair(highConfidencePair.p1, highConfidencePair.p2, 'merge')}
              className="w-full py-2.5 bg-primary text-primary-foreground font-display font-bold text-xs rounded-xl hover:brightness-110 active:scale-98 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              🔀 Merge Products
            </button>
            <button
              onClick={() => {
                setIsRenaming(true);
                setRenameVal(highConfidencePair.p2.name);
              }}
              className="w-full py-2.5 bg-surface-3 border border-border text-foreground font-display font-semibold text-xs rounded-xl hover:bg-surface-2 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              ✏️ Rename New Product
            </button>
            <button
              onClick={() => handleResolveSimilarPair(highConfidencePair.p1, highConfidencePair.p2, 'separate')}
              className="w-full py-2.5 bg-surface-2 border border-border text-muted-foreground font-display font-semibold text-xs rounded-xl hover:bg-surface-3 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              📦 Keep Separate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
