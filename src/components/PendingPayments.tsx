import { useMemo, useState, useEffect } from 'react';
import { StoreData, PendingPayment, PaymentMethod } from '@/types/store';
import { addPaymentToPending, markPendingPaid, deletePendingPayment, getPendingSummary } from '@/lib/store-data';
import { getRepaymentInsights, CustomerRepaymentInsight } from '@/lib/manager-intel';
import { showToast } from '@/components/Toast';

interface Props { store: StoreData; onUpdate: (s: StoreData) => void; }

function daysFromNow(iso?: string) {
  if (!iso) return null;
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
  return diff;
}

export default function PendingPayments({ store, onUpdate }: Props) {
  const summary = useMemo(() => getPendingSummary(store), [store]);
  const [filter, setFilter] = useState<'all' | 'overdue' | 'paid'>('all');
  const [partialFor, setPartialFor] = useState<PendingPayment | null>(null);
  const [partialAmt, setPartialAmt] = useState('');
  const [partialMethod, setPartialMethod] = useState<PaymentMethod>(() => {
    return (localStorage.getItem('storeflow_last_payment_method') as PaymentMethod) || 'transfer';
  });

  useEffect(() => {
    localStorage.setItem('storeflow_last_payment_method', partialMethod);
  }, [partialMethod]);

  const all = store.pendingPayments || [];
  const list = useMemo(() => {
    if (filter === 'paid') return all.filter(p => p.status === 'paid');
    if (filter === 'overdue') return all.filter(p => p.status === 'pending' && p.dueDate && new Date(p.dueDate) < new Date());
    return all.filter(p => p.status === 'pending');
  }, [all, filter]);

  // Learned per-customer repayment intelligence
  const repayInsights = useMemo(() => getRepaymentInsights(store), [store]);
  const insightByKey = useMemo(() => {
    const m = new Map<string, CustomerRepaymentInsight>();
    repayInsights.customers.forEach(c => m.set(c.customerKey, c));
    return m;
  }, [repayInsights]);
  const insightFor = (name: string) => insightByKey.get((name || '').trim().toLowerCase());
  const relDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const diff = Math.round((d.getTime() - Date.now()) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff > 0) return `in ${diff}d`;
    return `${Math.abs(diff)}d ago`;
  };

  const handleMarkPaid = (p: PendingPayment) => {
    const updated = markPendingPaid(store, p.id);
    onUpdate(updated);
    showToast(`${p.customerName} marked as paid`);
  };

  const handlePartial = () => {
    if (!partialFor) return;
    const amt = Number(partialAmt);
    if (!amt || amt <= 0) return showToast('Enter a valid amount', 'error');
    const updated = addPaymentToPending(store, partialFor.id, amt, partialMethod);
    onUpdate(updated);
    showToast(`Recorded ₦${amt.toLocaleString()} from ${partialFor.customerName}`);
    setPartialFor(null); setPartialAmt('');
  };

  const handleDelete = (p: PendingPayment) => {
    if (!confirm(`Delete pending record for ${p.customerName}?`)) return;
    onUpdate(deletePendingPayment(store, p.id));
  };

  const call = (phone?: string) => phone ? window.open(`tel:${phone}`) : showToast('No phone number on file', 'error');
  const wa = (p: PendingPayment) => {
    if (!p.customerPhone) return showToast('No phone number on file', 'error');
    const msg = encodeURIComponent(`Hi ${p.customerName}, this is a friendly reminder about your outstanding balance of ₦${p.balance.toLocaleString()} at ${store.storeName}. Thank you!`);
    window.open(`https://wa.me/${p.customerPhone.replace(/\D/g, '')}?text=${msg}`, '_blank');
  };

  return (
    <div className="animate-fade-in space-y-4 pb-20">
      {/* Top summary — refreshed */}
      <div className="relative overflow-hidden rounded-2xl border border-warning/30 bg-gradient-to-br from-warning/20 via-warning/5 to-transparent p-4">
        <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-warning/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-display font-semibold">Total Owed</p>
            <p className="font-display text-[32px] leading-none font-bold text-warning mt-1">₦{summary.totalOwed.toLocaleString()}</p>
            <p className="text-[11px] text-muted-foreground mt-1.5">Across {summary.customerCount} customer{summary.customerCount === 1 ? '' : 's'}</p>
          </div>
          <div className="text-right">
            <div className="inline-flex flex-col items-end px-3 py-1.5 rounded-xl bg-success/15 border border-success/30">
              <span className="text-[9px] uppercase tracking-wider text-success/80 font-semibold">Recovery</span>
              <span className="font-display text-xl font-bold text-success leading-none">{summary.recoveryRate}%</span>
            </div>
          </div>
        </div>
        <div className="relative grid grid-cols-3 gap-1.5 mt-3">
          <div className="rounded-lg bg-background/50 backdrop-blur-sm border border-border/40 p-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Collected/mo</p>
            <p className="text-sm font-display font-bold text-success">₦{summary.collectedThisMonth.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-background/50 backdrop-blur-sm border border-border/40 p-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Overdue</p>
            <p className="text-sm font-display font-bold text-destructive">{summary.overdue.length}</p>
          </div>
          <div className="rounded-lg bg-background/50 backdrop-blur-sm border border-border/40 p-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Avg debt</p>
            <p className="text-sm font-display font-bold text-foreground">₦{repayInsights.overallAvgDebtSize.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Flow's learned insight banner */}
      {repayInsights.customers.length > 0 && (
        <div className="rounded-2xl p-3 bg-gradient-to-r from-primary/10 to-transparent border border-primary/30 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-lg flex-shrink-0">🧠</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider text-primary font-display font-bold">Flow has learned</p>
            <p className="text-xs text-foreground">
              {repayInsights.overallAvgDaysToClear !== null
                ? <>Customers typically clear debts in <b>{repayInsights.overallAvgDaysToClear} days</b>. Store reliability score: <b>{repayInsights.overallReliability}%</b>.</>
                : <>Watching {repayInsights.customers.length} customer{repayInsights.customers.length === 1 ? '' : 's'} · reliability score {repayInsights.overallReliability}%.</>
              }
            </p>
          </div>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2">
        {(['all', 'overdue', 'paid'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-display font-semibold border transition-colors ${
              filter === f ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-card text-muted-foreground border-border hover:bg-surface-2'
            }`}>
            {f === 'all' ? 'Pending' : f === 'overdue' ? 'Overdue' : 'Paid'}
          </button>
        ))}
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-3xl mb-2">{filter === 'paid' ? '📦' : '✨'}</p>
          <p className="text-sm text-muted-foreground">
            {filter === 'paid' ? 'No completed pending payments yet.' : 'No pending balances. Nice and clean.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map(p => {
            const days = daysFromNow(p.dueDate);
            const isOverdue = days !== null && days < 0;
            const tone = p.status === 'paid' ? 'text-success' : isOverdue ? 'text-destructive' : 'text-warning';
            const ins = insightFor(p.customerName);
            const rel = ins?.reliabilityScore ?? null;
            const relChipClass = rel === null
              ? 'bg-muted text-muted-foreground border-border'
              : rel >= 75 ? 'bg-success/15 text-success border-success/30'
              : rel >= 45 ? 'bg-warning/15 text-warning border-warning/30'
              : 'bg-destructive/15 text-destructive border-destructive/30';
            return (
              <div key={p.id} className="p-3 rounded-xl bg-card border border-border space-y-2 hover:border-border/80 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-display font-bold text-sm truncate">{p.customerName}</p>
                      {rel !== null && ins!.sampleSize >= 2 && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-display font-bold ${relChipClass}`}>
                          {rel}% reliable
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{p.items.map(i => `${i.quantity}× ${i.productName}`).join(', ')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-display font-bold ${tone}`}>₦{p.balance.toLocaleString()}</p>
                    {p.dueDate && (
                      <p className={`text-[10px] ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {isOverdue ? `Overdue ${Math.abs(days!)}d` : days === 0 ? 'Due today' : `${days}d left`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Progress + numbers */}
                <div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                    <span>₦{p.paid.toLocaleString()} <span className="opacity-60">of</span> ₦{p.total.toLocaleString()}</span>
                    <span className="font-display font-semibold">{Math.round((p.paid / p.total) * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-success/80 to-success transition-all" style={{ width: `${Math.min(100, (p.paid / p.total) * 100)}%` }} />
                  </div>
                </div>

                {/* Per-customer predictive insight strip */}
                {p.status === 'pending' && ins && ins.sampleSize >= 2 && (
                  <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-primary/5 border border-primary/20 text-center">
                    <div>
                      <p className="text-[8px] uppercase text-muted-foreground tracking-wider">Usually pays</p>
                      <p className="text-[11px] font-display font-bold text-primary">
                        {ins.avgDaysBetweenPayments !== null ? `every ${ins.avgDaysBetweenPayments}d` : '—'}
                      </p>
                    </div>
                    <div className="border-x border-primary/20">
                      <p className="text-[8px] uppercase text-muted-foreground tracking-wider">Avg debt</p>
                      <p className="text-[11px] font-display font-bold text-foreground">₦{ins.avgDebtSize.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase text-muted-foreground tracking-wider">Next pay</p>
                      <p className="text-[11px] font-display font-bold text-warning">{relDate(ins.predictedNextPaymentDate)}</p>
                    </div>
                  </div>
                )}
                {p.status === 'pending' && (
                  <div className="grid grid-cols-5 gap-1.5 pt-1">
                    <button onClick={() => call(p.customerPhone)} className="p-2 rounded-lg bg-surface-2 text-[10px] font-display font-semibold">📞 Call</button>
                    <button onClick={() => wa(p)} className="p-2 rounded-lg bg-success/15 text-success text-[10px] font-display font-semibold">💬 WhatsApp</button>
                    <button onClick={() => { setPartialFor(p); setPartialAmt(''); setPartialMethod((localStorage.getItem('storeflow_last_payment_method') as PaymentMethod) || 'transfer'); }} className="p-2 rounded-lg bg-primary/15 text-primary text-[10px] font-display font-semibold">+ Partial</button>
                    <button onClick={() => handleMarkPaid(p)} className="p-2 rounded-lg bg-success text-white text-[10px] font-display font-semibold">✓ Paid</button>
                    <button onClick={() => handleDelete(p)} className="p-2 rounded-lg bg-destructive/15 text-destructive text-[10px] font-display font-semibold">🗑</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Partial payment modal */}
      {partialFor && (
        <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setPartialFor(null)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-xs text-muted-foreground">Partial payment from</p>
              <p className="font-display font-bold">{partialFor.customerName}</p>
              <p className="text-xs text-muted-foreground">Balance: <span className="text-warning font-semibold">₦{partialFor.balance.toLocaleString()}</span></p>
            </div>
            <input autoFocus type="number" placeholder="Amount paid" value={partialAmt}
              onChange={e => setPartialAmt(e.target.value)}
              className="w-full p-3 rounded-lg bg-surface-2 border border-border text-center text-lg font-display" />
            <div className="grid grid-cols-3 gap-1.5">
              {(['transfer', 'pos', 'cash'] as PaymentMethod[]).map(m => (
                <button key={m} onClick={() => setPartialMethod(m)}
                  className={`p-2 rounded-lg text-xs font-display font-semibold border ${
                    partialMethod === m ? 'bg-primary/15 text-primary border-primary/50' : 'bg-surface-2 text-muted-foreground border-border'
                  }`}>{m === 'pos' ? 'CARD' : m.toUpperCase()}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPartialFor(null)} className="flex-1 p-2.5 rounded-lg bg-surface-2 text-sm">Cancel</button>
              <button onClick={handlePartial} className="flex-1 p-2.5 rounded-lg bg-success text-white text-sm font-bold">Record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
