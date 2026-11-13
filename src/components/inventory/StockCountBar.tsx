import { recordStockCountAudit } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import type { InventoryState } from './useInventory';

/**
 * Shown while counting stock: progress through the count and the way to finish it.
 */
export default function StockCountBar({ s }: { s: InventoryState }) {
  const { store, onUpdate, setCountMode, auditCounts, setAuditCounts, setShowAuditHistory } = s;
  return (
    <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 mb-4 flex flex-wrap items-center justify-between gap-3 text-left">
      <div>
        <h3 className="font-display font-bold text-warning text-sm flex items-center gap-1.5">
          📋 Stock Count Mode Active
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enter the physical quantities found on store shelves. Audits will adjust stock and log variances.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setShowAuditHistory(true)}
          className="px-3.5 py-2 rounded-lg bg-surface-2 border border-border text-foreground hover:bg-surface-3 text-xs font-semibold animate-pulse"
        >
          📜 Audit History
        </button>
        <button
          onClick={() => {
            let updated = store;
            Object.entries(auditCounts).forEach(([pId, act]) => {
              const prod = store.products.find(p => p.id === pId);
              if (prod) {
                updated = recordStockCountAudit(updated, pId, prod.name, prod.quantity, act);
              }
            });
            onUpdate(updated);
            setAuditCounts({});
            setCountMode(false);
            showToast('✓ Stock counts reconciled');
          }}
          disabled={Object.keys(auditCounts).length === 0}
          className="px-3.5 py-2 rounded-lg bg-warning text-primary-foreground hover:opacity-90 disabled:opacity-50 text-xs font-bold"
        >
          ✓ Reconcile Audits ({Object.keys(auditCounts).length})
        </button>
        <button
          onClick={() => {
            setCountMode(false);
            setAuditCounts({});
          }}
          className="px-3.5 py-2 rounded-lg bg-surface-2 border border-border text-xs font-semibold text-destructive hover:bg-destructive/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
