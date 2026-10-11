import type { ExpenseCategory, ExpensePaidFrom, FlowNotification, StaffExpenseRequest, StoreData } from '@/types/store';
import { addExpense } from '@/lib/store-data';
import { recordActivityLog } from '@/lib/activity-log';
import { describeExpense, recorderFor } from '@/lib/expense-log';
import { isManagement } from '@/lib/permissions';
import type { Actor } from '@/lib/current-actor';

/**
 * A worker telling the shop what they spent.
 *
 * Recording an expense and seeing the money are different trusts. An
 * attendant who bought Hypo for ₦200 has to be able to say so; that does not
 * make them somebody who sees the shop's balance or its profit. So this is
 * not the Expenses page - which opens on the totals - but its own small way
 * in, and what comes back to the worker is only the expense they entered.
 *
 * By default the owner agrees each one before it leaves the books. A waiting
 * expense is held in `staffExpenseRequests`, never in `expenses`; see
 * StaffExpenseRequest for why.
 */

/** What a worker can spend shop money on. Rent, wages and piece work are the owner's to pay. */
export const STAFF_EXPENSE_CATEGORIES: ExpenseCategory[] = ['Consumables', 'Transport', 'Utilities', 'Other'];

export const PAID_FROM_LABEL: Record<ExpensePaidFrom, string> = { cash: 'Cash', bank: 'Bank', wallet: 'Wallet' };

/** Anyone signed in who does not run the shop: they report, the owner decides. */
export function recordsAsStaff(user: { id?: string; role?: string } | null | undefined): boolean {
  return !!user?.id && !!user.role && !isManagement(user);
}

/** Only the owner agrees a worker's spending, so nobody approves their own. */
export function canApproveStaffExpenses(user: { role?: string } | null | undefined): boolean {
  return String(user?.role || '').toLowerCase() === 'owner';
}

export interface StaffExpenseRule {
  needsApproval: boolean;
  /** Up to this, an expense goes straight in even when approval is on. 0 means none do. */
  freeLimit: number;
}

export function staffExpenseRule(store: Pick<StoreData, 'managerSettings'>): StaffExpenseRule {
  const settings = store.managerSettings || {};
  const freeLimit = Math.max(0, Number(settings.staffExpenseFreeLimit) || 0);
  return { needsApproval: settings.staffExpenseApproval !== 'immediate', freeLimit };
}

/** Whether this amount has to wait for the owner under the shop's rule. */
export function mustWait(store: Pick<StoreData, 'managerSettings'>, amount: number): boolean {
  const rule = staffExpenseRule(store);
  if (!rule.needsApproval) return false;
  return !(rule.freeLimit > 0 && amount <= rule.freeLimit);
}

export interface StaffExpenseInput {
  amount: number;
  category: ExpenseCategory;
  note: string;
  /** YYYY-MM-DD, the day the money was spent. */
  date: string;
  paidFrom: ExpensePaidFrom;
}

export type SubmitResult =
  | { ok: true; store: StoreData; request: StaffExpenseRequest }
  | { ok: false; error: string };

const notificationId = (requestId: string) => `staff-expense-${requestId}`;

function newId(): string {
  return `sx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function todayKey(now: Date): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Put an approved request in the book, through addExpense like every other expense. */
function enterInBook(store: StoreData, request: StaffExpenseRequest, actor: Actor, at: Date, autoApproved: boolean): StoreData {
  const withExpense = addExpense(store, {
    amount: request.amount,
    category: request.category,
    date: request.date,
    note: request.note,
    paidFrom: request.paidFrom,
    recordedBy: request.recordedBy,
    approvedAt: autoApproved ? undefined : at.toISOString(),
  }, actor.name, actor.role, autoApproved
    ? undefined
    : `Approved ${request.recordedBy.name}'s expense: ${describeExpense(request)}`);
  const expenseId = withExpense.expenses?.[0]?.id;
  return {
    ...withExpense,
    staffExpenseRequests: (withExpense.staffExpenseRequests || []).map(item => item.id === request.id
      ? { ...item, status: 'approved' as const, autoApproved: autoApproved || undefined, decidedAt: at.toISOString(), expenseId }
      : item),
  };
}

export function submitStaffExpense(
  store: StoreData,
  worker: Actor & { id: string },
  input: StaffExpenseInput,
  now: Date = new Date(),
): SubmitResult {
  const amount = Math.round((Number(input.amount) || 0) * 100) / 100;
  if (!(amount > 0)) return { ok: false, error: 'Enter how much was spent.' };
  if (!STAFF_EXPENSE_CATEGORIES.includes(input.category)) return { ok: false, error: 'Pick what kind of expense it was.' };
  const note = (input.note || '').trim();
  if (!note) return { ok: false, error: 'Say what was bought or why.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')) return { ok: false, error: 'Pick the day it was spent.' };
  if (input.date > todayKey(now)) return { ok: false, error: 'That day has not come yet.' };
  if (!PAID_FROM_LABEL[input.paidFrom]) return { ok: false, error: 'Say where the money came from.' };

  const request: StaffExpenseRequest = {
    id: newId(),
    amount,
    category: input.category,
    note,
    date: new Date(`${input.date}T12:00:00`).toISOString(),
    paidFrom: input.paidFrom,
    recordedBy: recorderFor(worker),
    recordedAt: now.toISOString(),
    status: 'pending',
  };

  let next: StoreData = { ...store, staffExpenseRequests: [request, ...(store.staffExpenseRequests || [])] };

  if (!mustWait(store, amount)) {
    next = enterInBook(next, request, worker, now, true);
    const decided = next.staffExpenseRequests!.find(item => item.id === request.id)!;
    return { ok: true, store: next, request: decided };
  }

  next = recordActivityLog(next, worker.name, worker.role, `Recorded expense for approval: ${describeExpense(request)}`);
  // No category: it always arrives, and the notification gate shows an
  // uncategorised notification only to people who see the money.
  const notice: FlowNotification = {
    id: notificationId(request.id),
    icon: '🧾',
    tone: 'info',
    date: now.toISOString(),
    read: false,
    title: `${worker.name} recorded an expense`,
    text: `${note} · ₦${amount.toLocaleString()} · ${request.category}`,
    // The panel shows the description when there is one, so the expense
    // itself has to be in it, not only in `text`.
    description: `${note} · ₦${amount.toLocaleString()} · ${request.category}. Paid from ${PAID_FROM_LABEL[request.paidFrom].toLowerCase()}; it counts once you approve it.`,
    actionLabel: 'Review',
    actionTab: 'expenses',
  };
  next = { ...next, flowNotifications: [notice, ...(next.flowNotifications || [])] };
  return { ok: true, store: next, request };
}

function decide(store: StoreData, requestId: string, approver: Actor, at: Date, approve: boolean): StoreData {
  if (!canApproveStaffExpenses(approver)) return store;
  const request = (store.staffExpenseRequests || []).find(item => item.id === requestId);
  // Decided once. A second tap, or a stale screen, changes nothing.
  if (!request || request.status !== 'pending') return store;

  const readNotice = (s: StoreData): StoreData => ({
    ...s,
    flowNotifications: (s.flowNotifications || []).map(n => n.id === notificationId(requestId) ? { ...n, read: true } : n),
  });

  if (approve) {
    return readNotice(enterInBook(store, request, approver, at, false));
  }
  const rejected: StoreData = {
    ...store,
    staffExpenseRequests: (store.staffExpenseRequests || []).map(item => item.id === requestId
      ? { ...item, status: 'rejected' as const, decidedAt: at.toISOString() }
      : item),
  };
  return readNotice(recordActivityLog(rejected, approver.name, approver.role,
    `Rejected ${request.recordedBy.name}'s expense: ${describeExpense(request)}`));
}

export function approveStaffExpense(store: StoreData, requestId: string, approver: Actor, at: Date = new Date()): StoreData {
  return decide(store, requestId, approver, at, true);
}

export function rejectStaffExpense(store: StoreData, requestId: string, approver: Actor, at: Date = new Date()): StoreData {
  return decide(store, requestId, approver, at, false);
}

export function pendingStaffExpenses(store: Pick<StoreData, 'staffExpenseRequests'>): StaffExpenseRequest[] {
  return (store.staffExpenseRequests || []).filter(item => item.status === 'pending');
}

/** One worker's own requests, newest first. */
export function myStaffExpenses(store: Pick<StoreData, 'staffExpenseRequests'>, staffId: string): StaffExpenseRequest[] {
  return (store.staffExpenseRequests || []).filter(item => item.recordedBy.staffId === staffId);
}
