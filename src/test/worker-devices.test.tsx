import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ rpcAheadOfTypes: (...args: unknown[]) => rpc(...args) }));
vi.mock('@/lib/cloud-reach', () => ({ hasCloudSession: () => Promise.resolve(true) }));
vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));
const drawn = vi.fn();
vi.mock('@/lib/qr-code', () => ({ drawSimpleQR: (...args: unknown[]) => { drawn(...args); return Promise.resolve(); } }));

import DeviceRequests from '@/components/staff/DeviceRequests';
import JoinStore from '@/components/staff/JoinStore';
import { captureInviteFromUrl, clearInvite, inviteLink, inviteStoreRef, lastSeen, pendingInvite } from '@/lib/staff-join';
import InviteSwitchPrompt from '@/components/staff/InviteSwitchPrompt';
import { readSource } from './helpers/source';

/**
 * Step 6: the owner sees each worker's approved phones, takes one or all of
 * them back, and invites a worker with a QR. The cloud's half - only the
 * owner can revoke, and a revoked phone is answered "revoked" at every door -
 * was tested against the live database in the migration's dry run.
 */

const ok = (data: object) => ({ data: { ok: true, ...data }, error: null });

const shop = (): StoreData => ({
  storeName: 'Washlie', accessCode: 'ABC123', storeId: 'SF-WSH001', products: [], sales: [], expenses: [], customers: [],
  staffMembers: [{ id: 's1', name: 'Faith', role: 'attendant' }, { id: 's2', name: 'Bisi', role: 'cashier' }],
  managerSettings: {}, createdAt: new Date(0).toISOString(),
} as unknown as StoreData);

const phone = (id: string, staffId: string, name: string, label: string, seenMinutesAgo = 5) => ({
  id, staff_id: staffId, staff_name: name, device_label: label, status: 'authorized',
  requested_at: new Date(0).toISOString(), authorized_at: new Date(0).toISOString(),
  last_seen_at: new Date(Date.now() - seenMinutesAgo * 60000).toISOString(),
});

let devices: object[] = [];
beforeEach(() => {
  rpc.mockReset();
  drawn.mockReset();
  devices = [
    phone('d1', 's1', 'Faith', 'Tecno Spark'),
    phone('d2', 's1', 'Faith', 'Itel A70', 300),
    phone('d3', 's2', 'Bisi', 'Samsung A15', 1),
    phone('d9', 's-gone', 'Left last week', 'Old phone'),
  ];
  rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (fn === 'staff_device_list') return Promise.resolve(ok({ devices }));
    if (fn === 'staff_device_revoke') {
      devices = devices.filter(d => (d as { id: string }).id !== args.p_request_id);
      return Promise.resolve(ok({ revoked: 1 }));
    }
    if (fn === 'staff_device_revoke_all') {
      const before = devices.length;
      devices = devices.filter(d => (d as { staff_id: string }).staff_id !== args.p_staff_id);
      return Promise.resolve(ok({ revoked: before - devices.length }));
    }
    return Promise.resolve({ data: { ok: false, error: 'offline' }, error: null });
  });
});
afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

const workerCard = (name: string) => screen.getByText(name, { selector: 'span' }).closest('div.rounded-xl') as HTMLElement;

describe('approved phones, under each worker', () => {
  it('shows every phone with when it was last seen, and not a removed worker’s', async () => {
    render(<DeviceRequests store={shop()} />);
    await screen.findByText('Tecno Spark');
    expect(within(workerCard('Faith')).getByText('2 phones')).toBeTruthy();
    expect(screen.getByText(/Seen 5 min ago/)).toBeTruthy();
    expect(screen.getByText(/Seen 5 h ago/)).toBeTruthy();
    expect(screen.getByText(/Seen just now/)).toBeTruthy();
    expect(screen.queryByText('Old phone')).toBeNull();
  });

  it('asks before taking one phone back, then takes it back', async () => {
    render(<DeviceRequests store={shop()} />);
    await screen.findByText('Samsung A15');
    fireEvent.click(within(workerCard('Bisi')).getByRole('button', { name: 'Revoke' }));
    expect(screen.getByText("Remove Bisi's phone?")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(rpc).not.toHaveBeenCalledWith('staff_device_revoke', expect.anything());

    fireEvent.click(within(workerCard('Bisi')).getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Revoke' }).at(-1)!);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('staff_device_revoke', { p_request_id: 'd3' }));
    await waitFor(() => expect(screen.queryByText('Samsung A15')).toBeNull());
    expect(screen.getByText('Tecno Spark')).toBeTruthy();
  });

  it('offers Revoke all for a worker with more than one phone, and takes them all', async () => {
    render(<DeviceRequests store={shop()} />);
    await screen.findByText('Tecno Spark');
    expect(within(workerCard('Bisi')).queryByRole('button', { name: 'Revoke all' })).toBeNull();
    fireEvent.click(within(workerCard('Faith')).getByRole('button', { name: 'Revoke all' }));
    expect(screen.getByText("Remove all 2 of Faith's phones?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Revoke all' }).at(-1)!);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('staff_device_revoke_all', { p_store_ref: 'SF-WSH001', p_staff_id: 's1' }));
    await waitFor(() => expect(screen.queryByText('Tecno Spark')).toBeNull());
    expect(screen.queryByText('Itel A70')).toBeNull();
    expect(screen.getByText('Samsung A15')).toBeTruthy();
  });

  it('reads last seen in plain words', () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    expect(lastSeen(undefined, now)).toBe('Not seen yet');
    expect(lastSeen('2026-10-12T11:59:30Z', now)).toBe('Seen just now');
    expect(lastSeen('2026-10-12T11:15:00Z', now)).toBe('Seen 45 min ago');
    expect(lastSeen('2026-10-12T09:00:00Z', now)).toBe('Seen 3 h ago');
    expect(lastSeen('2026-10-09T09:00:00Z', now)).toMatch(/^Seen \d+ Oct|^Seen Oct \d+/);
  });
});

describe('the invite QR', () => {
  it('carries the Store ID and nothing secret', async () => {
    render(<DeviceRequests store={shop()} />);
    await screen.findByText('Tecno Spark');
    fireEvent.click(screen.getByRole('button', { name: /Show invite QR/ }));
    const dialog = screen.getByRole('dialog', { name: 'Staff invite' });
    await waitFor(() => expect(drawn).toHaveBeenCalled());
    const link = String(drawn.mock.calls[0][0]);
    expect(link).toBe(`${window.location.origin}/?join=SF-WSH001`);
    expect(link).not.toContain('ABC123');
    expect(dialog.textContent).not.toContain('ABC123');
    expect(dialog.textContent).toContain('You still approve each phone');
  });

  it('is only a Store ID: anything else in the link is ignored', () => {
    expect(inviteLink(' sf-wsh001 ', 'https://app.test')).toBe('https://app.test/?join=SF-WSH001');
    expect(inviteStoreRef('?join=sf-wsh001')).toBe('SF-WSH001');
    expect(inviteStoreRef('?join=<script>')).toBe('');
    expect(inviteStoreRef('?other=1')).toBe('');
  });

  it('opens Join a Store with the Store ID filled in', () => {
    render(<JoinStore onBack={() => {}} initialStoreRef="SF-WSH001" />);
    expect((screen.getByPlaceholderText('SF-XXXXXX') as HTMLInputElement).value).toBe('SF-WSH001');
    expect(screen.getByText("Filled in from the shop's invite.")).toBeTruthy();
  });

  it('is kept at start-up, before an open shop can swallow it', () => {
    window.history.replaceState(null, '', '/?join=sf-wsh001&tab=x');
    captureInviteFromUrl();
    expect(window.location.search).toBe('?tab=x');
    expect(pendingInvite()).toBe('SF-WSH001');
    clearInvite();
    expect(pendingInvite()).toBe('');
    expect(readSource('src/main.tsx')).toMatch(/captureInviteFromUrl\(\);[\s\S]*createRoot|captureInviteFromUrl\(\);/);
  });

  it('is offered on the opening screen without touching the two owner buttons', () => {
    const source = readSource('src/components/StoreAccess.tsx');
    expect(source).toContain('useState(pendingInvite)');
    expect(source).toContain('initialStoreRef={invitedRef}');
    expect(source).toMatch(/onClick=\{\(\) => setMode\('create-choice'\)\}[\s\S]{0,400}Create New Store/);
    expect(source).toMatch(/onClick=\{\(\) => setMode\('access-choice'\)\}[\s\S]{0,400}Access Existing Store/);
  });
});

describe('an invite opened on a phone that is already in a shop', () => {
  afterEach(() => { sessionStorage.clear(); });

  it('asks first, naming the shop it would sign out of', () => {
    const onJoin = vi.fn();
    const onStay = vi.fn();
    render(<InviteSwitchPrompt invitedRef="SF-NEW001" currentName="Corner Store" kind="owner" onJoin={onJoin} onStay={onStay} />);
    const dialog = screen.getByRole('dialog', { name: 'Join another shop?' });
    expect(dialog.textContent).toContain('SF-NEW001');
    expect(dialog.textContent).toContain('Nothing in Corner Store is deleted');
    fireEvent.click(screen.getByRole('button', { name: 'Stay in Corner Store' }));
    expect(onStay).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out of Corner Store and join' }));
    expect(onJoin).toHaveBeenCalled();
  });

  it('tells a worker’s phone it would leave its shop', () => {
    render(<InviteSwitchPrompt invitedRef="SF-NEW001" currentName="Washlie" kind="worker" onJoin={() => {}} onStay={() => {}} />);
    expect(screen.getByRole('button', { name: 'Leave Washlie and join' })).toBeTruthy();
  });

  it('is asked by an open shop, and not for its own invite or the shop it works at', () => {
    const index = readSource('src/pages/Index.tsx');
    const check = index.slice(index.indexOf('const [inviteAsk, setInviteAsk]'), index.indexOf('setInviteAsk(ref);'));
    expect(check).toContain('pendingInvite()');
    expect(check).toContain("normaliseStoreRef(store.staffDevice.storeRef) === ref");
    expect(check).toContain("normaliseStoreRef(String(store.storeId || '')) === ref");
    // Joining signs out; the invite stays waiting for the opening screen.
    const join = index.slice(index.indexOf('<InviteSwitchPrompt'), index.indexOf('onStay', index.indexOf('<InviteSwitchPrompt')));
    expect(join).toContain('handleLock()');
    expect(join).not.toContain('clearInvite()');
  });
});

describe('the cloud side', () => {
  it('leaves the passes in place, so the phone hears "revoked" and signs out', () => {
    const sql = readSource('supabase/migrations/20261012171906_staff_device_revoke.sql');
    expect(sql).not.toMatch(/delete\s+from\s+public\.staff_sessions/i);
    expect(sql).toMatch(/staff_join_is_owner/);
    expect(sql).toMatch(/revoke all on function public\.staff_device_revoke\(uuid\) from public, anon/);
  });
});
