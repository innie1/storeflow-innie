import { useState } from 'react';
import { ClipboardCheck, Wallet } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { isPerPieceWorker, pendingClaims, workerEarnings } from '@/lib/piece-work';
import RecordWork from '@/components/laundry/RecordWork';
import WorkerEarnings from '@/components/laundry/WorkerEarnings';

/**
 * A per-piece worker's own corner of their home screen.
 *
 * Record Work was a button on the owner's Staff page, which a casual worker
 * cannot open, so the person who actually did the ironing had no way to say
 * so. Signed in on the shop's phone, a per-piece worker now has it on their
 * home screen, with what they have earned beside it. Their claims still wait
 * for the owner's approval before they count as owed.
 *
 * Nobody else sees it: not the owner, and not a worker on a monthly wage.
 */

interface Props {
  store: StoreData;
  /** The shop's bundles from the cloud, so the list matches the Records page. */
  orders?: any[];
  currentUser?: { id?: string; role?: string } | null;
  onUpdate: (store: StoreData) => void;
}

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

export default function MyPieceWork({ store, orders, currentUser, onUpdate }: Props) {
  const [recording, setRecording] = useState(false);
  const [earningsOpen, setEarningsOpen] = useState(false);

  const me = currentUser?.id && currentUser.role !== 'owner'
    ? (store.staffMembers || []).find(member => member.id === currentUser.id)
    : undefined;
  if (!me || !isPerPieceWorker(me)) return null;

  const earnings = workerEarnings(store, me.id);
  const waiting = pendingClaims(store).filter(entry => entry.workerId === me.id).length;

  return (
    <>
      <section className="mb-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-left">
        <p className="text-[10px] uppercase font-black tracking-wider text-primary">Your piece work</p>
        {/* Today's figures count only what the owner has agreed, so a claim
            just sent is shown as waiting rather than quietly missing. */}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {earnings.piecesToday} {earnings.piecesToday === 1 ? 'piece' : 'pieces'} agreed today · {money(earnings.earnedToday)}
          {waiting > 0 && <> · {waiting} waiting for approval</>}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRecording(true)}
            className="h-11 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
          >
            <ClipboardCheck className="w-4 h-4" /> Record my work
          </button>
          <button
            type="button"
            onClick={() => setEarningsOpen(true)}
            className="h-11 rounded-xl bg-surface-2 border border-border font-display font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
          >
            <Wallet className="w-4 h-4" /> My earnings
          </button>
        </div>
      </section>

      {/* Their own pay, so the amounts are theirs to see. Approving and paying
          stay with the owner. */}
      {recording && (
        <RecordWork
          store={store}
          worker={me}
          orders={orders}
          onUpdate={onUpdate}
          onClose={() => setRecording(false)}
          showMoney
        />
      )}
      {earningsOpen && (
        <WorkerEarnings
          store={store}
          worker={me}
          canManage={false}
          onUpdate={onUpdate}
          onClose={() => setEarningsOpen(false)}
        />
      )}
    </>
  );
}
