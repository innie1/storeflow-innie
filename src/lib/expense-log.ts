import type { Expense, ExpenseRecorder, StoreData } from '@/types/store';
import { recordActivityLog } from '@/lib/activity-log';
import { currentActor, type Actor } from '@/lib/current-actor';

/**
 * The one way into the expense book.
 *
 * Expenses arrived by four roads - addExpense, a restock, an inventory
 * import, a supply bought - and each wrote the book its own way. Only one of
 * them could write the activity log, and only when its caller remembered to
 * say who was acting, which none of them did. So the book could not say who
 * spent the money, and the log never mentioned it.
 *
 * Every road now comes through here, which stamps who entered the expense and
 * logs it. A test fails if new code writes the book any other way.
 *
 * Moving the money is left to each road, because they differ for good
 * reason: a restock can be paid with new money, an expense comes out of the
 * balance it was paid from.
 */

export function recorderFor(actor: Actor): ExpenseRecorder {
  return { staffId: actor.id || 'owner', name: actor.name, role: actor.role };
}

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

/** "Consumables - ₦200 (Hypo)", the way the log has always described one. */
export function describeExpense(expense: Pick<Expense, 'category' | 'amount' | 'note'>): string {
  return `${expense.category} - ${naira(expense.amount)}${expense.note ? ` (${expense.note})` : ''}`;
}

/**
 * Put expenses in the book, newest first, saying who entered them.
 *
 * An expense that already names who spent it - a worker's, approved later by
 * the owner - keeps that name; the log line is the person acting now.
 */
export function enterExpenses(
  store: StoreData,
  expenses: Expense[],
  options: { actor?: Actor; action?: (expense: Expense) => string } = {},
): StoreData {
  if (expenses.length === 0) return store;
  const actor = options.actor || currentActor();
  const stamped = expenses.map(expense => expense.recordedBy ? expense : { ...expense, recordedBy: recorderFor(actor) });
  let next: StoreData = { ...store, expenses: [...stamped, ...(store.expenses || [])] };
  for (const expense of stamped) {
    next = recordActivityLog(next, actor.name, actor.role, options.action?.(expense) || `Recorded expense: ${describeExpense(expense)}`);
  }
  return next;
}

/** Log something done to an expense already in the book - deleted, restored. */
export function logExpense(store: StoreData, verb: string, expense: Expense, actor: Actor = currentActor()): StoreData {
  return recordActivityLog(store, actor.name, actor.role, `${verb} expense: ${describeExpense(expense)}`);
}
