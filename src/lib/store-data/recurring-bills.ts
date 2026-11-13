import { StoreData, Expense, RecurringBill } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';
import { addExpense } from './expenses';

export function addRecurringBill(
  store: StoreData,
  bill: { label: string; amount: number; category: Expense['category']; frequency: 'weekly' | 'monthly'; nextDueDate: string }
): StoreData {
  const newBill: RecurringBill = {
    id: generateId(),
    label: bill.label,
    amount: bill.amount,
    category: bill.category,
    frequency: bill.frequency,
    nextDueDate: bill.nextDueDate,
    active: true,
  };
  const updated = { ...store, recurringBills: [newBill, ...(store.recurringBills || [])] };
  saveStore(updated);
  return updated;
}

export function deleteRecurringBill(store: StoreData, id: string): StoreData {
  const updated = { ...store, recurringBills: (store.recurringBills || []).filter(b => b.id !== id) };
  saveStore(updated);
  return updated;
}

export function toggleRecurringBill(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    recurringBills: (store.recurringBills || []).map(b => b.id === id ? { ...b, active: !b.active } : b),
  };
  saveStore(updated);
  return updated;
}

// Marks a bill as paid right now: logs it as a real Expense and advances
// nextDueDate to the following cycle (7 days for weekly, same day next
// month for monthly), so the reminder clock resets automatically instead
// of nagging about a bill that was just paid.
export function markRecurringBillPaid(store: StoreData, id: string): StoreData {
  const bill = (store.recurringBills || []).find(b => b.id === id);
  if (!bill) return store;

  const current = new Date(bill.nextDueDate);
  const next = new Date(current);
  if (bill.frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else {
    next.setMonth(next.getMonth() + 1);
  }

  const withExpense = addExpense(store, {
    amount: bill.amount,
    category: bill.category,
    date: new Date().toISOString(),
    note: `${bill.label} (recurring bill)`,
  });

  const updated = {
    ...withExpense,
    recurringBills: (withExpense.recurringBills || []).map(b =>
      b.id === id ? { ...b, nextDueDate: next.toISOString(), lastReminderDate: undefined } : b
    ),
  };
  saveStore(updated);
  return updated;
}
