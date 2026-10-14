import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ remote: {} as any, calls: 0 }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } }, error: null }) },
  from: () => { const query: any = { select: () => query, eq: () => query, retry: () => query, abortSignal: () => query, maybeSingle: async () => ({ data: { id: 'store', data: mock.remote }, error: null }) }; return query; },
  rpc: async (_name: string, args: any) => {
    mock.calls++;
    try { mock.remote = mergeStoreSnapshot(args.p_base, args.p_next, mock.remote); return { data: { data: {} }, error: null }; }
    catch (error: any) { return { data: null, error: { code: '40001', message: error.message } }; }
  },
} }));
import { mergeStoreSnapshot } from '@/lib/store-sync-guard';
import { cloudIsOlderCopy, cloudSnapshot, getPendingStoreSync, retryStoreSync } from '@/lib/store-cloud-sync';
import { noteCloudReached } from '@/lib/cloud-reach';

/**
 * A phone kept the shop for weeks with nobody signed in, then signed in. It
 * holds no last agreed copy, so the cloud could not tell its changes from
 * another phone's and held them all - staff list included, so no invited
 * worker's PIN could be found - until somebody reviewed it by hand. When the
 * cloud's copy is only an older version of the phone's, that settles itself.
 */

const CODE = 'AMZXWE';
const cloudCopy = { accessCode: CODE, storeId: 'SF-5R9R2F', storeName: 'Washlie', sales: [{ id: 's1', total: 500 }], products: [{ id: 'p1', name: 'Shirt', quantity: 3 }], cashBalance: 500 };
const phone = () => ({
  ...cloudCopy,
  sales: [{ id: 's1', total: 500 }, { id: 's2', total: 700 }],
  products: [{ id: 'p1', name: 'Shirt', quantity: 2 }],
  cashBalance: 1200,
  staffMembers: [{ id: 'w1', name: 'Faith', pin: '4821', role: 'attendant' }],
  managerSettings: { ownerPassword: 'local-only' },
});
const hold = (state: string) => {
  localStorage.setItem(`storeflow_${CODE}`, JSON.stringify(phone()));
  localStorage.setItem(`storeflow_sync_pending_${CODE}`, JSON.stringify({ state }));
};
const archives = () => Object.keys(localStorage).filter(key => key.startsWith(`storeflow_sync_archive_${CODE}_`));

beforeEach(() => {
  noteCloudReached(); localStorage.clear(); mock.calls = 0; mock.remote = { ...cloudCopy };
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});

describe('a cloud copy that is only older', () => {
  it('is settled without asking: the phone goes up over it, after keeping it', async () => {
    hold('pending');
    await retryStoreSync(CODE);
    expect(getPendingStoreSync(CODE)).toBeNull();
    expect(mock.remote.staffMembers).toEqual(phone().staffMembers);
    expect(mock.remote.sales).toHaveLength(2);
    expect(mock.remote.cashBalance).toBe(1200);
    expect(mock.remote.managerSettings?.ownerPassword).toBeUndefined();
    expect(archives()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(archives()[0])!).next).toEqual(cloudCopy);
  });

  it('settles one already held, when the shop opens', async () => {
    hold('conflict');
    // The ordinary half-minute retry still leaves a held sync alone...
    await retryStoreSync(CODE);
    expect(mock.calls).toBe(0);
    expect(getPendingStoreSync(CODE)?.state).toBe('conflict');
    // ...opening the shop looks again.
    await retryStoreSync(CODE, { settleOlderCloud: true });
    expect(getPendingStoreSync(CODE)).toBeNull();
    expect(mock.remote.staffMembers).toHaveLength(1);
  });
});

describe('a cloud copy with something the phone never saw', () => {
  it('is left for the owner to review, and nothing is written over it', async () => {
    mock.remote = { ...cloudCopy, sales: [...cloudCopy.sales, { id: 'from-another-phone', total: 900 }] };
    hold('conflict');
    await retryStoreSync(CODE, { settleOlderCloud: true });
    expect(mock.calls).toBe(0);
    expect(getPendingStoreSync(CODE)).toMatchObject({ state: 'conflict', error: expect.stringMatching(/Review sync/) });
    expect(mock.remote.sales).toHaveLength(2);
    expect(archives()).toHaveLength(0);
  });

  it('never settles a held sync that has an agreed copy - that one is a real disagreement', async () => {
    localStorage.setItem(`storeflow_${CODE}`, JSON.stringify(phone()));
    localStorage.setItem(`storeflow_sync_pending_${CODE}`, JSON.stringify({ state: 'conflict', base: cloudCopy }));
    await retryStoreSync(CODE, { settleOlderCloud: true });
    expect(mock.calls).toBe(0);
  });
});

describe('telling an older copy from a different one', () => {
  it('counts a record the phone has since binned as one it holds', () => {
    const next = cloudSnapshot({ ...phone(), sales: [], trash: [{ id: 't1', type: 'sale', item: { id: 's1' } }] } as any);
    expect(cloudIsOlderCopy(cloudCopy, next)).toBe(true);
  });

  it('is not fooled by a missing worker, customer or expense either', () => {
    expect(cloudIsOlderCopy({ staffMembers: [{ id: 'w9' }] }, phone())).toBe(false);
    expect(cloudIsOlderCopy({ customers: [{ id: 'c9' }] }, phone())).toBe(false);
    expect(cloudIsOlderCopy({ expenses: [{ id: 'e9' }] }, phone())).toBe(false);
    expect(cloudIsOlderCopy(null, phone())).toBe(false);
  });
});
