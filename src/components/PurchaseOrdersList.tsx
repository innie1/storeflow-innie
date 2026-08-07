import { useEffect, useState } from 'react';
import { StoreData } from '@/types/store';
import { X, Package, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showToast } from '@/components/Toast';

interface PurchaseOrdersListProps {
  store: StoreData;
  onClose: () => void;
}

interface PO {
  id: string;
  supplier_name: string | null;
  items: { productId: string; name: string; qty: number; costPrice: number }[];
  total_cost: number;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  source: 'manual' | 'auto_fix';
  created_at: string;
}

const STATUS_STYLE: Record<PO['status'], string> = {
  draft: 'bg-muted/50 text-muted-foreground',
  ordered: 'bg-primary/10 text-primary',
  received: 'bg-success/10 text-success',
  cancelled: 'bg-destructive/10 text-destructive',
};

const NEXT_STATUS: Partial<Record<PO['status'], PO['status']>> = {
  draft: 'ordered',
  ordered: 'received',
};

const NEXT_LABEL: Partial<Record<PO['status'], string>> = {
  draft: 'Mark Ordered',
  ordered: 'Mark Received',
};

export default function PurchaseOrdersList({ store, onClose }: PurchaseOrdersListProps) {
  const [orders, setOrders] = useState<PO[] | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = async () => {
    if (!store.id) { setOrders([]); return; }
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      showToast(`Couldn't load purchase orders: ${error.message}`, 'error');
      setOrders([]);
      return;
    }
    setOrders((data || []) as unknown as PO[]);
  };

  useEffect(() => { load(); }, [store.id]);

  const advanceStatus = async (po: PO) => {
    const next = NEXT_STATUS[po.status];
    if (!next) return;
    setUpdatingId(po.id);
    const { error } = await supabase.from('purchase_orders').update({ status: next }).eq('id', po.id);
    setUpdatingId(null);
    if (error) {
      showToast(`Couldn't update status: ${error.message}`, 'error');
      return;
    }
    setOrders(prev => prev ? prev.map(o => o.id === po.id ? { ...o, status: next } : o) : prev);
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
        {orders === null && (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <div key={i} className="h-20 rounded-xl bg-surface-2/40 animate-pulse" />)}
          </div>
        )}

        {orders !== null && orders.length === 0 && (
          <div className="text-center py-16">
            <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Auto Fix creates one automatically from restock advice, or check back after your next order.</p>
          </div>
        )}

        {orders?.map(po => (
          <div key={po.id} className="p-3.5 rounded-xl border border-border">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="font-display font-semibold text-sm">{po.supplier_name || 'Unnamed supplier'}</p>
                <p className="text-xs text-muted-foreground">{new Date(po.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })} · {po.source === 'auto_fix' ? 'Created by Flow' : 'Manual'}</p>
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
              <p className="text-sm font-display font-bold">₦{po.total_cost.toLocaleString()}</p>
              {NEXT_STATUS[po.status] && (
                <button
                  onClick={() => advanceStatus(po)}
                  disabled={updatingId === po.id}
                  className="flex items-center gap-1 text-xs font-display font-semibold text-primary disabled:opacity-50"
                >
                  {updatingId === po.id ? 'Updating…' : NEXT_LABEL[po.status]}
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
