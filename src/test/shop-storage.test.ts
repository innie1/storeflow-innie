import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';
import {
  hydrateShopStorage,
  onShopStorageWriteFailure,
  shopStorage,
  shopStorageBlocked,
  type SpillBackend,
} from '@/lib/shop-storage';
import { loadStore, saveStore } from '@/lib/store-data';
import { compileBackupPayload } from '@/lib/backup-system';

/*
 * The shop's records outgrowing the phone's small store.
 *
 * The small store here is given a real limit, and the large one is a stand-in
 * that keeps what it is handed - so "restarting the app" is hydrating again
 * from the same stand-in, with memory empty.
 */

const LIMIT = 2_000;

/** A small store that refuses, like a phone's, once it is full. */
function limitSmallStore(limit = LIMIT) {
  // A real Storage keeps its methods on the prototype (assigning one on the
  // object would store a key called "setItem"); the stand-in keeps its own.
  const real = typeof Storage !== 'undefined' && localStorage instanceof Storage;
  const owner = (real ? Storage.prototype : localStorage) as Storage;
  const original = owner.setItem;
  return vi.spyOn(owner, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
    const store = real ? this : localStorage;
    let used = 0;
    for (let i = 0; i < store.length; i++) {
      const held = store.key(i)!;
      if (held !== key) used += (store.getItem(held) || '').length;
    }
    if (used + String(value).length > limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    original.call(store, key, value);
  });
}

function largeStore(failing = false) {
  const held = new Map<string, string | null>();
  const backend: SpillBackend = {
    all: async () => [...held.entries()],
    put: async (key, value) => {
      if (failing) throw new Error('disk full');
      held.set(key, value);
    },
  };
  return { held, backend };
}

/** Let the writes to the large store finish. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

const big = (fill: string) => fill.repeat(LIMIT + 1);

beforeEach(() => {
  localStorage.clear();
  onShopStorageWriteFailure(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('while everything fits', () => {
  it('keeps records in the small store exactly as before', async () => {
    const { held, backend } = largeStore();
    await hydrateShopStorage(backend);
    limitSmallStore();

    shopStorage.setItem('storeflow_AAA111', 'small');
    expect(localStorage.getItem('storeflow_AAA111')).toBe('small');
    expect(shopStorage.getItem('storeflow_AAA111')).toBe('small');
    expect(shopStorage.hasMoved('storeflow_AAA111')).toBe(false);
    await settle();
    expect(held.size).toBe(0);
  });

  it('reads what other code wrote straight to the small store', async () => {
    await hydrateShopStorage(largeStore().backend);
    localStorage.setItem('storeflow_AAA111', 'written directly');
    expect(shopStorage.getItem('storeflow_AAA111')).toBe('written directly');
  });
});

describe('when the small store is full', () => {
  it('moves the entry to the large store instead of failing the save', async () => {
    const { held, backend } = largeStore();
    await hydrateShopStorage(backend);
    shopStorage.setItem('storeflow_AAA111', 'first');
    limitSmallStore();

    expect(() => shopStorage.setItem('storeflow_AAA111', big('x'))).not.toThrow();
    expect(shopStorage.getItem('storeflow_AAA111')).toBe(big('x'));
    expect(shopStorage.hasMoved('storeflow_AAA111')).toBe(true);

    await settle();
    expect(held.get('storeflow_AAA111')).toBe(big('x'));
    // The old copy is cleared once the new one is safely kept, freeing the room.
    expect(localStorage.getItem('storeflow_AAA111')).toBeNull();
  });

  it('keeps the old copy until the new one is safely written', async () => {
    const { backend } = largeStore();
    await hydrateShopStorage(backend);
    shopStorage.setItem('storeflow_AAA111', 'first');
    limitSmallStore();

    shopStorage.setItem('storeflow_AAA111', big('x'));
    // Not yet committed: a sudden close now still finds the last good copy.
    expect(localStorage.getItem('storeflow_AAA111')).toBe('first');
  });

  it('is still there after the app is closed and opened again', async () => {
    const { backend } = largeStore();
    await hydrateShopStorage(backend);
    limitSmallStore();
    shopStorage.setItem('storeflow_AAA111', big('x'));
    shopStorage.setItem('storeflow_AAA111', big('y'));
    await settle();

    await hydrateShopStorage(backend);
    expect(shopStorage.getItem('storeflow_AAA111')).toBe(big('y'));
    expect(shopStorage.keys()).toContain('storeflow_AAA111');
  });

  it('never goes back to the small store, so the two can never disagree', async () => {
    const { held, backend } = largeStore();
    await hydrateShopStorage(backend);
    limitSmallStore();
    shopStorage.setItem('storeflow_sync_pending_AAA111', big('x'));
    await settle();

    // Removed, then written again small enough to fit the small store.
    shopStorage.removeItem('storeflow_sync_pending_AAA111');
    expect(shopStorage.getItem('storeflow_sync_pending_AAA111')).toBeNull();
    shopStorage.setItem('storeflow_sync_pending_AAA111', 'tiny');
    await settle();

    expect(localStorage.getItem('storeflow_sync_pending_AAA111')).toBeNull();
    expect(held.get('storeflow_sync_pending_AAA111')).toBe('tiny');

    await hydrateShopStorage(backend);
    expect(shopStorage.getItem('storeflow_sync_pending_AAA111')).toBe('tiny');
  });

  it('stays removed after a restart', async () => {
    const { backend } = largeStore();
    await hydrateShopStorage(backend);
    limitSmallStore();
    shopStorage.setItem('storeflow_AAA111', big('x'));
    await settle();
    shopStorage.removeItem('storeflow_AAA111');
    await settle();

    await hydrateShopStorage(backend);
    expect(shopStorage.getItem('storeflow_AAA111')).toBeNull();
    expect(shopStorage.keys()).not.toContain('storeflow_AAA111');
  });

  it('clears a stale small-store copy left by a close mid-move', async () => {
    const { held, backend } = largeStore();
    held.set('storeflow_AAA111', 'newer, in the large store');
    localStorage.setItem('storeflow_AAA111', 'older, left behind');

    await hydrateShopStorage(backend);
    expect(shopStorage.getItem('storeflow_AAA111')).toBe('newer, in the large store');
    expect(localStorage.getItem('storeflow_AAA111')).toBeNull();
  });
});

describe('when there is nowhere larger', () => {
  it('fails the save as it always did, so the shopkeeper is told', async () => {
    await hydrateShopStorage(null);
    limitSmallStore();
    expect(() => shopStorage.setItem('storeflow_AAA111', big('x'))).toThrow(/quota/i);
  });

  it('says so when the large store cannot keep a change', async () => {
    const failed = vi.fn();
    onShopStorageWriteFailure(failed);
    await hydrateShopStorage(largeStore(true).backend);
    limitSmallStore();

    shopStorage.setItem('storeflow_AAA111', big('x'));
    await settle();
    expect(failed).toHaveBeenCalledWith('storeflow_AAA111', expect.any(Error));
    // Still readable for the rest of the visit.
    expect(shopStorage.getItem('storeflow_AAA111')).toBe(big('x'));
  });

  it('stops the app rather than show an empty shop when moved records cannot be read', async () => {
    const { backend } = largeStore();
    await hydrateShopStorage(backend);
    limitSmallStore();
    shopStorage.setItem('storeflow_AAA111', big('x'));
    await settle();
    expect(shopStorageBlocked()).toBe(false);

    // The next start: the large store will not open.
    await hydrateShopStorage({ all: async () => { throw new Error('will not open'); }, put: async () => {} });
    expect(shopStorageBlocked()).toBe(true);
  });

  it('carries on as normal when nothing was ever moved', async () => {
    await hydrateShopStorage({ all: async () => { throw new Error('will not open'); }, put: async () => {} });
    expect(shopStorageBlocked()).toBe(false);
  });
});

describe('a shop too big for the small store', () => {
  const shop = (sales: number): StoreData => ({
    id: 's', storeId: 'SF-BIG', storeName: 'Busy Shop', accessCode: 'BIG001',
    storeType: 'provision', businessType: 'provision',
    products: [], customers: [], expenses: [], pendingPayments: [],
    sales: Array.from({ length: sales }, (_, i) => ({
      id: `sale${i}`, productId: 'p1', productName: 'Peak Milk', quantity: 1, unitPrice: 500, total: 500, profit: 80,
      date: new Date(Date.now() - i * 60_000).toISOString(),
    })),
    managerSettings: { autoBackupsEnabled: false },
    createdAt: new Date().toISOString(),
  } as unknown as StoreData);

  it('saves, loads back, and is in its own backup', async () => {
    const { backend } = largeStore();
    await hydrateShopStorage(backend);
    limitSmallStore(20_000);

    const store = shop(400);
    expect(JSON.stringify(store).length).toBeGreaterThan(20_000);
    expect(() => saveStore(store, { skipCloudSync: true })).not.toThrow();
    await settle();

    expect(loadStore('BIG001')?.sales).toHaveLength(400);

    // After a restart, from the large store alone.
    await hydrateShopStorage(backend);
    expect(localStorage.getItem('storeflow_BIG001')).toBeNull();
    expect(loadStore('BIG001')?.sales).toHaveLength(400);

    const backup = compileBackupPayload();
    expect(JSON.parse(backup.stores['storeflow_BIG001']).sales).toHaveLength(400);
    // The note of what has moved is this phone's business, not the backup's.
    expect(Object.keys(backup.stores)).not.toContain('storeflow_spilled_keys');
  });
});
