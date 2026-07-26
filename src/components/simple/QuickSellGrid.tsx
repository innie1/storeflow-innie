import { useMemo, useState } from 'react';
import { Product, StoreData } from '@/types/store';
import { Check, X } from 'lucide-react';

interface QuickSellGridProps {
  store: StoreData;
  onSell: (productId: string, quantity: number) => void;
}

const GRID_SIZE = 9;

// Picks up to 9 products to show as quick-tap tiles:
// 1) Whatever the owner named during Top 5 Products Setup, first
// 2) Then filled up with their best-sellers (by units_sold)
// 3) Then filled up with whatever's left, so the grid isn't sparse for new shops
function pickGridProducts(store: StoreData): Product[] {
  const byId = new Map(store.products.map(p => [p.id, p]));
  const picked: Product[] = [];
  const seen = new Set<string>();

  for (const id of store.simpleOnboarding?.topProductIds || []) {
    const p = byId.get(id);
    if (p && !p.discontinued && !seen.has(p.id)) {
      picked.push(p);
      seen.add(p.id);
    }
  }

  const bySales = [...store.products]
    .filter(p => !p.discontinued && !seen.has(p.id))
    .sort((a, b) => (b.units_sold || 0) - (a.units_sold || 0));

  for (const p of bySales) {
    if (picked.length >= GRID_SIZE) break;
    picked.push(p);
    seen.add(p.id);
  }

  return picked.slice(0, GRID_SIZE);
}

export default function QuickSellGrid({ store, onSell }: QuickSellGridProps) {
  const products = useMemo(() => pickGridProducts(store), [store]);
  const [active, setActive] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);

  if (products.length === 0) return null;

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
    <div className="w-full mt-10">
      <p className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wide text-center mb-3">
        Or Tap To Sell
      </p>
      <div className="grid grid-cols-3 gap-2.5">
        {products.map(p => (
          <button
            key={p.id}
            onClick={() => openTile(p)}
            className="aspect-square rounded-2xl border border-border bg-surface-2/40 flex flex-col items-center justify-center text-center px-1.5 gap-0.5 active:scale-95 transition-transform"
          >
            <span className="font-display font-semibold text-xs text-foreground leading-tight line-clamp-2">
              {p.name}
            </span>
            <span className="text-[10px] text-muted-foreground">₦{p.sellingPrice.toLocaleString()}</span>
          </button>
        ))}
      </div>

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
