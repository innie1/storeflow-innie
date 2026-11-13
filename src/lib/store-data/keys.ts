import { ExpenseCategory } from '@/types/store';

export const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

 // 7 days

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['Restock', 'Consumables', 'Rent', 'Utilities', 'Salaries', 'Transport', 'Other'];

export const STORE_PREFIX = 'storeflow_';
