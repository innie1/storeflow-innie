/**
 * Record Expense on Home opens the expense book with its form already open.
 *
 * The book was reachable only from More, and then only as a list with a
 * button somewhere on it - so an owner looking at Home reasonably concluded
 * the app could not record spending. The Home shortcut leaves a note here and
 * goes to the book; the book reads the note once when it opens.
 */

const KEY = 'storeflow_open_expense_form';

export function requestExpenseForm(): void {
  try { window.sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ }
}

/** True once, for the book opened by the shortcut. */
export function takeExpenseFormRequest(): boolean {
  try {
    const asked = window.sessionStorage.getItem(KEY) === '1';
    window.sessionStorage.removeItem(KEY);
    return asked;
  } catch {
    return false;
  }
}
