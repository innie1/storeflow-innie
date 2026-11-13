import { debtorKey } from '@/lib/customer-key';
import { StoreData } from '@/types/store';
import { getPendingSummary } from '@/lib/store-data';
import { CreditCard } from 'lucide-react';

// ─── Money Owed Card ──────────────────────────────────────────────────────────
export default function MoneyOwedCard({ store, onClick }: { store: StoreData; onClick?: () => void }) {
  const s = getPendingSummary(store);
  if (s.list.length === 0) return null;
  const advices: string[] = [];
  if (s.totalOwed > 0) advices.push(`Collecting 50% would add ₦${Math.round(s.totalOwed * 0.5).toLocaleString()} this month.`);
  if (s.overdue.length > 0) advices.push(`${s.overdue.length} customer${s.overdue.length === 1 ? ' is' : 's are'} overdue.`);
  /*
   * Grouped by customer, not by name. By name, two customers who share one had
   * their records added together, so one Musa Bello was said to have delayed
   * payment four times when two different Musas had two each.
   */
  const byCustomer = new Map<string, { name: string; count: number }>();
  (store.pendingPayments || []).forEach(p => {
    const key = debtorKey(p);
    if (!key) return;
    const entry = byCustomer.get(key) || { name: p.customerName, count: 0 };
    entry.count += 1;
    byCustomer.set(key, entry);
  });
  const repeat = [...byCustomer.values()].sort((a, b) => b.count - a.count)[0];
  if (repeat && repeat.count >= 2) advices.push(`${repeat.name} has delayed payment ${repeat.count} times.`);
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`w-full text-left p-4 rounded-2xl bg-card shadow-card space-y-3 border border-transparent transition-colors ${onClick ? 'cursor-pointer hover:border-warning/30' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div><h3 className="font-display font-bold text-sm flex items-center gap-1.5"><CreditCard className="w-4 h-4" /> Money Owed To You</h3><p className="text-[11px] text-muted-foreground">Outstanding customer balances</p></div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-display font-bold ${s.recoveryRate >= 70 ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>{s.recoveryRate}% recovered</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/20"><p className="text-[10px] text-muted-foreground uppercase">Outstanding</p><p className="font-display font-bold text-warning text-sm">₦{s.totalOwed.toLocaleString()}</p></div>
        <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Customers</p><p className="font-display font-bold text-sm">{s.customerCount}</p></div>
        <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Overdue</p><p className="font-display font-bold text-sm text-destructive">{s.overdue.length}</p></div>
      </div>
      {advices.length > 0 && <div className="space-y-1">{advices.map((a, i) => (<p key={i} className="text-[10px] text-foreground/90 leading-tight flex gap-1"><span className="flex-1">{a}</span></p>))}</div>}
    </div>
  );
}
