import type { StoreData } from '@/types/store';
import { same, serializeStoreSync } from './store-sync-guard';
import { prepareStoreForMarketplacePublish } from './marketplace-publish';
import { generateStoreUrl } from './qr-code';

export const STORE_SYNC_EVENT = 'storeflow:sync-state';
export interface PendingStoreSync {
  base?: StoreData;
  next: StoreData;
  state: 'pending' | 'syncing' | 'conflict' | 'error';
  error?: string;
  uncertainCheckout?: StoreData;
}
const keyFor = (code: string) => `storeflow_sync_pending_${code}`;
const signal = (code: string, store?: StoreData) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STORE_SYNC_EVENT, { detail: { code, store } }));
};
export function getPendingStoreSync(code: string): PendingStoreSync | null {
  const raw = localStorage.getItem(keyFor(code));
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { throw new Error('The saved sync record is unreadable. Export a backup before recovery.'); }
}
function writePending(code: string, pending: PendingStoreSync) {
  localStorage.setItem(keyFor(code), JSON.stringify(pending));
  signal(code);
}
/** Only public application data crosses the network; local credentials stay local. */
export function cloudSnapshot(store: StoreData): Record<string, any> {
  const next: Record<string, any> = JSON.parse(JSON.stringify(prepareStoreForMarketplacePublish(store, store.marketplaceSettings || {})));
  for (const key of ['ownerPassword', 'owner_password', 'emergencyRecoveryKey', 'recoveryAnswer']) {
    delete next[key];
    if (next.managerSettings) delete next.managerSettings[key];
  }
  return next;
}
export function queueStoreSync(store: StoreData, base?: StoreData): void {
  const next = JSON.parse(JSON.stringify(store)) as StoreData;
  try {
    const held = getPendingStoreSync(store.accessCode);
    writePending(store.accessCode, { uncertainCheckout: held?.uncertainCheckout, base: held ? held.base : base, next, state: held?.state === 'conflict' ? 'conflict' : 'pending', error: held?.error });
  } catch (error) {
    // Never report a completed local checkout as failed after its primary save.
    void import('@/components/Toast').then(({ showToast }) => showToast('Saved on this device, but sync recovery storage is unavailable. Export a backup.', 'error'));
    return;
  }
  void retryStoreSync(store.accessCode);
}
export async function retryStoreSync(code: string): Promise<void> {
  return serializeStoreSync(code, async () => {
    const held = getPendingStoreSync(code);
    if (!held) return;
    if (held.uncertainCheckout) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) { writePending(code, { ...held, state: 'pending' }); return; }
    writePending(code, { ...held, state: 'syncing', error: undefined });
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session?.user) throw new Error('Sign in to your cloud account to sync these records.');
      const { data: existing, error: fetchError } = await supabase.from('stores').select('id').eq('access_code', code).maybeSingle();
      if (fetchError) throw fetchError;
      const next = cloudSnapshot(held.next);
      let remote: Record<string, any>;
      if (existing) {
        const { data, error } = await (supabase as any).rpc('commit_store_snapshot', {
          p_store_id: existing.id, p_base: held.base ? cloudSnapshot(held.base) : {}, p_next: next,
        });
        if (error) throw error;
        remote = data.data;
      } else {
        const { data: profile, error: profileError } = await supabase.from('profiles').select('id').eq('auth_user_id', session.user.id).single();
        if (profileError || !profile) throw profileError || new Error('Owner profile is missing.');
        const storeId = held.next.storeId || code;
        const { data, error } = await supabase.from('stores').insert({ owner_id: profile.id, access_code: code, store_id: storeId,
          business_name: held.next.storeName, business_type: held.next.storeType || held.next.category || 'retail',
          data: next as any, qr_code: generateStoreUrl(storeId), barcode: storeId,
        }).select('data').single();
        if (error) throw error;
        remote = data.data as Record<string, any>;
      }
      const latest = getPendingStoreSync(code);
      const localRaw = localStorage.getItem(`storeflow_${code}`);
      const local = localRaw ? JSON.parse(localRaw) : held.next;
      if (latest && same(latest.next, held.next) && (same(local, held.next) || same(local, held.base))) {
        const accepted = { ...held.next, ...remote } as StoreData;
        // Keep nested local-only credentials too.
        accepted.managerSettings = { ...held.next.managerSettings, ...remote.managerSettings };
        localStorage.setItem(`storeflow_${code}`, JSON.stringify(accepted));
        localStorage.removeItem(keyFor(code));
        signal(code, accepted);
      } else if (latest) {
        // The upload succeeded while a newer local edit was being made. Advance
        // only its base, never replace the newer local records.
        writePending(code, { ...latest, base: held.next, state: 'pending', error: undefined });
      }
    } catch (error: any) {
      const latest = getPendingStoreSync(code);
      if (latest) writePending(code, { ...latest, state: error?.code === '40001' || /another device|conflict/i.test(error?.message || '') ? 'conflict' : 'error', error: error?.message || 'Sync failed. Your records remain saved on this device.' });
    }
  });
}

/** Flush first so an order never commits over unsynced counter sales. */
export async function requireStoreSynced(code: string) {
  await retryStoreSync(code);
  const pending = getPendingStoreSync(code);
  if (pending) throw new Error(pending.error || 'Sync your saved records before changing this online order.');
}

export async function inspectStoreConflict(code: string) {
  const held = getPendingStoreSync(code);
  if (!held) return null;
  const { supabase } = await import('@/integrations/supabase/client');
  const { data, error } = await supabase.from('stores').select('data').eq('access_code', code).single();
  if (error) throw error;
  return { ...held, remote: data.data };
}

/** Explicit recovery only: retain the full local journal before switching copies. */
export async function useReviewedCloudCopy(code: string, reviewed: Awaited<ReturnType<typeof inspectStoreConflict>>): Promise<StoreData> {
  if (!reviewed) throw new Error('Load the comparison first.');
  return new Promise((resolve, reject) => {
    void serializeStoreSync(code, async () => {
      const current = getPendingStoreSync(code);
      if (!current || !same(current.next, reviewed.next)) throw new Error('Local records changed. Review the comparison again.');
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.from('stores').select('data').eq('access_code', code).single();
      if (error) throw error;
      if (!same(data.data, reviewed.remote)) throw new Error('Cloud records changed. Review the comparison again.');
      const latest = getPendingStoreSync(code);
      if (!latest || !same(latest.next, reviewed.next)) throw new Error('Local records changed. Review the comparison again.');
      // A quota error aborts recovery: never discard a copy that could not be retained.
      localStorage.setItem(`storeflow_sync_archive_${code}_${Date.now()}`, JSON.stringify(latest));
      const remote = data.data as unknown as StoreData;
      const accepted = { ...latest.next, ...remote, managerSettings: { ...latest.next.managerSettings, ...remote.managerSettings } };
      localStorage.setItem(`storeflow_${code}`, JSON.stringify(accepted));
      localStorage.removeItem(keyFor(code));
      signal(code, accepted);
      resolve(accepted);
    }).catch(reject);
  });
}

export async function refreshStoreFromCloud(code: string): Promise<void> {
  return serializeStoreSync(code, async () => {
    if (getPendingStoreSync(code)) throw new Error('Resolve pending sync before refreshing cloud records.');
    const before = localStorage.getItem(`storeflow_${code}`);
    if (!before) return;
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.from('stores').select('data').eq('access_code', code).single();
    if (error) throw error;
    if (getPendingStoreSync(code) || localStorage.getItem(`storeflow_${code}`) !== before) throw new Error('Local records changed during refresh. Try again after syncing.');
    const local = JSON.parse(before), remote = data.data as unknown as StoreData;
    const accepted = { ...local, ...remote, managerSettings: { ...local.managerSettings, ...remote.managerSettings } };
    localStorage.setItem(`storeflow_${code}`, JSON.stringify(accepted));
    signal(code, accepted);
  });
}
