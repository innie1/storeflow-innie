/**
 * Where the shop's records are kept on the phone.
 *
 * Everything lived in the browser's small key-value store, which holds about
 * five megabytes for the whole app. A shop's records are one entry in it, and
 * a shop that syncs to the cloud keeps a second full copy beside it while a
 * sync is pending, so a busy shop reached the limit within months. Past it,
 * every save failed: the sale was not kept.
 *
 * The phone has a second, far larger store (IndexedDB). Reading it takes a
 * moment, and the whole app reads its records at once, without waiting - so
 * it could not simply be swapped in. This sits between the two:
 *
 *  - While an entry fits in the small store it stays there, written at once
 *    exactly as before. A shop under the limit sees no change at all.
 *  - The first time the small store refuses an entry for lack of room, that
 *    entry moves to the large store for good. It is read from memory, which
 *    is filled from the large store before the app draws anything, and each
 *    change is written through to the large store as it is made.
 *
 * An entry is only ever in one of the two. Once moved it never goes back to
 * the small store - a removed entry leaves an empty marker behind in the
 * large store - so there is never a question of which copy is newer.
 */

/** The large store, as little of it as this needs. */
export interface SpillBackend {
  /** Every entry, a null value being one that was moved here and then removed. */
  all(): Promise<[string, string | null][]>;
  put(key: string, value: string | null): Promise<void>;
}

const MARKER_KEY = 'storeflow_spilled_keys';
const CHANNEL_NAME = 'storeflow-shop-storage';
const HYDRATE_TIMEOUT_MS = 6000;

type State = 'not-ready' | 'ready' | 'unavailable';

let backend: SpillBackend | null = null;
let state: State = 'not-ready';
/** Entries living in the large store, as last read or written. */
const moved = new Map<string, string>();
/** Every key that has ever moved, including ones since removed. */
const sticky = new Set<string>();
/** The newest write per key, so an older one finishing late changes nothing. */
const writeTurn = new Map<string, number>();
let onWriteFailure: ((key: string, error: unknown) => void) | null = null;
let channel: BroadcastChannel | null = null;

const small = (): Storage | null => (typeof localStorage !== 'undefined' ? localStorage : null);

export function isStorageFullError(error: unknown): boolean {
  const e = error as { name?: string; code?: number } | null;
  if (!e) return false;
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014;
}

function readMarkers(): string[] {
  try {
    const raw = small()?.getItem(MARKER_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** A note in the small store of what has moved, for a day the large one will not open. */
function writeMarkers(): void {
  try { small()?.setItem(MARKER_KEY, JSON.stringify([...moved.keys()])); } catch { /* no room for a note; the entries themselves are safe */ }
}

function tell(key: string, value: string | null): void {
  try { channel?.postMessage({ key, value }); } catch { /* another tab simply reads it on its next start */ }
}

/** Write one entry through to the large store, and clear the small store's old copy once it is safe. */
function writeThrough(key: string, value: string | null): void {
  const turn = (writeTurn.get(key) || 0) + 1;
  writeTurn.set(key, turn);
  if (!backend) return;
  backend.put(key, value).then(() => {
    // Only now is the small store's copy surplus: until the large store has
    // the entry, that older copy is the one a sudden close would fall back on.
    try { small()?.removeItem(key); } catch { /* it is skipped on the next start instead */ }
    if (writeTurn.get(key) === turn) writeMarkers();
  }).catch(error => {
    if (writeTurn.get(key) === turn) onWriteFailure?.(key, error);
  });
}

function move(key: string, value: string): void {
  const first = !sticky.has(key);
  sticky.add(key);
  moved.set(key, value);
  writeThrough(key, value);
  tell(key, value);
  // Ask the browser not to clear this app's data when the phone runs low.
  // It may say no; nothing here depends on the answer.
  if (first) { try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* not offered */ } }
}

export const shopStorage = {
  getItem(key: string): string | null {
    if (sticky.has(key)) return moved.has(key) ? moved.get(key)! : null;
    return small()?.getItem(key) ?? null;
  },

  setItem(key: string, value: string): void {
    if (sticky.has(key)) { move(key, value); return; }
    const store = small();
    if (!store) return;
    try {
      store.setItem(key, value);
    } catch (error) {
      // With nowhere larger to put it, this is the failure it always was.
      if (!isStorageFullError(error) || state !== 'ready' || !backend) throw error;
      move(key, value);
    }
  },

  removeItem(key: string): void {
    if (sticky.has(key)) {
      if (!moved.has(key)) return;
      moved.delete(key);
      writeThrough(key, null);
      tell(key, null);
      return;
    }
    small()?.removeItem(key);
  },

  /** Every key held, in either store. */
  keys(): string[] {
    const store = small();
    const keys = new Set<string>(moved.keys());
    if (store) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (key && key !== MARKER_KEY && !sticky.has(key)) keys.add(key);
      }
    }
    return [...keys];
  },

  /** Whether this entry has moved to the large store. */
  hasMoved(key: string): boolean {
    return sticky.has(key);
  },
};

/**
 * Fill memory from the large store. Awaited before the app draws, so that a
 * shop whose records have moved is there the first time anything asks.
 */
export async function hydrateShopStorage(use?: SpillBackend | null): Promise<State> {
  backend = use === undefined ? openIndexedDbBackend() : use;
  moved.clear();
  sticky.clear();
  writeTurn.clear();
  if (!backend) { state = 'unavailable'; return state; }
  try {
    // A store that never answers is treated as one that would not open,
    // rather than leaving the app on a blank screen for good.
    const entries = await Promise.race([
      backend.all(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('The storage did not answer.')), HYDRATE_TIMEOUT_MS)),
    ]);
    for (const [key, value] of entries) {
      sticky.add(key);
      if (value !== null) moved.set(key, value);
      // A copy still in the small store is from before the move finished.
      try { small()?.removeItem(key); } catch { /* skipped by getItem either way */ }
    }
    state = 'ready';
    if (entries.length) writeMarkers();
    listenToOtherTabs();
  } catch {
    state = 'unavailable';
    backend = null;
  }
  return state;
}

/**
 * Records were moved to the large store on an earlier day and it cannot be
 * opened now. Carrying on would show the shop as empty and let new records be
 * written over where the real ones are, so the app stops and says so instead.
 */
export function shopStorageBlocked(): boolean {
  return state === 'unavailable' && readMarkers().length > 0;
}

/** Called when a change could not be written to the large store. */
export function onShopStorageWriteFailure(handler: (key: string, error: unknown) => void): void {
  onWriteFailure = handler;
}

function listenToOtherTabs(): void {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = event => {
      const { key, value } = (event.data || {}) as { key?: string; value?: string | null };
      if (typeof key !== 'string') return;
      sticky.add(key);
      if (typeof value === 'string') moved.set(key, value);
      else moved.delete(key);
    };
  } catch {
    channel = null;
  }
}

// ─── The large store itself ───────────────────────────────────────────────────

const DB_NAME = 'storeflow_shop_storage';
const TABLE = 'entries';

function openIndexedDbBackend(): SpillBackend | null {
  if (typeof indexedDB === 'undefined') return null;
  let opening: Promise<IDBDatabase> | null = null;
  const open = () => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(TABLE)) request.result.createObjectStore(TABLE, { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('The storage is in use by an older copy of the app.'));
    });
    // A failed open is tried again on the next call rather than remembered.
    opening.catch(() => { opening = null; });
    return opening;
  };
  return {
    async all() {
      const db = await open();
      return new Promise((resolve, reject) => {
        const request = db.transaction(TABLE, 'readonly').objectStore(TABLE).getAll();
        request.onsuccess = () => resolve((request.result as { key: string; value: string | null }[]).map(row => [row.key, row.value ?? null]));
        request.onerror = () => reject(request.error);
      });
    },
    async put(key, value) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(TABLE, 'readwrite');
        tx.objectStore(TABLE).put({ key, value });
        // Resolved when the write is committed, not merely asked for.
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('The write was cancelled.'));
      });
    },
  };
}
