import { useMemo, useState } from 'react';
import { Copy, ExternalLink, PackageCheck, Search, Share2, X } from 'lucide-react';
import { PurchaseOrderRecord, StoreData } from '@/types/store';
import { showToast } from '@/components/Toast';
import ScrollLock from '@/components/ScrollLock';
import { buyListOrigin } from '@/lib/buy-list-origin';

interface MyBuyListsProps {
  store: StoreData;
  onClose?: () => void;
}

const money = (n: number) => `₦${Math.round(n || 0).toLocaleString()}`;

export default function MyBuyLists({ store, onClose }: MyBuyListsProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PurchaseOrderRecord | null>(null);

  const lists = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(store.purchaseOrders || [])]
      .filter(po => !q || po.importCode.toLowerCase().includes(q) || po.items.some(i => i.name.toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [store.purchaseOrders, query]);

  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); showToast(`Copied ${code}`, 'success'); }
    catch { showToast('Could not copy the code.', 'error'); }
  };

  const shareList = async (po: PurchaseOrderRecord) => {
    const text = [
      `StoreFlow Buy List — ${po.importCode}`,
      `Created: ${new Date(po.createdAt).toLocaleDateString()}`,
      '',
      ...po.items.map((item, i) => `${i + 1}. ${item.name} × ${item.qty} — ${money(item.costPrice)} each`),
      '',
      `Total: ${money(po.totalCost)}`,
      `Import code: ${po.importCode}`,
      'Enter this code in Inventory > Import to receive the list into stock.'
    ].join('\n');

    if (navigator.share) {
      try { await navigator.share({ title: `Buy List ${po.importCode}`, text }); return; }
      catch { /* cancelled */ }
    }
    try { await navigator.clipboard.writeText(text); showToast('Buy list copied to clipboard.', 'success'); }
    catch { showToast('Could not share this list.', 'error'); }
  };

  const status = (po: PurchaseOrderRecord) => {
    if (po.imported) return { label: 'Received', cls: 'bg-success/10 text-success border-success/20' };
    if (po.status === 'cancelled') return { label: 'Cancelled', cls: 'bg-destructive/10 text-destructive border-destructive/20' };
    if (po.status === 'ordered') return { label: 'Approved / Shared', cls: 'bg-primary/10 text-primary border-primary/20' };
    return { label: 'Draft', cls: 'bg-warning/10 text-warning border-warning/20' };
  };

  return (
    <div className="fixed inset-0 z-[65] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-hidden bg-card border border-border rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-lg">My Buy Lists</h2>
            <p className="text-xs text-muted-foreground">Every approved restock list and its one-time import code.</p>
          </div>
          {onClose && <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-2"><X className="w-4 h-4" /></button>}
        </div>

        <div className="p-4 border-b border-border/70">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by code or product..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-2/50 border border-border text-sm outline-none focus:border-primary" />
          </div>
        </div>

        <div className="overflow-y-auto max-h-[65vh] p-4 space-y-2.5">
          {lists.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground">
              <PackageCheck className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold">No buy lists yet</p>
              <p className="text-xs mt-1">Approved lists will appear here with their unique codes.</p>
            </div>
          ) : lists.map(po => {
            const s = status(po);
            const origin = buyListOrigin(po);
            return (
              <button key={po.id} onClick={() => setSelected(po)} className="w-full text-left p-3.5 rounded-xl border border-border/60 bg-surface-2/20 hover:bg-surface-2/50 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm">{po.importCode}</span>
                      {/* Who chose the quantities. Two lists side by side, one
                          sized by Flow and one typed by hand, used to look the
                          same. */}
                      <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${origin.className}`}>{origin.label}</span>
                      <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${s.cls}`}>{s.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{po.items.length} product{po.items.length === 1 ? '' : 's'} · {new Date(po.createdAt).toLocaleDateString()} · {money(po.totalCost)}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={() => setSelected(null)}><ScrollLock />
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Restock Code</p>
                <h3 className="font-mono text-xl font-bold mt-1">{selected.importCode}</h3>
                <p className="text-xs text-muted-foreground mt-1">Created {new Date(selected.createdAt).toLocaleString()}</p>
                <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${buyListOrigin(selected).className}`}>
                    {buyListOrigin(selected).label}
                  </span>
                  {buyListOrigin(selected).hint}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-surface-2"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-2 mb-4">
              {selected.items.map(item => (
                <div key={`${selected.id}-${item.productId}`} className="flex justify-between gap-3 p-3 rounded-xl bg-surface-2/40 border border-border/40">
                  <div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{money(item.costPrice)} each</p></div>
                  <div className="text-right"><p className="text-sm font-bold">× {item.qty}</p><p className="text-xs text-muted-foreground">{money(item.qty * item.costPrice)}</p></div>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-between">
              <span className="text-xs font-semibold">Total</span><span className="font-display font-bold text-lg text-primary">{money(selected.totalCost)}</span>
            </div>

            {selected.imported && <div className="mt-3 p-3 rounded-xl bg-success/10 border border-success/20 text-xs text-success font-semibold">✓ This code has already been used{selected.importedAt ? ` on ${new Date(selected.importedAt).toLocaleDateString()}` : ''}.</div>}

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => copyCode(selected.importCode)} className="py-2.5 rounded-xl border border-border bg-surface-2/50 text-xs font-bold flex items-center justify-center gap-1.5"><Copy className="w-4 h-4" /> Copy Code</button>
              <button onClick={() => shareList(selected)} className="py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5"><Share2 className="w-4 h-4" /> Share List</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
