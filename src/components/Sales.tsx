import { useMemo, useState } from 'react';
import { StoreData, Sale, PaymentMethod } from '@/types/store';
import { recordCheckout, getTopSellers, findProductByBarcode } from '@/lib/store-data';
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
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customQtyFor, setCustomQtyFor] = useState<string | null>(null);
  const [customQty, setCustomQty] = useState('1');

  // checkout form
  const [discount, setDiscount] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [saveAs, setSaveAs] = useState<'paid' | 'pending'>('paid');
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const todaySales = useMemo(() => store.sales.filter(s => s.date.startsWith(today)), [store.sales, today]);
  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0);
  const todayProfit = todaySales.reduce((s, x) => s + x.profit, 0);
  const todayCount = todaySales.length;

  const categories = useMemo(() => {
    const set = new Set<string>();
    store.products.forEach(p => p.category && set.add(p.category));
    return ['All', ...Array.from(set)];
  }, [store.products]);

  const topSellerIds = useMemo(() => {
    const ids = new Set<string>();
    getTopSellers(store, 100).forEach(t => {
      const p = store.products.find(p => p.name === t.name);
      if (p) ids.add(p.id);
    });
    return ids;
  }, [store]);

  // Fast-selling = sold in last 7 days
  const fastSellingIds = useMemo(() => {
    const cutoff = Date.now() - 7 * 86400000;
    const ids = new Set<string>();
    store.sales.forEach(s => { if (new Date(s.date).getTime() > cutoff) ids.add(s.productId); });
    return ids;
  }, [store.sales]);

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
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [store.products, topSellerIds, category, search]);

  const addToCart = (productId: string, qty: number) => {
    const product = store.products.find(p => p.id === productId);
    if (!product) return false;
    if (qty > getAvailableQty(productId)) { showToast('Not enough stock', 'error'); return false; }
    const idx = cart.findIndex(c => c.productId === productId);
    if (idx >= 0) {
      const updated = [...cart];
      updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + qty };
      setCart(updated);
    } else {
      setCart(prev => [...prev, {
        productId, productName: product.name, quantity: qty,
        unitPrice: product.sellingPrice, costPrice: product.costPrice,
      }]);
    }
    return true;
  };

  const handleQuickAdd = (productId: string) => {
    if (getAvailableQty(productId) < 1) return showToast('Out of stock', 'error');
    addToCart(productId, 1);
  };

  // ⚡ Instant Sell — bypass cart, jump straight to checkout with 1 unit
  const handleInstantSell = (productId: string) => {
    const product = store.products.find(p => p.id === productId);
    if (!product || product.quantity < 1) return showToast('Out of stock', 'error');
    setCart([{
      productId, productName: product.name, quantity: 1,
      unitPrice: product.sellingPrice, costPrice: product.costPrice,
    }]);
    openCheckout(product.sellingPrice);
  };

  const handleCustomAdd = () => {
    if (!customQtyFor) return;
    const qty = Number(customQty);
    if (isNaN(qty) || qty <= 0) return showToast('Invalid quantity', 'error');
    addToCart(customQtyFor, qty);
    setCustomQtyFor(null); setCustomQty('1');
  };

  const changeCartQty = (i: number, delta: number) => {
    const item = cart[i]; if (!item) return;
    const next = item.quantity + delta;
    if (next <= 0) return setCart(cart.filter((_, idx) => idx !== i));
    const product = store.products.find(p => p.id === item.productId);
    if (product) {
      const otherInCart = cart.filter((c, idx) => c.productId === item.productId && idx !== i).reduce((s, c) => s + c.quantity, 0);
      if (next + otherInCart > product.quantity) return showToast('Not enough stock', 'error');
    }
    const updated = [...cart]; updated[i] = { ...item, quantity: next }; setCart(updated);
  };

  const cartSubtotal = cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  const cartProfit = cart.reduce((s, c) => s + (c.unitPrice - c.costPrice) * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const discountNum = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, cartSubtotal - discountNum);
  const paidNum = Math.min(total, Math.max(0, Number(paidAmount) || 0));
  const balance = Math.max(0, total - paidNum);

  const openCheckout = (preset?: number) => {
    if (cart.length === 0 && !preset) return showToast('Cart is empty', 'error');
    setDiscount(''); setMethod('cash'); setSaveAs('paid');
    setCustomerName(''); setCustomerPhone(''); setDueDate(''); setCustomerNote('');
    const sub = preset ?? cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
    setPaidAmount(String(sub));
    setCheckoutOpen(true);
  };

  const handleConfirm = () => {
    if (cart.length === 0) return;
    if (balance > 0 && saveAs === 'pending' && !customerName.trim()) {
      return showToast('Customer name is required for pending payment', 'error');
    }
    if (balance > 0 && saveAs === 'paid') {
      return showToast('Balance remains — switch to Pending Payment or top up the amount', 'error');
    }
    const result = recordCheckout(store,
      cart.map(c => ({ productId: c.productId, quantity: c.quantity })),
      {
        paid: paidNum,
        method,
        discount: discountNum,
        customerName: saveAs === 'pending' ? customerName.trim() : undefined,
        customerPhone: saveAs === 'pending' ? customerPhone.trim() || undefined : undefined,
        dueDate: saveAs === 'pending' && dueDate ? new Date(dueDate).toISOString() : undefined,
        customerNote: saveAs === 'pending' ? customerNote.trim() || undefined : undefined,
      });
    onUpdate(result.store);
    if (result.sales[0]) setLastSale(result.sales[0]);
    showToast(result.pending ? `Saved as pending · balance ₦${result.pending.balance.toLocaleString()}` : `Sale complete — ₦${total.toLocaleString()}`);
    setCart([]); setCheckoutOpen(false);
  };

  const handleBarcodeDetected = (code: string) => {
    const product = findProductByBarcode(store, code);
    if (!product) return showToast('Barcode not linked to any product', 'error');
    if (getAvailableQty(product.id) < 1) return showToast(`${product.name} out of stock`, 'error');
    addToCart(product.id, 1);
    setScanning(false);
  };

  // auto switch to pending when balance > 0
  const onPaidChange = (v: string) => {
    setPaidAmount(v);
    const p = Math.min(total, Math.max(0, Number(v) || 0));
    if (total - p > 0) setSaveAs('pending'); else setSaveAs('paid');
  };
  const balanceTone = balance === 0 ? 'text-success' : balance < total ? 'text-warning' : 'text-destructive';

  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-4 pb-28">
      {/* Today hero */}
      <div className="rounded-2xl p-4 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Today's Sales</p>
            <p className="font-display text-2xl font-bold text-primary">₦{todayRevenue.toLocaleString()}</p>
          </div>
          <button onClick={() => setScanning(true)}
            className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/30 text-primary text-lg flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Scan barcode">🔳</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-surface-2/60 p-2"><p className="text-[10px] text-muted-foreground">Sales</p><p className="text-sm font-display font-semibold">{todayCount}</p></div>
          <div className="rounded-lg bg-surface-2/60 p-2"><p className="text-[10px] text-muted-foreground">Profit</p><p className="text-sm font-display font-semibold text-success">₦{todayProfit.toLocaleString()}</p></div>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search products..."
        className="w-full p-3 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary" />

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-display font-semibold border transition-colors ${
                category === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'
              }`}>{c}</button>
          ))}
        </div>
      )}

      {visibleProducts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
          {store.products.length === 0 ? 'Add products in the Inventory tab to start selling.' : 'No products match.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {visibleProducts.map(p => {
            const avail = getAvailableQty(p.id);
            const isTop = topSellerIds.has(p.id);
            const isFast = fastSellingIds.has(p.id);
            const isLow = p.quantity <= 3;
            const inCart = cart.find(c => c.productId === p.id)?.quantity ?? 0;
            return (
              <div key={p.id} className="relative rounded-xl bg-card border border-border p-3 flex flex-col justify-between min-h-[152px]">
                {isTop && (
                  <span className="absolute top-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-display font-semibold">★ TOP</span>
                )}
                <div>
                  <p className="text-sm font-display font-semibold text-foreground line-clamp-2 pr-12">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{avail} left</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {isFast && <span className="text-[9px] text-warning">🔥 Fast</span>}
                    {isLow && <span className="text-[9px] text-destructive">⚠ Low</span>}
                  </div>
                </div>
                <div className="mt-2 space-y-1.5">
                  <span className="text-primary font-display font-bold text-sm block">₦{p.sellingPrice.toLocaleString()}</span>
                  <div className="flex gap-1">
                    <button onClick={() => handleInstantSell(p.id)} disabled={p.quantity < 1}
                      className="flex-1 h-8 rounded-md bg-success text-white text-[11px] font-display font-bold disabled:opacity-40 active:scale-95 transition-transform flex items-center justify-center gap-1"
                      aria-label="Instant sell">⚡ Sell</button>
                    <button onClick={() => handleQuickAdd(p.id)} disabled={avail < 1}
                      className="w-8 h-8 rounded-md bg-primary text-primary-foreground font-bold text-base disabled:opacity-40 active:scale-95 transition-transform relative"
                      aria-label="Add to cart">
                      +{inCart > 0 && <span className="absolute -top-1 -right-1 bg-destructive text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center">{inCart}</span>}
                    </button>
                  </div>
                  <button onClick={() => { setCustomQtyFor(p.id); setCustomQty('1'); }}
                    className="w-full h-6 rounded-md bg-surface-2 text-muted-foreground text-[10px]">Custom qty</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Custom qty popover */}
      {customQtyFor && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setCustomQtyFor(null)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-display font-bold text-sm">{store.products.find(p => p.id === customQtyFor)?.name}</p>
            <input autoFocus type="number" min="0.01" step="any" value={customQty} onChange={e => setCustomQty(e.target.value)}
              className="w-full p-3 rounded-lg bg-surface-2 border border-border text-center text-lg font-display" />
            <div className="flex gap-2">
              <button onClick={() => setCustomQtyFor(null)} className="flex-1 p-2.5 rounded-lg bg-surface-2 text-sm">Cancel</button>
              <button onClick={handleCustomAdd} className="flex-1 p-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold">Add to cart</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating cart bar */}
      {cart.length > 0 && !checkoutOpen && (
        <button onClick={() => openCheckout()}
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-40 px-5 py-3 rounded-full bg-primary text-primary-foreground font-display font-bold text-sm shadow-lg flex items-center gap-2 active:scale-95">
          🛒 {cartCount} · ₦{cartSubtotal.toLocaleString()} →
        </button>
      )}

      {/* CHECKOUT */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setCheckoutOpen(false)}>
          <div className="w-full max-w-md bg-card border-t sm:border border-border rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-lg">Checkout</h3>
                <p className="text-[11px] text-muted-foreground">{cartCount} item{cartCount !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setCheckoutOpen(false)} className="text-destructive text-xl">×</button>
            </div>

            <div className="p-4 space-y-4">
              {/* Order summary */}
              <div className="rounded-xl bg-surface-2/60 p-3 space-y-2">
                <p className="text-xs font-display font-bold text-muted-foreground uppercase">Order Summary</p>
                {cart.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground">₦{item.unitPrice.toLocaleString()} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeCartQty(i, -1)} className="w-6 h-6 rounded bg-card border border-border">−</button>
                      <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                      <button onClick={() => changeCartQty(i, 1)} className="w-6 h-6 rounded bg-card border border-border">+</button>
                    </div>
                    <span className="w-20 text-right text-primary font-display font-bold text-sm">₦{(item.unitPrice * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₦{cartSubtotal.toLocaleString()}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Discount</span>
                  <input type="number" value={discount} placeholder="0" onChange={e => setDiscount(e.target.value)}
                    className="w-24 p-1.5 rounded bg-surface-2 border border-border text-right text-sm" />
                </div>
                <div className="flex justify-between text-xs"><span className="text-muted-foreground">Profit</span><span className="text-success">₦{cartProfit.toLocaleString()}</span></div>
                <div className="flex justify-between font-display font-bold pt-1 border-t border-border">
                  <span>Total</span><span className="text-primary">₦{total.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment */}
              <div className="space-y-2">
                <p className="text-xs font-display font-bold text-muted-foreground uppercase">Payment</p>
                <div className="rounded-xl border-2 border-primary/40 p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">Customer Paid</p>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">₦</span>
                    <input autoFocus type="number" value={paidAmount} onChange={e => onPaidChange(e.target.value)}
                      className="flex-1 bg-transparent text-xl font-display font-bold focus:outline-none" />
                    <button onClick={() => onPaidChange(String(total))} className="text-[10px] text-primary px-2 py-1 rounded bg-primary/10">Full</button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1000, 2000, 5000, 10000].map(v => (
                    <button key={v} onClick={() => onPaidChange(String(paidNum + v))}
                      className="p-1.5 rounded-lg border border-primary/30 text-primary text-[11px] font-display font-semibold">+{v / 1000}k</button>
                  ))}
                </div>
                <div className="flex justify-between text-sm pt-1">
                  <span className="text-muted-foreground">Balance</span>
                  <span className={`font-display font-bold ${balanceTone}`}>₦{balance.toLocaleString()}</span>
                </div>
              </div>

              {/* Method */}
              <div className="space-y-2">
                <p className="text-xs font-display font-bold text-muted-foreground uppercase">Payment Method</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {([['cash', '💵', 'Cash'], ['transfer', '🏦', 'Transfer'], ['pos', '💳', 'POS'], ['mixed', '👥', 'Mixed']] as const).map(([m, icon, label]) => (
                    <button key={m} onClick={() => setMethod(m)}
                      className={`p-2 rounded-lg border text-center ${
                        method === m ? 'border-success bg-success/10' : 'border-border bg-surface-2'
                      }`}>
                      <div className="text-base">{icon}</div>
                      <div className="text-[10px] font-display font-semibold">{label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Save as */}
              {balance > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-display font-bold text-muted-foreground uppercase">Save as</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setSaveAs('paid')}
                      className={`p-3 rounded-xl border text-left text-xs ${saveAs === 'paid' ? 'border-success bg-success/10' : 'border-border bg-surface-2'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-3 h-3 rounded-full border ${saveAs === 'paid' ? 'bg-success border-success' : 'border-muted-foreground'}`} />
                        <span className="font-display font-bold">Paid in Full</span>
                      </div>
                      <p className="text-muted-foreground">Mark as completely paid</p>
                    </button>
                    <button onClick={() => setSaveAs('pending')}
                      className={`p-3 rounded-xl border text-left text-xs ${saveAs === 'pending' ? 'border-warning bg-warning/10' : 'border-border bg-surface-2'}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-3 h-3 rounded-full border ${saveAs === 'pending' ? 'bg-warning border-warning' : 'border-muted-foreground'}`} />
                        <span className="font-display font-bold">Pending Payment</span>
                      </div>
                      <p className="text-muted-foreground">Save balance for customer</p>
                    </button>
                  </div>
                </div>
              )}

              {/* Customer */}
              {(saveAs === 'pending' || customerOpen) && (
                <div className="space-y-2 rounded-xl border border-border p-3 bg-surface-2/40">
                  <p className="text-xs font-display font-bold flex items-center justify-between">
                    <span>👤 Customer {saveAs === 'pending' ? '(required)' : '(optional)'}</span>
                    {saveAs !== 'pending' && <button onClick={() => setCustomerOpen(false)} className="text-muted-foreground">×</button>}
                  </p>
                  <input placeholder="Customer name" value={customerName} onChange={e => setCustomerName(e.target.value)}
                    className="w-full p-2 rounded-lg bg-card border border-border text-sm" />
                  <input placeholder="Phone (for WhatsApp)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full p-2 rounded-lg bg-card border border-border text-sm" />
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full p-2 rounded-lg bg-card border border-border text-sm" />
                  <textarea placeholder="Notes (optional)" value={customerNote} onChange={e => setCustomerNote(e.target.value)} rows={2}
                    className="w-full p-2 rounded-lg bg-card border border-border text-sm" />
                </div>
              )}
              {saveAs !== 'pending' && !customerOpen && (
                <button onClick={() => setCustomerOpen(true)} className="w-full p-3 rounded-xl bg-surface-2 border border-border text-left text-xs flex items-center justify-between">
                  <span>👤 Customer (Optional)</span>
                  <span className="text-muted-foreground">›</span>
                </button>
              )}

              <button onClick={handleConfirm}
                className="w-full p-3.5 rounded-xl bg-success text-white font-display font-bold text-sm active:scale-[0.98]">
                🔒 Save Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {scanning && (
        <BarcodeScanner title="Scan to Sell" subtitle="Aim at the product's barcode"
          onClose={() => setScanning(false)} onDetected={handleBarcodeDetected} />
      )}

      {lastSale && <SaleReceipt store={store} sale={lastSale} onClose={() => setLastSale(null)} />}
    </div>
  );
}
