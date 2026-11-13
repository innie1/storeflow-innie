import { enterExpenses, logExpense } from '../expense-log';
import { StoreData, Expense } from '@/types/store';
import { generateId } from './ids';
import { EXPENSE_BALANCE_FIELD } from './money';
import { saveStore } from './load-save';
import { pushTrash } from './trash';

export function addExpense(store: StoreData, expense: Omit<Expense, 'id' | 'source'>, actorName?: string, actorRole?: string, logAction?: string): StoreData {
  const newExpense: Expense = {
    ...expense,
    id: generateId(),
    source: 'manual',
  };

  const field = EXPENSE_BALANCE_FIELD[expense.paidFrom || 'cash'];
  const newBalance = Math.max(0, (store[field] ?? 0) - expense.amount);

  const updated = enterExpenses(
    { ...store, [field]: Math.round(newBalance * 100) / 100 },
    [newExpense],
    {
      ...(actorName ? { actor: { name: actorName, role: actorRole || 'owner' } } : {}),
      ...(logAction ? { action: () => logAction } : {}),
    },
  );
  saveStore(updated);
  return updated;
}

export function deleteExpense(store: StoreData, id: string): StoreData {
  const expense = (store.expenses || []).find(e => e.id === id);
  if (!expense) return store;

  // Back to the balance it left, not always to cash.
  const field = EXPENSE_BALANCE_FIELD[expense.paidFrom || 'cash'];
  const newBalance = (store[field] ?? 0) + expense.amount;

  const updated = logExpense({
    ...store,
    expenses: (store.expenses || []).filter(e => e.id !== id),
    [field]: Math.round(newBalance * 100) / 100,
    trash: pushTrash(store, 'expense', expense),
  }, 'Deleted', expense);
  saveStore(updated);
  return updated;
}
