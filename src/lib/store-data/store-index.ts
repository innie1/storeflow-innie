import { StoreData } from '@/types/store';
import { STORE_PREFIX } from './keys';
import { shopStorage } from '@/lib/shop-storage';

export const STORE_INDEX_KEY = 'storeflow_index';

export interface StoreIndexEntry {
  code: string;
  name: string;
  createdAt: string;
  /**
   * What trade this shop is.
   *
   * The index held a name and a code, so the switcher showed the same generic
   * shop icon for every one of them. Somebody running a laundry, a barber shop
   * and a restaurant off one phone had nothing to tell the three apart except
   * whether they remembered which name went with which trade.
   */
  businessType?: string;
}

/** The trade, from wherever this store happens to record it. */
export function resolveIndexBusinessType(store: Partial<StoreData>): string | undefined {
  // businessType is not on StoreData, but some records carry it, so it is read
  // first and the declared fields are the fallback.
  const value = String((store as any).businessType || store.storeType || store.category || '').trim();
  return value || undefined;
}

/**
 * Fill in the trade for entries written before it was recorded.
 *
 * The stores are already on this device, so this is a local read rather than
 * anything that costs a request, and it means an existing merchant does not
 * have to re-add a shop to see what it is.
 */
export function backfillStoreIndexTypes(): StoreIndexEntry[] {
  const index = getStoreIndex();
  let changed = false;

  const filled = index.map(entry => {
    if (entry.businessType) return entry;
    const store = loadStoreQuietly(entry.code);
    const businessType = store ? resolveIndexBusinessType(store) : undefined;
    if (!businessType) return entry;
    changed = true;
    return { ...entry, businessType };
  });

  if (changed) {
    try { localStorage.setItem(STORE_INDEX_KEY, JSON.stringify(filled)); } catch { /* private mode */ }
  }
  return filled;
}

/** A read that must never mutate or persist: loadStore does both. */
export function loadStoreQuietly(code: string): StoreData | null {
  try {
    const raw = shopStorage.getItem(`${STORE_PREFIX}${String(code || '').toUpperCase()}`);
    return raw ? JSON.parse(raw) as StoreData : null;
  } catch {
    return null;
  }
}

export function getStoreIndex(): StoreIndexEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_INDEX_KEY) || '[]');
  } catch {
    return [];
  }
}

export function upsertStoreIndex(store: StoreData) {
  // A worker's slim copy is not a shop on this phone's list: it opens only
  // through the worker's own sign-in.
  if (store.staffDevice) return;
  const idx = getStoreIndex().filter(s => s.code !== store.accessCode);
  idx.unshift({
    code: store.accessCode,
    name: store.storeName,
    createdAt: store.createdAt,
    businessType: resolveIndexBusinessType(store),
  });
  localStorage.setItem(STORE_INDEX_KEY, JSON.stringify(idx));
}

export function removeStoreFromIndex(code: string) {
  const idx = getStoreIndex().filter(s => s.code !== code);
  localStorage.setItem(STORE_INDEX_KEY, JSON.stringify(idx));
  shopStorage.removeItem(STORE_PREFIX + code);
}
