import { afterEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { addExpense, deleteExpense, sumOperatingExpenses } from '@/lib/store-data';
import {
  approveStaffExpense, mustWait, myStaffExpenses, pendingStaffExpenses, recordsAsStaff,
  rejectStaffExpense, submitStaffExpense, type StaffExpenseInput,
} from '@/lib/staff-expenses';
import { visibleNotifications } from '@/lib/notification-gate';
import { setCurrentActor } from '@/lib/current-actor';

/**
 * "Record expense" without "see finances".
 *
 * A worker who spent ₦200 on Hypo can say so; whether it counts is the
 * owner's call by default; and nothing waiting reaches a total.
 */

const faith = { id: 's1', name: 'Faith', role: 'attendant' };
const owner = { name: 'Owner', role: 'owner' };
const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const shop = (settings: Record<string, unknown> = {}): StoreData => ({
  storeName: 'Washlie', accessCode: 'WSH001', storeType: 'laundry', products: [], sales: [],
  expenses: [], customers: [], pendingPayments: [], cashBalance: 10000, bankBalance: 5000, walletBalance: 0,
  staffMembers: [{ ...faith, pin: '1234' }], managerSettings: settings,
  createdAt: new Date(0).toISOString(),
} as unknown as StoreData);

const hypo: StaffExpenseInput = { amount: 200, category: 'Consumables', note: 'Hypo', date: today(), paidFrom: 'cash' };

function submit(store: StoreData, input = hypo) {
  const result = submitStaffExpense(store, faith, input);
  if ('error' in result) throw new Error(result.error);
  return result;
}

afterEach(() => { localStorage.clear(); setCurrentActor(null); });

describe('a worker records an expense', () => {
  it('waits for the owner by default, and touches no total while it waits', () => {
    const { store, request } = submit(shop());
    expect(request.status).toBe('pending');
    expect(store.expenses).toHaveLength(0);
    expect(sumOperatingExpenses(store)).toBe(0);
    expect(store.cashBalance).toBe(10000);
    expect(pendingStaffExpenses(store)).toHaveLength(1);
  });

  it('says who recorded it', () => {
    const { request, store } = submit(shop());
    expect(request.recordedBy).toEqual({ staffId: 's1', name: 'Faith', role: 'attendant' });
    expect(store.activityLogs?.[0]).toMatchObject({ user: 'Faith', role: 'attendant' });
    expect(store.activityLogs?.[0].action).toContain('Consumables - ₦200 (Hypo)');
  });

  it('tells the owner, but not other workers', () => {
    const { store } = submit(shop());
    const notice = store.flowNotifications?.[0];
    expect(notice?.title).toBe('Faith recorded an expense');
    expect(visibleNotifications(store.flowNotifications || [], { role: 'owner' })).toHaveLength(1);
    expect(visibleNotifications(store.flowNotifications || [], { role: 'attendant' })).toHaveLength(0);
  });

  it('goes straight in when the shop records immediately', () => {
    const { store, request } = submit(shop({ staffExpenseApproval: 'immediate' }));
    expect(request.status).toBe('approved');
    expect(request.autoApproved).toBe(true);
    expect(store.expenses).toHaveLength(1);
    expect(store.expenses![0].recordedBy?.name).toBe('Faith');
    expect(store.cashBalance).toBe(9800);
    expect(store.flowNotifications || []).toHaveLength(0);
    expect(store.activityLogs?.[0].action).toBe('Recorded expense: Consumables - ₦200 (Hypo)');
  });

  it('goes straight in up to the limit, and waits above it', () => {
    const limited = shop({ staffExpenseFreeLimit: 1000 });
    expect(submit(limited, { ...hypo, amount: 500 }).request.status).toBe('approved');
    expect(submit(limited, { ...hypo, amount: 1000 }).request.status).toBe('approved');
    expect(submit(limited, { ...hypo, amount: 3000 }).request.status).toBe('pending');
    expect(mustWait(shop({ staffExpenseFreeLimit: 0 }), 1)).toBe(true);
  });

  it('refuses what cannot be right', () => {
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    for (const bad of [
      { ...hypo, amount: 0 },
      { ...hypo, note: '  ' },
      { ...hypo, category: 'Salaries' as const },
      { ...hypo, category: 'Rent' as const },
      { ...hypo, date: tomorrow },
    ]) {
      expect('error' in submitStaffExpense(shop(), faith, bad)).toBe(true);
    }
  });
});

describe('the owner decides', () => {
  it('approving puts it in the book exactly once, out of the balance it was paid from', () => {
    const { store, request } = submit(shop(), { ...hypo, paidFrom: 'bank' });
    const approved = approveStaffExpense(store, request.id, owner);
    expect(approved.expenses).toHaveLength(1);
    expect(sumOperatingExpenses(approved)).toBe(200);
    expect(approved.bankBalance).toBe(4800);
    expect(approved.cashBalance).toBe(10000);
    expect(approved.expenses![0]).toMatchObject({ recordedBy: { name: 'Faith', role: 'attendant' }, paidFrom: 'bank' });
    expect(approved.expenses![0].approvedAt).toBeTruthy();
    expect(approved.activityLogs?.[0]).toMatchObject({ user: 'Owner', action: "Approved Faith's expense: Consumables - ₦200 (Hypo)" });
    expect(approved.flowNotifications?.[0].read).toBe(true);

    // A second tap, or a stale screen, does nothing.
    const again = approveStaffExpense(approved, request.id, owner);
    expect(again.expenses).toHaveLength(1);
    expect(again.bankBalance).toBe(4800);
    expect(rejectStaffExpense(approved, request.id, owner).expenses).toHaveLength(1);
  });

  it('rejecting never touches the book', () => {
    const { store, request } = submit(shop());
    const rejected = rejectStaffExpense(store, request.id, owner);
    expect(rejected.expenses).toHaveLength(0);
    expect(rejected.cashBalance).toBe(10000);
    expect(myStaffExpenses(rejected, 's1')[0].status).toBe('rejected');
    expect(approveStaffExpense(rejected, request.id, owner).expenses).toHaveLength(0);
  });

  it('no other worker can approve, and nobody their own', () => {
    const { store, request } = submit(shop());
    for (const who of [faith, { id: 's1', name: 'Faith', role: 'manager' }, { name: 'Sam', role: 'supervisor' }, { name: 'Bola', role: 'accountant' }]) {
      expect(approveStaffExpense(store, request.id, who)).toBe(store);
      expect(rejectStaffExpense(store, request.id, who)).toBe(store);
    }
  });

  it('a manager can decide while the owner is away, under their own name', () => {
    const { store, request } = submit(shop());
    const approved = approveStaffExpense(store, request.id, { id: 's9', name: 'Ada', role: 'manager' });
    expect(approved.expenses).toHaveLength(1);
    expect(approved.activityLogs?.[0]).toMatchObject({ user: 'Ada', role: 'manager', action: "Approved Faith's expense: Consumables - ₦200 (Hypo)" });
  });
});

describe('who counts as staff here', () => {
  it('is everyone signed in who does not run the shop', () => {
    expect(recordsAsStaff({ id: 's1', role: 'attendant' })).toBe(true);
    expect(recordsAsStaff({ id: 's2', role: 'cashier' })).toBe(true);
    expect(recordsAsStaff({ role: 'owner' })).toBe(false);
    expect(recordsAsStaff({ id: 's3', role: 'manager' })).toBe(false);
    expect(recordsAsStaff(null)).toBe(false);
  });
});

describe('a shop from before this', () => {
  it('reads old expenses as the owner paying cash, and deletes them back to cash', () => {
    const old = { ...shop(), expenses: [{ id: 'e1', amount: 500, category: 'Rent', date: new Date().toISOString() }] } as StoreData;
    expect(pendingStaffExpenses(old)).toEqual([]);
    expect(sumOperatingExpenses(old)).toBe(500);
    const deleted = deleteExpense(old, 'e1');
    expect(deleted.cashBalance).toBe(10500);
    expect(deleted.bankBalance).toBe(5000);
  });

  it('defaults a new shop to asking the owner first', () => {
    expect(mustWait(shop(), 1)).toBe(true);
  });
});

describe('every expense says who entered it', () => {
  it('stamps whoever is signed in, from any screen', () => {
    setCurrentActor({ id: 's9', name: 'Chi', role: 'accountant' });
    const store = addExpense(shop(), { amount: 300, category: 'Transport', date: new Date().toISOString(), paidFrom: 'wallet' });
    expect(store.expenses![0].recordedBy).toEqual({ staffId: 's9', name: 'Chi', role: 'accountant' });
    expect(store.activityLogs?.[0]).toMatchObject({ user: 'Chi', role: 'accountant', action: 'Recorded expense: Transport - ₦300' });
    expect(store.walletBalance).toBe(0);
  });

  it('is the owner when nobody else is signed in', () => {
    const store = addExpense(shop(), { amount: 300, category: 'Rent', date: new Date().toISOString() });
    expect(store.expenses![0].recordedBy).toMatchObject({ name: 'Owner', role: 'owner' });
    expect(store.cashBalance).toBe(9700);
  });

  it('logs a deletion too', () => {
    const added = addExpense(shop(), { amount: 300, category: 'Rent', date: new Date().toISOString(), paidFrom: 'bank' });
    const deleted = deleteExpense(added, added.expenses![0].id);
    expect(deleted.bankBalance).toBe(5000);
    expect(deleted.activityLogs?.[0].action).toBe('Deleted expense: Rent - ₦300');
  });
});

describe('an expense typed into Flow', () => {
  it("from a worker waits for the owner like the form, under the worker's name", async () => {
    const { flowAddExpense } = await import('@/lib/flow-finance-actions');
    setCurrentActor({ id: 's1', name: 'Faith', role: 'attendant' });
    const next = flowAddExpense(shop(), 200, 'Other', 'hypo');
    expect(next.expenses).toHaveLength(0);
    expect(next.cashBalance).toBe(10000);
    expect(pendingStaffExpenses(next)[0]).toMatchObject({ amount: 200, recordedBy: { name: 'Faith' } });
  });

  it('from a worker cannot slip in rent', async () => {
    const { flowAddExpense } = await import('@/lib/flow-finance-actions');
    setCurrentActor({ id: 's1', name: 'Faith', role: 'attendant' });
    expect(pendingStaffExpenses(flowAddExpense(shop(), 5000, 'Rent', 'rent'))[0].category).toBe('Other');
  });

  it('from the owner goes straight in, under the owner, not "Flow"', async () => {
    const { flowAddExpense } = await import('@/lib/flow-finance-actions');
    const next = flowAddExpense(shop(), 300, 'Transport', 'bike');
    expect(next.expenses![0].recordedBy).toMatchObject({ name: 'Owner', role: 'owner' });
    expect(next.activityLogs?.[0].user).toBe('Owner');
  });
});
