import { useMemo, useState } from 'react';
import { StoreData, TabId } from '@/types/store';
import { Search, X, Package, Users, Receipt } from 'lucide-react';
import Mascot from '../Mascot';

interface SimpleSearchProps {
  store: StoreData;
  onNavigate: (tab: TabId) => void;
  onClose: () => void;
}

const MAX_PER_GROUP = 6;

export default function SimpleSearch({ store, onNavigate, onClose }: SimpleSearchProps) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (q.length < 1) return { products: [], customers: [], sales: [] };

    const products = store.products
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
      )
      .slice(0, MAX_PER_GROUP);

    const customers = (store.customers || [])
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
      )
      .slice(0, MAX_PER_GROUP);

    const sales = store.sales
      .filter(s =>
        s.productName.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.transactionId || '').toLowerCase().includes(q)
      )
      .slice(0, MAX_PER_GROUP);

    return { products, customers, sales };
  }, [q, store.products, store.customers, store.sales]);

  const hasAny = results.products.length > 0 || results.customers.length > 0 || results.sales.length > 0;

  return (
    <div className="fixed inset-0 z-[85] bg-background/95 backdrop-blur-sm flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex-1 flex items-center gap-2 bg-surface-2 border border-border rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search products, customers, receipts..."
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery('')} className="cursor-pointer">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-sm font-display font-semibold text-primary px-1.5 shrink-0 cursor-pointer"
        >
          Cancel
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {q.length < 1 && (
          <div className="flex flex-col items-center text-center mt-8 px-4 animate-fade-in">
            <div className="relative flex flex-col items-center mb-3">
              <Mascot size={100} mood="thinking" animate={true} />
              <div className="mt-3 px-4 py-2 rounded-2xl bg-surface-2 border border-border shadow-sm max-w-[260px]">
                <p className="text-xs font-display font-medium text-foreground">
                  What are we searching for today? 🔍
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Type a product name, customer, or receipt # above
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-surface-2 border border-border/60 text-muted-foreground flex items-center gap-1">
                <Package className="w-3 h-3 text-primary" /> Products
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-surface-2 border border-border/60 text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3 text-primary" /> Customers
              </span>
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-surface-2 border border-border/60 text-muted-foreground flex items-center gap-1">
                <Receipt className="w-3 h-3 text-primary" /> Receipts
              </span>
            </div>
          </div>
        )}

        {q.length >= 1 && !hasAny && (
          <div className="flex flex-col items-center text-center mt-8 px-4 animate-fade-in">
            <div className="w-full max-w-xs p-5 rounded-2xl bg-surface-2/80 border border-border/80 shadow-md flex flex-col items-center gap-3">
              <div className="relative">
                <Mascot size={110} mood="concerned" animate={true} />
              </div>
              <div>
                <h4 className="font-display font-bold text-sm text-foreground">Nothing Found</h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Flow checked your store, but couldn't find any matches for <span className="font-semibold text-foreground">"{query}"</span>. 🙈
                </p>
              </div>
              <div className="w-full pt-2.5 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                <span>💡 Check spelling or search by barcode / phone</span>
              </div>
            </div>
          </div>
        )}

        {results.products.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2 px-1">Inventory</p>
            <div className="space-y-1.5">
              {results.products.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onNavigate('inventory'); onClose(); }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-surface-2 border border-border hover:border-primary/40 transition-colors text-left cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.quantity} in stock · ₦{p.sellingPrice.toLocaleString()}
                      {p.barcode ? ` · ${p.barcode}` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {results.customers.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2 px-1">Customers</p>
            <div className="space-y-1.5">
              {results.customers.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onNavigate('customers'); onClose(); }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-surface-2 border border-border hover:border-primary/40 transition-colors text-left cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.phone || 'No phone on file'}
                      {c.outstandingDebt > 0 ? ` · ₦${c.outstandingDebt.toLocaleString()} owed` : ''}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {results.sales.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground mb-2 px-1">Receipts</p>
            <div className="space-y-1.5">
              {results.sales.map(s => (
                <button
                  key={s.id}
                  onClick={() => { onNavigate('history'); onClose(); }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-surface-2 border border-border hover:border-primary/40 transition-colors text-left cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{s.productName} × {s.quantity}</p>
                    <p className="text-[11px] text-muted-foreground">
                      ₦{s.total.toLocaleString()} · {new Date(s.date).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
