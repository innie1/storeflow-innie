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

  // A two-way switch rather than two cards of explanation. Workers record
  // from their home screen and never see the shop's totals.
  const option = (active: boolean) => `h-8 px-3 rounded-lg text-xs font-display font-bold transition-colors ${
    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
  }`;

  return (
    <section className="p-3 rounded-2xl bg-card border border-border space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-1.5">
          <Receipt className="w-4 h-4 text-muted-foreground" /> Staff expenses
        </h3>
        <div role="group" aria-label="Staff expenses" className="flex p-0.5 rounded-xl bg-surface-2 border border-border">
          <button type="button" aria-pressed={rule.needsApproval} className={option(rule.needsApproval)} onClick={() => save({ staffExpenseApproval: 'approval' })}>
            Need my approval
          </button>
          <button type="button" aria-pressed={!rule.needsApproval} aria-label="Record straight away" className={option(!rule.needsApproval)} onClick={() => save({ staffExpenseApproval: 'immediate' })}>
            Straight in
          </button>
        </div>
      </div>
      {rule.needsApproval && (
        <label className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground shrink-0">No approval up to ₦</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={limit}
            onChange={e => setLimit(e.target.value)}
            onBlur={saveLimit}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            placeholder="0 = every expense waits"
            className="min-w-0 flex-1 h-9 px-3 rounded-xl bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
          />
        </label>
      )}
    </section>
  );
}
