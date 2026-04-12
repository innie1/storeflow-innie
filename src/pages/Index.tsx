import { useState, useCallback, useEffect } from 'react';
import { StoreData, TabId } from '@/types/store';
import { loadStore } from '@/lib/store-data';
import StoreAccess from '@/components/StoreAccess';
import Dashboard from '@/components/Dashboard';
import Inventory from '@/components/Inventory';
import Sales from '@/components/Sales';
import SalesHistory from '@/components/SalesHistory';
import ReceiptScanner from '@/components/ReceiptScanner';
import Settings, { saveSession, clearSession, getActiveSession } from '@/components/Settings';
import { ToastContainer } from '@/components/Toast';
import InstallPrompt from '@/components/InstallPrompt';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
  { id: 'sales', label: 'Sales', icon: '💰' },
  { id: 'history', label: 'History', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '👤' },
];

export default function Index() {
  const [store, setStore] = useState<StoreData | null>(null);
  const [tab, setTab] = useState<TabId>('dashboard');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Auto-restore session on mount
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
        {tab === 'history' && <SalesHistory store={store} onUpdate={setStore} />}
        {tab === 'settings' && <Settings store={store} onLock={handleLock} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/90 backdrop-blur-md border-t border-border">
        <div className="flex justify-around max-w-3xl mx-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id !== 'inventory') setFilterLowStock(false); }}
              className={`flex flex-col items-center py-2 px-3 text-xs transition-colors ${
                tab === t.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="text-lg mb-0.5">{t.icon}</span>
              <span className="font-display font-semibold">{t.label}</span>
            </button>
          ))}
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
