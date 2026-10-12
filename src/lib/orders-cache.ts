/**
 * The owner's phone keeps its own copy of the shop's orders.
 *
 * Every open used to download every order the shop had ever had, finished
 * ones included - 58 kB for a small laundry today, and on the way to 15 MB
 * an open after a year of ordinary trade, which the free plan's outgoing-data
 * allowance cannot carry. Now the phone shows its saved copy straight away
 * and asks the cloud only for orders new or changed since its last look; an
 * order counts as changed when its items do too
 * (supabase/migrations/20261012215712_orders_changed_since).
 *
 * "Since" is the newest updated_at the cloud itself sent, never this phone's
 * clock, and it moves only on a download - so anything that changed while
 * the app was open (a live update, a status this phone set) is fetched again,
 * whole, at the next open. Once a week the phone downloads everything again,
 * which catches anything it could otherwise have missed.
 *
 * Without IndexedDB (a private window, an old browser) there is no saved
 * copy, and every open downloads everything - exactly as before.
 */

const DB_NAME = 'storeflow_orders_cache';
const DB_VERSION = 1;
const STORE_NAME = 'shops';

export const FULL_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

export interface OrdersCache {
  storeId: string;
  orders: any[];
  /** The newest updated_at among orders the cloud has sent. */
  watermark: string | null;
  /** When everything was last downloaded. */
  fullAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'storeId' });
    };
  });
}

export async function readOrdersCache(storeId: string): Promise<OrdersCache | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    const db = await open();
    return await new Promise(resolve => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(storeId);
      request.onsuccess = () => resolve((request.result as OrdersCache) || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function writeOrdersCache(entry: OrdersCache): Promise<void> {
  try {
    if (typeof indexedDB === 'undefined') return;
    const db = await open();
    await new Promise<void>(resolve => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch { /* no saved copy this time; the next open downloads */ }
}

/** One list, newest first: what changed replaces what was there. */
export function mergeOrders(base: any[], changed: any[]): any[] {
  const byId = new Map<string, any>();
  for (const order of base || []) if (order?.id) byId.set(String(order.id), order);
  for (const order of changed || []) if (order?.id) byId.set(String(order.id), order);
  return [...byId.values()].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

/** The newest updated_at the cloud sent - kept as its own string, to the microsecond. */
export function newestUpdate(rows: any[], previous: string | null): string | null {
  let newest = previous;
  let newestMs = previous ? Date.parse(previous) : -Infinity;
  for (const row of rows || []) {
    const value = row?.updated_at ? String(row.updated_at) : '';
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && (ms > newestMs || (ms === newestMs && value > String(newest)))) {
      newest = value;
      newestMs = ms;
    }
  }
  return newest;
}

export interface OrderFetchers {
  /** Every order the shop has. */
  all: () => Promise<any[]>;
  /** Orders with updated_at at or after this (the cloud's own value). */
  since: (watermark: string) => Promise<any[]>;
}

export interface LoadedOrders {
  orders: any[];
  /** True when everything was downloaded, so the list replaces what is shown. */
  full: boolean;
  /** How many orders came down the wire. */
  downloaded: number;
}

/**
 * The shop's orders: the saved copy brought up to date with only what
 * changed, or everything when there is no copy or it is a week old.
 * Throws when the cloud cannot be reached, as the old download did.
 */
export async function loadStoreOrders(
  storeId: string,
  fetchers: OrderFetchers,
  now: Date = new Date(),
  storage: { read: typeof readOrdersCache; write: typeof writeOrdersCache } = { read: readOrdersCache, write: writeOrdersCache },
): Promise<LoadedOrders> {
  const cache = await storage.read(storeId);
  const stale = !cache || !cache.watermark || now.getTime() - Date.parse(cache.fullAt) > FULL_REFRESH_MS;
  if (stale) {
    const rows = await fetchers.all();
    const orders = mergeOrders([], rows);
    await storage.write({ storeId, orders, watermark: newestUpdate(rows, null), fullAt: now.toISOString() });
    return { orders, full: true, downloaded: rows.length };
  }
  const rows = await fetchers.since(cache.watermark!);
  const orders = mergeOrders(cache.orders, rows);
  await storage.write({ storeId, orders, watermark: newestUpdate(rows, cache.watermark), fullAt: cache.fullAt });
  return { orders, full: false, downloaded: rows.length };
}
