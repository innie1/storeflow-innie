import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';
import StaffExpenseButton from '@/components/staff/StaffExpenseButton';
import StaffExpenseSettings from '@/components/staff/StaffExpenseSettings';
import Expenses from '@/components/Expenses';
import { submitStaffExpense } from '@/lib/staff-expenses';

vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

/**
 * The worker's side shows the one expense they entered and nothing else; the
 * owner's side holds it apart from the totals until they decide.
 */

const faith = { id: 's1', name: 'Faith', pin: '1234', role: 'attendant' };
const ada = { id: 'm1', name: 'Ada', pin: '5678', role: 'manager' };

const shop = (settings: Record<string, unknown> = {}): StoreData => ({
  storeName: 'Washlie', accessCode: 'WSH002', storeType: 'laundry', businessType: 'laundry', products: [], sales: [],
  expenses: [{ id: 'old', amount: 40000, category: 'Rent', date: new Date().toISOString() }],
  customers: [], pendingPayments: [], cashBalance: 250000, bankBalance: 0, walletBalance: 0,
  staffMembers: [faith, ada], managerSettings: settings, recurringBills: [],
  createdAt: new Date(0).toISOString(),
} as unknown as StoreData);

afterEach(() => { cleanup(); localStorage.clear(); });

function recordHypo(store: StoreData, onUpdate = vi.fn()) {
  render(<StaffExpenseButton store={store} currentUser={{ id: 's1', name: 'Faith', role: 'attendant' }} onUpdate={onUpdate} />);
  fireEvent.click(screen.getByRole('button', { name: /Record Expense/ }));
  const form = screen.getByRole('dialog', { name: 'Record expense' });
  fireEvent.change(within(form).getByPlaceholderText('0'), { target: { value: '200' } });
  fireEvent.change(within(form).getByPlaceholderText(/Hypo/), { target: { value: 'Hypo' } });
  fireEvent.click(within(form).getByRole('button', { name: 'Save expense' }));
  return { form, onUpdate };
}

describe("a worker's Record Expense", () => {
  it('is on the home screen for a worker, not for the owner or a manager', () => {
    render(<StaffExpenseButton store={shop()} currentUser={{ id: 's1', role: 'attendant' }} onUpdate={() => {}} />);
    expect(screen.getByRole('button', { name: /Record Expense/ })).toBeTruthy();
    cleanup();
    render(<StaffExpenseButton store={shop()} currentUser={{ role: 'owner' }} onUpdate={() => {}} />);
    expect(screen.queryByRole('button', { name: /Record Expense/ })).toBeNull();
    cleanup();
    render(<StaffExpenseButton store={shop()} currentUser={{ id: 'm1', role: 'manager' }} onUpdate={() => {}} />);
    expect(screen.queryByRole('button', { name: /Record Expense/ })).toBeNull();
  });

  it('offers only the categories a worker spends on', () => {
    render(<StaffExpenseButton store={shop()} currentUser={{ id: 's1', role: 'attendant' }} onUpdate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Record Expense/ }));
    const form = screen.getByRole('dialog', { name: 'Record expense' });
    for (const shown of ['Consumables', 'Transport', 'Utilities', 'Other']) expect(within(form).getByRole('button', { name: shown })).toBeTruthy();
    for (const hidden of ['Rent', 'Salaries', 'Piece work', 'Restock']) expect(within(form).queryByRole('button', { name: hidden })).toBeNull();
  });

  it('shows the worker their expense and nothing of the shop', () => {
    const { form, onUpdate } = recordHypo(shop());
    expect(within(form).getByText('Expense recorded')).toBeTruthy();
    expect(within(form).getByText(/₦200 • Consumables • Hypo/)).toBeTruthy();
    expect(within(form).getByText('Waiting for owner approval')).toBeTruthy();
    const text = form.textContent || '';
    expect(text).not.toMatch(/40,000|250,000|Total|Balance|Profit|Net/i);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect((onUpdate.mock.calls[0][0] as StoreData).staffExpenseRequests).toHaveLength(1);
  });

  it('says Approved when the shop records straight away', () => {
    const { form } = recordHypo(shop({ staffExpenseApproval: 'immediate' }));
    expect(within(form).getByText('Approved')).toBeTruthy();
  });
});

describe("the owner's Expenses page", () => {
  const waiting = () => {
    const result = submitStaffExpense(shop(), faith, { amount: 200, category: 'Consumables', note: 'Hypo', date: new Date().toISOString().slice(0, 10), paidFrom: 'cash' });
    if ('error' in result) throw new Error(result.error);
    return result.store;
  };

  it('holds a waiting expense apart from the total, and approving counts it once', () => {
    const onUpdate = vi.fn();
    render(<Expenses store={waiting()} onUpdate={onUpdate} currentUser={{ role: 'owner', name: 'Owner' }} />);
    expect(screen.getByText('Waiting for approval (1)')).toBeTruthy();
    expect(screen.getByText(/Recorded by Faith • Attendant/)).toBeTruthy();
    expect(screen.getByText('₦40,000', { selector: 'p.text-2xl' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    const approved = onUpdate.mock.calls[0][0] as StoreData;
    expect(approved.expenses).toHaveLength(2);
    expect(approved.cashBalance).toBe(249800);
  });

  it('shows who recorded an approved expense', () => {
    const result = submitStaffExpense(shop({ staffExpenseApproval: 'immediate' }), faith, { amount: 500, category: 'Transport', note: 'Customer delivery', date: new Date().toISOString().slice(0, 10), paidFrom: 'cash' });
    if ('error' in result) throw new Error(result.error);
    render(<Expenses store={result.store} onUpdate={() => {}} currentUser={{ role: 'owner', name: 'Owner' }} />);
    expect(screen.getByText(/Recorded by Faith • Attendant/)).toBeTruthy();
  });

  it('gives nobody but the owner the Approve button', () => {
    render(<Expenses store={waiting()} onUpdate={() => {}} currentUser={{ id: 'a1', role: 'accountant', name: 'Bola' }} />);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('Waiting for the owner.')).toBeTruthy();
  });
});

describe('the Staff expenses setting', () => {
  it('starts on approval and saves a limit', () => {
    const onUpdate = vi.fn();
    render(<StaffExpenseSettings store={shop()} onUpdate={onUpdate} />);
    const limit = screen.getByPlaceholderText(/every expense waits/);
    fireEvent.change(limit, { target: { value: '1000' } });
    fireEvent.blur(limit);
    expect((onUpdate.mock.calls[0][0] as StoreData).managerSettings?.staffExpenseFreeLimit).toBe(1000);
    fireEvent.click(screen.getByRole('button', { name: /Record straight away/ }));
    expect((onUpdate.mock.calls[1][0] as StoreData).managerSettings?.staffExpenseApproval).toBe('immediate');
  });
});
