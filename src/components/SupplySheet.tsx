import { useMemo, useState } from 'react';
import { Droplets, Plus, X } from 'lucide-react';
import type { StoreData, SupplyItem } from '@/types/store';
import {
  consumablesSpend,
  markSupplyPurchased,
  reportSupplyLow,
  supplyId,
  supplyList,
  getSupplies,
} from '@/lib/consumables';

/**
 * Soap, starch, diesel — what the shop uses up doing the work.
 *
 * Two jobs, deliberately kept apart. Anyone can say "we have run out of
 * bleach", because the person who reaches for the empty bottle is usually not
 * the person who pays for it, and making them fetch the owner is how a shop
 * ends up washing without bleach. Recording what it cost is the owner's, and
 * is the only half that touches money.
 */

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
  /** False for staff without permission to see costs. */
  canSeeMoney: boolean;
  actorName?: string;
  showToast: (message: string, tone?: 'success' | 'info' | 'error') => void;
}

function sinceLabel(iso?: string): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'since yesterday';
  return `${days} days`;
}

export default function SupplySheet({ store, onUpdate, onClose, canSeeMoney, actorName, showToast }: Props) {
  const supplies = useMemo(() => supplyList(store), [store]);
  const [buying, setBuying] = useState<SupplyItem | null>(null);
  const [amount, setAmount] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('');

  const spend = useMemo(() => consumablesSpend(store, 30), [store]);
  const lowCount = supplies.filter(item => item.lowSince).length;

  const toggleLow = (item: SupplyItem) => {
    const nowLow = !item.lowSince;
    onUpdate(reportSupplyLow(store, item, nowLow, actorName));
    showToast(nowLow ? `${item.name} reported low` : `${item.name} cleared`, 'success');
  };

  const confirmPurchase = () => {
    if (!buying) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      showToast('Enter what it cost', 'error');
      return;
    }
    onUpdate(markSupplyPurchased(store, { supply: buying, amount: value }));
    showToast(`₦${value.toLocaleString()} recorded for ${buying.name}`, 'success');
    setBuying(null);
    setAmount('');
  };

  const addSupply = () => {
    const name = newName.trim();
    if (!name) return;
    const next: SupplyItem = { id: supplyId(), name, unit: newUnit.trim() || undefined };
    // supplyList seeds a starting list that was never saved; saving the shop's
    // own item has to keep those, or adding one silently drops the rest.
    const base = getSupplies(store).length ? getSupplies(store) : supplies;
    onUpdate({ ...store, supplies: [...base, next] });
    setNewName('');
    setNewUnit('');
    setAdding(false);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-card border border-border p-5 space-y-4"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-black text-lg flex items-center gap-2">
              <Droplets className="w-4 h-4 text-primary" /> Supplies
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lowCount > 0
                ? `${lowCount} ${lowCount === 1 ? 'item needs' : 'items need'} buying.`
                : 'Tap anything you have run out of.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {canSeeMoney && spend > 0 && (
          <div className="rounded-xl border border-border bg-surface-2 p-3">
            <p className="text-[10px] uppercase font-black text-muted-foreground">Spent on supplies · 30 days</p>
            <p className="font-display font-black text-xl mt-1">₦{spend.toLocaleString()}</p>
          </div>
        )}

        <div className="space-y-2">
          {supplies.map(item => (
            <div
              key={item.id}
              className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
                item.lowSince ? 'border-amber-500/40 bg-amber-500/5' : 'border-border bg-surface-2'
              }`}
            >
              <div className="min-w-0">
                <p className="font-display font-bold text-sm truncate">
                  {item.name}
                  {item.unit ? <span className="text-muted-foreground font-normal"> · {item.unit}</span> : null}
                </p>
                {item.lowSince && (
                  <p className="text-[10px] text-amber-500 font-bold mt-0.5">
                    Run out {sinceLabel(item.lowSince)}
                    {item.lowReportedBy ? ` · ${item.lowReportedBy}` : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleLow(item)}
                  className={`h-9 px-3 rounded-xl text-xs font-display font-black border ${
                    item.lowSince
                      ? 'border-border bg-surface-3 text-muted-foreground'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                  }`}
                >
                  {item.lowSince ? 'Got it' : 'Run out'}
                </button>
                {canSeeMoney && (
                  <button
                    type="button"
                    onClick={() => { setBuying(item); setAmount(''); }}
                    className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black"
                  >
                    Bought
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {adding ? (
          <div className="rounded-xl border border-border bg-surface-2 p-3 space-y-2">
            <input
              value={newName}
              onChange={event => setNewName(event.target.value)}
              placeholder="What is it called?"
              className="w-full h-10 px-3 rounded-xl bg-card border border-border text-sm"
            />
            <input
              value={newUnit}
              onChange={event => setNewUnit(event.target.value)}
              placeholder="Measured in — bag, litre, keg (optional)"
              className="w-full h-10 px-3 rounded-xl bg-card border border-border text-sm"
            />
            <div className="flex gap-2">
              <button onClick={addSupply} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-display font-black text-xs">Add</button>
              <button onClick={() => setAdding(false)} className="flex-1 h-10 rounded-xl bg-surface-3 border border-border font-display font-bold text-xs">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="w-full h-10 rounded-xl border border-dashed border-border text-muted-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Something else you buy
          </button>
        )}

        {buying && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4" onClick={() => setBuying(null)}>
            <div className="w-full sm:max-w-xs rounded-2xl bg-card border border-border p-5 space-y-3" onClick={event => event.stopPropagation()}>
              <h4 className="font-display font-black text-base">{buying.name}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                What did it cost? This goes into your expenses, so it comes off profit the way rent does.
              </p>
              <input
                value={amount}
                onChange={event => setAmount(event.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal"
                autoFocus
                placeholder="0"
                className="w-full h-12 px-3 rounded-xl bg-surface-2 border border-border text-lg font-display font-black"
              />
              <div className="flex gap-2">
                <button onClick={confirmPurchase} className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-display font-black text-xs">Record it</button>
                <button onClick={() => setBuying(null)} className="flex-1 h-10 rounded-xl bg-surface-2 border border-border font-display font-bold text-xs">Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
