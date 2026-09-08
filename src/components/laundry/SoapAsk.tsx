import { useState } from 'react';
import { Droplets, X } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { markAsked, recordSoapAnswer, shouldAskAboutSoap, soapHistorySentence } from '@/lib/soap-log';
import { showToast } from '@/components/Toast';

/**
 * A quiet question about soap, on the screen where money is already the point.
 *
 * A card, not a pop-up. It sits in the page rather than over it, so a merchant
 * who came here to do something else can do it and never look down. It can be
 * closed without answering, and closing counts as an answer: it will not ask
 * again for a fortnight.
 */

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

export default function SoapAsk({ store, onUpdate }: Props) {
  const code = String(store.accessCode || '');
  const [dismissed, setDismissed] = useState(false);
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [brand, setBrand] = useState('');

  if (dismissed || !shouldAskAboutSoap(store)) return null;

  const close = () => {
    markAsked(code);
    setDismissed(true);
  };

  const save = () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      showToast('Enter what you spent', 'error');
      return;
    }
    onUpdate(recordSoapAnswer(store, { amount: value, quantity: Number(quantity) || undefined, brand }));
    setDismissed(true);
    showToast('Noted — that goes into what a piece costs you', 'success');
  };

  const history = soapHistorySentence(code);

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] uppercase font-black text-primary flex items-center gap-1.5">
          <Droplets className="w-3 h-3" /> Quick question
        </p>
        {/* Closing is a real answer. A prompt that must be cleared is a prompt
            that gets cleared without being read. */}
        <button onClick={close} aria-label="Not now" className="w-7 h-7 rounded-lg bg-surface-2 flex items-center justify-center shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="font-display font-black text-sm mt-1.5">Have you bought soap lately?</p>
      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
        Most shops pay for detergent out of the drawer and never record it, which
        makes every profit figure look better than it is. Tell me roughly and I
        will work the rest out.
      </p>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 h-11 px-3 rounded-xl bg-card border border-border">
          <span className="text-sm text-muted-foreground">₦</span>
          <input
            value={amount}
            onChange={event => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            placeholder="What you spent"
            className="w-full bg-transparent text-sm outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            value={quantity}
            onChange={event => setQuantity(event.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="How many"
            className="h-11 px-3 rounded-xl bg-card border border-border text-sm outline-none"
          />
          {/* Recorded, not judged. Which soap is better is not knowable from
              one shop's month, and pretending otherwise would be inventing it. */}
          <input
            value={brand}
            onChange={event => setBrand(event.target.value)}
            placeholder="Which soap"
            className="h-11 px-3 rounded-xl bg-card border border-border text-sm outline-none"
          />
        </div>
      </div>

      {history && <p className="text-[10px] text-muted-foreground mt-2">{history}</p>}

      <div className="flex gap-2 mt-3">
        <button onClick={save} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black">
          Save it
        </button>
        <button onClick={close} className="h-10 px-4 rounded-xl bg-surface-2 border border-border text-xs font-display font-bold text-muted-foreground">
          Not now
        </button>
      </div>
    </div>
  );
}
