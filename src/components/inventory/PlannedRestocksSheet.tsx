import { receiveStock } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * Restocks the shop has planned but not yet received.
 */
export default function PlannedRestocksSheet({ s }: { s: InventoryState }) {
  const { store, onUpdate, currentUser, setShowPlannedRestocks } = s;
  return (
    <Modal title={`Planned Restocks (${(store.plannedRestocks || []).length})`} onClose={() => setShowPlannedRestocks(false)}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          These are planned inventory restocks. Once you have received the items, click "Receive Now" to add them to your active inventory.
        </p>

        {(!store.plannedRestocks || store.plannedRestocks.length === 0) ? (
          <p className="text-center py-6 text-xs text-muted-foreground">No planned restocks saved yet.</p>
        ) : (
          <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
            {store.plannedRestocks.map(pr => (
              <div key={pr.id} className="p-3 rounded-xl bg-surface-2 border border-border space-y-2 text-left">
                <div className="flex justify-between items-baseline gap-2">
                  <h4 className="font-display font-bold text-sm text-foreground">{pr.productName}</h4>
                  <span className="text-[10px] text-muted-foreground">{new Date(pr.date).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Qty: <strong>{pr.quantity}</strong></span>
                  <span>Unit Cost: ₦{pr.costPrice.toLocaleString()}</span>
                  <span>Total: ₦{(pr.quantity * pr.costPrice).toLocaleString()}</span>
                </div>
                <div className="flex gap-2 pt-1 border-t border-border/30">
                  <button
                    onClick={() => {
                      const updated = receiveStock(
                        store,
                        [{ productId: pr.productId, quantity: pr.quantity, costPrice: pr.costPrice }],
                        pr.funding,
                        'Purchase Order Receiving',
                        currentUser?.name,
                        currentUser?.role
                      );
                      const final = {
                        ...updated,
                        plannedRestocks: (updated.plannedRestocks || []).filter(x => x.id !== pr.id)
                      };
                      onUpdate(final);
                      showToast(`✓ Planned stock received: ${pr.productName}`);
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-success text-white font-display font-bold text-xs hover:opacity-90 cursor-pointer"
                  >
                    📥 Receive Now
                  </button>
                  <button
                    onClick={() => {
                      const final = {
                        ...store,
                        plannedRestocks: (store.plannedRestocks || []).filter(x => x.id !== pr.id)
                      };
                      onUpdate(final);
                      showToast('Planned restock deleted');
                    }}
                    className="px-2 py-1.5 rounded-lg bg-surface-3 border border-border text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                  >
                    ✕ Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setShowPlannedRestocks(false)}
          className="w-full p-2.5 rounded-lg bg-surface-2 border border-border font-display font-semibold text-xs text-foreground"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
