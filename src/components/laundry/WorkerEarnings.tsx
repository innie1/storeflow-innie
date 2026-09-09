import { useMemo, useState } from 'react';
import { Check, Trash2, Wallet, X } from 'lucide-react';
import type { StaffMember, StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import {
  approvePieceWork,
  payWorker,
  pendingClaims,
  removePieceWork,
  taskLabel,
  workerEarnings,
} from '@/lib/piece-work';

/**
 * What a per-piece worker has earned, and what the shop still owes them.
 *
 * Split into what is agreed and what is waiting, because they are different
 * promises. Money the owner has approved is owed; a claim nobody has looked at
 * yet is not, and showing them as one number would have somebody counting on
 * money that might be corrected before payday.
 *
 * The owner's half - approving, correcting, paying - lives on the same screen
 * rather than somewhere else, because it is the same conversation.
 */

interface Props {
  store: StoreData;
  worker: StaffMember;
  /** Only an owner may approve work or hand over money. */
  canManage: boolean;
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
}

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

export default function WorkerEarnings({ store, worker, canManage, onUpdate, onClose }: Props) {
  const [payAmount, setPayAmount] = useState('');
  const earnings = useMemo(() => workerEarnings(store, worker.id), [store, worker.id]);
  const waiting = useMemo(
    () => pendingClaims(store).filter(entry => entry.workerId === worker.id),
    [store, worker.id],
  );

  const persist = (next: StoreData) => { saveStore(next); onUpdate(next); };

  const approveAll = () => {
    if (!waiting.length) return;
    persist(approvePieceWork(store, waiting.map(entry => entry.id)));
    showToast('Work approved — it is now owed', 'success');
  };

  const pay = () => {
    const amount = Number(payAmount) || 0;
    if (amount <= 0) return;
    if (amount > earnings.balance) {
      showToast(`${worker.name} is owed ${money(earnings.balance)}`, 'error');
      return;
    }
    persist(payWorker(store, worker, amount));
    setPayAmount('');
    showToast(`${money(amount)} paid to ${worker.name}`, 'success');
  };

  return (
    <div className="fixed inset-0 z-[75] bg-background flex flex-col">
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase text-primary font-black">Earnings</p>
          <h3 className="font-display font-black text-base truncate">{worker.name}</h3>
        </div>
        <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-card border border-border p-3">
            <p className="font-display font-black text-xl">{earnings.piecesToday}</p>
            <p className="text-[10px] text-muted-foreground">pieces today</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-3">
            <p className="font-display font-black text-xl text-success">{money(earnings.earnedToday)}</p>
            <p className="text-[10px] text-muted-foreground">today</p>
          </div>
          <div className="rounded-2xl bg-card border border-border p-3">
            <p className="font-display font-black text-xl">{money(earnings.earnedThisWeek)}</p>
            <p className="text-[10px] text-muted-foreground">this week</p>
          </div>
        </div>

        {earnings.todayByTask.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-3.5">
            <p className="text-[10px] uppercase font-black text-muted-foreground">Today</p>
            <div className="mt-2 space-y-1.5">
              {earnings.todayByTask.map(entry => (
                <div key={entry.task} className="flex items-center justify-between text-xs">
                  <span>{taskLabel(entry.task)} · {entry.pieces} {entry.pieces === 1 ? 'piece' : 'pieces'}</span>
                  <span className="font-display font-bold">{money(entry.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* The three that matter on payday, said plainly. */}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Earned and agreed</span>
            <span className="font-display font-bold">{money(earnings.approvedTotal)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Already paid</span>
            <span className="font-display font-bold">{money(earnings.paid)}</span>
          </div>
          <div className="flex items-center justify-between text-sm border-t border-border pt-1.5">
            <span className="font-display font-black">Still owed</span>
            <span className="font-display font-black text-primary">{money(earnings.balance)}</span>
          </div>
          {earnings.awaitingApproval > 0 && (
            /* Kept out of the total on purpose: it is a claim, not a debt. */
            <p className="text-[10px] text-muted-foreground pt-1">
              {money(earnings.awaitingApproval)} more is waiting for the owner to check it.
            </p>
          )}
        </div>

        {canManage && waiting.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase font-black text-muted-foreground">Waiting for you</p>
              <button onClick={approveAll} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-display font-black">
                Approve all
              </button>
            </div>
            <div className="mt-2 space-y-1.5">
              {waiting.map(entry => (
                <div key={entry.id} className="flex items-center gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{entry.quantity} × {entry.garmentType} · {taskLabel(entry.task)}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{entry.tagCode} · {entry.customerName}</p>
                  </div>
                  <span className="font-display font-bold shrink-0">{money(entry.amount)}</span>
                  <button
                    onClick={() => { persist(approvePieceWork(store, [entry.id])); showToast('Approved', 'success'); }}
                    aria-label="Approve"
                    className="w-8 h-8 rounded-lg bg-success/15 text-success flex items-center justify-center shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  {/* Removed, not marked wrong: the pieces have to go back on
                      the job or nobody can ever claim them. */}
                  <button
                    onClick={() => { persist(removePieceWork(store, entry.id)); showToast('Claim removed — the pieces are back on the job', 'info'); }}
                    aria-label="Remove this claim"
                    className="w-8 h-8 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {canManage && earnings.balance > 0 && (
          <div className="rounded-2xl bg-card border border-border p-3.5">
            <p className="text-[10px] uppercase font-black text-muted-foreground flex items-center gap-1.5">
              <Wallet className="w-3 h-3" /> Pay {worker.name}
            </p>
            <div className="flex gap-2 mt-2">
              <div className="flex items-center gap-2 flex-1 h-11 px-3 rounded-xl bg-surface-2 border border-border">
                <span className="text-sm text-muted-foreground">₦</span>
                <input
                  value={payAmount}
                  onChange={event => setPayAmount(event.target.value.replace(/[^0-9]/g, ''))}
                  inputMode="numeric"
                  placeholder={String(Math.round(earnings.balance))}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
              <button onClick={pay} className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black">
                Pay
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              This comes out of the shop's cash and is kept in the payment history.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
