import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  rpcAheadOfTypes: (...args: unknown[]) => rpc(...args),
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import WorkerSignIn from '@/components/staff/WorkerSignIn';
import { getStoreIndex, loadStore, saveStore } from '@/lib/store-data';
import { getPendingStoreSync } from '@/lib/store-cloud-sync';
import { shouldRunGuide } from '@/lib/setup-guide';
import {
  OFFLINE_WINDOW_MS, readWorkerSession, refreshWorkerCopy, signInWorker, workerAccessCode, workerStoreFromView,
} from '@/lib/staff-session';
import { readJoin, writeJoin } from '@/lib/staff-join';
import { readSource } from './helpers/source';

/**
 * Step 5a: a worker signs in on their own approved phone with their own PIN
 * and gets a slim copy of the shop. The cloud's half - what the copy may
 * carry, the pass, revocation - was tested against the live database in the
 * migration's dry run; this is the phone's half.
 */

const joined = { requestId: 'r1', storeRef: 'SF-WSH001', storeName: 'Washlie', staffId: 's1', staffName: 'Faith', staffRole: 'attendant', status: 'authorized' as const };
const view = {
  storeName: 'Washlie', storeType: 'laundry', businessType: 'laundry',
  products: [{ id: 'p1', name: 'Wash and Iron', sellingPrice: 1500, isService: true }],
  customers: [{ id: 'c1', name: 'Ada', phone: '0802' }],
  staffMembers: [{ id: 's1', name: 'Faith', role: 'attendant', permissions: { sales: true } }],
  managerSettings: { staffExpenseApproval: 'approval', staffExpenseFreeLimit: 1000 },
};
const worker = { id: 's1', name: 'Faith', role: 'attendant', permissions: { sales: true } };
const ok = (data: object) => ({ data: { ok: true, ...data }, error: null });
const no = (error: string) => ({ data: { ok: false, error }, error: null });
const deps = { loadCopy: (code: string) => loadStore(code), saveCopy: (s: StoreData) => saveStore(s, { skipCloudSync: true }) };

let online = true;
beforeEach(() => {
  rpc.mockReset();
  online = true;
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  writeJoin(joined);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('signing in online', () => {
  it('asks the cloud with this phone and the PIN, and keeps a slim copy under its own name', async () => {
    rpc.mockResolvedValue(ok({ token: 't'.repeat(64), expires_at: new Date(Date.now() + 86400000).toISOString(), store_ref: 'SF-WSH001', worker, view }));
    const result = await signInWorker('1234', deps);
    expect(rpc).toHaveBeenCalledWith('staff_sign_in', expect.objectContaining({ p_request_id: 'r1', p_pin: '1234' }));
    expect('error' in result).toBe(false);
    const copy = loadStore('STAFF-SF-WSH001')!;
    expect(copy.staffDevice).toEqual({ requestId: 'r1', storeRef: 'SF-WSH001', staffId: 's1' });
    expect(copy.storeId).toBe('SF-WSH001');
    expect(copy.products[0].name).toBe('Wash and Iron');
    // The PIN itself is never kept; a scrambled copy is, for signing in offline.
    const stored = Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i)!)).join(' ');
    expect(stored).not.toMatch(/"1234"|:1234/);
    expect(readWorkerSession()?.pinHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never lists the copy as a shop on this phone, and never sends it to the cloud as one', async () => {
    rpc.mockResolvedValue(ok({ token: 'x', expires_at: new Date().toISOString(), store_ref: 'SF-WSH001', worker, view }));
    await signInWorker('1234', deps);
    const copy = loadStore('STAFF-SF-WSH001')!;
    saveStore({ ...copy, storeId: 'SF-WSH001', managerSettings: { ...copy.managerSettings, multiDeviceSync: true } });
    expect(getStoreIndex().map(entry => entry.code)).not.toContain('STAFF-SF-WSH001');
    expect(getPendingStoreSync('STAFF-SF-WSH001')).toBeNull();
    expect(shouldRunGuide(copy)).toBe(false);
  });

  it('says why when the cloud says no, and forgets a revoked phone', async () => {
    rpc.mockResolvedValue(no('wrong_pin'));
    expect(await signInWorker('0000', deps)).toEqual({ ok: false, error: 'wrong_pin' });
    expect(readJoin()).not.toBeNull();
    rpc.mockResolvedValue(no('revoked'));
    expect(await signInWorker('1234', deps)).toEqual({ ok: false, error: 'revoked' });
    expect(readJoin()).toBeNull();
  });
});

describe('signing in offline', () => {
  const signedInAt = Date.parse('2026-10-12T08:00:00Z');
  const firstSignIn = async () => {
    rpc.mockResolvedValue(ok({ token: 'x', expires_at: new Date(signedInAt + 86400000).toISOString(), store_ref: 'SF-WSH001', worker, view }));
    await signInWorker('1234', { ...deps, now: () => signedInAt });
    online = false;
    rpc.mockReset();
  };

  it('lets the right PIN in for a day after the cloud last said yes', async () => {
    await firstSignIn();
    const result = await signInWorker('1234', { ...deps, now: () => signedInAt + OFFLINE_WINDOW_MS - 60000 });
    expect(result).toMatchObject({ ok: true, offline: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a wrong PIN, and anything after a day', async () => {
    await firstSignIn();
    expect(await signInWorker('9999', { ...deps, now: () => signedInAt + 1000 })).toEqual({ ok: false, error: 'wrong_pin' });
    expect(await signInWorker('1234', { ...deps, now: () => signedInAt + OFFLINE_WINDOW_MS + 1000 })).toEqual({ ok: false, error: 'offline_too_long' });
  });

  it('needs the internet the first time', async () => {
    online = false;
    expect(await signInWorker('1234', deps)).toEqual({ ok: false, error: 'offline_first' });
  });
});

describe('refreshing while signed in', () => {
  it('keeps work only this phone has, takes the cloud’s version of the rest', () => {
    const first = workerStoreFromView(view, joined, 'SF-WSH001', null);
    const withLocal = { ...first, customers: [...(first.customers || []), { id: 'c-new', name: 'Bisi', phone: '0803' }] } as StoreData;
    const refreshed = workerStoreFromView({ ...view, customers: [{ id: 'c1', name: 'Ada Obi', phone: '0802' }] }, joined, 'SF-WSH001', withLocal);
    expect(refreshed.customers!.map(c => c.name)).toEqual(['Ada Obi', 'Bisi']);
    expect(refreshed.accessCode).toBe(workerAccessCode('SF-WSH001'));
  });

  it('signs the phone out and wipes the copy when the owner has removed it', async () => {
    rpc.mockResolvedValue(ok({ token: 'x', expires_at: new Date().toISOString(), store_ref: 'SF-WSH001', worker, view }));
    await signInWorker('1234', deps);
    rpc.mockResolvedValue(no('revoked'));
    expect((await refreshWorkerCopy(deps)).state).toBe('shut_out');
    expect(localStorage.getItem('storeflow_STAFF-SF-WSH001')).toBeNull();
    expect(readJoin()).toBeNull();
    expect(readWorkerSession()).toBeNull();
  });
});

describe('the sign-in card', () => {
  it('shows the shop and the worker, and only on a joined phone', () => {
    render(<WorkerSignIn onSignedIn={() => {}} />);
    expect(screen.getByText('Washlie')).toBeTruthy();
    expect(screen.getByText('Faith · Attendant')).toBeTruthy();
    cleanup();
    writeJoin(null);
    const { container } = render(<WorkerSignIn onSignedIn={() => {}} />);
    expect(container.textContent).toBe('');
  });

  it('opens the shop as the worker the cloud says, with missing permissions as no', async () => {
    rpc.mockResolvedValue(ok({ token: 'x', expires_at: new Date().toISOString(), store_ref: 'SF-WSH001', worker: { id: 's1', name: 'Faith', role: 'attendant', permissions: {} }, view }));
    const opened = vi.fn();
    render(<WorkerSignIn onSignedIn={opened} />);
    fireEvent.change(screen.getByLabelText('Your PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await vi.waitFor(() => expect(opened).toHaveBeenCalled());
    expect(JSON.parse(localStorage.getItem('storeflow_active_user')!)).toEqual({
      id: 's1', name: 'Faith', role: 'attendant', permissions: { sales: false, inventory: false, reports: false, settings: false, money: false },
    });
  });
});

describe('a worker’s phone cannot switch', () => {
  it('hides Switch Role and Switch Store on a worker copy', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toMatch(/\{!store\.staffDevice && \(\s*<button[\s\S]{0,300}setShowSwitchUser\(true\)/);
    expect(index).toContain("onClick={() => { if (!store.staffDevice) setShowSwitcher(true); }}");
    expect(readSource('src/components/Settings.tsx')).toMatch(/\{!store\.staffDevice && \(\s*<DataTile[\s\S]{0,200}label="Switch Store"/);
  });
});
