import { useState } from 'react';
import { StoreData, PurchaseOrderRecord } from '@/types/store';
import { X, Package, ChevronRight, KeyRound, Copy, CheckCircle2 } from 'lucide-react';
import { updatePurchaseOrderStatus, importPurchaseOrderByCode } from '@/lib/store-data';
import { showToast } from '@/components/Toast';

interface PurchaseOrdersListProps {
  store: StoreData;
  onClose: () => void;
  onUpdate: (s: StoreData) => void;
}

const STATUS_STYLE: Record<PurchaseOrderRecord['status'], string> = {
  draft: 'bg-muted/50 text-muted-foreground',
  ordered: 'bg-primary/10 text-primary',
  received: 'bg-success/10 text-success',
  cancelled: 'bg-destructive/10 text-destructive',
};

const NEXT_STATUS: Partial<Record<PurchaseOrderRecord['status'], PurchaseOrderRecord['status']>> = {
  draft: 'ordered',
  ordered: 'received',
};

const NEXT_LABEL: Partial<Record<PurchaseOrderRecord['status'], string>> = {
  draft: 'Mark Ordered',
  ordered: 'Mark Received',
};

export default function PurchaseOrdersList({ store, onClose, onUpdate }: PurchaseOrdersListProps) {
  const orders = store.purchaseOrders || [];
  const [showImport, setShowImport] = useState(false);
  const [codeInput, setCodeInput] = useState('');

  const advanceStatus = (po: PurchaseOrderRecord) => {
    const next = NEXT_STATUS[po.status];
    if (!next) return;
    const updated = updatePurchaseOrderStatus(store, po.id, next);
    onUpdate(updated);
  };

  const handleImport = () => {
    const result = importPurchaseOrderByCode(store, codeInput);
    if (result.success) {
      onUpdate(result.store);
      showToast(result.message, 'success');
      setCodeInput('');
      setShowImport(false);
    } else {
      showToast(result.message, 'error');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showToast('Code copied', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h3 className="text-base font-display font-bold">Purchase Orders</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-display font-bold"
          >
            <KeyRound className="w-3.5 h-3.5" /> Import with Code
          </button>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {showImport && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowImport(false)}>
          <div className="w-full sm:max-w-sm bg-background border border-border rounded-t-2xl sm:rounded-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <h4 className="font-display font-bold text-sm">Import with Purchase Code</h4>
            <p className="text-xs text-muted-foreground">Enter the code from a Buy List you already approved. It'll add those exact items to your stock — each code works once.</p>
            <input
              value={codeInput}
              onChange={e => setCodeInput(e.target.value.toUpperCase())}
              placeholder="PO-XXXXXX"
              autoCapitalize="characters"
              className="w-full p-3 rounded-xl bg-surface-2 border border-border text-center font-mono font-bold tracking-widest text-sm focus:outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowImport(false)} className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-semibold">Cancel</button>
              <button onClick={handleImport} disabled={!codeInput.trim()} className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 text-xs font-display font-bold">Import</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {orders.length === 0 && (
          <div className="text-center py-16">
            <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Approve a Buy List, or Auto Fix creates one automatically from restock advice.</p>
          </div>
        )}

        {orders.map(po => (
          <div key={po.id} className="p-3.5 rounded-xl border border-border">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="font-display font-semibold text-sm">{po.supplierName || 'Unnamed supplier'}</p>
                <p className="text-xs text-muted-foreground">{new Date(po.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} · {po.source === 'auto_fix' ? 'Created by Flow' : 'Manual'}</p>
              </div>
              <span className={`text-[10px] font-display font-bold uppercase px-2 py-1 rounded-full ${STATUS_STYLE[po.status]}`}>{po.status}</span>
            </div>

            {po.importCode && (
              <div className="flex items-center justify-between gap-2 mb-2 px-2.5 py-2 rounded-lg bg-surface-2/60 border border-border/60">
                <div className="flex items-center gap-1.5 min-w-0">
                  <KeyRound className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="font-mono font-bold text-xs tracking-wider truncate">{po.importCode}</span>
                </div>
                {po.imported ? (
                  <span className="flex items-center gap-1 text-[10px] font-display font-bold text-success shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Imported
                  </span>
                ) : (
                  <button onClick={() => copyCode(po.importCode)} className="flex items-center gap-1 text-[10px] font-display font-bold text-primary shrink-0">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1 mb-2">
              {po.items.map((it, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-foreground truncate">{it.name} × {it.qty}</span>
                  <span className="text-muted-foreground flex-shrink-0">₦{(it.qty * it.costPrice).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/40">
              <p className="text-sm font-display font-bold">₦{po.totalCost.toLocaleString()}</p>
              {NEXT_STATUS[po.status] && (
                <button
                  onClick={() => advanceStatus(po)}
                  className="flex items-center gap-1 text-xs font-display font-semibold text-primary"
                >
                  {NEXT_LABEL[po.status]}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
