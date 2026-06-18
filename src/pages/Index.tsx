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
import Manager from '@/components/Manager';
import GamesDashboard from '@/components/games/GamesDashboard';
import GamesSettings from '@/components/games/GamesSettings';
import GamesHistory from '@/components/games/GamesHistory';
import GamesAnalytics from '@/components/games/GamesAnalytics';
import { ToastContainer, showToast } from '@/components/Toast';
import InstallPrompt from '@/components/InstallPrompt';

const RETAIL_MAIN_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'sales', label: 'Sales', icon: '💰' },
  { id: 'manager', label: 'Flow', icon: '✨' },
];


const RETAIL_MORE_ITEMS: { id: TabId; label: string; icon: string }[] = [
  { id: 'expenses', label: 'Expenses', icon: '🧾' },
  { id: 'pending', label: 'Pending Payments', icon: '💳' },
  { id: 'history', label: 'History', icon: '📋' },
  { id: 'roi', label: 'ROI Tracker', icon: '📈' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

const GAMES_MAIN_TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'games-dashboard', label: 'Dashboard', icon: '🎮' },
  { id: 'games-history', label: 'History', icon: '📋' },
  { id: 'games-analytics', label: 'Analytics', icon: '📈' },
  { id: 'games-settings', label: 'Games', icon: '🕹️' },
];

const GAMES_MORE_ITEMS: { id: TabId; label: string; icon: string }[] = [
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function Index() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [scanCart, setScanCart] = useState<{ product: Product; qty: number }[]>([]);
  const [newProductPrompt, setNewProductPrompt] = useState<{ barcode: string; name: string; costPrice: string; sellingPrice: string; quantity: string } | null>(null);

  const isGames = store?.category === 'games';
  const mainTabs = isGames ? GAMES_MAIN_TABS : RETAIL_MAIN_TABS;
  const moreItems = isGames ? GAMES_MORE_ITEMS : RETAIL_MORE_ITEMS;

  // When switching to a games store, ensure the active tab is valid for it
  useEffect(() => {
    if (!store) return;
    const all = [...mainTabs, ...moreItems].map(t => t.id);
    if (!all.includes(tab)) setTab(mainTabs[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.accessCode, store?.category]);

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
          <h1 className="font-display font-bold text-lg"><span className="text-foreground">Store</span><span className="text-primary">Flow</span></h1>
          <p className="text-xs text-muted-foreground">{tab === 'settings' ? 'Settings' : store.storeName}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLockConfirm(true)}
            className="px-3 py-1.5 rounded-full bg-surface-2 border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors flex items-center gap-1.5"
          >
            <span>🔒</span> Lock Store
          </button>
          <button
            onClick={() => { setTab('settings'); setShowMoreMenu(false); }}
            className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center transition-all border-2 ${
              tab === 'settings' ? 'border-primary' : 'border-border hover:border-primary/40'
            }`}
            aria-label="Profile"
          >
            {store.profile?.photo ? (
              <img src={store.profile.photo} alt={store.storeName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-surface-2 flex items-center justify-center">
                <span className="text-sm">👤</span>
              </div>
            )}
          </button>
        </div>
      </header>

      {showLockConfirm && (
        <div className="fixed inset-0 z-[80] bg-background/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setShowLockConfirm(false)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-4" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-2">
              <div className="text-3xl">🔒</div>
              <h3 className="font-display font-bold text-lg">Lock your store?</h3>
              <p className="text-sm text-muted-foreground">You'll need to re-enter your access code to get back in.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowLockConfirm(false)} className="flex-1 p-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm">Cancel</button>
              <button onClick={() => { setShowLockConfirm(false); handleLock(); }} className="flex-1 p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm">Lock Store</button>
            </div>
          </div>
        </div>
      )}

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
        {tab === 'manager' && <Manager store={store} onUpdate={setStore} />}
        {tab === 'history' && <SalesHistory store={store} onUpdate={setStore} />}
        {tab === 'roi' && <ROITracker store={store} onUpdate={setStore} />}
        {tab === 'settings' && <Settings store={store} onUpdate={setStore} onLock={handleLock} />}
        {tab === 'games-dashboard' && (
          <GamesDashboard store={store} onUpdate={setStore} onGoToSettings={() => setTab('games-settings')} />
        )}
        {tab === 'games-history' && <GamesHistory store={store} onUpdate={setStore} />}
        {tab === 'games-analytics' && <GamesAnalytics store={store} />}
        {tab === 'games-settings' && <GamesSettings store={store} onUpdate={setStore} />}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/90 backdrop-blur-md border-t border-border">
        <div className="flex justify-around max-w-3xl mx-auto">
          {mainTabs.map(t => (
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
                moreItems.some(m => m.id === tab) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="text-lg mb-0.5">•••</span>
              <span className="font-display font-semibold">More</span>
            </button>
            {showMoreMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                <div className="absolute bottom-full right-0 mb-2 w-44 bg-card shadow-card border border-border rounded-xl overflow-hidden z-50 animate-fade-in">
                  {moreItems.map(m => (
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

      {showBarcodeScanner && (
        <>
          <BarcodeScanner
            title={scanCart.length > 0 ? `Scan more · ${scanCart.length} item${scanCart.length === 1 ? '' : 's'} in cart` : 'Scan to Save or Sell'}
            subtitle="Existing barcodes are added to cart · new ones open a save form"
            onClose={() => setShowBarcodeScanner(false)}
            onDetected={handleBarcodeDetected}
          />
          {scanCart.length > 0 && (
            <div className="fixed bottom-0 left-0 right-0 z-[60] bg-card border-t border-success/40 p-3 space-y-2 max-h-[40vh] overflow-y-auto shadow-card">
              <div className="flex items-center justify-between">
                <span className="font-display font-bold text-sm text-success">
                  🛒 Scan Cart · ₦{scanCart.reduce((s, c) => s + c.product.sellingPrice * c.qty, 0).toLocaleString()}
                </span>
                <button onClick={() => setScanCart([])} className="text-xs text-destructive hover:underline">Clear</button>
              </div>
              <div className="space-y-1">
                {scanCart.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-surface-2">
                    <span className="truncate">{c.product.name} × {c.qty}</span>
                    <span className="text-primary font-semibold">₦{(c.product.sellingPrice * c.qty).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={handleCheckoutScanCart}
                className="w-full p-2.5 rounded-lg bg-success text-white font-display font-bold text-sm hover:opacity-90"
              >
                ✓ Complete Sale
              </button>
            </div>
          )}
        </>
      )}

      {newProductPrompt && (
        <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setNewProductPrompt(null)}>
          <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-3" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="font-display font-bold text-lg">New Product</h3>
              <p className="text-xs text-muted-foreground">Barcode <span className="font-mono text-primary">{newProductPrompt.barcode}</span> not found. Save it to your inventory.</p>
            </div>
            <input
              autoFocus
              placeholder="Product name"
              value={newProductPrompt.name}
              onChange={e => setNewProductPrompt({ ...newProductPrompt, name: e.target.value })}
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="Cost price (₦)"
                value={newProductPrompt.costPrice}
                onChange={e => setNewProductPrompt({ ...newProductPrompt, costPrice: e.target.value })}
                className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
              />
              <input
                type="number"
                placeholder="Selling price (₦)"
                value={newProductPrompt.sellingPrice}
                onChange={e => setNewProductPrompt({ ...newProductPrompt, sellingPrice: e.target.value })}
                className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <input
              type="number"
              placeholder="Quantity"
              value={newProductPrompt.quantity}
              onChange={e => setNewProductPrompt({ ...newProductPrompt, quantity: e.target.value })}
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button onClick={() => setNewProductPrompt(null)} className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold">Cancel</button>
              <button onClick={handleSaveNewProduct} className="flex-1 p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold">Save Product</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
      <InstallPrompt />
    </div>
  );
}
