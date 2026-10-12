import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  rpcAheadOfTypes: (...args: unknown[]) => rpc(...args),
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { submitStaffExpense } from '@/lib/staff-expenses';
import { markViewAsSent, sendWorkerRecords, unsentRecords, workerStoreFromView } from '@/lib/staff-session';
import { addArrivedRecords, collectStaffRecords } from '@/lib/staff-records';
import { mergeStoreSnapshot } from '@/lib/store-sync-guard';
import { writeJoin, readJoin } from '@/lib/staff-join';
import StaffExpenseButton from '@/components/staff/StaffExpenseButton';

/**
 * Step 5c: what a worker records on their own phone - new customers, their
 * expenses, their piece work - reaches the owner's phone and books. The
 * cloud's half (add-only, the owner's rates, the worker's identity from the
 * staff list) was tested against the live database in the migration's dry
 * run; this is both phones' half.
 */

const today = () => new Date().toISOString().slice(0, 10);
const joined = { requestId: 'r1', storeRef: 'SF-WSH001', storeName: 'Washlie', staffId: 's1', staffName: 'Faith', staffRole: 'attendant', status: 'authorized' as const };
const faith = { id: 's1', name: 'Faith', role: 'attendant' };

function workerCopy(rule: Record<string, unknown> = {}): StoreData {
  const view = {
    storeName: 'Washlie', businessType: 'laundry',
    customers: [{ id: 'c-old', name: 'Ada', phone: '0802' }],
    staffMembers: [{ id: 's1', name: 'Faith', role: 'attendant' }],
    managerSettings: rule,
  };
  const copy = workerStoreFromView(view, joined, 'SF-WSH001', null);
  markViewAsSent(copy.accessCode, view);
  return copy;
}

function ownerShop(settings: Record<string, unknown> = {}): StoreData {
  return {
    storeName: 'Washlie', accessCode: 'ABC123', storeId: 'SF-WSH001', products: [], sales: [], expenses: [],
    customers: [{ id: 'c-old', name: 'Ada', phone: '0802', totalPurchases: 45000, outstandingDebt: 3000, purchaseHistory: [], loyaltyPoints: 0, visitsCount: 4 }],
    cashBalance: 100000, staffMembers: [{ ...faith, pin: '1234' }], managerSettings: settings, createdAt: new Date(0).toISOString(),
  } as unknown as StoreData;
}

function signedIn() {
  writeJoin(joined);
  localStorage.setItem('storeflow_staff_session', JSON.stringify({
    token: 'the-pass', expiresAt: new Date(Date.now() + 3600e3).toISOString(), lastOnlineAt: new Date().toISOString(),
    pinHash: 'x', worker: faith, storeRef: 'SF-WSH001',
  }));
}

beforeEach(() => { rpc.mockReset(); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); });
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('on the worker’s phone', () => {
  it('an expense waits to be sent: no book, no balance, no notification there', () => {
    const result = submitStaffExpense(workerCopy({ staffExpenseApproval: 'immediate' }), faith, { amount: 200, category: 'Consumables', note: 'Hypo', date: today(), paidFrom: 'cash' });
    if ('error' in result) throw new Error(result.error);
    expect(result.request.status).toBe('pending');
    expect(result.store.expenses).toHaveLength(0);
    expect(result.store.flowNotifications || []).toHaveLength(0);
  });

  it('says Recorded when the shop records straight away, and Waiting when it does not', () => {
    for (const [rule, label] of [[{ staffExpenseApproval: 'immediate' }, 'Recorded'], [{}, 'Waiting for owner approval']] as const) {
      render(<StaffExpenseButton store={workerCopy(rule)} currentUser={faith} onUpdate={() => {}} />);
      fireEvent.click(screen.getByRole('button', { name: /Record Expense/ }));
      const form = screen.getByRole('dialog', { name: 'Record expense' });
      fireEvent.change(within(form).getByPlaceholderText('0'), { target: { value: '200' } });
      fireEvent.change(within(form).getByPlaceholderText(/Hypo/), { target: { value: 'Hypo' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Save expense' }));
      expect(within(form).getByText(label)).toBeTruthy();
      cleanup();
    }
  });

  it('sends only what it recorded and the cloud has not got', () => {
    let copy = workerCopy();
    const result = submitStaffExpense(copy, faith, { amount: 500, category: 'Transport', note: 'Delivery', date: today(), paidFrom: 'cash' });
    if ('error' in result) throw new Error(result.error);
    copy = {
      ...result.store,
      customers: [{ id: 'c-new', name: 'Bisi', phone: '0803', address: '' } as never, ...(result.store.customers || [])],
      pieceWork: [
        { id: 'w1', workerId: 's1', workerName: 'Faith', task: 'ironing', garmentType: 'Shirt', quantity: 4, rate: 9999, amount: 1, approved: true } as never,
        { id: 'w2', workerId: 's9', workerName: 'Someone else', task: 'ironing', garmentType: 'Shirt', quantity: 1 } as never,
      ],
    };
    const unsent = unsentRecords(copy);
    expect(unsent.customers.map(c => c.id)).toEqual(['c-new']);
    expect(unsent.expenseRequests).toHaveLength(1);
    expect(unsent.expenseRequests[0]).not.toHaveProperty('status');
    expect(unsent.expenseRequests[0]).not.toHaveProperty('recordedBy');
    expect(unsent.pieceWork.map(w => w.id)).toEqual(['w1']);
    expect(unsent.pieceWork[0]).not.toHaveProperty('rate');
    expect(unsent.pieceWork[0]).not.toHaveProperty('approved');
  });

  it('sends through the worker’s door once, then not again', async () => {
    signedIn();
    rpc.mockResolvedValue({ data: { ok: true, customers: ['c-new'], expenses: [], pieceWork: [] }, error: null });
    const copy = { ...workerCopy(), customers: [{ id: 'c-new', name: 'Bisi', phone: '0803' } as never] } as StoreData;
    expect((await sendWorkerRecords(copy)).state).toBe('sent');
    expect(rpc).toHaveBeenCalledWith('staff_send_records', expect.objectContaining({ p_token: 'the-pass', p_customers: [{ id: 'c-new', name: 'Bisi', phone: '0803', address: undefined }] }));
    expect((await sendWorkerRecords(copy)).state).toBe('nothing');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('keeps them when it cannot send, and is signed out if revoked', async () => {
    signedIn();
    const copy = { ...workerCopy(), customers: [{ id: 'c-new', name: 'Bisi', phone: '0803' } as never] } as StoreData;
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'expired' }, error: null });
    expect((await sendWorkerRecords(copy)).state).toBe('unchanged');
    expect(unsentRecords(copy).customers).toHaveLength(1);
    rpc.mockResolvedValueOnce({ data: { ok: false, error: 'revoked' }, error: null });
    expect((await sendWorkerRecords(copy)).state).toBe('shut_out');
    expect(readJoin()).toBeNull();
  });

  it('fills the money fields the copy leaves out, so customer screens have numbers', () => {
    const copy = workerCopy();
    expect(copy.customers![0]).toMatchObject({ totalPurchases: 0, outstandingDebt: 0, purchaseHistory: [], visitsCount: 0 });
  });
});

describe('on the owner’s phone', () => {
  const arrivedExpense = (amount: number) => ({
    id: `x${amount}`, amount, category: 'Consumables', note: 'Hypo', date: new Date().toISOString(), paidFrom: 'cash',
    recordedBy: { staffId: 's1', name: 'Faith', role: 'attendant' }, recordedAt: new Date().toISOString(), status: 'pending',
  }) as never;

  it('adds what arrived, once, without touching what is already here', () => {
    const shop = ownerShop();
    const arrived = { customers: [{ id: 'c-new', name: 'Bisi' } as never, { id: 'c-old', name: 'Ada RENAMED' } as never] };
    const first = addArrivedRecords(shop, arrived);
    expect(first.added).toBe(1);
    expect(first.store.customers!.map(c => c.name)).toEqual(['Bisi', 'Ada']);
    expect(addArrivedRecords(first.store, arrived).added).toBe(0);
  });

  it('waits for Approve, with a notification, when the shop asks first', () => {
    const { store } = addArrivedRecords(ownerShop(), { staffExpenseRequests: [arrivedExpense(200)] });
    expect(store.expenses).toHaveLength(0);
    expect(store.cashBalance).toBe(100000);
    expect(store.flowNotifications?.[0].title).toBe('Faith recorded an expense');
  });

  it('goes straight into the book when the shop records immediately, or under the limit', () => {
    const immediate = addArrivedRecords(ownerShop({ staffExpenseApproval: 'immediate' }), { staffExpenseRequests: [arrivedExpense(200)] }).store;
    expect(immediate.expenses![0]).toMatchObject({ amount: 200, recordedBy: { name: 'Faith' } });
    expect(immediate.cashBalance).toBe(99800);
    const limited = addArrivedRecords(ownerShop({ staffExpenseFreeLimit: 1000 }), { staffExpenseRequests: [arrivedExpense(500), arrivedExpense(3000)] }).store;
    expect(limited.expenses!.map(e => e.amount)).toEqual([500]);
    expect(limited.staffExpenseRequests!.find(r => r.amount === 3000)?.status).toBe('pending');
  });

  it('asks only for what is new since last time', async () => {
    rpc.mockResolvedValueOnce({ data: { ok: true, as_of: '2026-10-12T13:00:00Z', customers: [{ id: 'c-new', name: 'Bisi' }], staffExpenseRequests: [], pieceWork: [] }, error: null });
    const shop = ownerShop();
    const next = await collectStaffRecords(shop);
    expect(rpc.mock.calls[0]).toEqual(['store_staff_records_since', { p_store_ref: 'SF-WSH001', p_since: null }]);
    expect(next?.customers).toHaveLength(2);
    rpc.mockResolvedValueOnce({ data: { ok: true, as_of: '2026-10-12T13:10:00Z', customers: [], staffExpenseRequests: [], pieceWork: [] }, error: null });
    expect(await collectStaffRecords(next!)).toBeNull();
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_since: '2026-10-12T13:00:00Z' });
  });
});

describe('two phones adding at once', () => {
  const A = { id: 'A', name: 'Ada' };
  const W = { id: 'W', name: 'From Faith' };
  it('keeps both phones’ customers', () => {
    const merged = mergeStoreSnapshot({ customers: [A] }, { customers: [{ id: 'X', name: 'Owner new' }, A] }, { customers: [W, A] });
    expect((merged.customers as { id: string }[]).map(c => c.id)).toEqual(['X', 'W', 'A']);
  });
  it('lets a sale through while a customer was added elsewhere', () => {
    const merged = mergeStoreSnapshot({ customers: [A], sales: [] }, { customers: [A], sales: [{ id: 's1' }] }, { customers: [W, A], sales: [] });
    expect(merged.sales).toHaveLength(1);
    expect((merged.customers as { id: string }[]).map(c => c.id)).toEqual(['W', 'A']);
  });
  it('still refuses the same customer changed two ways, and stock clashes', () => {
    expect(() => mergeStoreSnapshot({ customers: [A] }, { customers: [{ id: 'A', name: 'Ada O' }] }, { customers: [{ id: 'A', name: 'Ada X' }] })).toThrow(/same record/);
    expect(() => mergeStoreSnapshot({ products: [{ id: 'p', quantity: 5 }] }, { products: [{ id: 'p', quantity: 4 }] }, { products: [{ id: 'p', quantity: 3 }] })).toThrow(/stock or payments/);
  });
});
