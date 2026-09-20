import { useEffect, useMemo, useState } from 'react';
import type { StoreData } from '@/types/store';
import { cloudSnapshot, getPendingStoreSync, inspectStoreConflict, retryStoreSync, refreshStoreFromCloud, STORE_SYNC_EVENT, useReviewedCloudCopy } from '@/lib/store-cloud-sync';
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
    update(); retry();
    window.addEventListener(STORE_SYNC_EVENT, update);
    window.addEventListener('storage', update);
    window.addEventListener('online', retry);
    const interval = window.setInterval(retry, 30_000);
    return () => { window.removeEventListener(STORE_SYNC_EVENT, update); window.removeEventListener('storage', update); window.removeEventListener('online', retry); window.clearInterval(interval); };
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
  if (!unsent && !owner) return null;
  return <section className="rounded-xl border border-border bg-card p-3 text-sm space-y-2" aria-label="Store sync and record checks">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span role="status">{unsent ? unsent.state === 'syncing' ? 'Syncing saved records…' : unsent.state === 'conflict' ? 'Sync needs review — saved on this device' : 'Records waiting to sync — saved on this device' : 'No records waiting to sync'}</span>
      <div className="flex gap-3">{!unsent && owner && (store.storeId || store.managerSettings?.multiDeviceSync) && <button disabled={busy} onClick={() => void act(() => refreshStoreFromCloud(store.accessCode))}>Refresh cloud records</button>}{unsent && <button disabled={busy || unsent.state === 'syncing'} onClick={() => void act(() => retryStoreSync(store.accessCode))}>Retry sync</button>}{owner && <button onClick={() => setOpen(v => !v)}>{open ? 'Close checks' : 'Check records'}</button>}</div>
    </div>
    {unsent?.error && <p className="text-muted-foreground">{unsent.error}</p>}
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
        <button disabled={busy} className="underline" onClick={() => void act(async () => { setReview(await inspectStoreConflict(store.accessCode)); setAcknowledged(false); })}>Compare device and cloud records</button>
        {review && <div className="space-y-3 border rounded p-3">
          <table className="w-full text-left"><caption>Records saved on each copy</caption><thead><tr><th>Record</th><th>This device</th><th>Cloud</th></tr></thead><tbody>{['products','sales','pendingPayments'].map(field => <tr key={field}><td>{field === 'pendingPayments' ? 'Debt invoices' : field === 'sales' ? 'Sales' : 'Products'}</td><td>{((review.next as any)[field] || []).length}</td><td>{((review.remote as any)?.[field] || []).length}</td></tr>)}</tbody></table>
          <button className="underline" onClick={() => download(`storeflow-sync-review-${store.accessCode}.json`, { base: review.base ? cloudSnapshot(review.base) : null, device: cloudSnapshot(review.next), cloud: review.remote, uncertainCheckout: review.uncertainCheckout ? cloudSnapshot(review.uncertainCheckout) : undefined })}>Download both copies for review</button>
          <p>Using the cloud copy removes unuploaded changes from the active device records. A recovery copy is retained on this device.</p>
          <label className="flex gap-2"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />I have reviewed the differences and want to use the cloud copy.</label>
          <button disabled={!acknowledged || busy} className="border rounded p-2 disabled:opacity-50" onClick={() => void act(async () => { await useReviewedCloudCopy(store.accessCode, review); setReview(null); setAcknowledged(false); })}>Keep recovery copy and use cloud records</button>
        </div>}
      </>}
    </div>}
  </section>;
}
