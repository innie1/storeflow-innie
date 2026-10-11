import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';
import Expenses from '@/components/Expenses';
import StaffExpenseButton from '@/components/staff/StaffExpenseButton';
import SupplySheet from '@/components/SupplySheet';
import { addExpense, deleteExpense, restoreTrashItem } from '@/lib/store-data';
import { markSupplyPurchased } from '@/lib/consumables';
import {
  approveStaffExpense, expenseRecorders, filterExpenseBook, groupByDay, rejectStaffExpense, submitStaffExpense,
} from '@/lib/staff-expenses';
import { canOpenTab } from '@/lib/permissions';
import { setCurrentActor } from '@/lib/current-actor';
import { readSource } from './helpers/source';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

/**
 * Step 2 - a worker sees their own expenses, the owner sees the book by who
 * entered it - and three faults found on the way: supplies bought never left
 * the cash, an expense restored from the bin never left it again, and the Flow
 * button was a dead end for workers.
 */

const faith = { id: 's1', name: 'Faith', pin: '1234', role: 'attendant' };
const tunde = { id: 's2', name: 'Tunde', pin: '5678', role: 'attendant' };
const owner = { name: 'Owner', role: 'owner' };
const day = (offset = 0) => {
  const d = new Date(Date.now() - offset * 86400000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const shop = (): StoreData => ({
  storeName: 'Washlie', accessCode: 'WSH003', storeType: 'laundry', businessType: 'laundry', products: [], sales: [],
  expenses: [{ id: 'rent', amount: 40000, category: 'Rent', date: new Date().toISOString() }],
  customers: [], pendingPayments: [], cashBalance: 100000, bankBalance: 20000, walletBalance: 0,
  staffMembers: [faith, tunde], managerSettings: {}, recurringBills: [],
  createdAt: new Date(0).toISOString(),
} as unknown as StoreData);

function record(store: StoreData, worker: typeof faith, amount: number, note: string, date = day()) {
  const result = submitStaffExpense(store, worker, { amount, category: 'Transport', note, date, paidFrom: 'cash' });
  if ('error' in result) throw new Error(result.error);
  return result;
}

/** Faith: ₦500 approved today, ₦1,500 waiting today, ₦300 rejected yesterday. Tunde: ₦800 approved. */
function busyShop() {
  let s = shop();
  const a = record(s, faith, 500, 'Customer delivery'); s = approveStaffExpense(a.store, a.request.id, owner);
  const b = record(s, faith, 1500, 'Fuel'); s = b.store;
  const c = record(s, faith, 300, 'Bike', day(1)); s = rejectStaffExpense(c.store, c.request.id, owner);
  const d = record(s, tunde, 800, 'Nylon'); s = approveStaffExpense(d.store, d.request.id, owner);
  return s;
}

afterEach(() => { cleanup(); localStorage.clear(); setCurrentActor(null); });

describe('the book by who entered it', () => {
  it('splits owner, staff, one worker, and keeps waiting ones out of the book', () => {
    const s = busyShop();
    const book = s.expenses || [];
    expect(filterExpenseBook(book, 'all')).toHaveLength(3);
    expect(filterExpenseBook(book, 'owner').map(e => e.id)).toEqual(['rent']);
    expect(filterExpenseBook(book, 'staff').map(e => e.amount).sort()).toEqual([500, 800]);
    expect(filterExpenseBook(book, 'all', 's1').map(e => e.amount)).toEqual([500]);
    expect(filterExpenseBook(book, 'pending')).toEqual([]);
    expect(expenseRecorders(s).map(r => r.name)).toEqual(['Faith', 'Tunde']);
  });

  it("groups a worker's own by the day they spent it", () => {
    const s = busyShop();
    const days = groupByDay((s.staffExpenseRequests || []).filter(r => r.recordedBy.staffId === 's1'));
    expect(days.map(d => d.label)).toEqual(['Today', 'Yesterday']);
    expect(days[0].items.map(i => i.amount).sort()).toEqual([1500, 500]);
  });
});

describe("a worker's My expenses", () => {
  it('lists only their own, with what became of each, and no total', () => {
    render(<StaffExpenseButton store={busyShop()} currentUser={{ id: 's1', name: 'Faith', role: 'attendant' }} onUpdate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /My expenses/ }));
    const sheet = screen.getByRole('dialog', { name: 'My expenses' });
    expect(within(sheet).getByText('Today')).toBeTruthy();
    expect(within(sheet).getByText('Yesterday')).toBeTruthy();
    expect(within(sheet).getByText('₦500 Customer delivery').closest('li')?.textContent).toContain('Approved');
    expect(within(sheet).getByText('₦1,500 Fuel').closest('li')?.textContent).toContain('Waiting for approval');
    expect(within(sheet).getByText('₦300 Bike').closest('li')?.textContent).toContain('Rejected');
    const text = sheet.textContent || '';
    expect(text).not.toContain('Nylon');
    expect(text).not.toContain('40,000');
    expect(text).not.toMatch(/total/i);
  });

  it('is not offered before they have recorded anything', () => {
    render(<StaffExpenseButton store={shop()} currentUser={{ id: 's1', role: 'attendant' }} onUpdate={() => {}} />);
    expect(screen.queryByRole('button', { name: /My expenses/ })).toBeNull();
  });
});

describe("the owner's filters", () => {
  const page = () => render(<Expenses store={busyShop()} onUpdate={() => {}} currentUser={{ role: 'owner', name: 'Owner' }} />);
  const list = () => document.body.textContent || '';

  it('Staff shows only workers’ expenses', () => {
    page();
    fireEvent.click(screen.getByRole('button', { name: 'Staff' }));
    expect(screen.getByText(/2 expenses · ₦1,300 in this view/)).toBeTruthy();
  });

  it('Owner shows only the owner’s', () => {
    page();
    fireEvent.click(screen.getByRole('button', { name: 'Owner' }));
    expect(screen.getByText(/1 expense · ₦40,000 in this view/)).toBeTruthy();
  });

  it('one employee', () => {
    page();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by employee' }), { target: { value: 's2' } });
    expect(screen.getByText(/1 expense · ₦800 in this view/)).toBeTruthy();
    // Faith's waiting expense is not Tunde's.
    expect(screen.queryByText('Waiting for approval (1)')).toBeNull();
  });

  it('Pending lists what waits, still out of the total', () => {
    page();
    fireEvent.click(screen.getByRole('button', { name: 'Pending (1)' }));
    expect(screen.getByText('Waiting for approval (1)')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
    expect(screen.getByText('₦41,300', { selector: 'p.text-2xl' })).toBeTruthy();
    expect(list()).not.toContain('Nylon');
  });
});

describe('supplies bought', () => {
  it('leave the cash, like any other expense', () => {
    const s = markSupplyPurchased(shop(), { supply: { id: 'soap', name: 'Soap', unit: 'bag' }, amount: 12000 } as never);
    expect(s.cashBalance).toBe(88000);
    expect(s.expenses![0]).toMatchObject({ amount: 12000, paidFrom: 'cash' });
    expect(s.bankBalance).toBe(20000);
  });

  it('are saved, not only shown', () => {
    const s = { ...shop(), supplies: [{ id: 'soap', name: 'Soap', unit: 'bag' }] } as StoreData;
    render(<SupplySheet store={s} onUpdate={() => {}} onClose={() => {}} canSeeMoney showToast={() => {}} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Bought' })[0]);
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '9000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record it' }));
    const saved = JSON.parse(localStorage.getItem('storeflow_WSH003') || '{}');
    expect(saved.cashBalance).toBe(91000);
  });
});

describe('an expense restored from the bin', () => {
  it('takes the money out again, from the balance it came from', () => {
    const added = addExpense(shop(), { amount: 3000, category: 'Transport', date: new Date().toISOString(), paidFrom: 'bank' });
    const deleted = deleteExpense(added, added.expenses![0].id);
    expect(deleted.bankBalance).toBe(20000);
    const restored = restoreTrashItem(deleted, deleted.trash![0].id);
    expect(restored.bankBalance).toBe(17000);
    expect(restored.cashBalance).toBe(100000);
    expect(restored.expenses!.filter(e => e.amount === 3000)).toHaveLength(1);
  });

  it('keeps its author: an old one with no name was the owner’s', () => {
    const old = { ...shop(), expenses: [{ id: 'e9', amount: 700, category: 'Other', date: new Date().toISOString(), note: 'x' }] } as StoreData;
    setCurrentActor({ id: 'm1', name: 'Ada', role: 'manager' });
    const deleted = deleteExpense(old, 'e9');
    const restored = restoreTrashItem(deleted, deleted.trash![0].id);
    expect(restored.expenses!.find(e => e.id === 'e9')?.recordedBy?.role).toBe('owner');
    expect(restored.activityLogs?.[0]).toMatchObject({ user: 'Ada', action: 'Restored expense: Other - ₦700 (x)' });
  });
});

describe('the Flow button', () => {
  it('is shown only to people who can open Flow', () => {
    expect(canOpenTab('manager', { role: 'attendant' })).toBe(false);
    expect(canOpenTab('manager', { role: 'owner' })).toBe(true);
    const index = readSource('src/pages/Index.tsx');
    expect(index).toMatch(/isTabAllowed\('manager', currentUser\) && \(\s*<FlowShirtFab/);
  });
});
