import { showToast } from '@/components/Toast';
import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * Going through the products that might be duplicates, one pair at a time.
 */
export default function DuplicateReviewSheet({ s }: { s: InventoryState }) {
  const {
    mediumConfidencePairs, setShowMediumReviews, renameTarget, setRenameTarget, renameVal,
    setRenameVal, handleResolveSimilarPair,
  } = s;
  return (
    <Modal
      title="Review Similar Products"
      onClose={() => {
        setShowMediumReviews(false);
        setRenameTarget(null);
        setRenameVal('');
      }}
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 no-scrollbar text-xs text-left">
        <p className="text-muted-foreground leading-snug">
          StoreFlow flagged the following products as possible duplicates based on similarities in name, units, costs, and selling prices. Review them to keep inventory data clean.
        </p>

        <div className="space-y-3.5">
          {mediumConfidencePairs.map(({ p1, p2, score }) => {
            const key = `${p1.id}-${p2.id}`;
            const isItemRenaming = renameTarget?.id === p2.id;

            return (
              <div key={key} className="p-3 bg-surface-2/30 border border-border/60 rounded-xl space-y-3 text-left">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-muted-foreground">Possible Match ({score}%)</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 font-bold uppercase">Medium Confidence</span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Product 1:</span>
                    <span className="font-bold text-white truncate max-w-[180px]">{p1.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Product 2:</span>
                    <span className="font-bold text-white truncate max-w-[180px]">{p2.name}</span>
                  </div>
                </div>

                {isItemRenaming ? (
                  <div className="space-y-2 pt-1 border-t border-border/40">
                    <input
                      type="text"
                      value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      className="w-full p-2 rounded bg-surface-2 border border-border text-xs text-white"
                      placeholder="Enter new product name..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setRenameTarget(null);
                          setRenameVal('');
                        }}
                        className="flex-1 py-1.5 rounded bg-surface-3 border border-border text-[10px] font-semibold"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (!renameVal.trim()) return showToast('Please enter a valid name', 'error');
                          handleResolveSimilarPair(p1, p2, 'rename', renameVal.trim());
                          setRenameTarget(null);
                          setRenameVal('');
                        }}
                        className="flex-1 py-1.5 rounded bg-primary text-primary-foreground text-[10px] font-bold"
                      >
                        Save Name
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1.5 pt-1 border-t border-border/40">
                    <button
                      onClick={() => handleResolveSimilarPair(p1, p2, 'merge')}
                      className="flex-1 py-2 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[10px] rounded-lg transition cursor-pointer"
                    >
                      🔀 Merge
                    </button>
                    <button
                      onClick={() => {
                        setRenameTarget(p2);
                        setRenameVal(p2.name);
                      }}
                      className="flex-1 py-2 bg-surface-3 hover:bg-surface-2 text-foreground font-semibold text-[10px] rounded-lg transition border border-border cursor-pointer"
                    >
                      ✏️ Rename
                    </button>
                    <button
                      onClick={() => handleResolveSimilarPair(p1, p2, 'separate')}
                      className="flex-1 py-2 bg-surface-2 hover:bg-surface-3 text-muted-foreground font-semibold text-[10px] rounded-lg transition border border-border cursor-pointer"
                    >
                      📦 Keep Sep.
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {mediumConfidencePairs.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-xs">
              ✨ No pending medium confidence matches to review!
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
