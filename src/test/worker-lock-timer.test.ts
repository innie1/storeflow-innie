import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  rpcAheadOfTypes: (...args: unknown[]) => rpc(...args),
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { loadStore, saveStore } from '@/lib/store-data';
import { refreshWorkerCopy, signInWorker } from '@/lib/staff-session';
import { writeJoin } from '@/lib/staff-join';
import { getActiveSession, getWorkerLockTimer, saveLockTimer, saveSession, saveWorkerLockTimer } from '@/lib/store-session';
import { readSource } from './helpers/source';

/**
 * Workers cannot open Settings, so their phones sat on the default hour.
 * The owner chooses a timer for workers' phones; the cloud carries it in the
 * worker's copy (supabase/migrations/20261027140000_worker_lock_timer.sql)
 * and the phone follows it for the worker copy only.
 */

const HOUR = 3600000;
const joined = { requestId: 'r1', storeRef: 'SF-WSH001', storeName: 'Washlie', staffId: 's1', staffName: 'Destiny', staffRole: 'manager', status: 'authorized' as const };
const worker = { id: 's1', name: 'Destiny', role: 'manager', permissions: {} };
const viewWith = (timer?: string) => ({
  storeName: 'Washlie', products: [], customers: [], staffMembers: [worker],
  managerSettings: { staffExpenseApproval: 'approval', ...(timer ? { workerLockTimer: timer } : {}) },
});
const ok = (data: object) => ({ data: { ok: true, ...data }, error: null });
const deps = { loadCopy: (code: string) => loadStore(code), saveCopy: (s: StoreData) => saveStore(s, { skipCloudSync: true }) };

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  writeJoin(joined);
});
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

/** A session opened `hoursAgo` hours ago for this shop. */
function openedAgo(accessCode: string, hoursAgo: number) {
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() - hoursAgo * HOUR);
  saveSession(accessCode);
  vi.useRealTimers();
}

describe("a worker's phone", () => {
  it('stays on one hour until the owner chooses', () => {
    expect(getWorkerLockTimer()).toBe('1h');
    openedAgo('STAFF-SF-WSH001', 2);
    expect(getActiveSession()).toBeNull();
  });

  it("follows the owner's timer, not this phone's own", () => {
    saveLockTimer('1h');
    saveWorkerLockTimer('12h');
    openedAgo('STAFF-SF-WSH001', 10);
    expect(getActiveSession()).toBe('STAFF-SF-WSH001');
    openedAgo('STAFF-SF-WSH001', 13);
    expect(getActiveSession()).toBeNull();
  });

  it("leaves an owner's own shop on this phone to its own timer", () => {
    saveLockTimer('1h');
    saveWorkerLockTimer('never');
    openedAgo('ABC123', 2);
    expect(getActiveSession()).toBeNull();
  });

  it('ignores a timer it does not know', () => {
    saveWorkerLockTimer('forever');
    expect(getWorkerLockTimer()).toBe('1h');
  });
});

describe('the timer arrives with the copy', () => {
  const pass = () => ({ token: 't'.repeat(64), expires_at: new Date(Date.now() + 86400000).toISOString(), store_ref: 'SF-WSH001', worker });

  it('at sign-in', async () => {
    rpc.mockResolvedValue(ok({ ...pass(), view: viewWith('8h') }));
    await signInWorker('1234', deps);
    expect(getWorkerLockTimer()).toBe('8h');
  });

  it('when the copy is refreshed, and goes back to an hour if the owner clears it', async () => {
    rpc.mockResolvedValue(ok({ ...pass(), view: viewWith('never') }));
    await signInWorker('1234', deps);
    rpc.mockResolvedValue(ok({ store_ref: 'SF-WSH001', worker, view: viewWith('4h') }));
    await refreshWorkerCopy(deps);
    expect(getWorkerLockTimer()).toBe('4h');
    rpc.mockResolvedValue(ok({ store_ref: 'SF-WSH001', worker, view: viewWith() }));
    await refreshWorkerCopy(deps);
    expect(getWorkerLockTimer()).toBe('1h');
  });
});

describe("the owner's Settings", () => {
  it("offers the workers' timer, and not on a worker's own phone", () => {
    const settings = readSource('src/components/Settings.tsx');
    expect(settings).toContain("Workers' Phones Lock Timer");
    expect(settings).toContain('workerLockTimer: value');
    expect(settings).toMatch(/!store\.staffDevice && \(\(\) => \{\s*const settings = store\.managerSettings/);
  });
});
