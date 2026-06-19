import { useMemo, useState, useEffect } from 'react';
import { StoreData, PendingPayment, PaymentMethod } from '@/types/store';
import { addPaymentToPending, markPendingPaid, deletePendingPayment, getPendingSummary } from '@/lib/store-data';
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
      {/* Top summary */}
      <div className="rounded-2xl p-4 bg-gradient-to-br from-warning/15 via-warning/5 to-transparent border border-warning/30">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total Owed</p>
            <p className="font-display text-3xl font-bold text-warning">₦{summary.totalOwed.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{summary.customerCount} customer{summary.customerCount === 1 ? '' : 's'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase text-muted-foreground">Recovery</p>
            <p className="font-display text-2xl font-bold text-success">{summary.recoveryRate}%</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="rounded-lg bg-surface-2/60 p-2">
            <p className="text-[10px] text-muted-foreground">Collected this month</p>
            <p className="text-sm font-display font-semibold text-success">₦{summary.collectedThisMonth.toLocaleString()}</p>
          </div>
          <div className="rounded-lg bg-surface-2/60 p-2">
            <p className="text-[10px] text-muted-foreground">Overdue</p>
            <p className="text-sm font-display font-semibold text-destructive">{summary.overdue.length}</p>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        {(['all', 'overdue', 'paid'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-display font-semibold border transition-colors ${
              filter === f ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border'
            }`}>
            {f === 'all' ? 'Pending' : f === 'overdue' ? 'Overdue' : 'Paid'}
          </button>
        ))}
      </div>

      {/* List */}
      {list.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
          {filter === 'paid' ? 'No completed pending payments yet.' : 'No pending balances. Nice and clean.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {list.map(p => {
            const days = daysFromNow(p.dueDate);
            const isOverdue = days !== null && days < 0;
            const tone = p.status === 'paid' ? 'text-success' : isOverdue ? 'text-destructive' : 'text-warning';
            return (
              <div key={p.id} className="p-3 rounded-xl bg-card border border-border space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-sm truncate">{p.customerName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{p.items.map(i => `${i.quantity}× ${i.productName}`).join(', ')}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-display font-bold ${tone}`}>₦{p.balance.toLocaleString()}</p>
                    {p.dueDate && (
                      <p className={`text-[10px] ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {isOverdue ? `Overdue ${Math.abs(days!)}d` : days === 0 ? 'Due today' : `${days}d left`}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span>Paid ₦{p.paid.toLocaleString()}</span>
                  <span>·</span>
                  <span>Total ₦{p.total.toLocaleString()}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full bg-success" style={{ width: `${Math.min(100, (p.paid / p.total) * 100)}%` }} />
                </div>
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
