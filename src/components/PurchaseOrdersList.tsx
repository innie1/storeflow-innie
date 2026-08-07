import { StoreData, PurchaseOrderRecord } from '@/types/store';
import { X, Package, ChevronRight } from 'lucide-react';
import { updatePurchaseOrderStatus } from '@/lib/store-data';

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

  const advanceStatus = (po: PurchaseOrderRecord) => {
    const next = NEXT_STATUS[po.status];
    if (!next) return;
    const updated = updatePurchaseOrderStatus(store, po.id, next);
    onUpdate(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <h3 className="text-base font-display font-bold">Purchase Orders</h3>
        </div>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-2/60" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {orders.length === 0 && (
          <div className="text-center py-16">
            <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Auto Fix creates one automatically from restock advice, or check back after your next order.</p>
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
