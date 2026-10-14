import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ rpcAheadOfTypes: (...args: unknown[]) => rpc(...args) }));

import { recordLaundryPayment } from '@/lib/laundry-money';
import { sendWorkerRecords, unsentLaundryPayments } from '@/lib/staff-session';
import { addArrivedPayments, type ArrivedPayment } from '@/lib/staff-records';
import { readSource } from './helpers/source';

/**
 * Money a worker takes on a bundle - at drop-off or at hand-over - recorded
 * on their own phone, reaching the owner's sales and Money Owed once.
 */

const REF = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';
const bundle = { clientRef: REF, tagCode: 'WSH-12', customerName: 'Ada', serviceId: 'wash', serviceName: 'Wash & Iron', total: 3000 };

const workerCopy = (): StoreData => {
  let store = { accessCode: 'STAFF-SF-WSH001', storeName: 'Washlie', sales: [], pendingPayments: [], staffDevice: { requestId: 'r1', storeRef: 'SF-WSH001', staffId: 'm1' } } as unknown as StoreData;
  store = recordLaundryPayment(store, { ...bundle, amountPaid: 1000, at: '2026-10-14T09:00:00.000Z' });
  store = recordLaundryPayment(store, { ...bundle, amountPaid: 2000, at: '2026-10-14T17:00:00.000Z' });
  return store;
};

beforeEach(() => {
  rpc.mockReset();
  localStorage.clear();
  localStorage.setItem('storeflow_staff_session', JSON.stringify({ token: 't', expiresAt: '2099-01-01', lastOnlineAt: new Date().toISOString(), pinHash: 'x', worker: { id: 'm1', name: 'Marta', role: 'attendant' }, storeRef: 'SF-WSH001' }));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

describe("the worker's phone", () => {
  it('finds the taking-in with its deposit, and each later payment', () => {
    expect(unsentLaundryPayments(workerCopy())).toEqual([
      { id: `laundry-${REF}-in`, kind: 'intake', clientRef: REF, amount: 1000, at: '2026-10-14T09:00:00.000Z' },
      { id: `laundry-${REF}-${Date.parse('2026-10-14T17:00:00.000Z')}`, kind: 'payment', clientRef: REF, amount: 2000, at: '2026-10-14T17:00:00.000Z' },
    ]);
  });

  it('sends them once, and keeps any the cloud has not taken for the next send', async () => {
    const store = workerCopy();
    const [intake, payment] = unsentLaundryPayments(store);
    // The cloud takes the intake; the bundle's later payment waits (say, a moment early).
    rpc.mockResolvedValueOnce({ data: { ok: true, payments: [intake.id] }, error: null });
    expect(await sendWorkerRecords(store)).toEqual({ state: 'sent' });
    expect(rpc).toHaveBeenCalledWith('staff_send_payments', expect.objectContaining({ p_token: 't', p_payments: [intake, payment] }));
    expect(unsentLaundryPayments(store)).toEqual([payment]);

    rpc.mockResolvedValueOnce({ data: { ok: true, payments: [payment.id] }, error: null });
    await sendWorkerRecords(store);
    expect(unsentLaundryPayments(store)).toEqual([]);
    rpc.mockClear();
    expect(await sendWorkerRecords(store)).toEqual({ state: 'nothing' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a phone with nothing taken asks nothing', async () => {
    const store = { accessCode: 'STAFF-SF-WSH001', pendingPayments: [], staffDevice: { requestId: 'r1', storeRef: 'SF-WSH001', staffId: 'm1' } } as unknown as StoreData;
    expect(await sendWorkerRecords(store)).toEqual({ state: 'nothing' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("the owner's phone", () => {
  const arrived: ArrivedPayment[] = [
    { id: `laundry-${REF}-in`, kind: 'intake', clientRef: REF, amount: 1000, at: '2026-10-14T09:00:00+00:00', staffName: 'Marta', total: 3000, tagCode: 'WSH-12', customerName: 'Ada', serviceId: 'wash', serviceName: 'Wash & Iron' },
    { id: `laundry-${REF}-1`, kind: 'payment', clientRef: REF, amount: 2000, at: '2026-10-14T17:00:00+00:00', staffName: 'Marta', total: 3000, tagCode: 'WSH-12', customerName: 'Ada', serviceId: 'wash', serviceName: 'Wash & Iron' },
  ];
  const owner = () => ({ accessCode: 'ABC123', storeName: 'Washlie', sales: [], pendingPayments: [] } as unknown as StoreData);

  it('books the money as sales and settles what is owed, naming who took it', () => {
    const { store, added } = addArrivedPayments(owner(), arrived);
    expect(added).toBe(2);
    expect((store.sales || []).map(sale => sale.total)).toEqual([1000, 2000]);
    const owed = store.pendingPayments?.find(entry => entry.id === `laundry-${REF}`);
    expect(owed).toMatchObject({ total: 3000, paid: 3000, balance: 0, status: 'paid' });
    expect(owed?.events?.[0].note).toContain('taken by Marta');
  });

  it('books each payment once, however often it arrives', () => {
    const once = addArrivedPayments(owner(), arrived).store;
    const twice = addArrivedPayments(once, arrived);
    expect(twice.added).toBe(0);
    expect(twice.store.sales).toHaveLength(2);
  });

  it('turns a bundle taken in with nothing paid into what the customer owes', () => {
    const { store } = addArrivedPayments(owner(), [{ ...arrived[0], amount: 0 }]);
    expect(store.sales).toHaveLength(0);
    expect(store.pendingPayments?.[0]).toMatchObject({ total: 3000, paid: 0, balance: 3000, status: 'pending' });
  });

  it('remembers only the newest few hundred ids', () => {
    const many = Array.from({ length: 320 }, (_, i) => `x${i}`);
    const { store } = addArrivedPayments({ ...owner(), appliedStaffPayments: many } as StoreData, arrived);
    expect(store.appliedStaffPayments).toHaveLength(300);
    expect(store.appliedStaffPayments?.slice(-2)).toEqual(arrived.map(payment => payment.id));
  });
});

describe('who moved a service order', () => {
  it('is noted when the status changes, not on every pause and resume', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain("rpc('service_order_note_step'");
    expect(index).toContain('getNormalizedStatus(before.status) !== getNormalizedStatus(newStatus)');
  });
});
