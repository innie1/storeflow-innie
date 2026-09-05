import { useState } from 'react';
import { Product, StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

interface CostPricePromptProps {
  store: StoreData;
  setStore: (store: StoreData) => void;
  product: Product;
  onDone: () => void;
}

export default function CostPricePrompt({ store, setStore, product, onDone }: CostPricePromptProps) {
  // Overlay: hold the page behind it still while this is open.
  useBodyScrollLock();
  const [value, setValue] = useState('');

  const save = (skip: boolean, dontAskAgain?: boolean) => {
    let updated: StoreData = store;

    if (!skip && Number(value) > 0) {
      updated = {
        ...store,
        products: store.products.map(p => (p.id === product.id ? { ...p, costPrice: Number(value) } : p)),
      };
    }

    if (dontAskAgain) {
      updated = {
        ...updated,
        simpleModeSettings: { ...(updated.simpleModeSettings || {}), skipCostPricePrompt: true },
      };
    }

    if (updated !== store) {
      saveStore(updated);
      setStore(updated);
    }
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 animate-fade-in">
      <div className="w-full max-w-sm bg-background rounded-t-2xl sm:rounded-2xl p-5 pb-6">
        <p className="font-display font-bold text-base text-foreground">What did {product.name} cost you?</p>
        <p className="text-xs text-muted-foreground mt-1">Helps track your real profit. Totally optional.</p>

        <input
          value={value}
          onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="₦ cost price"
          inputMode="numeric"
          autoFocus
          className="w-full mt-4 px-3.5 py-3 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />

        <div className="flex gap-3 mt-4">
          <button
            onClick={() => save(true)}
            className="flex-1 py-3 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm"
          >
            Skip
          </button>
          <button
            onClick={() => save(false)}
            disabled={!(Number(value) > 0)}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm disabled:opacity-40"
          >
            Save
          </button>
        </div>

        <button
          onClick={() => save(true, true)}
          className="w-full text-center text-xs text-muted-foreground font-display font-medium mt-4"
        >
          Don't ask me this again
        </button>
      </div>
    </div>
  );
}
