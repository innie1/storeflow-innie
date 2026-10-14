import { useEffect, useMemo, useState } from 'react';
import type { StoreData } from '@/types/store';
import { cloudSnapshot, getPendingStoreSync, inspectStoreConflict, retryStoreSync, STORE_SYNC_EVENT, adoptReviewedCloudCopy, adoptThisDeviceCopy } from '@/lib/store-cloud-sync';
import { inspectStoreRecords } from '@/lib/store-reconciliation';
import { showToast } from './Toast';

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function StoreIntegrityPanel({ store, owner }: { store: StoreData; owner: boolean }) {
  const [pending, setPending] = useState(() => getPendingStoreSync(store.accessCode));
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Awaited<ReturnType<typeof inspectStoreConflict>>>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const issues = useMemo(() => open && owner ? inspectStoreRecords(store) : [], [open, owner, store]);
  useEffect(() => {
    setOpen(false); setReview(null); setAcknowledged(false);
    const update = () => setPending(getPendingStoreSync(store.accessCode));
    const retry = () => { const held = getPendingStoreSync(store.accessCode); if (held && held.state !== 'conflict') void retryStoreSync(store.accessCode).catch(() => {}); };
    // On opening and on coming back online, a held sync with no agreed copy is
    // looked at again: if the cloud's copy is only older it settles itself.
    const settle = () => { const held = getPendingStoreSync(store.accessCode); if (held?.state === 'conflict' && !held.base) void retryStoreSync(store.accessCode, { settleOlderCloud: true }).catch(() => {}); else retry(); };
    update(); settle();
    window.addEventListener(STORE_SYNC_EVENT, update);
    window.addEventListener('storage', update);
    window.addEventListener('online', settle);
    const interval = window.setInterval(retry, 30_000);
    return () => { window.removeEventListener(STORE_SYNC_EVENT, update); window.removeEventListener('storage', update); window.removeEventListener('online', settle); window.clearInterval(interval); };
  }, [store.accessCode]);
  const act = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); } catch (error: any) { showToast(error.message || 'Could not load recovery records.', 'error'); }
    finally { setBusy(false); }
  };
  /*
   * A shop with no cloud account has nothing stuck. Saying "records waiting to
   * sync" to somebody who has never asked for syncing, above a Retry that
   * cannot work, teaches them the app is broken.
   */
  const unsent = pending && !pending.awaitingAccount ? pending : null;
  /*
   * Nothing to say about a shop with nothing waiting.
   *
   * It used to say so - "No records waiting to sync", beside a Refresh button
   * for records that did not need refreshing - as a permanent fixture above
   * the day's takings, earned by nothing having gone wrong. A shop with
   * everything saved now sees nothing here at all, which is the true state of
   * affairs and the quieter screen.
   */
  if (!unsent) return null;
  /*
   * Only what the owner has to decide. Waiting, syncing and a failed try are
   * the app's own business - it retries on opening, every half minute and on
   * coming back online, and settles a cloud copy that is only older by
   * itself - so they no longer sit above the page as a banner of status words
   * and buttons. What is left is the one case only the owner can answer: the
   * cloud has records this phone has never seen.
   */
  if (unsent.state !== 'conflict' || !owner) return null;
  const compare = () => void act(async () => { setReview(await inspectStoreConflict(store.accessCode)); setAcknowledged(false); });
  /*
   * A held sync's way out, where the owner can see it. It sat behind Check
   * records, then Compare - and while it waits, nothing this phone does
   * reaches the cloud: not its records, not its staff list, so no worker's
   * PIN can be found.
   */
  const choose = review && <div className="space-y-3 border rounded p-3">
    <table className="w-full text-left"><caption>Records saved on each copy</caption><thead><tr><th>Record</th><th>This device</th><th>Cloud</th></tr></thead><tbody>{['sales','products','pendingPayments','staffMembers'].map(field => <tr key={field}><td>{field === 'pendingPayments' ? 'Debt invoices' : field === 'sales' ? 'Sales' : field === 'staffMembers' ? 'Workers' : 'Products'}</td><td>{((review.next as any)[field] || []).length}</td><td>{((review.remote as any)?.[field] || []).length}</td></tr>)}</tbody></table>
    <button className="underline" onClick={() => download(`storeflow-sync-review-${store.accessCode}.json`, { base: review.base ? cloudSnapshot(review.base) : null, device: cloudSnapshot(review.next), cloud: review.remote, uncertainCheckout: review.uncertainCheckout ? cloudSnapshot(review.uncertainCheckout) : undefined })}>Download both copies for review</button>
    <label className="flex gap-2"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I have reviewed the differences.</label>
    <p className="text-muted-foreground">Keep this device's records if this is the phone you have been working on. The cloud's copy is saved on this device first.</p>
    <button disabled={!acknowledged || busy} className="w-full rounded p-2 bg-primary text-primary-foreground font-bold disabled:opacity-50" onClick={() => void act(async () => { await adoptThisDeviceCopy(store.accessCode, review); setReview(null); setAcknowledged(false); showToast('This device\'s records are now in the cloud.', 'success'); })}>Keep this device's records</button>
    <p className="text-muted-foreground">Using the cloud copy removes unuploaded changes from the active device records. A recovery copy is retained on this device.</p>
    <button disabled={!acknowledged || busy} className="w-full border rounded p-2 disabled:opacity-50" onClick={() => void act(async () => { await adoptReviewedCloudCopy(store.accessCode, review); setReview(null); setAcknowledged(false); })}>Keep recovery copy and use cloud records</button>
  </div>;
  return <section className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs space-y-2" aria-label="Store sync and record checks">
    <div className="flex items-center justify-between gap-2">
      <span role="status" className="text-amber-600 font-semibold">Sync needs your review</span>
      <div className="flex items-center gap-3 shrink-0">
        <button className="text-muted-foreground" onClick={() => setOpen(v => !v)}>{open ? 'Close checks' : 'Check records'}</button>
        {!review && <button disabled={busy} className="font-bold text-primary" onClick={compare}>Review</button>}
      </div>
    </div>
    {review && !open && <p className="text-muted-foreground">{unsent.error}</p>}
    {!open && choose}
    {open && owner && <div className="space-y-3">
      <p>These checks flag inconsistent records. Verify receipts and physical stock before making historical corrections.</p>
      <button className="underline" onClick={() => download(`storeflow-record-checks-${store.accessCode}.json`, { date: new Date().toISOString(), issues })}>Download findings</button>
      {issues.length ? <ul className="space-y-2 max-h-72 overflow-auto">{issues.map((issue, index) => <li key={`${issue.id}-${index}`} className="border-b pb-2"><strong>{issue.record}</strong>: {issue.issue}<p className="text-muted-foreground">{issue.fix}</p></li>)}</ul> : <p>No discrepancies found by these checks. Historical records may still need receipt and stock-count verification.</p>}
      <button className="underline" onClick={() => {
        const copies = Object.keys(localStorage).filter(key => key.startsWith(`storeflow_sync_archive_${store.accessCode}_`)).map(key => {
          const held = JSON.parse(localStorage.getItem(key)!);
          return { savedAt: key.split('_').pop(), base: held.base ? cloudSnapshot(held.base) : undefined, device: cloudSnapshot(held.next), uncertainCheckout: held.uncertainCheckout ? cloudSnapshot(held.uncertainCheckout) : undefined };
        });
        if (!copies.length) return showToast('No archived recovery copies on this device.', 'info');
        download(`storeflow-recovery-copies-${store.accessCode}.json`, copies);
      }}>Download archived recovery copies</button>
      {pending && <>
        <button disabled={busy} className="underline" onClick={compare}>Compare device and cloud records</button>
        {choose}
      </>}
    </div>}
  </section>;
}
