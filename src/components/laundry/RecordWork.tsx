import { useMemo, useState } from 'react';
import { Check, ChevronLeft, X } from 'lucide-react';
import type { StaffMember, StoreData } from '@/types/store';
import type { LocalLaundryRecord } from '@/lib/laundry-offline';
import { saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import {
  openJobsForTask,
  pieceRate,
  recordPieceWork,
  remainingForTask,
  WORK_TASKS,
  type RemainingItem,
} from '@/lib/piece-work';

/**
 * What a per-piece worker actually did.
 *
 * Three steps, in this order for a reason: the task, then a real customer's
 * job, then the items on that job that still need doing. Nowhere in it is a
 * box where somebody types how many shirts they ironed - the numbers come from
 * the customer's own bundle, and the most anybody can claim is what is
 * genuinely left on it.
 *
 * That is not a small distinction. "I ironed forty shirts" is a claim on the
 * shop's money that nobody can check by looking at anything; "three of the six
 * shirts on Musa's LT-104" is a claim anybody can walk over to the rack and
 * verify.
 */

interface Props {
  store: StoreData;
  worker: StaffMember;
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
}

export default function RecordWork({ store, worker, onUpdate, onClose }: Props) {
  const [task, setTask] = useState<string | null>(null);
  const [job, setJob] = useState<{ record: LocalLaundryRecord; items: RemainingItem[] } | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const jobs = useMemo(() => (task ? openJobsForTask(store, task) : []), [store, task]);

  const claimTotal = useMemo(() => {
    if (!task || !job) return 0;
    return job.items.reduce((sum, item) => {
      const quantity = counts[item.garmentType] || 0;
      return sum + quantity * pieceRate(worker, task, item.garmentType);
    }, 0);
  }, [counts, job, task, worker]);

  const claimPieces = Object.values(counts).reduce((sum, value) => sum + value, 0);

  const submit = () => {
    if (!task || !job) return;
    const items = Object.entries(counts)
      .filter(([, quantity]) => quantity > 0)
      .map(([garmentType, quantity]) => ({ garmentType, quantity }));
    if (!items.length) return;

    const next = recordPieceWork(store, { worker, record: job.record, task, items });
    saveStore(next);
    onUpdate(next);
    showToast(`${claimPieces} ${claimPieces === 1 ? 'piece' : 'pieces'} sent for approval`, 'success');
    onClose();
  };

  const step = !task ? 'task' : !job ? 'job' : 'items';

  return (
    <div className="fixed inset-0 z-[75] bg-background flex flex-col">
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2 min-w-0">
          {step !== 'task' && (
            <button
              onClick={() => (step === 'items' ? (setJob(null), setCounts({})) : setTask(null))}
              aria-label="Back"
              className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <p className="text-[10px] uppercase text-primary font-black">Record work</p>
            <h3 className="font-display font-black text-base truncate">
              {step === 'task' ? 'What did you do?' : step === 'job' ? 'Which job?' : job?.record.tagCode}
            </h3>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* 1. The task. */}
        {step === 'task' && WORK_TASKS.map(item => (
          <button
            key={item.id}
            onClick={() => { setTask(item.id); setJob(null); setCounts({}); }}
            className="w-full h-14 rounded-2xl bg-surface-2 border border-border font-display font-black text-sm text-left px-4"
          >
            {item.label}
          </button>
        ))}

        {/* 2. A real job with real work left on it. */}
        {step === 'job' && (
          jobs.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="font-display font-black text-sm">Nothing waiting</p>
              <p className="text-xs text-muted-foreground mt-1">
                No job in the shop still needs {WORK_TASKS.find(t => t.id === task)?.label.toLowerCase()}.
              </p>
            </div>
          ) : jobs.map(entry => (
            <button
              key={entry.record.clientRef}
              onClick={() => { setJob(entry); setCounts({}); }}
              className="w-full rounded-2xl bg-surface-2 border border-border p-3.5 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono font-black text-sm">{entry.record.tagCode}</p>
                  <p className="text-xs text-muted-foreground truncate">{entry.record.customerName}</p>
                </div>
                <span className="text-[11px] font-display font-bold text-primary shrink-0">
                  {entry.items.reduce((sum, item) => sum + item.remaining, 0)} left
                </span>
              </div>
            </button>
          ))
        )}

        {/* 3. Only what is still on that job, and never more of it. */}
        {step === 'items' && job && task && (
          <>
            <p className="text-[11px] text-muted-foreground">
              {job.record.customerName} · tap the ones you finished
            </p>
            {remainingForTask(store, job.record, task).map(item => {
              const picked = counts[item.garmentType] || 0;
              const rate = pieceRate(worker, task, item.garmentType);
              return (
                <div key={item.garmentType} className="rounded-2xl bg-surface-2 border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display font-black text-sm truncate">{item.garmentType}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.remaining} left of {item.total}
                        {rate > 0 ? ` · ₦${rate} each` : ' · no rate set'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setCounts(c => ({ ...c, [item.garmentType]: Math.max(0, picked - 1) }))}
                        className="w-9 h-9 rounded-xl bg-card border border-border font-black"
                        aria-label={`One fewer ${item.garmentType}`}
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-display font-black">{picked}</span>
                      {/*
                        Stops at what is left. The button simply will not go
                        past it, so there is no wrong number to type and no
                        error message to read.
                      */}
                      <button
                        onClick={() => setCounts(c => ({ ...c, [item.garmentType]: Math.min(item.remaining, picked + 1) }))}
                        disabled={picked >= item.remaining}
                        className="w-9 h-9 rounded-xl bg-card border border-border font-black disabled:opacity-30"
                        aria-label={`One more ${item.garmentType}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {step === 'items' && (
        <div className="shrink-0 border-t border-border p-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs text-muted-foreground">{claimPieces} {claimPieces === 1 ? 'piece' : 'pieces'}</span>
            <span className="font-display font-black text-sm">₦{Math.round(claimTotal).toLocaleString()}</span>
          </div>
          <button
            onClick={submit}
            disabled={claimPieces === 0}
            className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Check className="w-4 h-4" /> Send for approval
          </button>
          {/* Said plainly, because "submitted" and "paid" are not the same and
              somebody counting on this money should know which just happened. */}
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            The owner checks this before it is added to your earnings.
          </p>
        </div>
      )}
    </div>
  );
}
