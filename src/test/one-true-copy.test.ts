import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

/**
 * One true copy of the shop on the phone.
 *
 * Every save used to leave a waiting record holding two more full copies of
 * the shop: `next`, identical to the shop just saved, and `base`, the cloud's
 * last agreed copy - which a shop with no cloud account does not have. Neither
 * was ever cleared for such a shop. A long history filled the phone's storage
 * for the app three times over, and every save then said "sync recovery
 * storage is unavailable".
 */

const session = { value: null as unknown };
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: session.value }, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  },
}));

const sales = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: `sale-${index}`, productId: 'p1', productName: 'Rice 5kg', quantity: 1, unitPrice: 5200, total: 5200,
  profit: 1200, date: new Date(2026, 0, 1 + (index % 28)).toISOString(), paymentMethod: 'cash',
}));

function shop(code: string, saleCount = 400): StoreData {
  return {
    storeName: 'Corner Provisions', accessCode: code, storeId: `SF-${code}`, createdAt: '2026-01-01T00:00:00.000Z',
    products: [{ id: 'p1', name: 'Rice 5kg', costPrice: 4000, sellingPrice: 5200, quantity: 20, category: 'Food' }],
    sales: sales(saleCount), customers: [], pendingPayments: [], managerSettings: { autoBackupsEnabled: false },
  } as unknown as StoreData;
}

/** What saveStore does: the shop first, then the record for the cloud. */
async function save(store: StoreData) {
  const { queueStoreSync } = await import('@/lib/store-cloud-sync');
  const before = localStorage.getItem(`storeflow_${store.accessCode}`);
  localStorage.setItem(`storeflow_${store.accessCode}`, JSON.stringify(store));
  queueStoreSync(store, before ? JSON.parse(before) : undefined);
  await new Promise(resolve => setTimeout(resolve, 10));
}

const waitingRecord = (code: string) => localStorage.getItem(`storeflow_sync_pending_${code}`) || '';
const shopRecord = (code: string) => localStorage.getItem(`storeflow_${code}`) || '';

beforeEach(() => {
  localStorage.clear();
  session.value = null;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

describe('a shop that lives only on this phone', () => {
  it('keeps no spare copies of itself', async () => {
    // Already on the phone, so each save has a "before" that could be kept as a base.
    const first = shop('ALONE1');
    localStorage.setItem(`storeflow_${first.accessCode}`, JSON.stringify(first));
    for (let sale = 0; sale < 5; sale += 1) await save({ ...first, sales: sales(401 + sale) } as StoreData);

    const shopSize = shopRecord('ALONE1').length;
    const spareSize = waitingRecord('ALONE1').length;
    expect(shopSize, 'the test shop should be big enough to matter').toBeGreaterThan(50_000);
    // A few flags, not a shop.
    expect(spareSize, `the waiting record is ${spareSize} characters beside a ${shopSize}-character shop`).toBeLessThan(500);
  });

  it('still reads as waiting, with the shop as it now stands', async () => {
    const { getPendingStoreSync } = await import('@/lib/store-cloud-sync');
    const store = shop('ALONE2', 10);
    await save(store);
    await save({ ...store, storeName: 'Renamed' } as StoreData);

    const pending = getPendingStoreSync('ALONE2');
    expect(pending?.awaitingAccount).toBe(true);
    expect(pending?.next.storeName, 'readers still get the latest shop').toBe('Renamed');
  });
});

describe('a shop this phone has seen in the cloud', () => {
  it('keeps the cloud\'s last agreed copy, which it needs to merge safely', async () => {
    const { markStoreInCloud, getPendingStoreSync } = await import('@/lib/store-cloud-sync');
    const store = shop('CLOUD1', 10);
    localStorage.setItem(`storeflow_${store.accessCode}`, JSON.stringify(store));
    markStoreInCloud('CLOUD1');
    await save({ ...store, storeName: 'Edited' } as StoreData);
    await save({ ...store, storeName: 'Edited again' } as StoreData);

    const pending = getPendingStoreSync('CLOUD1');
    expect(pending?.base?.storeName, 'the base is the copy before the unsent edits').toBe('Corner Provisions');
    expect(pending?.next.storeName).toBe('Edited again');
    // Still no duplicate of the shop itself.
    expect(JSON.parse(waitingRecord('CLOUD1')).next).toBeUndefined();
  });
});

describe('records written before this change', () => {
  it('drop a copy that only duplicated the shop', async () => {
    const { getPendingStoreSync, queueStoreSync } = await import('@/lib/store-cloud-sync');
    const store = shop('OLD001', 10);
    localStorage.setItem(`storeflow_${store.accessCode}`, JSON.stringify(store));
    localStorage.setItem(`storeflow_sync_pending_${store.accessCode}`, JSON.stringify({ base: store, next: store, state: 'pending', awaitingAccount: true }));

    expect(getPendingStoreSync('OLD001')?.journal, 'a duplicate is not a sale in flight').toBeUndefined();
    queueStoreSync(store);
    const rewritten = JSON.parse(waitingRecord('OLD001'));
    expect(rewritten.next).toBeUndefined();
    expect(rewritten.base).toBeUndefined();
  });

  it('keep a sale the shop does not hold yet, as the thing to send', async () => {
    const { getPendingStoreSync } = await import('@/lib/store-cloud-sync');
    const store = shop('OLD002', 10);
    const withSale = { ...store, sales: sales(11) } as StoreData;
    localStorage.setItem(`storeflow_${store.accessCode}`, JSON.stringify(store));
    localStorage.setItem(`storeflow_sync_pending_${store.accessCode}`, JSON.stringify({ base: store, next: withSale, state: 'syncing' }));

    const pending = getPendingStoreSync('OLD002');
    expect(pending?.journal?.sales).toHaveLength(11);
    expect(pending?.next.sales, 'the sale in flight is what goes, not the shop without it').toHaveLength(11);
  });
});

describe('the storage it frees', () => {
  it('lets a shop keep saving where the old records had filled the phone', async () => {
    /*
     * About 5 MB is what a phone gives the app. The shop here is a little over
     * a third of that: with two more copies beside it the phone was full; with
     * one it is not.
     */
    const { getPendingStoreSync } = await import('@/lib/store-cloud-sync');
    const store = shop('ROOM99', 9000);
    const shopSize = JSON.stringify(store).length;
    const limit = Math.floor(shopSize * 2.5);
    const realSetItem = localStorage.setItem.bind(localStorage);
    const used = () => Object.keys(localStorage).reduce((sum, key) => sum + key.length + (localStorage.getItem(key) || '').length, 0);
    const owner: Storage = typeof Storage !== 'undefined' && localStorage instanceof Storage ? Storage.prototype : localStorage;
    const spy = vi.spyOn(owner, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      const replacing = (localStorage.getItem(key) || '').length;
      if (used() - replacing + key.length + value.length > limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return realSetItem(key, value);
    });

    // An established shop, already on the phone, being edited.
    realSetItem(`storeflow_${store.accessCode}`, JSON.stringify(store));
    await save({ ...store, storeName: 'Saving' } as StoreData);
    await save({ ...store, storeName: 'Still saving' } as StoreData);
    spy.mockRestore();

    expect(JSON.parse(shopRecord('ROOM99')).storeName).toBe('Still saving');
    expect(getPendingStoreSync('ROOM99')?.awaitingAccount).toBe(true);
  });
});
