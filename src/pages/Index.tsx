import { useState, useCallback, useEffect } from 'react';
import { StoreData, TabId, Product } from '@/types/store';
import { loadStore, findProductByBarcode, addProduct, recordSale } from '@/lib/store-data';
import StoreAccess from '@/components/StoreAccess';
import Dashboard from '@/components/Dashboard';
import Inventory from '@/components/Inventory';
import Sales from '@/components/Sales';
import SalesHistory from '@/components/SalesHistory';
import ReceiptScanner from '@/components/ReceiptScanner';
import BarcodeScanner from '@/components/BarcodeScanner';
import Settings, { saveSession, clearSession, getActiveSession } from '@/components/Settings';
import Expenses from '@/components/Expenses';
import ROITracker from '@/components/ROITracker';
import { ToastContainer, showToast } from '@/components/Toast';
import InstallPrompt from '@/components/InstallPrompt';

const MAIN_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'sales', label: 'Sales', icon: '💰' },
  { id: 'expenses', label: 'Expenses', icon: '🧾' },
];

const MORE_ITEMS: { id: TabId; label: string; icon: string }[] = [
  { id: 'history', label: 'History', icon: '📋' },
  { id: 'roi', label: 'ROI Tracker', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

const isMoreTab = (tab: TabId) => MORE_ITEMS.some(m => m.id === tab);

export default function Index() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [scanCart, setScanCart] = useState<{ product: Product; qty: number }[]>([]);
  const [newProductPrompt, setNewProductPrompt] = useState<{ barcode: string; name: string; costPrice: string; sellingPrice: string; quantity: string } | null>(null);

  useEffect(() => {
    const code = getActiveSession();
    if (code) {
      const restored = loadStore(code);
      if (restored) setStore(restored);
      else clearSession();
    }
  }, []);

  const handleStoreLoaded = useCallback((s: StoreData) => {
    setStore(s);
    saveSession(s.accessCode);
  }, []);

  const handleNavigate = useCallback((targetTab: TabId, lowStock?: boolean) => {
    setTab(targetTab);
    if (lowStock) setFilterLowStock(true);
  }, []);

  const handleLock = () => {
    clearSession();
    setStore(null);
  };

  const handleBarcodeDetected = useCallback((code: string) => {
    if (!store) return;
    const existing = findProductByBarcode(store, code);
    if (existing) {
      // Sell mode: add to scan cart
      if (existing.quantity <= 0) {
        showToast(`${existing.name} is out of stock`, 'error');
        return;
      }
      setScanCart(prev => {
        const idx = prev.findIndex(c => c.product.id === existing.id);
        if (idx >= 0) {
          const used = prev[idx].qty;
          if (used + 1 > existing.quantity) {
            showToast('No more stock available', 'error');
            return prev;
          }
          const next = [...prev];
          next[idx] = { ...next[idx], qty: used + 1 };
          showToast(`${existing.name} × ${next[idx].qty}`);
          return next;
        }
        showToast(`✓ ${existing.name} added to cart`);
        return [...prev, { product: existing, qty: 1 }];
      });
    } else {
      // Save mode
      setShowBarcodeScanner(false);
      setNewProductPrompt({ barcode: code, name: '', costPrice: '', sellingPrice: '', quantity: '1' });
    }
  }, [store]);

  const handleCheckoutScanCart = () => {
    if (!store || scanCart.length === 0) return;
    let updated = store;
    for (const item of scanCart) {
      updated = recordSale(updated, item.product.id, item.qty);
    }
    setStore(updated);
    const total = scanCart.reduce((s, c) => s + c.product.sellingPrice * c.qty, 0);
    showToast(`Sold ${scanCart.length} item${scanCart.length === 1 ? '' : 's'} — ₦${total.toLocaleString()}`);
    setScanCart([]);
    setShowBarcodeScanner(false);
  };

  const handleSaveNewProduct = () => {
    if (!store || !newProductPrompt) return;
    const { barcode, name, costPrice, sellingPrice, quantity } = newProductPrompt;
    if (!name.trim() || !sellingPrice || !quantity) {
      showToast('Fill name, selling price and quantity', 'error');
      return;
    }
    const updated = addProduct(store, {
      name: name.trim(),
      costPrice: Number(costPrice) || 0,
      sellingPrice: Number(sellingPrice),
      quantity: Number(quantity),
      category: 'Scanned',
      barcode,
    });
    setStore(updated);
    showToast(`✓ Saved ${name}`);
    setNewProductPrompt(null);
  };

  if (!store) {
    return (
      <>
        <StoreAccess onStoreLoaded={handleStoreLoaded} />
        <ToastContainer />
        <InstallPrompt />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-lg text-primary">StoreFlow</h1>
          <p className="text-xs text-muted-foreground">{store.storeName}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowScanner(true)}
            className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors font-display font-semibold"
          >
            📷 Scan
          </button>
          <button onClick={handleLock} className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
            🔒 Lock
          </button>
          <button
            onClick={() => { setTab('settings'); setShowMoreMenu(false); }}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${
              tab === 'settings' ? 'bg-primary text-primary-foreground' : 'bg-surface-2 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
            }`}
          >
            👤
          </button>
        </div>
      </header>

      <main className="flex-1 p-4 pb-20 container max-w-3xl">
        {tab === 'dashboard' && <Dashboard store={store} onNavigate={handleNavigate} />}
        {tab === 'inventory' && (
          <Inventory
            store={store}
            onUpdate={setStore}
            filterLowStock={filterLowStock}
            onClearFilter={() => setFilterLowStock(false)}
          />
        )}
        {tab === 'sales' && <Sales store={store} onUpdate={setStore} />}
        {tab === 'expenses' && <Expenses store={store} onUpdate={setStore} />}
        {tab === 'history' && <SalesHistory store={store} onUpdate={setStore} />}
        {tab === 'roi' && <ROITracker store={store} onUpdate={setStore} />}
        {tab === 'settings' && <Settings store={store} onUpdate={setStore} onLock={handleLock} />}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/90 backdrop-blur-md border-t border-border">
        <div className="flex justify-around max-w-3xl mx-auto">
          {MAIN_TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setFilterLowStock(t.id !== 'inventory' ? false : filterLowStock); setShowMoreMenu(false); }}
              className={`flex flex-col items-center py-2 px-3 text-xs transition-colors ${
                tab === t.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="text-lg mb-0.5">{t.icon}</span>
              <span className="font-display font-semibold">{t.label}</span>
            </button>
          ))}
          {/* More button */}
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className={`flex flex-col items-center py-2 px-3 text-xs transition-colors ${
                isMoreTab(tab) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="text-lg mb-0.5">•••</span>
              <span className="font-display font-semibold">More</span>
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute bottom-full right-0 mb-2 w-44 bg-card shadow-card border border-border rounded-xl overflow-hidden z-50 animate-fade-in">
                  {MORE_ITEMS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setTab(m.id); setShowMoreMenu(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-display font-semibold transition-colors ${
                        tab === m.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-surface-2'
                      }`}
                    >
                      <span>{m.icon}</span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {showScanner && (
        <ReceiptScanner
          store={store}
          onUpdate={setStore}
          onClose={() => setShowScanner(false)}
        />
      )}

      <ToastContainer />
      <InstallPrompt />
    </div>
  );
}
