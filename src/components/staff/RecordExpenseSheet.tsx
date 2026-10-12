import { useState } from 'react';
import { CheckCircle2, Clock, Droplets, Lightbulb, Receipt, Truck, type LucideIcon } from 'lucide-react';
import type { ExpenseCategory, ExpensePaidFrom, StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { mustWait, PAID_FROM_LABEL, STAFF_EXPENSE_CATEGORIES, submitStaffExpense, type SubmitResult } from '@/lib/staff-expenses';
import ScrollLock from '@/components/ScrollLock';

/**
 * The worker's expense form.
 *
 * Deliberately not the Expenses page: that page opens on the shop's totals.
 * What the worker sees afterwards is the one expense they entered and whether
 * it is in or waiting - never a balance, a total or a profit.
 */

interface Props {
  store: StoreData;
  worker: { id: string; name: string; role: string };
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
}

const ICON: Partial<Record<ExpenseCategory, LucideIcon>> = {
  Consumables: Droplets,
  Transport: Truck,
  Utilities: Lightbulb,
  Other: Receipt,
};

const HINT: Partial<Record<ExpenseCategory, string>> = {
  Consumables: 'e.g. Hypo, detergent, nylon',
  Transport: 'e.g. Customer delivery',
  Utilities: 'e.g. Electricity token, fuel',
  Other: 'e.g. Repair of iron',
};

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function RecordExpenseSheet({ store, worker, onUpdate, onClose }: Props) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Consumables');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(today);
  const [paidFrom, setPaidFrom] = useState<ExpensePaidFrom>('cash');
  const [error, setError] = useState('');
  const [done, setDone] = useState<Extract<SubmitResult, { ok: true }>['request'] | null>(null);

  const submit = () => {
    const result = submitStaffExpense(store, worker, { amount: Number(amount), category, note, date, paidFrom });
    if ('error' in result) {
      setError(result.error);
      return;
    }
    saveStore(result.store);
    onUpdate(result.store);
    setDone(result.request);
  };

  // On a worker's own phone it is sent to the owner's, where the shop's rule
  // is applied; say what that rule will do, rather than "waiting" for a shop
  // that records straight away.
  const counts = !!done && (done.status === 'approved' || (!!store.staffDevice && !mustWait(store, done.amount)));

  const input = 'w-full h-11 px-3 rounded-xl bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm';
  const chip = (active: boolean) => `h-10 rounded-xl text-xs font-display font-bold border transition-colors flex items-center justify-center gap-1.5 ${
    active ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-foreground border-border'
  }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <ScrollLock />
      <div
        role="dialog"
        aria-label="Record expense"
        className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto animate-slide-up text-left"
        onClick={e => e.stopPropagation()}
      >
        {done ? (
          <div className="text-center py-4">
            {counts
              ? <CheckCircle2 className="w-12 h-12 mx-auto text-success" />
              : <Clock className="w-12 h-12 mx-auto text-amber-500" />}
            <p className="mt-3 font-display font-black text-lg">Expense recorded</p>
            <p className="mt-1 text-sm text-foreground">
              ₦{done.amount.toLocaleString()} • {done.category} • {done.note}
            </p>
            <p className={`mt-2 text-xs font-semibold ${counts ? 'text-success' : 'text-amber-600'}`}>
              {done.status === 'approved' ? 'Approved' : counts ? 'Recorded' : 'Waiting for owner approval'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full h-11 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-black text-lg">Record expense</h3>
              <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground text-2xl leading-none">×</button>
            </div>
            <div className="space-y-3.5">
              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground">Amount (₦)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setError(''); }}
                  placeholder="0"
                  className={input}
                  autoFocus
                />
              </label>

              <div>
                <span className="text-[11px] font-semibold text-muted-foreground">Category</span>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  {STAFF_EXPENSE_CATEGORIES.map(cat => {
                    const Icon = ICON[cat] || Receipt;
                    return (
                      <button key={cat} type="button" onClick={() => setCategory(cat)} className={chip(category === cat)}>
                        <Icon className="w-3.5 h-3.5" /> {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground">What was bought / reason</span>
                <input
                  value={note}
                  onChange={e => { setNote(e.target.value); setError(''); }}
                  placeholder={HINT[category]}
                  className={input}
                />
              </label>

              <label className="block">
                <span className="text-[11px] font-semibold text-muted-foreground">Date</span>
                <input type="date" value={date} max={today()} onChange={e => { setDate(e.target.value); setError(''); }} className={input} />
              </label>

              <div>
                <span className="text-[11px] font-semibold text-muted-foreground">Paid from</span>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {(Object.keys(PAID_FROM_LABEL) as ExpensePaidFrom[]).map(source => (
                    <button key={source} type="button" onClick={() => setPaidFrom(source)} className={chip(paidFrom === source)}>
                      {PAID_FROM_LABEL[source]}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

              <button
                type="button"
                onClick={submit}
                className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm active:scale-[0.98] transition"
              >
                Save expense
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
