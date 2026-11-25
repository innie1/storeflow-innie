import type { StoreData } from '@/types/store';
import { approveServiceChange, canApproveServiceChanges, pendingServiceChanges, rejectServiceChange, serviceChangeLines } from '@/lib/service-changes';
import { showToast } from '@/components/Toast';

interface Props {
  store: StoreData;
  /** Saves and shows the new copy of the shop. */
  persist: (store: StoreData) => void;
  currentUser?: { name?: string; role?: string };
}

/**
 * At the top of the Price List: what a manager asked to change, and the
 * owner's Approve or Reject. On a manager's own phone, one line saying their
 * changes go to the owner first, so a price that springs back after a
 * refresh is not a mystery.
 */
export default function ServiceChangeApprovals({ store, persist, currentUser }: Props) {
  if (store.staffDevice) {
    return (
      <p className="text-[11px] rounded-xl border border-border bg-surface-2 px-3 py-2 text-muted-foreground" data-service-change-note>
        Price and service changes you make here go to the owner for approval. They count once the owner approves them.
      </p>
    );
  }
  const waiting = pendingServiceChanges(store);
  if (!waiting.length || !canApproveServiceChanges(currentUser)) return null;
  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-3" data-service-change-approvals>
      <p className="text-xs font-black text-amber-600">Waiting for your approval</p>
      {waiting.map(request => (
        <div key={request.id} className="space-y-1.5 border-t border-amber-500/20 pt-2 first:border-0 first:pt-0">
          <p className="text-xs font-bold text-foreground">
            {request._fromStaff.name} wants to change {request.serviceName}
            <span className="font-normal text-muted-foreground">
              {' · '}{new Date(request._fromStaff.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
          <ul className="text-[11px] text-muted-foreground space-y-0.5">
            {serviceChangeLines(request).map(line => <li key={line}>{line}</li>)}
          </ul>
          <div className="flex gap-2 pt-1">
            <button
              className="flex-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold py-2"
              onClick={() => { persist(approveServiceChange(store, request.id, currentUser || {})); showToast('Approved. The new prices are in use.', 'success'); }}
            >Approve</button>
            <button
              className="flex-1 rounded-lg border border-border text-xs font-bold py-2"
              onClick={() => { persist(rejectServiceChange(store, request.id, currentUser || {})); showToast('Rejected. Nothing was changed.', 'info'); }}
            >Reject</button>
          </div>
        </div>
      ))}
    </section>
  );
}
