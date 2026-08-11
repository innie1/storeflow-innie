import { useMemo, useState } from 'react';
import { StoreData, Product } from '@/types/store';
import { recordSale, saveStore, generateId, getSalesTargetStatus } from '@/lib/store-data';
import { checkNewMilestone, markMilestoneReached, MilestoneDef } from '@/lib/milestones';
import { showToast } from '@/components/Toast';
import { playSoldSound, playProductAddedSound } from '@/lib/sound-effects';
import SimpleVoiceSell from './SimpleVoiceSell';
import SimpleOnboarding from './SimpleOnboarding';
import BusinessSimpleHome from './BusinessSimpleHome';
import OfflineQueueBanner, { markSaleQueuedIfOffline } from './OfflineQueueBanner';
import CostPricePrompt from './CostPricePrompt';
import QuickSellGrid from './QuickSellGrid';
import SimpleSearch from './SimpleSearch';
import GamesDashboard from '@/components/games/GamesDashboard';
import { History, Search } from 'lucide-react';
import './SimpleModeHomeLayout.css';

interface SimpleModeHomeProps {
  store: StoreData;
  setStore: (store: StoreData) => void;
  currentUser?: any;
  onNavigate: (tab: any) => void;
}

export default function SimpleModeHome({ store, setStore, currentUser, onNavigate }: SimpleModeHomeProps) {
  const businessType = String((store as any).businessType || store.storeType || 'provision');

  // Gaming Centre is a session business, not a product-selling store.
  if (store.category === 'games' || store.storeType === 'games' || businessType === 'games') {
    return (
      <GamesDashboard
        store={store}
        onUpdate={setStore}
        onGoToSettings={() => onNavigate('games-settings')}
      />
    );
  }

  // Service, appointment and metered businesses get their own simple workflow.
  // They should never be pushed through the "What 5 products do you sell?"
  // onboarding screen because that question only makes sense for product stores.
  const nonProductBusiness = ['laundry', 'gas_filling', 'barber', 'salon', 'tailoring', 'repair', 'printing', 'car_wash', 'cyber_cafe', 'photography', 'spa', 'cleaning'].includes(businessType);
  if (nonProductBusiness) {
    return <BusinessSimpleHome store={store} onNavigate={onNavigate} />;
  }

  const today = new Date().toISOString().split('T')[0];
  const todaySales = useMemo(() => store.sales.filter(s => s.date.startsWith(today)), [store.sales, today]);
  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0);
  const todayProfit = todaySales.reduce((s, x) => s + x.profit, 0);
  const todayCount = todaySales.length;
  const target = useMemo(() => getSalesTargetStatus(store), [store]);

  const [showSearch, setShowSearch] = useState(false);
  const [costPricePromptProductId, setCostPricePromptProductId] = useState<string | null>(null);
  const [activeMilestone, setActiveMilestone] = useState<MilestoneDef | null>(null);

  const handleConfirmSale = (productId: string, quantity: number) => {
    const product = store.products.find(p => p.id === productId);
    if (!product) return;
    if (product.quantity < quantity && !store.managerSettings?.backorderSellingEnabled) {
      showToast('Not enough stock for that quantity', 'error');
      return;
    }
    const updated = recordSale(store, productId, quantity, currentUser?.name, currentUser?.role);
    saveStore(updated);
    setStore(updated);
    markSaleQueuedIfOffline(store.accessCode);

    const newMilestone = checkNewMilestone(updated);
    if (newMilestone) setActiveMilestone(newMilestone);

    if (!store.simpleModeSettings?.skipCostPricePrompt && (!product.costPrice || product.costPrice <= 0)) {
      setCostPricePromptProductId(productId);
    }
  };

  const handleConfirmMultiSale = (items: { productId: string; quantity: number }[]) => {
    let updated = store;
    let blockedAny = false;
    const transactionId = generateId();

    items.forEach(({ productId, quantity }) => {
      const product = updated.products.find(p => p.id === productId);
      if (!product) return;
      if (product.quantity < quantity && !updated.managerSettings?.backorderSellingEnabled) {
        blockedAny = true;
        return;
      }
      updated = recordSale(updated, productId, quantity, currentUser?.name, currentUser?.role, transactionId);
    });

    saveStore(updated);
    setStore(updated);
    markSaleQueuedIfOffline(store.accessCode);
    playSoldSound();

    if (blockedAny) {
      showToast('Some items didn\'t have enough stock and were skipped', 'error');
    }

    const newMilestone = checkNewMilestone(updated);
    if (newMilestone) setActiveMilestone(newMilestone);
  };

  const handleCreateProduct = (name: string, sellingPrice: number, costPrice: number, quantity: number): Product => {
    const newProduct: Product = {
      id: generateId(),
      name,
      costPrice: costPrice || 0,
      sellingPrice,
      quantity: Math.max(0, quantity || 0),
      category: store.storeType || 'others',
      addedAt: new Date().toISOString(),
      source: 'voice_sale',
      needsStockSetup: !costPrice,
    };
    const updated: StoreData = { ...store, products: [...store.products, newProduct] };
    saveStore(updated);
    setStore(updated);
    playProductAddedSound();
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
    <div className="relative flex flex-col items-center px-3 pt-0 pb-6 max-w-sm mx-auto">
      <OfflineQueueBanner store={store} setStore={setStore} />

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

        <div className="mt-3 max-w-[220px] mx-auto">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span className="uppercase font-bold tracking-wide">
              {target.period === 'daily' ? "Today's Target" : "This Week's Target"}
              {target.mode === 'auto' ? ' (Auto)' : ''}
            </span>
            <span className="font-bold text-foreground">₦{target.progressAmount.toLocaleString()} / ₦{target.targetAmount.toLocaleString()}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${target.progressPercent >= 100 ? 'bg-success' : 'bg-primary'}`}
              style={{ width: `${target.progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="simple-mode-voice-shell">
        <SimpleVoiceSell
          products={store.products}
          onConfirmSale={handleConfirmSale}
          onConfirmMultiSale={handleConfirmMultiSale}
          onCreateProduct={handleCreateProduct}
          onSaveAlias={handleSaveAlias}
        />
        <button
          onClick={() => setShowSearch(true)}
          className="simple-mode-search-near-toggle bg-surface-2 border border-border flex items-center justify-center hover:bg-surface-3 active:scale-95 transition-all cursor-pointer shadow-sm"
          title="Search products, customers, receipts"
          aria-label="Search products, customers, receipts"
        >
          <Search className="w-4 h-4 text-foreground/80" />
        </button>
      </div>

      <button
        onClick={() => onNavigate('history')}
        className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground font-display font-semibold"
      >
        <History className="w-3.5 h-3.5" /> View Sales History
      </button>

      <QuickSellGrid store={store} onSell={handleConfirmSale} />

      {promptProduct && (
        <CostPricePrompt
          store={store}
          setStore={setStore}
          product={promptProduct}
          onDone={() => setCostPricePromptProductId(null)}
        />
      )}

      {activeMilestone && (
        <MilestoneCelebration
          milestone={activeMilestone}
          onDismiss={() => {
            const updated = markMilestoneReached(store, activeMilestone.id);
            setStore(updated);
            setActiveMilestone(null);
          }}
        />
      )}

      {showSearch && (
        <SimpleSearch
          store={store}
          onNavigate={onNavigate}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}
