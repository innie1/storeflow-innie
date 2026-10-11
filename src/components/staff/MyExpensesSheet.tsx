import type { StoreData } from '@/types/store';
import { groupByDay, myStaffExpenses, STATUS_LABEL } from '@/lib/staff-expenses';
import ScrollLock from '@/components/ScrollLock';

/**
 * What a worker has recorded, and what became of each one.
 *
 * Only their own: never the owner's expenses or another worker's, and no
 * total - a running sum of what one person spent is still the shop's money.
 */

interface Props {
  store: StoreData;
  staffId: string;
  onClose: () => void;
}

const STATUS_TONE = {
  approved: 'text-success',
  pending: 'text-amber-600',
  rejected: 'text-destructive',
} as const;

export default function MyExpensesSheet({ store, staffId, onClose }: Props) {
  const days = groupByDay(myStaffExpenses(store, staffId));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <ScrollLock />
      <div
        role="dialog"
        aria-label="My expenses"
        className="w-full max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto animate-slide-up text-left"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-black text-lg">My expenses</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground text-2xl leading-none">×</button>
        </div>
        {days.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {days.map(day => (
              <section key={day.label}>
                <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">{day.label}</p>
                <ul className="space-y-1.5">
                  {day.items.map(item => (
                    <li key={item.id} className="p-2.5 rounded-xl bg-surface-2 border border-border flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-display font-bold truncate">₦{item.amount.toLocaleString()} {item.note}</p>
                        <p className="text-[11px] text-muted-foreground">{item.category}</p>
                      </div>
                      <span className={`text-[11px] font-semibold shrink-0 ${STATUS_TONE[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
