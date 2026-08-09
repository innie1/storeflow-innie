import { useMemo, useState } from 'react';
import { Product, StoreData } from '@/types/store';
import { Check, X, ChevronDown, ChevronUp } from 'lucide-react';

interface QuickSellGridProps {
  store: StoreData;
  onSell: (productId: string, quantity: number) => void;
}

const GRID_SIZE = 9;

// Recent sales are deliberately first so the things the owner just sold stay
// close to the mic. After that we keep the owner's pinned products and
// best-sellers, preserving the old quick-sell behavior for everything else.
function getLastSaleTimes(store: StoreData): Map<string, number> {
  const lastSale = new Map<string, number>();
  for (const sale of store.sales) {
    const timestamp = new Date(sale.date).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const current = lastSale.get(sale.productId) || 0;
    if (timestamp > current) lastSale.set(sale.productId, timestamp);
  }
  return lastSale;
}

function sortSellProducts(store: StoreData): Product[] {
  const lastSale = getLastSaleTimes(store);
  const pinned = new Set(store.simpleOnboarding?.topProductIds || []);

  return [...store.products]
    .filter(p => !p.discontinued)
    .sort((a, b) => {
      const aRecent = lastSale.get(a.id) || 0;
      const bRecent = lastSale.get(b.id) || 0;

      // Recently sold products always rise to the top. This also applies when
      // the owner expands the list with More.
      if (aRecent !== bRecent) return bRecent - aRecent;

      const aPinned = pinned.has(a.id) ? 0 : 1;
      const bPinned = pinned.has(b.id) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;

      const unitDiff = (b.units_sold || 0) - (a.units_sold || 0);
      if (unitDiff !== 0) return unitDiff;

      return a.name.localeCompare(b.name);
    });
}

export default function QuickSellGrid({ store, onSell }: QuickSellGridProps) {
  const allProducts = useMemo(() => sortSellProducts(store), [store]);
  const [showAll, setShowAll] = useState(false);
  const [active, setActive] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);

  const products = showAll ? allProducts : allProducts.slice(0, GRID_SIZE);
  const hasMore = allProducts.length > GRID_SIZE;

  if (allProducts.length === 0) return null;

  const openTile = (p: Product) => {
    setActive(p);
    setQty(1);
  };

  const confirm = () => {
    if (!active) return;
    onSell(active.id, qty);
    setActive(null);
  };

  return (
    <div className="w-full mt-6">
      <p className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wide text-center mb-3">
        Or Tap To Sell
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {products.map(p => (
          <button
            key={p.id}
            onClick={() => openTile(p)}
            className="py-2.5 px-3 rounded-xl border border-border/80 bg-surface-2/40 hover:bg-surface-2 flex items-center justify-between gap-2 active:scale-[0.98] transition-all text-left group"
          >
            <div className="min-w-0 flex-1">
              <span className="font-display font-semibold text-xs text-foreground block truncate group-hover:text-primary transition-colors">
                {p.name}
              </span>
              <span className="text-[11px] font-medium text-muted-foreground block mt-0.5">
                ₦{p.sellingPrice.toLocaleString()}
              </span>
            </div>
            <div className="shrink-0 w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold text-xs flex items-center justify-center">
              +
            </div>
          </button>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setShowAll(prev => !prev)}
          className="w-full mt-3 py-2.5 rounded-xl border border-border bg-surface-2/60 text-muted-foreground hover:text-foreground hover:bg-surface-2 font-display font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.99] transition-all"
          aria-expanded={showAll}
        >
          {showAll ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showAll ? 'Show less' : `More · ${allProducts.length - GRID_SIZE} more items`}
        </button>
      )}

      {active && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 animate-fade-in">
          <div className="w-full max-w-sm bg-background rounded-t-2xl sm:rounded-2xl p-5 pb-6">
            <p className="font-display font-bold text-base text-foreground text-center">{active.name}</p>

            <div className="flex items-center justify-center gap-3 mt-5">
              <button
                onClick={() => setQty(q => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center font-bold text-lg"
              >−</button>
              <span className="font-display font-black text-xl w-10 text-center">{qty}</span>
              <button
                onClick={() => setQty(q => Math.min(active.quantity || q + 1, q + 1))}
                className="w-10 h-10 rounded-full bg-surface-2 border border-border flex items-center justify-center font-bold text-lg"
              >+</button>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-3">
              Total: <span className="font-display font-bold text-foreground">₦{(active.sellingPrice * qty).toLocaleString()}</span>
            </p>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setActive(null)}
                className="flex-1 py-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm flex items-center justify-center gap-1.5"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
              <button
                onClick={confirm}
                className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Confirm Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
