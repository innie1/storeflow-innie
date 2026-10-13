import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ rpcAheadOfTypes: (...args: unknown[]) => rpc(...args) }));
const session = vi.fn();
vi.mock('@/lib/cloud-reach', () => ({ hasCloudSession: () => session() }));
vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

import JoinStore from '@/components/staff/JoinStore';
import DeviceRequests from '@/components/staff/DeviceRequests';
import { deviceKey, joinErrorText, normaliseStoreRef, readJoin, spacedCode } from '@/lib/staff-join';
import { noticeNewDeviceRequests, storeRefOf } from '@/lib/device-request-watch';
import { visibleNotifications } from '@/lib/notification-gate';
import { readSource } from './helpers/source';

/**
 * A worker joins on their own phone with the Store ID and their own PIN; the
 * owner approves with a one-time code. The cloud side is tested against the
 * real database in the migration's dry run; here the app's half, with the
 * cloud's answers stood in.
 */

const ok = (data: object) => ({ data: { ok: true, ...data }, error: null });
const no = (error: string, extra: object = {}) => ({ data: { ok: false, error, ...extra }, error: null });

function answer(map: Record<string, unknown | ((args: Record<string, unknown>) => unknown)>) {
  rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    const value = map[fn];
    return Promise.resolve(typeof value === 'function' ? (value as (a: Record<string, unknown>) => unknown)(args) : value ?? no('offline'));
  });
}

const shop = (): StoreData => ({
  storeName: 'Washlie', accessCode: 'ABC123', storeId: 'SF-WSH001', products: [], sales: [], expenses: [], customers: [],
  staffMembers: [], managerSettings: {}, createdAt: new Date(0).toISOString(),
} as unknown as StoreData);

beforeEach(() => { rpc.mockReset(); session.mockReset(); session.mockResolvedValue(true); });
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); });

describe("the phone's own key", () => {
  it('is made once, long and random, and kept', () => {
    const first = deviceKey();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(deviceKey()).toBe(first);
    localStorage.clear();
    expect(deviceKey()).not.toBe(first);
  });
});

describe('small things', () => {
  it('reads a Store ID however it is typed, and spaces a code for reading out', () => {
    expect(normaliseStoreRef(' sf-wsh 001 ')).toBe('SF-WSH001');
    expect(spacedCode('482731')).toBe('482 731');
    expect(joinErrorText('wrong_code', 3)).toContain('3 tries left');
    expect(joinErrorText('paused')).toMatch(/hour/);
    expect(storeRefOf(shop())).toBe('SF-WSH001');
    expect(storeRefOf({ ...shop(), storeId: undefined })).toBe('ABC123');
  });
});

describe('Join a Store, on the worker’s phone', () => {
  const fill = (storeId: string, pin: string) => {
    fireEvent.change(screen.getByPlaceholderText('SF-XXXXXX'), { target: { value: storeId } });
    fireEvent.change(screen.getByPlaceholderText('4 digits'), { target: { value: pin } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  };

  it('asks only for the Store ID and their own PIN - nothing of the owner’s', () => {
    render(<JoinStore onBack={() => {}} />);
    const inputs = Array.from(document.querySelectorAll('input'));
    expect(inputs).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/email|password|access code/i);
  });

  it('shows no names until the PIN is right', async () => {
    answer({ staff_join_identify: no('wrong_pin') });
    render(<JoinStore onBack={() => {}} />);
    fill('sf-wsh001', '0000');
    await screen.findByText('That PIN is not right for this shop.');
    expect(rpc).toHaveBeenCalledWith('staff_join_identify', expect.objectContaining({ p_store_ref: 'SF-WSH001', p_pin: '0000' }));
    expect(screen.queryByText(/You are/)).toBeNull();
  });

  it('goes from PIN to request to code to approved', async () => {
    answer({
      staff_join_identify: ok({ store_name: 'Washlie', matches: [{ staff_id: 's1', name: 'Faith', role: 'attendant' }] }),
      staff_join_request: ok({ request_id: 'r1', status: 'pending', store_name: 'Washlie', staff_name: 'Faith', staff_role: 'attendant' }),
      staff_join_status: ok({ status: 'approved', code_ready: true, store_name: 'Washlie', staff_name: 'Faith' }),
      staff_join_redeem: (args: Record<string, unknown>) => args.p_code === '482731'
        ? ok({ status: 'authorized', staff_id: 's1', staff_name: 'Faith' })
        : no('wrong_code', { tries_left: 4 }),
    });
    render(<JoinStore onBack={() => {}} />);
    fill('SF-WSH001', '1234');
    await screen.findByText('You are Faith');
    expect(screen.getByText('Attendant')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Request Access' }));
    await screen.findByText('Waiting for the owner');
    expect(readJoin()).toMatchObject({ requestId: 'r1', staffName: 'Faith' });
    // The PIN is not kept once the request is made.
    const stored = Array.from({ length: localStorage.length }, (_, i) => `${localStorage.key(i)}=${localStorage.getItem(localStorage.key(i)!)}`).join(' ');
    expect(stored).not.toContain('1234');
    await screen.findByText(/The owner has approved/);

    const codeBox = screen.getByPlaceholderText('000000');
    fireEvent.change(codeBox, { target: { value: '111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter code' }));
    await screen.findByText(/That code is not right. 4 tries left/);

    fireEvent.change(codeBox, { target: { value: '482 731' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter code' }));
    await screen.findByText('This phone is approved');
    expect(readJoin()?.status).toBe('authorized');
  });

  it('picks up where it left off, and says so when the owner says no', async () => {
    localStorage.setItem('storeflow_staff_join', JSON.stringify({ requestId: 'r9', storeRef: 'SF-WSH001', storeName: 'Washlie', staffId: 's1', staffName: 'Faith', status: 'pending' }));
    answer({ staff_join_status: ok({ status: 'rejected', code_ready: false, store_name: 'Washlie', staff_name: 'Faith' }) });
    render(<JoinStore onBack={() => {}} />);
    await screen.findByText('Not approved');
    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    expect(readJoin()).toBeNull();
    expect(screen.getByPlaceholderText('SF-XXXXXX')).toBeTruthy();
  });
});

describe("the owner's Workers' phones", () => {
  const pending = { id: 'r1', staff_id: 's1', staff_name: 'Faith', staff_role: 'attendant', device_label: 'Samsung SM-A366B', status: 'pending', requested_at: new Date().toISOString() };

  it('asks the owner to sign in when this phone has no account', async () => {
    session.mockResolvedValue(false);
    render(<DeviceRequests store={shop()} />);
    await screen.findByText(/Sign in to your StoreFlow account/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('approves with a code to read out, or rejects', async () => {
    let devices: object[] = [pending];
    answer({
      staff_device_list: () => ok({ devices }),
      staff_device_approve: () => { devices = [{ ...pending, status: 'approved', code_live: true }]; return ok({ code: '482731', expires_at: new Date(Date.now() + 300000).toISOString() }); },
      staff_device_reject: () => { devices = []; return ok({}); },
    });
    render(<DeviceRequests store={shop()} />);
    await screen.findByText('Faith');
    expect(rpc).toHaveBeenCalledWith('staff_device_list', { p_store_ref: 'SF-WSH001' });
    expect(screen.getByText(/Attendant · Samsung SM-A366B · Requested/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approval code' });
    expect(dialog.textContent).toContain('482 731');
    expect(dialog.textContent).toMatch(/Works once, for [45]:\d\d more/);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await screen.findByText('Approved. Waiting for them to type the code.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('staff_device_reject', { p_request_id: 'r1' }));
  });

  it('offers no invite until the cloud knows the shop, and says how to put it online', async () => {
    answer({ staff_device_list: no('not_owner') });
    render(<DeviceRequests store={shop()} />);
    await screen.findByText(/Workers can't join yet/);
    expect(document.body.textContent).toContain('Multi-device Cloud Sync');
    expect(screen.queryByRole('button', { name: /Show invite QR/ })).toBeNull();
    expect(screen.queryByText(/Sign in to your StoreFlow account/)).toBeNull();
  });

  it('offers no invite while signed out either', async () => {
    session.mockResolvedValue(false);
    render(<DeviceRequests store={shop()} />);
    await screen.findByText(/Sign in to your StoreFlow account/);
    expect(screen.queryByRole('button', { name: /Show invite QR/ })).toBeNull();
  });

  it('tells a worker an unknown shop may simply not be online yet', () => {
    expect(joinErrorText('not_found')).toMatch(/cannot find this shop online/);
    expect(joinErrorText('not_found')).toMatch(/Cloud Sync/);
  });

  it('tells the owner to share the Store ID, never the access code', async () => {
    answer({ staff_device_list: ok({ devices: [] }) });
    render(<DeviceRequests store={shop()} />);
    await screen.findByText('No requests yet.');
    expect(screen.getByText('SF-WSH001')).toBeTruthy();
    expect(document.body.textContent).not.toContain('ABC123');
  });
});

describe('a new request reaches the owner', () => {
  const row = { id: 'r1', staff_id: 's1', staff_name: 'Faith', staff_role: 'attendant', device_label: 'Samsung A36', status: 'pending' as const, requested_at: new Date().toISOString() };

  it('once, as a notification only the owner’s side sees', () => {
    const first = noticeNewDeviceRequests(shop(), [row])!;
    expect(first.flowNotifications?.[0]).toMatchObject({ title: 'New device requesting access', description: 'Faith · Attendant · Samsung A36', actionTab: 'staff' });
    expect(noticeNewDeviceRequests(first, [row])).toBeNull();
    expect(noticeNewDeviceRequests(shop(), [{ ...row, status: 'authorized' }])).toBeNull();
    expect(visibleNotifications(first.flowNotifications || [], { role: 'attendant' })).toHaveLength(0);
    // A supervisor can open the Staff page, so only the missing category keeps it from them.
    expect(visibleNotifications(first.flowNotifications || [], { role: 'supervisor' })).toHaveLength(0);
    expect(visibleNotifications(first.flowNotifications || [], { role: 'owner' })).toHaveLength(1);
  });
});

describe('the opening screen', () => {
  it('adds Join a Store without touching the two owner buttons', () => {
    const source = readSource('src/components/StoreAccess.tsx');
    expect(source).toContain("onClick={() => setMode('join')}");
    expect(source).toContain('Join a Store');
    expect(source).toMatch(/onClick=\{\(\) => setMode\('create-choice'\)\}[\s\S]{0,400}Create New Store/);
    expect(source).toMatch(/onClick=\{\(\) => setMode\('access-choice'\)\}[\s\S]{0,400}Access Existing Store/);
  });
});


