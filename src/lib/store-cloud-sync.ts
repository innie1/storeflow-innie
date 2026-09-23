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
  /**
   * There is no cloud account on this device to send these to.
   *
   * Not a failure and not the shop's problem: most shops run entirely on the
   * phone in the drawer. Records stay saved and stay ready, and nothing about
   * them is reported as wrong or allowed to stand in front of a sale.
   */
  awaitingAccount?: boolean;
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
/** Shops already told, this visit, that the cloud copy could not be kept. */
const toldNoRoom = new Set<string>();
export function queueStoreSync(store: StoreData, base?: StoreData): void {
  const next = JSON.parse(JSON.stringify(store)) as StoreData;
  try {
    const held = getPendingStoreSync(store.accessCode);
    writePending(store.accessCode, { uncertainCheckout: held?.uncertainCheckout, base: held ? held.base : base, next, state: held?.state === 'conflict' ? 'conflict' : 'pending', error: held?.error });
  } catch (error) {
    /*
     * The shop itself is already saved; only the spare copy kept for the cloud
     * could not be written. This was a red "sync recovery storage is
     * unavailable" on every single save, which read as the app failing when
     * nothing the shop did had been lost. Now it is said once per shop per
     * visit, quietly, in words a shopkeeper can follow.
     */
    if (!toldNoRoom.has(store.accessCode)) {
      toldNoRoom.add(store.accessCode);
      void import('@/components/Toast').then(({ showToast }) => showToast('Saved on this phone. The copy for the cloud could not be kept — phone storage may be full.', 'quiet', 5000));
    }
    return;
  }
  void retryStoreSync(store.accessCode);
}
export async function retryStoreSync(code: string): Promise<void> {
  return serializeStoreSync(code, async () => {
    const held = getPendingStoreSync(code);
    if (!held) return;
    if (held.uncertainCheckout) return;
    /*
     * A conflict is settled by somebody comparing the two copies, never by
     * sending the same proposal again. Retrying one would also rewrite its
     * state and lose the reason it is being held - which is exactly what made
     * a refused change quietly look like an ordinary unsent record.
     */
    if (held.state === 'conflict') return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) { writePending(code, { ...held, state: 'pending' }); return; }
    writePending(code, { ...held, state: 'syncing', error: undefined });
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError || !session?.user) {
        // Nothing is wrong here. There is simply nowhere to send them yet.
        writePending(code, { ...held, state: 'pending', awaitingAccount: true, error: undefined });
        return;
      }
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
      // It reached the cloud, so whatever this record said about waiting for an
      // account is out of date.
      if (latest?.awaitingAccount) writePending(code, { ...latest, awaitingAccount: false });
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
      if (latest) writePending(code, { ...latest, awaitingAccount: false, state: error?.code === '40001' || /another device|conflict/i.test(error?.message || '') ? 'conflict' : 'error', error: error?.message || 'Sync failed. Your records remain saved on this device.' });
    }
  });
}

/** Flush first so an order never commits over unsynced counter sales. */
/**
 * What must be settled before this device may commit to the cloud.
 *
 * Only a real disagreement: the cloud refused a change, or a sale went out
 * and its answer was lost so the same money may already be recorded there.
 * Records that are merely waiting to be sent - the ordinary state of a shop
 * with no cloud account, or one whose signal comes and goes - are not a
 * reason to stop anybody working. A till that refuses to sell until a phone
 * can reach a server is worse than a stock figure that settles a minute late,
 * which is the bargain the laundry's intake has always made.
 */
export async function requireStoreSynced(code: string) {
  await retryStoreSync(code);
  const pending = getPendingStoreSync(code);
  if (pending && (pending.state === 'conflict' || pending.uncertainCheckout)) {
    throw new Error(pending.error || 'Review your saved records before changing this online order.');
  }
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
export async function adoptReviewedCloudCopy(code: string, reviewed: Awaited<ReturnType<typeof inspectStoreConflict>>): Promise<StoreData> {
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
