import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  rpcAheadOfTypes: (...args: unknown[]) => rpc(...args),
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import {
  createLocalLaundryRecord, getLocalLaundryRecords, resumeWorkerLaundry, syncPendingLaundryRecords, updateLaundryOrderStage,
} from '@/lib/laundry-offline';
import { fetchWorkerBundles, mergeBundles } from '@/lib/staff-session';
import { writeJoin, readJoin } from '@/lib/staff-join';

/**
 * Step 5b: laundry from a worker's own phone goes through the worker's pass,
 * never the shop's access code. The cloud's half - the role check, the
 * "recorded by", the list without customers' private keys - was tested
 * against the live database in the migration's dry run.
 */

const WORKER = 'STAFF-SF-WSH001';
const COUNTER = 'ABC123';

function bundle(accessCode: string, name = 'Ada') {
  return createLocalLaundryRecord({
    accessCode, customerName: name, customerPhone: '', serviceId: 'p1', serviceName: 'Wash and Iron',
    total: 1500, garments: [{ garmentType: 'Shirt', quantity: 1 }],
  } as never);
}

function signedIn() {
  writeJoin({ requestId: 'r1', storeRef: 'SF-WSH001', storeName: 'Washlie', staffId: 's1', staffName: 'Faith', status: 'authorized' });
  localStorage.setItem('storeflow_staff_session', JSON.stringify({
    token: 'the-pass', expiresAt: new Date(Date.now() + 3600e3).toISOString(), lastOnlineAt: new Date().toISOString(),
    pinHash: 'x', worker: { id: 's1', name: 'Faith', role: 'attendant' }, storeRef: 'SF-WSH001',
  }));
}

const calledWith = (fn: string) => rpc.mock.calls.filter(call => call[0] === fn).map(call => call[1] as Record<string, unknown>);

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('a bundle taken in on a worker’s phone', () => {
  it('goes through the worker’s door with the pass, never an access code', async () => {
    signedIn();
    rpc.mockImplementation((fn: string) => Promise.resolve({ data: fn === 'staff_laundry_walkin' ? { order_id: 'o1', tag_code: 'T1' } : { order_id: 'o1' }, error: null }));
    bundle(WORKER);
    await syncPendingLaundryRecords(WORKER);
    const sent = calledWith('staff_laundry_walkin');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ p_token: 'the-pass', p_customer_name: 'Ada' });
    expect(String(sent[0].p_device_key)).toMatch(/^[0-9a-f]{64}$/);
    for (const [, args] of rpc.mock.calls) expect(args).not.toHaveProperty('p_access_code');
    expect(calledWith('create_laundry_walkin_v2')).toHaveLength(0);
    expect(getLocalLaundryRecords(WORKER)[0].syncStatus).toBe('synced');
  });

  it('waits on the phone when the pass has run out, and goes once the worker signs in again', async () => {
    signedIn();
    rpc.mockResolvedValue({ data: { ok: false, error: 'expired' }, error: null });
    bundle(WORKER);
    await syncPendingLaundryRecords(WORKER);
    expect(getLocalLaundryRecords(WORKER)[0].syncStatus).toBe('pending');
    // Not hammered: the shop waits, every bundle with it.
    rpc.mockClear();
    bundle(WORKER, 'Bisi');
    await syncPendingLaundryRecords(WORKER);
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockImplementation(() => Promise.resolve({ data: { order_id: 'o9' }, error: null }));
    await resumeWorkerLaundry(WORKER);
    expect(calledWith('staff_laundry_walkin')).toHaveLength(2);
    expect(getLocalLaundryRecords(WORKER).every(record => record.syncStatus === 'synced')).toBe(true);
  });

  it('with no pass at all, waits rather than going anywhere', async () => {
    bundle(WORKER);
    await syncPendingLaundryRecords(WORKER);
    expect(rpc).not.toHaveBeenCalled();
    expect(getLocalLaundryRecords(WORKER)[0].syncStatus).toBe('pending');
  });
});

describe('the counter is unchanged', () => {
  it('still uses the shop’s own door and code', async () => {
    rpc.mockResolvedValue({ data: { order_id: 'o2' }, error: null });
    bundle(COUNTER);
    await syncPendingLaundryRecords(COUNTER);
    expect(calledWith('create_laundry_walkin_v2')[0]).toMatchObject({ p_access_code: COUNTER });
    expect(calledWith('staff_laundry_walkin')).toHaveLength(0);
  });
});

describe('moving a bundle another phone took in', () => {
  it('goes through the worker’s stage door', async () => {
    signedIn();
    rpc.mockResolvedValue({ data: { order_id: 'o3', workflow_stage: 'washing' }, error: null });
    const moved = await updateLaundryOrderStage(WORKER, { client_ref: 'from-the-counter' }, 'washing');
    expect(moved).toBe(true);
    expect(calledWith('staff_laundry_stage')[0]).toMatchObject({ p_token: 'the-pass', p_client_ref: 'from-the-counter', p_stage: 'washing' });
    expect(calledWith('update_laundry_walkin_stage')).toHaveLength(0);
  });
});

describe('the shop’s bundles on a worker’s phone', () => {
  it('asks for everything once, then only what changed', async () => {
    signedIn();
    rpc.mockResolvedValueOnce({ data: { ok: true, as_of: '2026-10-12T10:00:00Z', orders: [{ id: 'o1', created_at: '2026-10-12T09:00:00Z', workflow_stage: 'received' }] }, error: null });
    const first = await fetchWorkerBundles(null);
    expect(rpc.mock.calls[0]).toEqual(['staff_laundry_list', expect.objectContaining({ p_token: 'the-pass', p_since: null })]);
    expect(first).toMatchObject({ state: 'ok', asOf: '2026-10-12T10:00:00Z' });
    rpc.mockResolvedValueOnce({ data: { ok: true, as_of: '2026-10-12T10:03:00Z', orders: [{ id: 'o1', created_at: '2026-10-12T09:00:00Z', workflow_stage: 'washing' }, { id: 'o2', created_at: '2026-10-12T10:01:00Z' }] }, error: null });
    const next = await fetchWorkerBundles('2026-10-12T10:00:00Z');
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_since: '2026-10-12T10:00:00Z' });
    const shown = mergeBundles((first as any).orders, (next as any).orders);
    expect(shown.map(o => o.id)).toEqual(['o2', 'o1']);
    expect(shown[1].workflow_stage).toBe('washing');
  });

  it('signs a revoked phone out, but not one whose pass just ran out', async () => {
    signedIn();
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'expired' }, error: null });
    expect((await fetchWorkerBundles(null)).state).toBe('unchanged');
    expect(readJoin()).not.toBeNull();
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'revoked' }, error: null });
    expect((await fetchWorkerBundles(null)).state).toBe('shut_out');
    expect(readJoin()).toBeNull();
  });
});
