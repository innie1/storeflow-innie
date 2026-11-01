import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  rpcAheadOfTypes: (...args: unknown[]) => rpc(...args),
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import WorkerPassPrompt from '@/components/staff/WorkerPassPrompt';
import { loadStore, saveStore } from '@/lib/store-data';
import { updateLaundryOrderStage } from '@/lib/laundry-offline';
import {
  fetchWorkerBundles, noteWorkerPassExpired, readWorkerSession, refreshWorkerCopy, sendWorkerRecords, signInWorker,
  WORKER_PASS_EXPIRED_EVENT, WORKER_PASS_RENEWED_EVENT,
} from '@/lib/staff-session';
import { readJoin, writeJoin } from '@/lib/staff-join';
import { readSource } from './helpers/source';

/**
 * The pass lasts 24 hours. A phone left open past that used to keep taking
 * work in with nothing able to leave it, and nothing asked for the PIN. The
 * first door to answer "expired" now gets the PIN asked for, on top of the
 * screen; the work stays and goes once there is a new pass.
 */

const joined = { requestId: 'r1', storeRef: 'SF-SHOP01', storeName: 'Shop', staffId: 's1', staffName: 'Destiny', staffRole: 'manager', status: 'authorized' as const };
const worker = { id: 's1', name: 'Destiny', role: 'manager' };
const view = { storeName: 'Shop', products: [], customers: [], staffMembers: [worker], managerSettings: {} };
const ok = (data: object) => ({ data: { ok: true, ...data }, error: null });
const no = (error: string) => ({ data: { ok: false, error }, error: null });
const pass = (token: string) => ok({ token, expires_at: new Date(Date.now() + 86400000).toISOString(), store_ref: 'SF-SHOP01', worker, view });
const deps = { loadCopy: (code: string) => loadStore(code), saveCopy: (s: StoreData) => saveStore(s, { skipCloudSync: true }) };

let expired: ReturnType<typeof vi.fn>;
let renewed: ReturnType<typeof vi.fn>;

async function signedIn(token = 'a'.repeat(64)) {
  rpc.mockResolvedValue(pass(token));
  await signInWorker('1234', deps);
  rpc.mockReset();
  renewed.mockReset();
}

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  writeJoin(joined);
  expired = vi.fn();
  renewed = vi.fn();
  window.addEventListener(WORKER_PASS_EXPIRED_EVENT, expired);
  window.addEventListener(WORKER_PASS_RENEWED_EVENT, renewed);
});
afterEach(() => {
  window.removeEventListener(WORKER_PASS_EXPIRED_EVENT, expired);
  window.removeEventListener(WORKER_PASS_RENEWED_EVENT, renewed);
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('hearing that the pass has run out', () => {
  it('from the refresh and from the bundles, without signing anybody out', async () => {
    await signedIn();
    rpc.mockResolvedValue(no('expired'));
    expect(await refreshWorkerCopy(deps)).toEqual({ state: 'unchanged' });
    expect(await fetchWorkerBundles(null)).toEqual({ state: 'unchanged' });
    expect(expired).toHaveBeenCalledTimes(2);
    expect(readJoin()).not.toBeNull();
    expect(readWorkerSession()).not.toBeNull();
  });

  it('when work is being sent, and the work waits', async () => {
    await signedIn();
    const store = loadStore('STAFF-SF-SHOP01')!;
    saveStore({ ...store, customers: [{ id: 'c-new', name: 'Ada', phone: '0802' } as any] }, { skipCloudSync: true });
    rpc.mockResolvedValue(no('expired'));
    expect(await sendWorkerRecords(loadStore('STAFF-SF-SHOP01')!)).toEqual({ state: 'unchanged' });
    expect(expired).toHaveBeenCalled();

    rpc.mockReset();
    rpc.mockResolvedValue(ok({ customers: ['c-new'], expense_requests: [], piece_work: [] }));
    await sendWorkerRecords(loadStore('STAFF-SF-SHOP01')!);
    expect(rpc).toHaveBeenCalledWith('staff_send_records', expect.objectContaining({
      p_customers: [expect.objectContaining({ id: 'c-new' })],
    }));
  });

  it('when a bundle is moved along', async () => {
    await signedIn();
    rpc.mockResolvedValue(no('expired'));
    const accepted = await updateLaundryOrderStage('STAFF-SF-SHOP01', { client_ref: 'cloud-bundle' }, 'ready');
    expect(accepted).toBe(false);
    expect(expired).toHaveBeenCalled();
  });

  it('not from a poor connection, or any other refusal', async () => {
    await signedIn();
    rpc.mockResolvedValue({ data: null, error: { message: 'network' } });
    await refreshWorkerCopy(deps);
    rpc.mockResolvedValue(no('not_allowed'));
    await fetchWorkerBundles(null);
    expect(expired).not.toHaveBeenCalled();
  });

  it('not from a late answer to the pass before this one', async () => {
    await signedIn('b'.repeat(64));
    noteWorkerPassExpired('a'.repeat(64));
    expect(expired).not.toHaveBeenCalled();
    noteWorkerPassExpired('b'.repeat(64));
    expect(expired).toHaveBeenCalledTimes(1);
  });
});

describe('the prompt', () => {
  const fill = (pin: string) => {
    fireEvent.change(screen.getByLabelText('Your PIN'), { target: { value: pin } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  };
  const handlers = () => ({ onRenewed: vi.fn(), onSignOut: vi.fn(), onShutOut: vi.fn() });

  it('gets a new pass with the PIN, and says so to the bundles', async () => {
    await signedIn('a'.repeat(64));
    const on = handlers();
    render(<WorkerPassPrompt {...on} />);
    rpc.mockResolvedValue(pass('c'.repeat(64)));
    fill('1234');
    await waitFor(() => expect(on.onRenewed).toHaveBeenCalled());
    expect(readWorkerSession()?.token).toBe('c'.repeat(64));
    expect(renewed).toHaveBeenCalledTimes(1);
    expect(on.onShutOut).not.toHaveBeenCalled();
  });

  it('stays, and says why, on a wrong PIN', async () => {
    await signedIn();
    const on = handlers();
    render(<WorkerPassPrompt {...on} />);
    rpc.mockResolvedValue(no('wrong_pin'));
    fill('9999');
    await screen.findByText('That PIN is not right.');
    expect(on.onRenewed).not.toHaveBeenCalled();
    expect(on.onShutOut).not.toHaveBeenCalled();
  });

  it('signs the phone out when the owner has taken it back', async () => {
    await signedIn();
    const on = handlers();
    render(<WorkerPassPrompt {...on} />);
    rpc.mockResolvedValue(no('revoked'));
    fill('1234');
    await waitFor(() => expect(on.onShutOut).toHaveBeenCalled());
    expect(on.onRenewed).not.toHaveBeenCalled();
  });

  it('can be left by signing out', async () => {
    await signedIn();
    const on = handlers();
    render(<WorkerPassPrompt {...on} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(on.onSignOut).toHaveBeenCalled();
  });
});

describe('the app', () => {
  it('shows the prompt on a worker’s phone, and sends what waited once it is answered', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain('window.addEventListener(WORKER_PASS_EXPIRED_EVENT, onExpired)');
    expect(index).toContain('{passRanOut && store.staffDevice && (');
    expect(index).toMatch(/setPassRanOut\(false\);\s+\/\/ What waited for the pass goes now[^\n]*\s+void sendWorkerRecords\(renewed\)/);
    expect(index).toContain('window.addEventListener(WORKER_PASS_RENEWED_EVENT, onVisible)');
  });
});
