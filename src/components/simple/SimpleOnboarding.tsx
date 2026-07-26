import { useState } from 'react';
import { StoreData, Product } from '@/types/store';
import { generateId, saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { Check, ChevronLeft, Store, Shirt, UtensilsCrossed, Cpu, MoreHorizontal, Plus, Trash2 } from 'lucide-react';

interface SimpleOnboardingProps {
  store: StoreData;
  setStore: (store: StoreData) => void;
  onComplete: () => void;
}

type ShopType = 'provision' | 'clothing' | 'food' | 'electronics' | 'others';

const SHOP_TYPES: { key: ShopType; label: string; icon: any }[] = [
  { key: 'provision', label: 'Provision', icon: Store },
  { key: 'clothing', label: 'Clothing', icon: Shirt },
  { key: 'food', label: 'Food', icon: UtensilsCrossed },
  { key: 'electronics', label: 'Electronics', icon: Cpu },
  { key: 'others', label: 'Others', icon: MoreHorizontal },
];

interface DraftProduct {
  name: string;
  sellingPrice: string;
}

const emptyDraft = (): DraftProduct => ({ name: '', sellingPrice: '' });

function ProgressBar({ step }: { step: 1 | 2 | 3 }) {
  const pct = step === 1 ? 33 : step === 2 ? 66 : 100;
  return (
    <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden mb-8">
      <div
        className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function SimpleOnboarding({ store, setStore, onComplete }: SimpleOnboardingProps) {
  // step 1 = Shop Type, step 2 = Confirm Shop Type, step 3 = Top 5 Products Setup
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [shopType, setShopType] = useState<ShopType | null>(null);
  const [drafts, setDrafts] = useState<DraftProduct[]>([emptyDraft()]);

  // ── Screen 2: Shop Type ──
  if (step === 1) {
    return (
      <div className="flex flex-col px-5 pt-6 pb-10 max-w-sm mx-auto">
        <ProgressBar step={step} />
        <h1 className="font-display font-black text-2xl text-foreground text-center">What kind of shop is this?</h1>
        <p className="text-sm text-muted-foreground text-center mt-1.5">This helps us set things up right for you.</p>
        <div className="grid grid-cols-2 gap-3 mt-8">
          {SHOP_TYPES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setShopType(key); setStep(2); }}
              className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border border-border bg-surface-2/40 active:scale-95 transition-transform"
            >
              <Icon className="w-7 h-7 text-primary" />
              <span className="font-display font-semibold text-sm text-foreground">{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Screen 3: Confirm Shop Type ──
  if (step === 2 && shopType) {
    const chosen = SHOP_TYPES.find(s => s.key === shopType)!;
    const Icon = chosen.icon;
    return (
      <div className="flex flex-col items-center px-5 pt-6 pb-10 max-w-sm mx-auto text-center">
        <ProgressBar step={step} />
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-primary" />
        </div>
        <h1 className="font-display font-black text-2xl text-foreground">A {chosen.label.toLowerCase()} shop, right?</h1>
        <p className="text-sm text-muted-foreground mt-1.5">You can change this later in Settings.</p>
        <div className="flex gap-3 w-full mt-8">
          <button
            onClick={() => setStep(1)}
            className="flex-1 py-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm flex items-center justify-center gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" /> Change
          </button>
          <button
            onClick={() => setStep(3)}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" /> Yes, Continue
          </button>
        </div>
      </div>
    );
  }

  // ── Screen 4: Top 5 Products Setup ──
  const updateDraft = (idx: number, patch: Partial<DraftProduct>) => {
    setDrafts(d => d.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };
  const addRow = () => {
    if (drafts.length >= 5) return;
    setDrafts(d => [...d, emptyDraft()]);
  };
  const removeRow = (idx: number) => setDrafts(d => d.filter((_, i) => i !== idx));

  const finish = () => {
    const valid = drafts.filter(d => d.name.trim() && Number(d.sellingPrice) > 0);
    const now = new Date().toISOString();
    const newProducts: Product[] = valid.map(d => ({
      id: generateId(),
      name: d.name.trim(),
      costPrice: 0, // Unknown at this point — Cost Price Prompt fills this in later, skippable
      sellingPrice: Number(d.sellingPrice),
      quantity: 0,
      category: shopType || 'others',
      addedAt: now,
    }));

    const updated: StoreData = {
      ...store,
      products: [...store.products, ...newProducts],
      simpleOnboarding: { complete: true, shopType: shopType || 'others' },
    };
    saveStore(updated);
    setStore(updated);
    if (newProducts.length > 0) {
      showToast(`${newProducts.length} product${newProducts.length === 1 ? '' : 's'} added`, 'success');
    }
    onComplete();
  };

  return (
    <div className="flex flex-col px-5 pt-6 pb-10 max-w-sm mx-auto">
      <ProgressBar step={step} />
      <h1 className="font-display font-black text-2xl text-foreground text-center">What 5 products do you sell most?</h1>
      <p className="text-sm text-muted-foreground text-center mt-1.5">Add a few now — you can add more anytime. Prices only, no stress about stock yet.</p>

      <div className="flex flex-col gap-2.5 mt-6">
        {drafts.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              value={row.name}
              onChange={e => updateDraft(idx, { name: e.target.value })}
              placeholder="Product name"
              className="flex-1 px-3.5 py-3 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <input
              value={row.sellingPrice}
              onChange={e => updateDraft(idx, { sellingPrice: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="₦ price"
              inputMode="numeric"
              className="w-24 px-3.5 py-3 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            {drafts.length > 1 && (
              <button onClick={() => removeRow(idx)} className="w-9 h-9 flex items-center justify-center text-muted-foreground">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {drafts.length < 5 && (
        <button
          onClick={addRow}
          className="mt-3 flex items-center justify-center gap-1.5 text-xs font-display font-semibold text-primary py-2"
        >
          <Plus className="w-3.5 h-3.5" /> Add another
        </button>
      )}

      <div className="flex gap-3 mt-6">
        <button
          onClick={finish}
          className="flex-1 py-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm"
        >
          Skip for now
        </button>
        <button
          onClick={finish}
          className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm"
        >
          Done
        </button>
      </div>
    </div>
  );
}
