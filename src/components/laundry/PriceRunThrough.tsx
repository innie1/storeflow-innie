import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Product, StoreData } from '@/types/store';
import { getLaundryGarmentPrice, getLaundryPricingConfig, setLaundryGarmentPrice, renameLaundryGarmentType } from '@/lib/laundry-pricing';
import { showToast } from '@/components/Toast';

/**
 * Set every price in one run.
 *
 * Pricing twenty-eight items meant finding each one in a list, opening it,
 * typing, saving, and finding your place again - so most shops priced three
 * and left the rest at whatever the service charged. This deals them one at a
 * time: name, price, save, next, with the count of what is left in view so
 * nobody is working blind.
 *
 * Leaving part-way is expected, not a failure. The ones already set are saved
 * as they go, and the run picks up where it stopped.
 */

interface Props {
  store: StoreData;
  service: Product;
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
}

export default function PriceRunThrough({ store, service, onUpdate, onClose }: Props) {
  const garments = useMemo(() => getLaundryPricingConfig(store).garmentTypes, [store]);
  const [index, setIndex] = useState(0);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [done, setDone] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const priceRef = useRef<HTMLInputElement | null>(null);

  const current = garments[index];
  const remaining = Math.max(0, garments.length - index - 1);

  // Load the item as it comes up, and put the caret where the work is.
  useEffect(() => {
    if (!current) return;
    setName(current);
    setPrice(String(getLaundryGarmentPrice(store, service, current) || ''));
    setLeaving(false);
    const timer = setTimeout(() => priceRef.current?.focus(), 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current]);

  if (!current) {
    return (
      <div className="fixed inset-0 z-[75] bg-background/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
        <div className="w-full sm:max-w-sm rounded-2xl bg-card border border-border p-5 text-center" onClick={event => event.stopPropagation()}>
          <p className="font-display font-black text-base">That is every item priced</p>
          <p className="text-xs text-muted-foreground mt-1">{done} {done === 1 ? 'price' : 'prices'} set in this run.</p>
          <button onClick={onClose} className="mt-4 w-full h-11 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm">Done</button>
        </div>
      </div>
    );
  }

  const advance = () => {
    setLeaving(true);
    // Let the card leave before the next one arrives, so it reads as a deck
    // being dealt rather than fields blinking in place.
    setTimeout(() => setIndex(value => value + 1), 170);
  };

  const save = () => {
    const cleanName = name.trim() || current;
    const value = Math.max(0, Number(price) || 0);

    let next = store;
    if (cleanName !== current) next = renameLaundryGarmentType(next, current, cleanName);
    next = setLaundryGarmentPrice(next, String(service.id), cleanName, value);
    onUpdate(next);

    setDone(count => count + 1);
    advance();
  };

  return (
    <div className="fixed inset-0 z-[75] bg-background/90 backdrop-blur-sm flex items-end sm:items-center justify-center" role="dialog" aria-label="Set prices">
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border">
          <div className="min-w-0">
            <p className="text-[10px] uppercase font-black text-muted-foreground">{service.name}</p>
            {/* The count, always. Nobody should be working without knowing
                how much of it is left. */}
            <p className="font-display font-black text-sm mt-0.5">
              {done > 0 ? `${done} set · ` : ''}{remaining} to go
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="h-1 bg-surface-2">
          <div
            className="h-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.round(((index) / garments.length) * 100)}%` }}
          />
        </div>

        <div className={`p-4 transition-all duration-150 ${leaving ? 'opacity-0 -translate-x-6' : 'opacity-100 translate-x-0'}`}>
          <label className="text-[10px] uppercase font-black text-muted-foreground">Item</label>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            className="mt-1 w-full h-12 px-3.5 rounded-xl bg-surface-2 border border-border text-sm outline-none focus:border-primary"
          />

          <label className="text-[10px] uppercase font-black text-muted-foreground mt-3 block">What you charge</label>
          <div className="mt-1 flex items-center gap-2 px-3.5 rounded-xl bg-surface-2 border border-border">
            <span className="text-sm text-muted-foreground">₦</span>
            <input
              ref={priceRef}
              value={price}
              onChange={event => setPrice(event.target.value.replace(/[^0-9.]/g, ''))}
              onKeyDown={event => { if (event.key === 'Enter') save(); }}
              inputMode="decimal"
              className="w-full h-12 bg-transparent text-lg font-display font-black outline-none"
            />
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={save}
              className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" /> Save and next
            </button>
            {/* Skipping is not a failure. A shop that does not wash duvets
                should not have to price them to get through the list. */}
            <button
              onClick={advance}
              className="h-12 px-4 rounded-xl bg-surface-2 border border-border font-display font-bold text-sm text-muted-foreground"
            >
              Skip
            </button>
          </div>

          <button
            onClick={() => { showToast(`${done} ${done === 1 ? 'price' : 'prices'} saved`, 'success'); onClose(); }}
            className="w-full mt-2 h-10 rounded-xl text-xs font-display font-bold text-muted-foreground"
          >
            Stop here — keep what I have done
          </button>
        </div>
      </div>
    </div>
  );
}
