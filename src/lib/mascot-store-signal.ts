import { StoreData } from '@/types/store';

/**
 * The little bit of store state the mascot actually reacts to.
 *
 * Mascot used to get this by calling loadStore() on a 5-second interval, in
 * every mounted instance, even when the live store had been handed to it as a
 * prop. loadStore is not a read: it re-parses the whole store record, runs
 * scheduled savings deductions, re-syncs product performance and writes the
 * store index back to localStorage. For a merchant whose record is several
 * megabytes, that is a multi-hundred-millisecond main-thread stall twelve
 * times a minute, per mascot — which is precisely the thread the animation
 * needs in order to look smooth.
 *
 * This reads the four fields directly, parses at most once a minute however
 * many mascots ask, and writes nothing.
 */

export interface MascotStoreSignal {
  openingTime: string | null;
  closingTime: string | null;
  managerEnabled: boolean;
  salesCount: number;
}

export const EMPTY_SIGNAL: MascotStoreSignal = {
  openingTime: null,
  closingTime: null,
  managerEnabled: true,
  salesCount: 0,
};

/** Opening hours change a few times a year; a minute of staleness is invisible. */
const CACHE_TTL_MS = 60_000;

let cached: { at: number; key: string; signal: MascotStoreSignal } | null = null;

/** Pulls the signal out of a store object already in memory — no parsing. */
export function signalFromStore(store: StoreData): MascotStoreSignal {
  return {
    openingTime: store.profile?.openingTime || null,
    closingTime: store.profile?.closingTime || null,
    managerEnabled: store.managerSettings?.enabled !== false,
    salesCount: Array.isArray(store.sales) ? store.sales.length : 0,
  };
}

/**
 * Reads the signal from storage for mascots that were not given a store.
 *
 * Shared across every instance and time-limited, so ten mascots on a screen
 * cost one parse a minute between them rather than two a second each.
 */
export function readStoreSignal(): MascotStoreSignal {
  if (typeof localStorage === 'undefined') return EMPTY_SIGNAL;

  try {
    const sessionRaw = localStorage.getItem('storeflow_session');
    if (!sessionRaw) return EMPTY_SIGNAL;
    const code = JSON.parse(sessionRaw)?.accessCode;
    if (!code) return EMPTY_SIGNAL;

    const key = `storeflow_${String(code).toUpperCase()}`;
    const now = Date.now();
    if (cached && cached.key === key && now - cached.at < CACHE_TTL_MS) {
      return cached.signal;
    }

    const raw = localStorage.getItem(key);
    if (!raw) return EMPTY_SIGNAL;

    // Deliberately not loadStore(): this must stay a read. loadStore mutates
    // and persists, which a decorative component has no business doing.
    const signal = signalFromStore(JSON.parse(raw) as StoreData);
    cached = { at: now, key, signal };
    return signal;
  } catch {
    return EMPTY_SIGNAL;
  }
}

/** Drops the cache so the next read is fresh — used when the app comes back. */
export function invalidateStoreSignal(): void {
  cached = null;
}
