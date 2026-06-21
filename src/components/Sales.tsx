import { useMemo, useState, useEffect } from 'react';
import { StoreData, Sale, PaymentMethod, ManagerSettings } from '@/types/store';
import { recordCheckout, getTopSellers, findProductByBarcode, recordLostSale } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import SaleReceipt from '@/components/SaleReceipt';
import BarcodeScanner from '@/components/BarcodeScanner';
import VoiceSell from '@/components/VoiceSell';
import { printSystem } from '@/lib/print-engine';
import { getSmartDiscounts } from '@/lib/manager-intel';
import {
  Search,
  SlidersHorizontal,
  Zap,
  Plus,
  ArrowUp,
  User,
  BarChart3,
  Mic,
  QrCode,
  AlertTriangle
} from 'lucide-react';

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
  managerSettings?: ManagerSettings;
  isActive?: boolean;
}

export default function Sales({ store, onUpdate, managerSettings, isActive = true }: SalesProps) {
  const [search, setSearch] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [category, setCategory] = useState<string>('All');
  const [lastSales, setLastSales] = useState<Sale[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customQtyFor, setCustomQtyFor] = useState<string | null>(null);
  const [customQty, setCustomQty] = useState('1');
  const [filterLowStock, setFilterLowStock] = useState(false);

  const [showLostSaleModal, setShowLostSaleModal] = useState(false);
  const [lostSaleName, setLostSaleName] = useState('');
  const [lostSaleQty, setLostSaleQty] = useState('1');

  // Automatically shut down voice selling when navigating away
  useEffect(() => {
    if (!isActive) {
      setVoiceActive(false);
    }
  }, [isActive]);

  // checkout form
  const [discount, setDiscount] = useState('');
  const [discountManuallyEdited, setDiscountManuallyEdited] = useState(false);
  const [paidAmount, setPaidAmount] = useState('');
  const [paidAmountManuallyEdited, setPaidAmountManuallyEdited] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>(() => {
    return (localStorage.getItem('storeflow_last_payment_method') as PaymentMethod) || 'transfer';
  });
  const [saveAs, setSaveAs] = useState<'paid' | 'pending'>('paid');

  useEffect(() => {
    localStorage.setItem('storeflow_last_payment_method', method);
  }, [method]);
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
      const matchLow = !filterLowStock || p.quantity <= 3;
      return matchCat && matchSearch && matchLow;
    });
  }, [store.products, topSellerIds, category, search, filterLowStock]);

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

  const handleRecordLostSale = () => {
    if (!lostSaleName.trim() || Number(lostSaleQty) <= 0) {
      return showToast('Enter product name and quantity', 'error');
    }
    const updated = recordLostSale(store, lostSaleName.trim(), Number(lostSaleQty));
    onUpdate(updated);
    setShowLostSaleModal(false);
    setLostSaleName('');
    setLostSaleQty('1');
    showToast('✓ Lost sale recorded for Flow demand analysis');
  };

  const cartSmartDiscounts = useMemo(() => {
    const recs = getSmartDiscounts(store);
    return cart.map(item => {
      const rec = recs.find(r => r.productId === item.productId);
      if (rec) {
        const discountAmt = Math.round(item.unitPrice * item.quantity * (rec.suggestedDiscountPct / 100));
        return {
          productId: item.productId,
          productName: item.productName,
          suggestedPct: rec.suggestedDiscountPct,
          discountAmount: discountAmt,
          reason: `Clearance of slow-moving stock`
        };
      }
      return null;
    }).filter((r): r is NonNullable<typeof r> => r !== null);
  }, [cart, store]);

  const calculateAutoDiscount = (sub: number) => {
    if (!managerSettings?.autoDiscountEnabled) return 0;
    const minSub = managerSettings.autoDiscountMinSubtotal || 0;
    const maxSub = managerSettings.autoDiscountMaxSubtotal || 0;
    const isMinMet = !minSub || sub >= minSub;
    const isMaxMet = !maxSub || sub <= maxSub;
    
    if (isMinMet && isMaxMet) {
      if (managerSettings.autoDiscountType === 'percentage') {
        const val = managerSettings.autoDiscountValue || 0;
        return Math.round(sub * (val / 100));
      } else {
        return managerSettings.autoDiscountValue || 0;
      }
    }
    return 0;
  };

  // Recalculate automatic discount when subtotal changes (if not manually overridden)
  useEffect(() => {
    if (checkoutOpen && !discountManuallyEdited && managerSettings?.autoDiscountEnabled) {
      const amt = calculateAutoDiscount(cartSubtotal);
      setDiscount(amt > 0 ? String(amt) : '');
      if (!paidAmountManuallyEdited) {
        setPaidAmount(String(Math.max(0, cartSubtotal - amt)));
      }
    }
  }, [cartSubtotal, checkoutOpen, discountManuallyEdited, paidAmountManuallyEdited, managerSettings]);

  const openCheckout = (preset?: number) => {
    if (cart.length === 0 && !preset) return showToast('Cart is empty', 'error');
    setDiscountManuallyEdited(false);
    setPaidAmountManuallyEdited(false);
    
    const sub = preset ?? cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
    const initialDiscount = calculateAutoDiscount(sub);
    
    setDiscount(initialDiscount > 0 ? String(initialDiscount) : '');
    setMethod((localStorage.getItem('storeflow_last_payment_method') as PaymentMethod) || 'transfer');
    setSaveAs('paid');
    setCustomerName(''); setCustomerPhone(''); setDueDate(''); setCustomerNote('');
    setPaidAmount(String(Math.max(0, sub - initialDiscount)));
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
    if (result.sales.length > 0) {
      setLastSales(result.sales);
      if (managerSettings?.autoPrintReceipt) {
        const totalSum = result.sales.reduce((sum, s) => sum + s.total, 0);
        const receiptData = {
          storeName: store.storeName,
          storeType: store.profile?.storeType,
          location: store.profile?.location,
          phone: store.profile?.phone,
          email: store.profile?.email,
          receiptNumber: result.sales[0].transactionId || result.sales[0].id,
          date: result.sales[0].date,
          items: result.sales.map(s => ({
            productName: s.productName,
            name: s.productName,
            quantity: s.quantity,
            unitPrice: s.unitPrice,
            total: s.total
          })),
          subtotal: totalSum,
          discount: discountNum,
          total: Math.max(0, totalSum - discountNum),
          paid: paidNum,
          balance: balance,
          paymentMethod: method,
          footerMessage: managerSettings.receiptFooterMessage || 'Thank you for your patronage! 🙏',
          receiptCurrency: managerSettings.receiptCurrency || '₦',
        };
        printSystem(receiptData, managerSettings.receiptWidth || '58mm').catch(err => {
          console.error("Auto print failed:", err);
        });
      }
    }
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
    setPaidAmountManuallyEdited(true);
    const p = Math.min(total, Math.max(0, Number(v) || 0));
    if (total - p > 0) setSaveAs('pending'); else setSaveAs('paid');
  };
  const balanceTone = balance === 0 ? 'text-success' : balance < total ? 'text-warning' : 'text-destructive';

  return (
    <div className="animate-fade-in w-full max-w-2xl mx-auto space-y-4 pb-28">
      {/* Today's Sales Summary Card - High-Fidelity Themed Gradient */}
      <div className="rounded-2xl p-4 bg-gradient-to-br from-yellow-500/10 via-card/95 to-card border border-yellow-500/20 shadow-card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">Today's Sales (Revenue)</p>
            <h2 className="text-2xl font-display font-black text-yellow-500 mt-0.5">₦{todayRevenue.toLocaleString()}</h2>
          </div>
          <div className="w-11 h-11 rounded-xl border border-yellow-500/25 bg-yellow-500/10 flex items-center justify-center text-yellow-500">
            <BarChart3 className="w-5 h-5" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3.5">
          {/* Sales card */}
          <div className="bg-surface-2 border border-border/40 rounded-2xl p-3 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] text-slate-400 font-display font-semibold">Sales Count</p>
              <p className="text-lg font-display font-black text-foreground mt-0.5">{todayCount}</p>
            </div>
            <div className="w-7 h-7 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-500 shrink-0">
              <User className="w-4 h-4" />
            </div>
          </div>
          {/* Profit card */}
          <div className="bg-surface-2 border border-border/40 rounded-2xl p-3 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[11px] text-slate-400 font-display font-semibold">Net Profit</p>
              <p className="text-lg font-display font-black text-emerald-400 mt-0.5">₦{todayProfit.toLocaleString()}</p>
            </div>
            <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ArrowUp className="w-4 h-4 stroke-[3]" />
            </div>
          </div>
        </div>
      </div>

      {/* Voice Sell — inline ambient bar */}
      {(managerSettings?.voiceFeatures !== false) && (
        <VoiceSell
          products={store.products}
          autoStart={managerSettings?.autoVoiceListen === true}
          ambientActive={voiceActive}
          setAmbientActive={setVoiceActive}
          onListeningChange={setVoiceListening}
          onAddItems={items => {
            items.forEach(item => addToCart(item.productId, item.quantity));
          }}
          onCheckout={() => openCheckout()}
        />
      )}

      {/* Search and Filters */}
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-10 pr-20 py-3 rounded-xl bg-surface-1 border border-border/40 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all duration-300"
          />
          {/* Barcode scanner action inside search bar */}
          <button
            onClick={() => setScanning(true)}
            className="absolute right-10 top-3 text-slate-400 hover:text-primary active:scale-90 transition-transform"
            title="Scan barcode"
            aria-label="Scan barcode"
          >
            <QrCode className="w-5 h-5" />
          </button>
          
          {/* Sliders filter action inside search bar */}
          <button
            onClick={() => {
              setFilterLowStock(prev => !prev);
              showToast(filterLowStock ? "Showing all products" : "Filtering low stock products");
            }}
            className={`absolute right-3.5 top-3.5 active:scale-90 transition-transform ${
              filterLowStock ? 'text-primary' : 'text-slate-400 hover:text-foreground'
            }`}
            title="Filter low stock"
            aria-label="Filter low stock"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
      {/* Log Lost Sale quick link */}
      <div className="flex justify-between items-center text-left">
        <p className="text-xs text-muted-foreground">Tap ⚡ to sell, + to add to cart</p>
        <button
          onClick={() => {
            setLostSaleName('');
            setLostSaleQty('1');
            setShowLostSaleModal(true);
          }}
          className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-[10px] text-muted-foreground hover:text-foreground font-display font-bold transition-colors flex items-center gap-1 shrink-0"
        >
          📝 Log Lost Sale
        </button>
      </div>

      {search && visibleProducts.length === 0 && (
        <div className="rounded-2xl p-6 bg-destructive/5 border border-destructive/20 text-center space-y-3">
          <p className="text-sm text-slate-300 font-display font-medium">No products found matching "{search}"</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Did a customer ask for an out-of-stock or unstocked item? Log it as a lost sale so Flow can analyze demand patterns.
          </p>
          <button
            onClick={() => {
              setLostSaleName(search);
              setLostSaleQty('1');
              setShowLostSaleModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-destructive text-white text-xs font-display font-bold hover:bg-destructive/90 active:scale-95 transition-transform shadow-md"
          >
            📝 Record Lost Sale for "{search}"
          </button>
        </div>
      )}

      {voiceActive && cart.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-display font-bold text-primary uppercase tracking-wider">🎙️ Voice Added Items</span>
              <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">{cartCount} items</span>
            </div>
            <button onClick={() => setCart([])} className="text-[10px] text-destructive/80 hover:text-destructive font-display font-semibold">
              Clear list
            </button>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto no-scrollbar">
            {cart.map((item, i) => (
              <div key={item.productId} className="flex items-center justify-between text-xs py-1 px-1.5 rounded-lg bg-card border border-border/30">
                <div className="flex-1 min-w-0 pr-2">
                  <p className="font-display font-semibold truncate">{item.productName}</p>
                  <p className="text-[10px] text-muted-foreground">₦{item.unitPrice.toLocaleString()} × {item.quantity}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold text-primary">
                    ₦{(item.unitPrice * item.quantity).toLocaleString()}
                  </span>
                  <button
                    onClick={() => changeCartQty(i, -item.quantity)}
                    className="w-6 h-6 rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive flex items-center justify-center text-sm font-bold active:scale-90 transition-transform ml-1"
                    title="Remove item"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
          {categories.map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-display font-semibold border transition-colors ${
                category === c ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-muted-foreground border-border/20'
              }`}>{c}</button>
          ))}
        </div>
      )}

      {visibleProducts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
          {store.products.length === 0 ? 'Add products in the Inventory tab to start selling.' : 'No products match.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full">
          {visibleProducts.map(p => {
            const avail = getAvailableQty(p.id);
            const isTop = topSellerIds.has(p.id);
            const isFast = fastSellingIds.has(p.id);
            const isLow = p.quantity <= 3;
            const inCart = cart.find(c => c.productId === p.id)?.quantity ?? 0;
            return (
              <div key={p.id} className="relative rounded-2xl bg-card border border-border/40 p-3.5 flex flex-col justify-between min-h-[185px]">
                {isTop && (
                  <span className="absolute top-3 right-3 text-[9px] px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary font-display font-bold">
                    ★ TOP
                  </span>
                )}
                <div>
                  <p className="text-sm font-display font-bold text-foreground line-clamp-1 pr-12">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{avail} left</p>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {isFast && <span className="text-[9px] text-primary bg-primary/5 px-1.5 py-0.5 rounded-md border border-primary/20">🔥 Fast</span>}
                    {isLow && (
                      <span className="text-[10px] text-rose-400 flex items-center gap-1 font-display font-bold mt-0.5">
                        ⚠️ Low stock
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                  <span className="text-primary font-display font-black text-sm block">
                    ₦{p.sellingPrice.toLocaleString()}
                  </span>
                  
                  {/* Buttons Row */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleInstantSell(p.id)}
                      disabled={p.quantity < 1}
                      className="flex-1 h-9 rounded-xl bg-[hsl(var(--quick-sell-bg))] text-[hsl(var(--quick-sell-foreground))] text-xs font-display font-black hover:bg-[hsl(var(--quick-sell-hover))] disabled:opacity-40 active:scale-95 transition-transform flex items-center justify-center gap-1 shadow-sm transition-colors duration-200"
                      aria-label="Instant sell"
                    >
                      ⚡ Sell
                    </button>
                    <button
                      onClick={() => handleQuickAdd(p.id)}
                      disabled={avail < 1}
                      className="w-9 h-9 rounded-full bg-yellow-500 text-slate-950 font-black text-lg hover:bg-yellow-400 disabled:opacity-40 active:scale-95 transition-transform flex items-center justify-center shadow-sm relative shrink-0"
                      aria-label="Add to cart"
                    >
                      <Plus className="w-4 h-4 stroke-[3]" />
                      {inCart > 0 && (
                        <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                          {inCart}
                        </span>
                      )}
                    </button>
                  </div>
                  
                  {/* Custom qty Button */}
                  <button
                    onClick={() => { setCustomQtyFor(p.id); setCustomQty('1'); }}
                    className="w-full h-8 rounded-xl bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors text-[10px] font-display font-semibold"
                  >
                    Custom qty
                  </button>
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
            <div className="sticky top-0 bg-card border-b border-border p-3 flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base">Checkout</h3>
                <p className="text-[10px] text-muted-foreground">{cartCount} item{cartCount !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setCheckoutOpen(false)} className="text-destructive text-lg">×</button>
            </div>

            <div className="p-3 space-y-3">
              {/* Order summary */}
              <div className="rounded-lg bg-surface-2/60 p-2.5 space-y-1.5">
                <p className="text-[10px] font-display font-bold text-muted-foreground uppercase">Order Summary</p>
                {cart.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{item.productName}</p>
                      <p className="text-[9px] text-muted-foreground">₦{item.unitPrice.toLocaleString()} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeCartQty(i, -1)} className="w-5 h-5 rounded bg-card border border-border flex items-center justify-center text-xs font-bold">−</button>
                      <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                      <button onClick={() => changeCartQty(i, 1)} className="w-5 h-5 rounded bg-card border border-border flex items-center justify-center text-xs font-bold">+</button>
                      <button onClick={() => changeCartQty(i, -item.quantity)} className="w-5 h-5 rounded bg-destructive/10 hover:bg-destructive/20 text-destructive flex items-center justify-center font-bold text-xs ml-0.5 active:scale-90 transition-transform" title="Remove item">×</button>
                    </div>
                    <span className="w-16 text-right text-primary font-display font-bold text-xs">₦{(item.unitPrice * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>₦{cartSubtotal.toLocaleString()}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Discount</span>
                  <input type="number" value={discount} placeholder="0" onChange={e => { setDiscount(e.target.value); setDiscountManuallyEdited(true); }}
                    className="w-20 p-1 rounded bg-surface-2 border border-border text-right text-xs text-foreground" />
                </div>

                {/* Smart Discounts Recommendations */}
                {cartSmartDiscounts.length > 0 && (
                  <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20 my-1 space-y-1 text-left">
                    <p className="text-[9px] font-display font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-1">
                      ✨ Flow Smart Discount Promo
                    </p>
                    {cartSmartDiscounts.map(sd => (
                      <button
                        key={sd.productId}
                        type="button"
                        onClick={() => {
                          setDiscount(String(sd.discountAmount));
                          setDiscountManuallyEdited(true);
                          showToast(`Applied ₦${sd.discountAmount} discount for ${sd.productName}`);
                        }}
                        className="w-full flex items-center justify-between p-1 bg-surface-2 hover:border-yellow-500/50 border border-border rounded text-[9px] font-semibold transition-colors text-foreground"
                      >
                        <span>Apply {sd.suggestedPct}% off slow-moving <span className="font-bold">{sd.productName}</span></span>
                        <span className="text-success font-bold">-₦{sd.discountAmount}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex justify-between text-[10px]"><span className="text-muted-foreground">Profit</span><span className="text-success">₦{cartProfit.toLocaleString()}</span></div>
                <div className="flex justify-between font-display font-bold pt-1 border-t border-border text-sm">
                  <span>Total</span><span className="text-primary">₦{total.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-display font-bold text-muted-foreground uppercase">Payment</p>
                <div className="flex items-center justify-between rounded-lg border border-primary/30 p-2 bg-surface-2/40">
                  <span className="text-xs font-display font-semibold text-muted-foreground">Customer Paid</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">₦</span>
                    <input type="number" value={paidAmount} onChange={e => onPaidChange(e.target.value)}
                      className="w-24 bg-card border border-border rounded px-1.5 py-0.5 text-right text-sm font-display font-bold focus:outline-none focus:border-primary" />
                    <button onClick={() => onPaidChange(String(total))} className="text-[10px] text-primary px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20 font-semibold">Full</button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[1000, 2000, 5000, 10000].map(v => (
                    <button key={v} onClick={() => onPaidChange(String(paidNum + v))}
                      className="py-1 rounded-lg border border-primary/20 text-primary text-[10px] font-display font-semibold">+{v / 1000}k</button>
                  ))}
                </div>
                <div className="flex justify-between text-xs pt-0.5">
                  <span className="text-muted-foreground">Balance</span>
                  <span className={`font-display font-bold ${balanceTone}`}>₦{balance.toLocaleString()}</span>
                </div>
              </div>

              {/* Method */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-display font-bold text-muted-foreground uppercase">Payment Method</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {([['transfer', 'Transfer'], ['pos', 'Card'], ['cash', 'Cash'], ['mixed', 'Mixed']] as const).map(([m, label]) => (
                    <button key={m} onClick={() => setMethod(m)}
                      className={`py-1.5 rounded-lg border text-center text-xs font-display font-semibold transition-all ${
                        method === m ? 'border-success bg-success/10 text-success-foreground' : 'border-border bg-surface-2 text-muted-foreground'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Save as */}
              {balance > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-display font-bold text-muted-foreground uppercase">Save as</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => setSaveAs('paid')}
                      className={`py-1.5 px-3 rounded-lg border text-center text-xs font-display font-semibold transition-all ${
                        saveAs === 'paid' ? 'border-success bg-success/10 text-success-foreground' : 'border-border bg-surface-2 text-muted-foreground'
                      }`}>
                      Paid in Full
                    </button>
                    <button onClick={() => setSaveAs('pending')}
                      className={`py-1.5 px-3 rounded-lg border text-center text-xs font-display font-semibold transition-all ${
                        saveAs === 'pending' ? 'border-warning bg-warning/10 text-warning-foreground' : 'border-border bg-surface-2 text-muted-foreground'
                      }`}>
                      Pending Payment
                    </button>
                  </div>
                </div>
              )}

              {/* Customer */}
              {(saveAs === 'pending' || customerOpen) && (
                <div className="space-y-1.5 rounded-lg border border-border p-2 bg-surface-2/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-display font-bold text-muted-foreground uppercase">👤 Customer {saveAs === 'pending' ? '(required)' : '(optional)'}</span>
                    {saveAs !== 'pending' && (
                      <button onClick={() => setCustomerOpen(false)} className="text-destructive text-[10px] font-semibold hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input placeholder="Name" value={customerName} onChange={e => setCustomerName(e.target.value)}
                      className="p-1.5 rounded bg-card border border-border text-xs w-full" />
                    <input placeholder="Phone" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                      className="p-1.5 rounded bg-card border border-border text-xs w-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                      className="p-1.5 rounded bg-card border border-border text-xs w-full text-muted-foreground" />
                    <input placeholder="Notes" value={customerNote} onChange={e => setCustomerNote(e.target.value)}
                      className="p-1.5 rounded bg-card border border-border text-xs w-full" />
                  </div>
                </div>
              )}
              {saveAs !== 'pending' && !customerOpen && (
                <button onClick={() => setCustomerOpen(true)} className="w-full py-1.5 px-3 rounded-lg bg-surface-2 border border-border text-left text-[11px] flex items-center justify-between text-muted-foreground hover:bg-surface-2/80 transition-colors">
                  <span>👤 Add Customer Details (Optional)</span>
                  <span>+</span>
                </button>
              )}

              <button onClick={handleConfirm}
                className="w-full py-2.5 rounded-xl bg-success text-white font-display font-bold text-sm active:scale-[0.98]">
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


      {showLostSaleModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setShowLostSaleModal(false)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 space-y-3 text-left animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-1">
              <h3 className="font-display font-bold text-base">Record Lost Sale</h3>
              <button onClick={() => setShowLostSaleModal(false)} className="text-xl text-muted-foreground hover:text-foreground">×</button>
            </div>
            <p className="text-xs text-muted-foreground">
              Log sales lost due to lack of stock so that Flow can recommend replenishment.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-bold">Product Name</label>
                <input
                  type="text"
                  value={lostSaleName}
                  onChange={e => setLostSaleName(e.target.value)}
                  placeholder="e.g. Peak Milk"
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase font-bold">Quantity Requested</label>
                <input
                  type="number"
                  min="1"
                  value={lostSaleQty}
                  onChange={e => setLostSaleQty(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <button
                onClick={handleRecordLostSale}
                className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 text-sm"
              >
                Log Lost Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {lastSales && <SaleReceipt store={store} sale={lastSales} onClose={() => setLastSales(null)} onUpdateStore={onUpdate} />}
    </div>
  );
}
