import { useState } from 'react';
import { Receipt } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { staffExpenseRule } from '@/lib/staff-expenses';
import { showToast } from '@/components/Toast';

/**
 * Whether a worker's expense waits for the owner, and up to what amount it
 * need not. On the Staff page, which only the owner can change.
 */

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

export default function StaffExpenseSettings({ store, onUpdate }: Props) {
  const rule = staffExpenseRule(store);
  const [limit, setLimit] = useState(String(rule.freeLimit || ''));

  const save = (changes: { staffExpenseApproval?: 'approval' | 'immediate'; staffExpenseFreeLimit?: number }) => {
    const next: StoreData = { ...store, managerSettings: { ...(store.managerSettings || {}), ...changes } };
    saveStore(next);
    onUpdate(next);
  };

  const saveLimit = () => {
    const value = Math.max(0, Math.round(Number(limit) || 0));
    if (value === rule.freeLimit) return;
    save({ staffExpenseFreeLimit: value });
    setLimit(value ? String(value) : '');
    showToast(value ? `Expenses up to ₦${value.toLocaleString()} go straight in` : 'Every staff expense waits for you');
  };

  const option = (active: boolean) => `w-full p-3 rounded-xl border text-left transition-colors ${
    active ? 'border-primary bg-primary/5' : 'border-border bg-card'
  }`;

  return (
    <section className="p-4 rounded-2xl bg-card border border-border space-y-3">
      <div className="flex items-center gap-2">
        <Receipt className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-display font-bold text-base text-foreground">Staff expenses</h3>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">
        Workers can record what they spend from their home screen. They never see your totals.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" className={option(rule.needsApproval)} onClick={() => save({ staffExpenseApproval: 'approval' })}>
          <p className="font-display font-bold text-sm">Need my approval</p>
          <p className="text-[11px] text-muted-foreground">It counts once you approve it.</p>
        </button>
        <button type="button" className={option(!rule.needsApproval)} onClick={() => save({ staffExpenseApproval: 'immediate' })}>
          <p className="font-display font-bold text-sm">Record straight away</p>
          <p className="text-[11px] text-muted-foreground">It counts as soon as it is saved.</p>
        </button>
      </div>
      {rule.needsApproval && (
        <label className="block">
          <span className="text-[11px] font-semibold text-muted-foreground">Staff can record without approval up to (₦)</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={limit}
            onChange={e => setLimit(e.target.value)}
            onBlur={saveLimit}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="0 — every expense waits"
            className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
          />
        </label>
      )}
    </section>
  );
}
