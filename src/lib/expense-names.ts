/**
 * What an expense is, read from what it was called.
 *
 * Every figure that matters reads an expense by its category: light bills
 * spread over the pieces they paid for, soap over the clothes it washed, rent
 * into the month's target. But the category was a row of buttons that most
 * people skipped. The owner's form started on Rent and a worker's on
 * Consumables, so a "Light bill" typed into the note and saved went into the
 * book as rent - or, from a worker's phone, as soap - and every sum built on
 * it was wrong without anyone seeing why.
 *
 * The name is what people actually fill in, so the name decides. A new
 * expense is filed by its name as it is typed, and one already in the book
 * under the button nobody pressed is filed by its name when the shop opens.
 *
 * Only when the name is plain. "Light bill" is a utility; "transport for
 * soap" names two things and is left where it was put, because a wrong guess
 * is worse than the button somebody chose.
 */

import type { Expense, ExpenseCategory, RecurringBill, StoreData } from '@/types/store';

/** The words that say which category an expense belongs to. */
const NAME_WORDS: { category: ExpenseCategory; words: RegExp }[] = [
  {
    category: 'Utilities',
    words: /\b(light|lights|nepa|phcn|electric\w*|power|token|prepaid|meter|disco|ikedc|ekedc|aedc|bedc|diesel|fuel|petrol|gas|generator|gen|water|borehole|internet|wifi|wi-fi|data|airtime|recharge)\b/,
  },
  {
    category: 'Consumables',
    words: /\b(soap|soaps|detergent|ariel|omo|sunlight|klin|bleach|jik|hypo|starch|softener|downy|stain|hanger|hangers|nylon|nylons|polythene|bag|bags|perfume|fragrance|sachet|chemical|chemicals)\b/,
  },
  { category: 'Rent', words: /\b(rent|landlord|lease)\b/ },
  { category: 'Salaries', words: /\b(salary|salaries|wage|wages|payroll)\b/ },
  {
    category: 'Transport',
    words: /\b(transport|transportation|fare|okada|keke|bus|uber|bolt|taxi|cab|delivery|dispatch|logistics)\b/,
  },
];

/** The names offered on the form, each with the category it files under. */
export const COMMON_EXPENSE_NAMES: { name: string; category: ExpenseCategory }[] = [
  { name: 'Light bill', category: 'Utilities' },
  { name: 'Diesel', category: 'Utilities' },
  { name: 'Water', category: 'Utilities' },
  { name: 'Soap', category: 'Consumables' },
  { name: 'Transport', category: 'Transport' },
  { name: 'Shop rent', category: 'Rent' },
  { name: 'Salary', category: 'Salaries' },
];

/**
 * The category a name plainly belongs to, or null when it names none or more
 * than one.
 */
export function categoryFromName(name: string | undefined): ExpenseCategory | null {
  const text = String(name || '').toLowerCase();
  if (!text.trim()) return null;
  const found = new Set(NAME_WORDS.filter(rule => rule.words.test(text)).map(rule => rule.category));
  return found.size === 1 ? [...found][0] : null;
}

/*
 * The buttons a form started on, and Other. Anything else - Utilities,
 * Salaries, Transport, a restock - was a button somebody pressed, and is
 * kept whatever the note says.
 */
const UNCHOSEN: ExpenseCategory[] = ['Rent', 'Consumables', 'Other'];

/** The expense filed by its name, or the same expense if it already is. */
export function fileExpenseByName<T extends Pick<Expense, 'category' | 'note'> & Partial<Pick<Expense, 'source' | 'supply'>>>(expense: T): T {
  if (expense.source === 'restock') return expense;
  // A supply bought from the supplies list says itself what it bought.
  if (expense.supply) return expense;
  if (!UNCHOSEN.includes(expense.category)) return expense;
  const named = categoryFromName(expense.note);
  if (!named || named === expense.category) return expense;
  return { ...expense, category: named };
}

function fileBillByName(bill: RecurringBill): RecurringBill {
  if (!UNCHOSEN.includes(bill.category)) return bill;
  const named = categoryFromName(bill.label);
  return named && named !== bill.category ? { ...bill, category: named } : bill;
}

/**
 * Every expense and recurring bill in the book filed by its name.
 *
 * The same store back when nothing needed moving, so callers can tell.
 */
export function fileExpensesByName(store: StoreData): StoreData {
  let changed = false;
  const expenses = (store.expenses || []).map(expense => {
    const filed = fileExpenseByName(expense);
    if (filed !== expense) changed = true;
    return filed;
  });
  const recurringBills = (store.recurringBills || []).map(bill => {
    const filed = fileBillByName(bill);
    if (filed !== bill) changed = true;
    return filed;
  });
  if (!changed) return store;
  return {
    ...store,
    ...(store.expenses ? { expenses } : {}),
    ...(store.recurringBills ? { recurringBills } : {}),
  };
}
