import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const single = vi.fn();
const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ single: () => single() }) }) }),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

import { adoptThisDeviceCopy, getPendingStoreSync, inspectStoreConflict } from '@/lib/store-cloud-sync';

/**
 * A phone that kept the shop for weeks with nobody signed in comes back to a
 * cloud copy that is simply older. Its sync is held, and the way out it was
 * offered - the cloud's copy - would have thrown its records away. Keeping
 * this device's records sends them as changes to the cloud copy as reviewed,
 * after keeping the cloud's copy on the phone.
 */

const CODE = 'AMZXWE';
const phone = { accessCode: CODE, storeId: 'SF-5R9R2F', storeName: 'Washlie', sales: [{ id: 's1' }, { id: 's2' }], staffMembers: [{ id: 'w1', name: 'Faith', pin: '4821', role: 'attendant' }], managerSettings: { ownerPassword: 'local-only' } };
const cloud = { accessCode: CODE, storeId: 'SF-5R9R2F', storeName: 'Washlie', sales: [{ id: 's0' }] };

beforeEach(() => {
  localStorage.clear();
  single.mockReset(); rpc.mockReset();
  localStorage.setItem(`storeflow_${CODE}`, JSON.stringify(phone));
  localStorage.setItem(`storeflow_sync_pending_${CODE}`, JSON.stringify({ state: 'conflict', error: 'Another device changed stock or payments.' }));
  single.mockResolvedValue({ data: { id: 'row-1', data: cloud }, error: null });
});
afterEach(() => localStorage.clear());

describe("keeping this device's records", () => {
  it('keeps the cloud copy first, then sends this phone over it, and clears the hold', async () => {
    rpc.mockResolvedValue({ data: { data: {} }, error: null });
    const reviewed = await inspectStoreConflict(CODE);
    const accepted = await adoptThisDeviceCopy(CODE, reviewed);

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, any>];
    expect(fn).toBe('commit_store_snapshot');
    // Changes against the cloud copy exactly as reviewed, so nothing reads as another device's.
    expect(args.p_store_id).toBe('row-1');
    expect(args.p_base).toEqual(cloud);
    expect(args.p_next.staffMembers).toEqual(phone.staffMembers);
    expect(args.p_next.managerSettings?.ownerPassword).toBeUndefined();

    const archived = Object.keys(localStorage).filter(key => key.startsWith(`storeflow_sync_archive_${CODE}_`));
    expect(archived).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem(archived[0])!).next).toEqual(cloud);

    expect(getPendingStoreSync(CODE)).toBeNull();
    expect(accepted.sales).toHaveLength(2);
    expect(accepted.managerSettings?.ownerPassword).toBe('local-only');
  });

  it('refuses when the cloud changed after the review', async () => {
    const reviewed = await inspectStoreConflict(CODE);
    single.mockResolvedValue({ data: { id: 'row-1', data: { ...cloud, sales: [] } }, error: null });
    await expect(adoptThisDeviceCopy(CODE, reviewed)).rejects.toThrow(/Cloud records changed/);
    expect(rpc).not.toHaveBeenCalled();
    expect(getPendingStoreSync(CODE)).not.toBeNull();
  });

  it('keeps the hold when the cloud says no', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Stock cannot be negative' } });
    const reviewed = await inspectStoreConflict(CODE);
    await expect(adoptThisDeviceCopy(CODE, reviewed)).rejects.toMatchObject({ message: 'Stock cannot be negative' });
    expect(getPendingStoreSync(CODE)).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(`storeflow_${CODE}`)!)).toEqual(phone);
  });
});
