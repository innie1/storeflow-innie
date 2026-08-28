import { useState } from 'react';
import { StoreData, Product } from '@/types/store';
import { generateId, saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { Plus, Trash2, Mic } from 'lucide-react';

const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// Parses something like "Indomie two hundred" or "Garri 500" into a name + optional price.
// Trailing number word/digits (with optional "naira") is treated as the price.
function parseVoiceProduct(transcript: string): { name: string; price?: string } {
  const words = transcript.trim().replace(/naira/gi, '').trim().split(/\s+/);
  const last = words[words.length - 1];
  const digits = last?.replace(/[^0-9]/g, '');
  if (digits && /^[0-9]+$/.test(digits) && digits.length >= 2) {
    return { name: words.slice(0, -1).join(' ').trim(), price: digits };
  }
  return { name: transcript.trim() };
}

interface SimpleOnboardingProps {
  store: StoreData;
  setStore: (store: StoreData) => void;
  onComplete: () => void;
}

interface DraftProduct {
  name: string;
  sellingPrice: string;
}

const emptyDraft = (): DraftProduct => ({ name: '', sellingPrice: '' });

// One screen: Top 5 Products Setup. Shop type is no longer asked here —
// it's already set at account creation and adjustable anytime in Settings,
// so re-asking it here was the same question three times in two minutes.
export default function SimpleOnboarding({ store, setStore, onComplete }: SimpleOnboardingProps) {
  const [drafts, setDrafts] = useState<DraftProduct[]>([emptyDraft()]);
  const [listening, setListening] = useState(false);

  const startVoiceAdd = () => {
    if (!SR) {
      showToast('Voice input is not supported on this device', 'error');
      return;
    }
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      if (!transcript.trim()) return;
      const { name, price } = parseVoiceProduct(transcript);
      if (!name) return;
      setDrafts(d => {
        const emptyIdx = d.findIndex(row => !row.name.trim());
        if (emptyIdx >= 0) {
          const next = [...d];
          next[emptyIdx] = { name, sellingPrice: price || next[emptyIdx].sellingPrice };
          return next;
        }
        if (d.length >= 5) return d;
        return [...d, { name, sellingPrice: price || '' }];
      });
    };
    r.start();
  };

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
      category: store.storeType || 'others',
      addedAt: now,
    }));

    const updated: StoreData = {
      ...store,
      products: [...store.products, ...newProducts],
      simpleOnboarding: { complete: true, topProductIds: newProducts.map(p => p.id) },
    };
    saveStore(updated);
    setStore(updated);
    if (newProducts.length > 0) {
      showToast(`${newProducts.length} product${newProducts.length === 1 ? '' : 's'} added`, 'success');
    }
    onComplete();
  };

  return (
    <div className="flex flex-col px-5 pt-10 pb-10 max-w-sm mx-auto">
      <h1 className="font-display font-black text-2xl text-foreground text-center">What 5 products do you sell most?</h1>
      <p className="text-sm text-muted-foreground text-center mt-1.5">Add a few now — you can add more anytime. Prices only, no stress about stock yet.</p>

      <button
        onClick={startVoiceAdd}
        className={`mt-5 self-center flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-display font-semibold ${
          listening ? 'bg-primary text-primary-foreground border-primary animate-pulse' : 'bg-surface-2/40 border-border text-foreground'
        }`}
      >
        <Mic className="w-4 h-4" /> {listening ? 'Listening…' : 'Say a product'}
      </button>

      <div className="flex flex-col gap-2.5 mt-4">
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
