import { useMemo, useState } from 'react';
import { Mic, Send, Shirt, X } from 'lucide-react';
import type { Product, StoreData, TabId } from '@/types/store';
import { generateId, recordSale, saveStore } from '@/lib/store-data';
import { isBusinessTabAllowed, resolveBusinessType } from '@/lib/business-runtime';
import { requestLaundryWorkspace } from '@/lib/laundry-workspace';
import { createFlowShirtCode, parseFlowShirtText, type FlowShirtDraftItem } from '@/lib/flow-shirt';
import { showToast } from '@/components/Toast';
import SimpleVoiceSell from '@/components/simple/SimpleVoiceSell';
import { markSaleQueuedIfOffline } from '@/components/simple/OfflineQueueBanner';

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  onNavigate?: (tab: TabId) => void;
  currentUser?: any;
}

export default function FlowShirtFab({ store, onUpdate, onNavigate, currentUser }: Props) {
  const businessType = resolveBusinessType(store);
  const canSellProducts = businessType !== 'games' && isBusinessTabAllowed(store, 'sales');
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<FlowShirtDraftItem[]>([]);

  const activeProducts = useMemo(
    () => (store.products || []).filter(product => !product.discontinued && !product.isService),
    [store.products],
  );

  if (businessType !== 'laundry' && !canSellProducts) return null;

  const commit = (updated: StoreData) => {
    saveStore(updated);
    onUpdate(updated);
    markSaleQueuedIfOffline(store.accessCode);
  };

  const handleFab = () => {
    if (businessType === 'laundry') {
      // Laundry must keep the mandatory customer + phone intake instead of
      // leaking the retail sale form into the laundry workspace.
      requestLaundryWorkspace('record');
      onNavigate?.('laundry-records' as TabId);
      return;
    }
    setOpen(true);
  };

  const prepareTypedSale = () => {
    const parsed = parseFlowShirtText(text, activeProducts);
    if (!parsed.length) return showToast('Type at least one item to sell', 'error');
    setDraft(parsed);
  };

  const updateDraftPrice = (index: number, value: string) => {
    const price = Number(value.replace(/[^0-9.]/g, ''));
    setDraft(current => current.map((item, itemIndex) => itemIndex === index
      ? { ...item, priceGuess: Number.isFinite(price) ? price : null }
      : item));
  };

  const saveTypedSale = () => {
    if (!draft.length) return;
    let updated = store;
    const transactionCode = createFlowShirtCode();
    const blocked: string[] = [];

    for (const item of draft) {
      let productId = item.product?.id;
      if (productId) {
        const currentProduct = updated.products.find(product => product.id === productId);
        if (!currentProduct) continue;
        if (currentProduct.quantity < item.quantity && !updated.managerSettings?.backorderSellingEnabled) {
          blocked.push(currentProduct.name);
          continue;
        }
      } else {
        const price = Math.max(0, Number(item.priceGuess) || 0);
        if (!(price > 0)) {
          showToast(`Enter a selling price for ${item.name}`, 'error');
          return;
        }
        const newProduct: Product = {
          id: generateId(),
          name: item.name,
          costPrice: 0,
          sellingPrice: price,
          quantity: item.quantity,
          initialQuantity: item.quantity,
          category: store.storeType || 'others',
          addedAt: new Date().toISOString(),
          source: 'voice_sale',
          needsStockSetup: true,
        };
        updated = { ...updated, products: [...updated.products, newProduct] };
        productId = newProduct.id;
      }

      if (productId) {
        updated = recordSale(updated, productId, item.quantity, currentUser?.name, currentUser?.role, transactionCode);
      }
    }

    commit(updated);
    setText('');
    setDraft([]);
    setOpen(false);
    showToast(blocked.length
      ? `Saved ${transactionCode}. Skipped low stock: ${blocked.join(', ')}`
      : `Sale saved — ${transactionCode}`,
      blocked.length ? 'info' : 'success');
  };

  const confirmVoiceSale = (productId: string, quantity: number) => {
    const product = store.products.find(item => item.id === productId);
    if (!product) return;
    if (product.quantity < quantity && !store.managerSettings?.backorderSellingEnabled) {
      return showToast('Not enough stock for that quantity', 'error');
    }
    commit(recordSale(store, productId, quantity, currentUser?.name, currentUser?.role, createFlowShirtCode()));
  };

  const confirmVoiceMultiSale = (items: { productId: string; quantity: number }[]) => {
    let updated = store;
    const transactionCode = createFlowShirtCode();
    let soldAny = false;
    for (const item of items) {
      const product = updated.products.find(candidate => candidate.id === item.productId);
      if (!product) continue;
      if (product.quantity < item.quantity && !updated.managerSettings?.backorderSellingEnabled) continue;
      updated = recordSale(updated, item.productId, item.quantity, currentUser?.name, currentUser?.role, transactionCode);
      soldAny = true;
    }
    if (soldAny) commit(updated);
  };

  const createVoiceProduct = (name: string, sellingPrice: number, costPrice: number, quantity: number): Product => {
    const newProduct: Product = {
      id: generateId(),
      name,
      costPrice: costPrice || 0,
      sellingPrice,
      quantity: Math.max(0, quantity || 0),
      initialQuantity: Math.max(0, quantity || 0),
      category: store.storeType || 'others',
      addedAt: new Date().toISOString(),
      source: 'voice_sale',
      needsStockSetup: !costPrice,
    };
    const updated = { ...store, products: [...store.products, newProduct] } as StoreData;
    commit(updated);
    return newProduct;
  };

  const saveVoiceAlias = (productId: string, alias: string) => {
    const clean = alias.trim().toLowerCase();
    if (!clean) return;
    const updated = {
      ...store,
      products: store.products.map(product => product.id !== productId ? product : {
        ...product,
        voiceAliases: (product.voiceAliases || []).some(existing => existing.toLowerCase() === clean)
          ? product.voiceAliases
          : [...(product.voiceAliases || []), clean],
      }),
    } as StoreData;
    commit(updated);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleFab}
        className="fixed right-4 bottom-24 md:bottom-8 z-[55] w-14 h-14 rounded-full bg-primary text-primary-foreground border border-primary/60 shadow-xl flex items-center justify-center active:scale-95 transition-transform"
        title={businessType === 'laundry' ? 'Record Laundry' : 'Flow Shirt smart sell'}
        aria-label={businessType === 'laundry' ? 'Record Laundry' : 'Open Flow Shirt smart sell'}
      >
        <Shirt className="w-6 h-6" strokeWidth={2.4} />
      </button>

      {open && canSellProducts && (
        <div className="fixed inset-0 z-[90] bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-background border border-border p-5 space-y-4" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center"><Shirt className="w-5 h-5" /></div>
                <div>
                  <p className="font-display font-black text-lg">Flow Shirt</p>
                  <p className="text-xs text-muted-foreground">Type it or say it. Review the list before saving.</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="w-9 h-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>

            <section className="rounded-2xl border border-border bg-card p-3.5 space-y-3">
              <label className="text-[10px] uppercase font-black text-muted-foreground">Type a sale</label>
              <textarea
                value={text}
                onChange={event => { setText(event.target.value); setDraft([]); }}
                rows={3}
                placeholder="Example: 2 Indomie, 1 Garri, Milo for 800"
                className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-primary"
              />
              <button onClick={prepareTypedSale} className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black flex items-center justify-center gap-2">
                <Send className="w-4 h-4" /> Build Sale List
              </button>
            </section>

            {draft.length > 0 && (
              <section className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border"><p className="text-xs font-display font-black">Review list</p></div>
                <div className="divide-y divide-border/70">
                  {draft.map((item, index) => (
                    <div key={`${item.raw}-${index}`} className="p-3.5 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">{item.name} × {item.quantity}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{item.product ? (item.confidence === 'exact' ? 'Matched inventory' : 'Likely inventory match') : 'New item — price required'}</p>
                      </div>
                      {item.product ? (
                        <span className="text-xs font-black">₦{Number(item.product.sellingPrice || 0).toLocaleString()}</span>
                      ) : (
                        <div className="w-28 h-9 rounded-lg border border-border bg-surface-2 px-2 flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground">₦</span>
                          <input value={item.priceGuess ?? ''} onChange={event => updateDraftPrice(index, event.target.value)} inputMode="decimal" placeholder="Price" className="w-full min-w-0 bg-transparent outline-none text-xs font-black text-right" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="p-3">
                  <button onClick={saveTypedSale} className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm">Save Sale</button>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-border bg-card p-3.5 space-y-2">
              <div className="flex items-center gap-2"><Mic className="w-4 h-4 text-primary" /><p className="text-xs font-display font-black">Voice mode</p></div>
              <SimpleVoiceSell
                products={activeProducts}
                onConfirmSale={confirmVoiceSale}
                onConfirmMultiSale={confirmVoiceMultiSale}
                onCreateProduct={createVoiceProduct}
                onSaveAlias={saveVoiceAlias}
              />
            </section>
          </div>
        </div>
      )}
    </>
  );
}
