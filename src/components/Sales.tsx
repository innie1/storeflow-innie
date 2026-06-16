import { useMemo, useState } from 'react';
import { StoreData, Sale } from '@/types/store';
import { recordSale, getTopSellers, findProductByBarcode } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import SaleReceipt from '@/components/SaleReceipt';
import BarcodeScanner from '@/components/BarcodeScanner';

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
}

interface SalesProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

export default function Sales({ store, onUpdate }: SalesProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('All');
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customQtyFor, setCustomQtyFor] = useState<string | null>(null);
  const [customQty, setCustomQty] = useState('1');

  // ---------- today's metrics ----------
  const today = new Date().toISOString().split('T')[0];
  const todaySales = useMemo(
    () => store.sales.filter(s => s.date.startsWith(today)),
    [store.sales, today]
  );
  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0);
  const todayProfit = todaySales.reduce((s, x) => s + x.profit, 0);
  const todayCount = todaySales.length;

  // ---------- categories ----------
  const categories = useMemo(() => {
    const set = new Set<string>();
    store.products.forEach(p => p.category && set.add(p.category));
    return ['All', ...Array.from(set)];
  }, [store.products]);

  // ---------- product ordering ----------
  const topSellerIds = useMemo(() => {
    const ids = new Set<string>();
    getTopSellers(store, 100).forEach(t => {
      const p = store.products.find(p => p.name === t.name);
      if (p) ids.add(p.id);
    });
    return ids;
  }, [store]);

  const getAvailableQty = (productId: string) => {
    const product = store.products.find(p => p.id === productId);
    if (!product) return 0;
    const inCart = cart.filter(c => c.productId === productId).reduce((s, c) => s + c.quantity, 0);
    return product.quantity - inCart;
  };

  const visibleProducts = useMemo(() => {
    const sorted = [...store.products]
      .filter(p => p.quantity > 0)
      .sort((a, b) => {
        const aTop = topSellerIds.has(a.id) ? 0 : 1;
        const bTop = topSellerIds.has(b.id) ? 0 : 1;
        return aTop - bTop || a.name.localeCompare(b.name);
      });
    return sorted.filter(p => {
      const matchCat = category === 'All' || p.category === category;
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [store.products, topSellerIds, category, search]);

  // ---------- cart ops ----------
  const addToCart = (productId: string, qty: number) => {
    const product = store.products.find(p => p.id === productId);
    if (!product) return;
    if (qty > getAvailableQty(productId)) return showToast('Not enough stock', 'error');
    const idx = cart.findIndex(c => c.productId === productId);
    if (idx >= 0) {
      const updated = [...cart];
      updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + qty };
      setCart(updated);
    } else {
      setCart([
        ...cart,
        {
          productId,
          productName: product.name,
          quantity: qty,
          unitPrice: product.sellingPrice,
          costPrice: product.costPrice,
        },
      ]);
    }
  };

  const handleQuickAdd = (productId: string) => {
    if (getAvailableQty(productId) < 1) return showToast('Out of stock', 'error');
    addToCart(productId, 1);
  };

  const handleCustomAdd = () => {
    if (!customQtyFor) return;
    const qty = Number(customQty);
    if (isNaN(qty) || qty <= 0) return showToast('Invalid quantity', 'error');
    addToCart(customQtyFor, qty);
    setCustomQtyFor(null);
    setCustomQty('1');
  };

  const changeCartQty = (i: number, delta: number) => {
    const item = cart[i];
    if (!item) return;
    const next = item.quantity + delta;
    if (next <= 0) return setCart(cart.filter((_, idx) => idx !== i));
    const product = store.products.find(p => p.id === item.productId);
    if (product) {
      const otherInCart = cart
        .filter((c, idx) => c.productId === item.productId && idx !== i)
        .reduce((s, c) => s + c.quantity, 0);
      if (next + otherInCart > product.quantity) return showToast('Not enough stock', 'error');
    }
    const updated = [...cart];
    updated[i] = { ...item, quantity: next };
    setCart(updated);
  };

  const handleCheckout = () => {
    if (cart.length === 0) return showToast('Cart is empty', 'error');
    let updated = store;
    let lastRecordedSale: Sale | null = null;
    for (const item of cart) {
      const p = updated.products.find(p => p.id === item.productId);
      if (!p || p.quantity < item.quantity) {
        showToast(`Not enough stock for ${item.productName}`, 'error');
        return;
      }
      updated = recordSale(updated, item.productId, item.quantity);
      lastRecordedSale = updated.sales[0];
    }
    onUpdate(updated);
    if (lastRecordedSale) setLastSale(lastRecordedSale);
    const totalAmount = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
    showToast(`Sale complete — ₦${totalAmount.toLocaleString()}`);
    setCart([]);
    setCartOpen(false);
  };

  const handleBarcodeDetected = (code: string) => {
    const product = findProductByBarcode(store, code);
    if (!product) return showToast('Barcode not linked to any product', 'error');
    if (getAvailableQty(product.id) < 1) return showToast(`${product.name} out of stock`, 'error');
    addToCart(product.id, 1);
    setScanning(false);
  };

  const cartTotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const cartProfit = cart.reduce((s, c) => s + (c.unitPrice - c.costPrice) * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-4 pb-28">
      {/* Today hero */}
      <div className="rounded-2xl p-4 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Today</p>
            <p className="font-display text-2xl font-bold text-primary">
              ₦{todayRevenue.toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => setScanning(true)}
            className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/30 text-primary text-lg flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Scan barcode"
          >
            🔳
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface-2/60 p-2">
            <p className="text-[10px] text-muted-foreground">Sales</p>
            <p className="text-sm font-display font-semibold text-foreground">{todayCount}</p>
          </div>
          <div className="rounded-lg bg-surface-2/60 p-2">
            <p className="text-[10px] text-muted-foreground">Profit</p>
            <p className="text-sm font-display font-semibold text-success">
              ₦{todayProfit.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Search products..."
        className="w-full p-3 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary"
      />

      {/* Category chips */}
      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-display font-semibold border transition-colors ${
                category === c
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/40'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {/* Product grid: tap = quick add, long press / "·" = custom qty */}
      {visibleProducts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
          {store.products.length === 0
            ? 'Add products in the Inventory tab to start selling.'
            : 'No products match.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {visibleProducts.map(p => {
            const avail = getAvailableQty(p.id);
            const isTop = topSellerIds.has(p.id);
            return (
              <div
                key={p.id}
                className="relative rounded-xl bg-card border border-border p-3 flex flex-col justify-between min-h-[112px] hover:border-primary/40 transition-colors"
              >
                {isTop && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-display font-semibold">
                    ★ TOP
                  </span>
                )}
                <div>
                  <p className="text-sm font-display font-semibold text-foreground line-clamp-2 pr-8">
                    {p.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{avail} left</p>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-primary font-display font-bold text-sm">
                    ₦{p.sellingPrice.toLocaleString()}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setCustomQtyFor(p.id);
                        setCustomQty('1');
                      }}
                      className="w-7 h-7 rounded-md bg-surface-2 text-muted-foreground hover:text-primary text-xs"
                      aria-label="Custom quantity"
                    >
                      ⋯
                    </button>
                    <button
                      onClick={() => handleQuickAdd(p.id)}
                      disabled={avail < 1}
                      className="w-7 h-7 rounded-md bg-primary text-primary-foreground font-bold text-base disabled:opacity-40 active:scale-95 transition-transform"
                      aria-label="Add one"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom qty popover */}
      {customQtyFor && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setCustomQtyFor(null)}
        >
          <div
            className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <p className="font-display font-bold text-sm">
              {store.products.find(p => p.id === customQtyFor)?.name}
            </p>
            <input
              autoFocus
              type="number"
              min="0.01"
              step="any"
              value={customQty}
              onChange={e => setCustomQty(e.target.value)}
              className="w-full p-3 rounded-lg bg-surface-2 border border-border text-center text-lg font-display"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setCustomQtyFor(null)}
                className="flex-1 p-2.5 rounded-lg bg-surface-2 text-muted-foreground text-sm font-display"
              >
                Cancel
              </button>
              <button
                onClick={handleCustomAdd}
                className="flex-1 p-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold"
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating cart button */}
      {cart.length > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 px-5 py-3 rounded-full bg-primary text-primary-foreground font-display font-bold text-sm shadow-lg flex items-center gap-2 active:scale-95 transition-transform"
        >
          🛒 {cartCount} item{cartCount !== 1 ? 's' : ''} · ₦{cartTotal.toLocaleString()}
        </button>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end justify-center"
          onClick={() => setCartOpen(false)}
        >
          <div
            className="w-full max-w-md bg-card border-t border-border rounded-t-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold">🛒 Cart</h3>
              <button
                onClick={() => setCart([])}
                className="text-xs text-destructive hover:underline"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2">
              {cart.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-lg bg-surface-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground font-medium truncate">
                      {item.productName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      ₦{item.unitPrice.toLocaleString()} each
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => changeCartQty(i, -1)}
                      className="w-7 h-7 rounded-md bg-card border border-border text-muted-foreground"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-display font-semibold">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => changeCartQty(i, 1)}
                      className="w-7 h-7 rounded-md bg-card border border-border text-muted-foreground"
                    >
                      +
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm text-primary font-display font-semibold">
                    ₦{(item.unitPrice * item.quantity).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="text-primary font-display font-bold">
                  ₦{cartTotal.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Profit</span>
                <span className="text-success font-display font-semibold">
                  ₦{cartProfit.toLocaleString()}
                </span>
              </div>
            </div>
            <button
              onClick={handleCheckout}
              className="w-full p-3 rounded-xl bg-success text-white font-display font-bold"
            >
              Complete Sale
            </button>
          </div>
        </div>
      )}

      {scanning && (
        <BarcodeScanner
          title="Scan to Sell"
          subtitle="Aim at the product's barcode"
          onClose={() => setScanning(false)}
          onDetected={handleBarcodeDetected}
        />
      )}

      {lastSale && (
        <SaleReceipt store={store} sale={lastSale} onClose={() => setLastSale(null)} />
      )}
    </div>
  );
}
