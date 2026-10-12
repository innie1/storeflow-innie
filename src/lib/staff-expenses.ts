import type { Expense, ExpenseCategory, ExpensePaidFrom, ExpenseRecorder, FlowNotification, StaffExpenseRequest, StoreData } from '@/types/store';
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

  // On a worker's own phone it only waits there to be sent: the books are on
  // the owner's phone, which applies the shop's rule when it arrives.
  if (store.staffDevice) {
    next = recordActivityLog(next, worker.name, worker.role, `Recorded expense: ${describeExpense(request)}`);
    return { ok: true, store: next, request };
  }

  if (!mustWait(store, amount)) {
    next = enterInBook(next, request, worker, now, true);
    const decided = next.staffExpenseRequests!.find(item => item.id === request.id)!;
    return { ok: true, store: next, request: decided };
  }

  next = recordActivityLog(next, worker.name, worker.role, `Recorded expense for approval: ${describeExpense(request)}`);
  next = { ...next, flowNotifications: [waitingNotice(request, now), ...(next.flowNotifications || [])] };
  return { ok: true, store: next, request };
}

/** "Faith recorded an expense" for the owner. No category: only people who see the money see it. */
function waitingNotice(request: StaffExpenseRequest, now: Date): FlowNotification {
  const line = `${request.note} · ₦${request.amount.toLocaleString()} · ${request.category}`;
  return {
    id: notificationId(request.id),
    icon: '🧾',
    tone: 'info',
    date: now.toISOString(),
    read: false,
    title: `${request.recordedBy.name} recorded an expense`,
    text: line,
    // The panel shows the description when there is one, so the expense
    // itself has to be in it, not only in `text`.
    description: `${line}. Paid from ${PAID_FROM_LABEL[request.paidFrom].toLowerCase()}; it counts once you approve it.`,
    actionLabel: 'Review',
    actionTab: 'expenses',
  };
}

/**
 * Expenses that arrived from workers' own phones, settled on the owner's.
 *
 * They always arrive waiting - a worker's phone has no books to put them in.
 * Here the shop's own rule decides: straight into the book if the shop
 * records immediately or the amount is under the limit, exactly as if it had
 * been entered on the counter phone; otherwise the owner is told, and it
 * waits for Approve.
 */
export function settleArrivedStaffExpenses(store: StoreData, ids: string[], now: Date = new Date()): StoreData {
  let next = store;
  for (const id of ids) {
    const request = (next.staffExpenseRequests || []).find(item => item.id === id);
    if (!request || request.status !== 'pending') continue;
    const worker: Actor = { id: request.recordedBy.staffId, name: request.recordedBy.name, role: request.recordedBy.role };
    if (!mustWait(next, request.amount)) {
      next = enterInBook(next, request, worker, now, true);
      continue;
    }
    if ((next.flowNotifications || []).some(n => n.id === notificationId(id))) continue;
    next = recordActivityLog(next, worker.name, worker.role, `Recorded expense for approval: ${describeExpense(request)}`);
    next = { ...next, flowNotifications: [waitingNotice(request, now), ...(next.flowNotifications || [])] };
  }
  return next;
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

/* ── Looking back ───────────────────────────────────────────────────────── */

/** The owner's view of the book: everything, theirs, the workers', or what waits. */
export type ExpenseWho = 'all' | 'owner' | 'staff' | 'pending';

/** Recorded by the owner - which is every expense from before anybody else could. */
export function isOwnerExpense(expense: Pick<Expense, 'recordedBy'>): boolean {
  return !expense.recordedBy || expense.recordedBy.role === 'owner';
}

/**
 * Book entries for the owner's filter. 'pending' has none: a waiting expense
 * is not in the book, and is listed from the requests instead.
 */
export function filterExpenseBook(expenses: Expense[], who: ExpenseWho, staffId?: string): Expense[] {
  if (who === 'pending') return [];
  return expenses.filter(expense => {
    if (staffId) return expense.recordedBy?.staffId === staffId;
    if (who === 'owner') return isOwnerExpense(expense);
    if (who === 'staff') return !isOwnerExpense(expense);
    return true;
  });
}

/** Everybody other than the owner who has entered an expense, by name. */
export function expenseRecorders(store: Pick<StoreData, 'expenses' | 'staffExpenseRequests'>): ExpenseRecorder[] {
  const seen = new Map<string, ExpenseRecorder>();
  for (const by of [
    ...(store.staffExpenseRequests || []).map(item => item.recordedBy),
    ...(store.expenses || []).map(expense => expense.recordedBy),
  ]) {
    if (by && by.role !== 'owner' && !seen.has(by.staffId)) seen.set(by.staffId, by);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A worker's own expenses by the day they were spent, newest day first. */
export function groupByDay(requests: StaffExpenseRequest[], now: Date = new Date()): { label: string; items: StaffExpenseRequest[] }[] {
  const dayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const today = dayKey(now.toISOString());
  const yesterday = dayKey(new Date(now.getTime() - 86400000).toISOString());
  const groups = new Map<string, StaffExpenseRequest[]>();
  for (const item of [...requests].sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt))) {
    const key = dayKey(item.date);
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return [...groups.entries()].map(([key, items]) => ({
    label: key === today ? 'Today' : key === yesterday ? 'Yesterday'
      : new Date(items[0].date).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }),
    items,
  }));
}

export const STATUS_LABEL: Record<StaffExpenseRequest['status'], string> = {
  approved: 'Approved',
  pending: 'Waiting for approval',
  rejected: 'Rejected',
};
