import type { StoreData } from '@/types/store';
import { recordCheckout } from './store-data';
import { cloudSnapshot, markStoreInCloud, requireStoreSynced, queueStoreSync, refreshStoreFromCloud, STORE_SYNC_EVENT } from './store-cloud-sync';
import { money, salePrice } from './inventory-sale-math';
import { FINANCIAL_FIELDS, same, serializeStoreSync } from './store-sync-guard';

const committing = new Set<string>();
type Items = Parameters<typeof recordCheckout>[1];
type Options = Parameters<typeof recordCheckout>[2];
/** Online sales are confirmed by the server before publishing the receipt. */
export async function commitCheckout(store: StoreData, items: Items, options: Options, baseStore = store): Promise<ReturnType<typeof recordCheckout>> {
  const failure = (error: string): ReturnType<typeof recordCheckout> => ({ store, sales: [], error, subtotal: 0, total: 0, discount: 0, paid: 0, balance: 0 });
  if (committing.has(store.accessCode)) return failure('A sale is already being saved. Please wait.');
  const connectedStore = !!(store.storeId || store.managerSettings?.multiDeviceSync);
  if (!connectedStore || !navigator.onLine) return recordCheckout(store, items, options);
  committing.add(store.accessCode);
  try {
    await requireStoreSynced(store.accessCode);
    return await serializeStoreSync(store.accessCode, async () => {
    const raw = localStorage.getItem('storeflow_' + store.accessCode);
    const current = raw ? JSON.parse(raw) : baseStore;
    if (FINANCIAL_FIELDS.some(k => !same(current[k], baseStore[k]))) return failure('Stock or payments changed. Refresh your cart before saving.');
    const result = recordCheckout(store, items, { ...options, deferSave: true });
    if (result.error) return result;
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: row, error: lookupError } = await supabase.from('stores').select('id').eq('access_code', store.accessCode).maybeSingle();
    if (lookupError || !row) {
      /*
       * This device cannot commit for this shop - no cloud account signed in,
       * no row of its own yet, or no permission to read one. None of that is a
       * reason to refuse a customer. The sale is written down here and mirrored
       * when there is somewhere to mirror it to, which is exactly what the
       * laundry does with a bundle.
       */
      localStorage.setItem('storeflow_' + store.accessCode, JSON.stringify(result.store));
      queueStoreSync(result.store, baseStore);
      return result;
    }
    markStoreInCloud(store.accessCode);
    // A durable journal covers a closed tab or lost response. Until accepted it
    // is visibly pending, and retries submit the same IDs and complete snapshot.
    // It is the one copy kept beside the shop: the shop does not hold this sale yet.
    const journal = { base: baseStore, journal: result.store, state: 'syncing' };
    localStorage.setItem('storeflow_sync_pending_' + store.accessCode, JSON.stringify(journal));
    window.dispatchEvent(new CustomEvent(STORE_SYNC_EVENT, { detail: { code: store.accessCode } }));
    const { data, error } = await (supabase as any).rpc('commit_store_snapshot', {
      p_store_id: row.id, p_base: cloudSnapshot(baseStore), p_next: cloudSnapshot(result.store),
    }).catch((error: any) => ({ data: null, error: { message: error.message } }));
    if (error) {
      // A definite database rejection has no side effects. Unknown network
      // outcomes retain the exact proposal for idempotent recovery.
      if (error.code && !['PGRST000','PGRST001','PGRST002'].includes(error.code)) {
        const held = JSON.parse(localStorage.getItem('storeflow_sync_pending_' + store.accessCode) || 'null');
        if (same(held?.journal ?? held?.next, result.store)) localStorage.removeItem('storeflow_sync_pending_' + store.accessCode);
        window.dispatchEvent(new CustomEvent(STORE_SYNC_EVENT, { detail: { code: store.accessCode } }));
        if (error.code === '40001') void refreshStoreFromCloud(store.accessCode).catch(() => {});
        return failure(error.message || 'Sale rejected. Nothing was sold.');
      }
      const live = JSON.parse(localStorage.getItem('storeflow_' + store.accessCode) || 'null');
      if (live && !same(live, current)) {
        localStorage.setItem('storeflow_sync_pending_' + store.accessCode, JSON.stringify({ base: baseStore, uncertainCheckout: result.store, state: 'conflict', error: 'The sale response was lost while another edit was made. Both copies are kept. Review cloud records before retrying this sale.' }));
        window.dispatchEvent(new CustomEvent(STORE_SYNC_EVENT, { detail: { code: store.accessCode } }));
        return failure('Sale status is uncertain. Review the saved sync copies before trying again.');
      }
      localStorage.setItem('storeflow_' + store.accessCode, JSON.stringify(result.store));
      queueStoreSync(result.store, baseStore);
      return result;
    }
    const latestRaw = localStorage.getItem('storeflow_' + store.accessCode);
    if (latestRaw && !same(JSON.parse(latestRaw), current) && !same(JSON.parse(latestRaw), result.store)) {
      // A newer local edit still uses the old base. Keep it active and require
      // review against the now-committed sale; never silently overwrite it.
      const latest = JSON.parse(latestRaw);
      localStorage.setItem('storeflow_sync_pending_' + store.accessCode, JSON.stringify({ base: baseStore, state: 'conflict', error: 'The sale was saved online while another local edit was made. Compare both copies before continuing.' }));
      window.dispatchEvent(new CustomEvent(STORE_SYNC_EVENT, { detail: { code: store.accessCode } }));
      return { ...result, store: latest };
    }
    const accepted = { ...result.store, ...data.data, managerSettings: { ...result.store.managerSettings, ...data.data.managerSettings } };
    localStorage.setItem('storeflow_' + store.accessCode, JSON.stringify(accepted));
    localStorage.removeItem('storeflow_sync_pending_' + store.accessCode);
    window.dispatchEvent(new CustomEvent(STORE_SYNC_EVENT, { detail: { code: store.accessCode, store: accepted } }));
    return { ...result, store: accepted };
    });
  } catch (error: any) {
    return failure(error.message || 'Sale could not be confirmed. Check sync status before retrying.');
  } finally { committing.delete(store.accessCode); }
}
export async function commitCashCheckout(store: StoreData, items: Items, actorName?: string, actorRole?: string, baseStore = store) {
  const total = money(items.reduce((sum, item) => { const p = store.products.find(p => p.id === item.productId); return sum + (p ? money(salePrice(p, item.saleType) * item.quantity) : 0); }, 0));
  return commitCheckout(store, items, { paid: total, method: 'cash', actorName, actorRole }, baseStore);
}
