import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  rpcAheadOfTypes: (...args: unknown[]) => rpc(...args),
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { cloudBundleBalance, laundryPaymentsTakenHere, recordLaundryPayment } from '@/lib/laundry-money';
import { addArrivedPayments } from '@/lib/staff-records';
import { loadStore, saveStore } from '@/lib/store-data';
import { sendWorkerRecords, signInWorker } from '@/lib/staff-session';
import { writeJoin } from '@/lib/staff-join';
import { readSource } from './helpers/source';

/**
 * Take Money on a bundle this phone did not take in - another phone took it
 * in, or this one lost its storage. It used to go up under the taking-in's
 * own id, which the cloud already held at nothing paid: the cloud called it a
 * repeat, the phone stopped sending, the Take button stayed, and the owner
 * never heard of the money. The cloud's half is
 * supabase/migrations/20261101100000_worker_payment_same_id.sql.
 */

const REF = 'c9c9e890-c2e7-41ff-92d7-1da0e0ab0516';
const shop = { accessCode: 'STAFF-SF-SHOP01', pendingPayments: [], sales: [] } as unknown as StoreData;
const bundle = { clientRef: REF, tagCode: 'C6JYNQ', customerName: 'Ada', serviceId: 's1', serviceName: 'Full Service', total: 4000 };
const take = (store: StoreData, amountPaid: number, at: string) => recordLaundryPayment(store, { ...bundle, amountPaid, at, laterPayment: true });
const intake = (store: StoreData, amountPaid: number, at: string) => recordLaundryPayment(store, { ...bundle, amountPaid, at });
const cloudHoldsTakingIn = { total: 4000, paid_so_far: 0, paid_ids: [`laundry-${REF}-in`] };

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('money on a bundle this phone did not take in', () => {
  it('is a payment under its own id, not the taking-in', () => {
    const taken = laundryPaymentsTakenHere(take(shop, 4000, '2026-10-31T18:58:00.000Z'));
    expect(taken).toEqual([{
      id: `laundry-${REF}-${Date.parse('2026-10-31T18:58:00.000Z')}`,
      kind: 'payment', clientRef: REF, amount: 4000, at: '2026-10-31T18:58:00.000Z',
    }]);
  });

  it('takes the balance down the moment it is tapped', () => {
    expect(cloudBundleBalance(shop, REF, cloudHoldsTakingIn)).toBe(4000);
    expect(cloudBundleBalance(take(shop, 4000, '2026-10-31T18:58:00.000Z'), REF, cloudHoldsTakingIn)).toBe(0);
  });

  it('keeps a part payment and the next one apart', () => {
    const first = take(shop, 1500, '2026-10-31T10:00:00.000Z');
    const second = take(first, 2500, '2026-10-31T11:00:00.000Z');
    const taken = laundryPaymentsTakenHere(second);
    expect(taken.map(p => [p.kind, p.amount])).toEqual([['payment', 1500], ['payment', 2500]]);
    expect(new Set(taken.map(p => p.id)).size).toBe(2);
    expect(cloudBundleBalance(second, REF, cloudHoldsTakingIn)).toBe(0);
  });

  it('is not counted twice once the cloud has it', () => {
    const paid = take(shop, 4000, '2026-10-31T18:58:00.000Z');
    const id = laundryPaymentsTakenHere(paid)[0].id;
    expect(cloudBundleBalance(paid, REF, { total: 4000, paid_so_far: 4000, paid_ids: [`laundry-${REF}-in`, id] })).toBe(0);
  });

  it('reaches the owner, named, and books once', () => {
    const owner = intake({ accessCode: 'ABC123', pendingPayments: [], sales: [] } as unknown as StoreData, 0, '2026-10-26T10:07:00.000Z');
    const payment = { ...laundryPaymentsTakenHere(take(shop, 4000, '2026-10-31T18:58:00.000Z'))[0], tagCode: 'C6JYNQ', customerName: 'Ada', serviceId: 's1', serviceName: 'Full Service', total: 4000, staffName: 'Destiny' };
    const { store, added } = addArrivedPayments(owner, [payment]);
    expect(added).toBe(1);
    const debt = store.pendingPayments?.find(p => p.id === `laundry-${REF}`);
    expect(debt).toMatchObject({ paid: 4000, balance: 0, status: 'paid' });
    expect(debt?.events?.[0].note).toContain('taken by Destiny');
    expect(addArrivedPayments(store, [payment]).added).toBe(0);
  });
});

describe('a bundle this phone took in', () => {
  it('still sends the taking-in once, deposit included, then each payment', () => {
    const taken = laundryPaymentsTakenHere(take(intake(shop, 1000, '2026-10-29T10:00:00.000Z'), 3000, '2026-10-31T10:00:00.000Z'));
    expect(taken).toEqual([
      { id: `laundry-${REF}-in`, kind: 'intake', clientRef: REF, amount: 1000, at: '2026-10-29T10:00:00.000Z' },
      { id: `laundry-${REF}-${Date.parse('2026-10-31T10:00:00.000Z')}`, kind: 'payment', clientRef: REF, amount: 3000, at: '2026-10-31T10:00:00.000Z' },
    ]);
  });

  it('reads a record saved before this change the way it always did', () => {
    const saved = {
      ...shop,
      pendingPayments: [{ id: `laundry-${REF}`, customerName: 'Ada', items: [], total: 4000, paid: 1000, balance: 3000, createdAt: '2026-10-29T10:00:00.000Z', status: 'pending', events: [{ date: '2026-10-29T10:00:00.000Z', amount: 1000 }] }],
    } as unknown as StoreData;
    expect(laundryPaymentsTakenHere(saved).map(p => [p.id, p.kind, p.amount])).toEqual([[`laundry-${REF}-in`, 'intake', 1000]]);
  });
});

describe('on a worker’s phone, from the button to the cloud', () => {
  const joined = { requestId: 'r1', storeRef: 'SF-SHOP01', storeName: 'Shop', staffId: 's1', staffName: 'Destiny', staffRole: 'manager', status: 'authorized' as const };
  const worker = { id: 's1', name: 'Destiny', role: 'manager' };
  const ok = (data: object) => ({ data: { ok: true, ...data }, error: null });
  const deps = { loadCopy: (code: string) => loadStore(code), saveCopy: (s: StoreData) => saveStore(s, { skipCloudSync: true }) };

  beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    writeJoin(joined);
  });

  it('sends it as a payment, and stops once the cloud has answered', async () => {
    rpc.mockResolvedValue(ok({ token: 't'.repeat(64), expires_at: new Date(Date.now() + 86400000).toISOString(), store_ref: 'SF-SHOP01', worker, view: { storeName: 'Shop', products: [], customers: [], staffMembers: [worker], managerSettings: {} } }));
    await signInWorker('1234', deps);
    const copy = loadStore('STAFF-SF-SHOP01')!;
    const at = '2026-10-31T18:58:00.000Z';
    const id = `laundry-${REF}-${Date.parse(at)}`;
    saveStore(take(copy, 4000, at), { skipCloudSync: true });

    rpc.mockReset();
    rpc.mockResolvedValue(ok({ payments: [id] }));
    expect(await sendWorkerRecords(loadStore('STAFF-SF-SHOP01')!)).toEqual({ state: 'sent' });
    expect(rpc).toHaveBeenCalledWith('staff_send_payments', expect.objectContaining({
      p_payments: [expect.objectContaining({ id, kind: 'payment', amount: 4000 })],
    }));

    rpc.mockReset();
    expect(await sendWorkerRecords(loadStore('STAFF-SF-SHOP01')!)).toEqual({ state: 'nothing' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('the counter’s Take button', () => {
  it('marks what it takes as a later payment', () => {
    const source = readSource('src/components/laundry/LaundryWorkspace.tsx');
    expect(source).toMatch(/amountPaid: record\.balance,\s+laterPayment: true,/);
  });
});
