import { useMemo, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { updateProduct } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { pricingAdvice, simulatePrice, type PriceAdvice } from '@/lib/pricing-advisor';

/**
 * What each thing earns, and what to do about it.
 *
 * Nothing here changes a price on its own. Every suggestion shows the
 * arithmetic behind it, can be tried without saving, and is only applied by
 * the owner pressing accept - because a price is the shop's decision and an
 * app that quietly moved one would deserve never to be trusted again.
 */

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

const IGNORED_KEY = 'storeflow_pricing_ignored_';

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

const TONE: Record<string, string> = {
  losing: 'border-destructive/40 bg-destructive/5',
  thin: 'border-amber-500/40 bg-amber-500/5',
  quiet: 'border-border bg-surface-2',
  healthy: 'border-success/30 bg-success/5',
  learning: 'border-border bg-surface-2',
};

const LABEL: Record<string, string> = {
  losing: 'Losing money',
  thin: 'Thin margin',
  quiet: 'Nobody buying',
  healthy: 'Healthy',
  learning: 'Still learning',
};

export default function PricingAdvisor({ store, onUpdate }: Props) {
  const state = useMemo(() => pricingAdvice(store), [store]);
  const code = String(store.accessCode || '');

  const [ignored, setIgnored] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(IGNORED_KEY + code) || '[]'); } catch { return []; }
  });
  const [simulating, setSimulating] = useState<string | null>(null);
  const [trialPrice, setTrialPrice] = useState('');

  const ignore = (item: PriceAdvice) => {
    const next = [...ignored, item.productId];
    setIgnored(next);
    try { localStorage.setItem(IGNORED_KEY + code, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const accept = (item: PriceAdvice, price: number) => {
    const product = (store.products || []).find(p => String(p.id) === item.productId);
    if (!product) return;
    // Only ever from here, and only ever on a press.
    onUpdate(updateProduct(store, String(product.id), { sellingPrice: price }));
    setSimulating(null);
    showToast(`${item.name} is now ${money(price)}`, 'success');
  };

  if (state.learning) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-left">
        <p className="text-[10px] uppercase font-black text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Pricing
        </p>
        {/*
          Said plainly rather than shown as an empty advisor. Reasoning from a
          handful of jobs is how somebody talks themselves into a price change
          that costs them customers.
        */}
        <p className="font-display font-black text-sm mt-1.5">Still learning your costs</p>
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
          {state.seen} of {state.needed} sales so far. Once there is enough, I can tell you
          which prices are working and which are costing you.
        </p>
        <div className="mt-2.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (state.seen / state.needed) * 100)}%` }} />
        </div>
      </div>
    );
  }

  const shown = state.advice.filter(item => !ignored.includes(item.productId) && item.kind !== 'healthy');
  const healthy = state.advice.filter(item => item.kind === 'healthy').length;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase font-black text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Pricing
        </p>
        {healthy > 0 && (
          <p className="text-[10px] text-success font-bold">{healthy} priced well</p>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-success/30 bg-success/5 p-4 text-left">
          <p className="font-display font-black text-sm">Nothing needs changing</p>
          <p className="text-[11px] text-muted-foreground mt-1">Every price you charge is covering what it costs.</p>
        </div>
      ) : shown.map(item => {
        const open = simulating === item.productId;
        const trial = open && trialPrice ? simulatePrice(item, Number(trialPrice)) : null;

        return (
          <div key={item.productId} className={`rounded-2xl border p-3.5 text-left ${TONE[item.kind]}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display font-black text-sm truncate">{item.name}</p>
                <p className="text-[10px] uppercase font-black text-muted-foreground mt-0.5">{LABEL[item.kind]}</p>
              </div>
              <p className="font-display font-black text-sm shrink-0">{money(item.price)}</p>
            </div>

            {/* The arithmetic, always. A recommendation without its reasoning
                is just an instruction. */}
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{item.why}</p>

            {item.suggested !== null && (
              <p className="text-[11px] mt-1.5">
                <span className="text-muted-foreground">Suggested </span>
                <b className="text-foreground">{money(item.suggested)}</b>
                {item.monthlyImpact !== null && (
                  <span className="text-muted-foreground">
                    {' '}· about {money(item.monthlyImpact)} more this month at the {item.volume} you have done
                  </span>
                )}
              </p>
            )}

            {open && (
              <div className="mt-2.5 rounded-xl border border-border bg-card p-2.5">
                <label className="text-[10px] uppercase font-black text-muted-foreground">Try a price</label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">₦</span>
                  <input
                    value={trialPrice}
                    onChange={event => setTrialPrice(event.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    autoFocus
                    className="flex-1 h-9 px-2 rounded-lg bg-surface-2 border border-border text-sm outline-none focus:border-primary"
                  />
                </div>
                {trial && trial.margin !== null && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                    {money(trial.margin)} of every {money(Number(trialPrice))} would be yours
                    {trial.marginShare !== null && ` (${Math.round(trial.marginShare * 100)}%)`}
                    {trial.monthlyChange !== null && (
                      <>. At the {item.volume} you have done this month that is {money(trial.monthlyChange)} difference.</>
                    )}
                    {/* Not a forecast. Whether the same number would sell at a
                        different price is exactly what cannot be known here. */}
                    {' '}It cannot say whether you would sell the same number at that price.
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => accept(item, Number(trialPrice))}
                    disabled={!Number(trialPrice)}
                    className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-[11px] font-display font-black disabled:opacity-40"
                  >
                    Use this price
                  </button>
                  <button onClick={() => setSimulating(null)} className="h-9 px-3 rounded-xl bg-surface-2 border border-border text-[11px] font-display font-bold">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!open && (
              <div className="flex gap-2 mt-2.5">
                {item.suggested !== null && (
                  <button
                    onClick={() => accept(item, item.suggested!)}
                    className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-[11px] font-display font-black flex items-center gap-1.5"
                  >
                    <Check className="w-3 h-3" /> Accept
                  </button>
                )}
                <button
                  onClick={() => { setSimulating(item.productId); setTrialPrice(String(item.suggested ?? item.price)); }}
                  className="h-9 px-3 rounded-xl bg-surface-2 border border-border text-[11px] font-display font-bold"
                >
                  Try a price
                </button>
                <button
                  onClick={() => ignore(item)}
                  className="h-9 px-3 rounded-xl bg-surface-2 border border-border text-muted-foreground text-[11px] font-display font-bold flex items-center gap-1.5"
                >
                  <X className="w-3 h-3" /> Ignore
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
