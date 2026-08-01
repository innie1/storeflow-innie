import { useMemo, useState } from 'react';
import { StoreData, Product } from '@/types/store';
import { recordSale, saveStore, generateId, getSalesTargetStatus } from '@/lib/store-data';
import { checkNewMilestone, markMilestoneReached, MilestoneDef } from '@/lib/milestones';
import MilestoneCelebration from '@/components/MilestoneCelebration';
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
  const target = useMemo(() => getSalesTargetStatus(store), [store]);

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

    // Screen 11 — ask for cost price if this product doesn't have one yet, unless the owner opted out
    if (!store.simpleModeSettings?.skipCostPricePrompt && (!product.costPrice || product.costPrice <= 0)) {
      setCostPricePromptProductId(productId);
    }
  };

  // Records several items from one voice sale ("Indomitable, Garri and
  // onions") in one go. Uses a running accumulator instead of calling
  // handleConfirmSale in a loop — looping calls to recordSale against the
  // same stale `store` closure would silently drop all but the last item.
  const handleConfirmMultiSale = (items: { productId: string; quantity: number }[]) => {
    let updated = store;
    let blockedAny = false;

    // One shared transactionId links every item into a single order — same
    // pattern recordCheckout uses for the main POS cart. Without this, each
    // voice-sold item lands as its own disconnected sale row: no combined
    // receipt in Sales History, and it gets silently skipped by the
    // transaction-basket analytics in manager-intel.ts (which requires a
    // transactionId to group items together).
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
      // No cost price yet means the owner just called out a sale, not a full
      // product setup — flag it so it shows a Pending Inventory badge until
      // they come back and fill in cost price / supplier / etc.
      needsStockSetup: !costPrice,
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

        {/* Sales target — auto (daily/weekly, based on how often this store sells) unless the owner set one manually */}
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

      {/* Big mic — the whole point of Simple Mode */}
      <SimpleVoiceSell
        products={store.products}
        onConfirmSale={handleConfirmSale}
        onConfirmMultiSale={handleConfirmMultiSale}
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
    </div>
  );
}
