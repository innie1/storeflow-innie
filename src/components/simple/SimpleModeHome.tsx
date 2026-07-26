import { useMemo, useState } from 'react';
import { StoreData, Product } from '@/types/store';
import { recordSale, saveStore, generateId } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import SimpleVoiceSell from './SimpleVoiceSell';
import SimpleOnboarding from './SimpleOnboarding';
import OfflineQueueBanner, { markSaleQueuedIfOffline } from './OfflineQueueBanner';
import CostPricePrompt from './CostPricePrompt';
import QuickSellGrid from './QuickSellGrid';
import { History } from 'lucide-react';

interface SimpleModeHomeProps {
  store: StoreData;
  setStore: (store: StoreData) => void;
  currentUser?: any;
  onNavigate: (tab: any) => void;
}

export default function SimpleModeHome({ store, setStore, currentUser, onNavigate }: SimpleModeHomeProps) {
  const today = new Date().toISOString().split('T')[0];
  const todaySales = useMemo(() => store.sales.filter(s => s.date.startsWith(today)), [store.sales, today]);
  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0);
  const todayProfit = todaySales.reduce((s, x) => s + x.profit, 0);
  const todayCount = todaySales.length;

  const [costPricePromptProductId, setCostPricePromptProductId] = useState<string | null>(null);

  const handleConfirmSale = (productId: string, quantity: number) => {
    const product = store.products.find(p => p.id === productId);
    if (!product) return;
    if (product.quantity < quantity) {
      showToast('Not enough stock for that quantity', 'error');
      return;
    }
    const updated = recordSale(store, productId, quantity, currentUser?.name, currentUser?.role);
    saveStore(updated);
    setStore(updated);
    markSaleQueuedIfOffline(store.accessCode);

    // Screen 11 — ask for cost price if this product doesn't have one yet, unless the owner opted out
    if (!store.simpleModeSettings?.skipCostPricePrompt && (!product.costPrice || product.costPrice <= 0)) {
      setCostPricePromptProductId(productId);
    }
  };

  const handleCreateProduct = (name: string, sellingPrice: number, costPrice: number, quantity: number): Product => {
    const newProduct: Product = {
      id: generateId(),
      name,
      costPrice: costPrice || 0,
      sellingPrice,
      quantity: Math.max(0, quantity || 0),
      category: store.simpleOnboarding?.shopType || 'others',
      addedAt: new Date().toISOString(),
    };
    const updated: StoreData = { ...store, products: [...store.products, newProduct] };
    saveStore(updated);
    setStore(updated);
    showToast(`${name} added`, 'success');
    return newProduct;
  };

  const handleSaveAlias = (productId: string, alias: string) => {
    const clean = alias.trim().toLowerCase();
    if (!clean) return;
    const updated: StoreData = {
      ...store,
      products: store.products.map(p => {
        if (p.id !== productId) return p;
        const existing = p.voiceAliases || [];
        if (existing.some(a => a.toLowerCase() === clean)) return p;
        return { ...p, voiceAliases: [...existing, clean] };
      }),
    };
    saveStore(updated);
    setStore(updated);
  };

  // First-time-only setup — Screens 2, 3, 4.
  // Only new stores get a `simpleOnboarding` object at creation time (see createStore()).
  // Existing/legacy stores never had this field set, so they must NOT be routed
  // through onboarding just because the field is missing — that would incorrectly
  // interrupt shops that are already up and running.
  if (store.simpleOnboarding && !store.simpleOnboarding.complete) {
    return (
      <SimpleOnboarding
        store={store}
        setStore={setStore}
        onComplete={() => { /* store already updated inside the onboarding flow */ }}
      />
    );
  }

  const promptProduct = costPricePromptProductId
    ? store.products.find(p => p.id === costPricePromptProductId)
    : null;

  return (
    <div className="flex flex-col items-center px-5 pt-8 pb-10 max-w-sm mx-auto">
      <OfflineQueueBanner store={store} setStore={setStore} />

      {/* Today's total */}
      <div className="w-full text-center mb-10">
        <p className="text-xs text-muted-foreground font-display font-semibold uppercase tracking-wide">Today's Sales</p>
        <h1 className="text-4xl font-display font-black text-foreground mt-1">₦{todayRevenue.toLocaleString()}</h1>
        <div className="flex items-center justify-center gap-4 mt-2">
          <p className="text-xs text-muted-foreground">
            <span className="font-display font-bold text-success">₦{todayProfit.toLocaleString()}</span> profit
          </p>
          <span className="w-1 h-1 rounded-full bg-border" />
          <p className="text-xs text-muted-foreground">
            <span className="font-display font-bold text-foreground">{todayCount}</span> sale{todayCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Big mic — the whole point of Simple Mode */}
      <SimpleVoiceSell
        products={store.products}
        onConfirmSale={handleConfirmSale}
        onCreateProduct={handleCreateProduct}
        onSaveAlias={handleSaveAlias}
      />

      {/* Light secondary action — history only, nothing else competes for attention here */}
      <button
        onClick={() => onNavigate('history')}
        className="mt-10 flex items-center gap-1.5 text-xs text-muted-foreground font-display font-semibold"
      >
        <History className="w-3.5 h-3.5" /> View Sales History
      </button>

      {/* Nine-tile quick-tap grid — onboarding top products first, then best-sellers */}
      <QuickSellGrid store={store} onSell={handleConfirmSale} />

      {promptProduct && (
        <CostPricePrompt
          store={store}
          setStore={setStore}
          product={promptProduct}
          onDone={() => setCostPricePromptProductId(null)}
        />
      )}
    </div>
  );
}
