import type { Expense, Sale, StoreData } from '@/types/store';
import { describeExpense } from '@/lib/expense-log';

/**
 * Names for records made before the records themselves kept one.
 *
 * Sales gained "who sold it" and expenses "who recorded it" partway through
 * the shop's life, so everything before then showed no name - while the
 * activity history had been writing down who did each of them all along. This
 * reads the name back out of the history and puts it on the record, so the
 * lists, receipts and filters cover the old records too.
 *
 * Only a confident match is used: the same description, and for a sale the
 * same moment (within two minutes). Each history line names one record at
 * most. Anything that does not match keeps no name rather than a guess.
 * Restocks never had a history line of their own, so old ones stay unnamed.
 */

interface LogLine { id?: string; user?: string; role?: string; action?: string; timestamp?: string }

const SALE_WINDOW_MS = 2 * 60 * 1000;
const time = (value: unknown) => {
  const at = Date.parse(String(value || ''));
  return Number.isFinite(at) ? at : NaN;
};

export function backfillAttribution(store: StoreData): StoreData {
  const logs: LogLine[] = Array.isArray(store.activityLogs) ? (store.activityLogs as LogLine[]) : [];
  if (!logs.length) return store;
  const used = new Set<LogLine>();
  const staff = store.staffMembers || [];

  const closest = (candidates: LogLine[], at: number, window = Infinity): LogLine | null => {
    let best: LogLine | null = null;
    let gap = Infinity;
    for (const line of candidates) {
      if (used.has(line) || !line.user) continue;
      const lineAt = time(line.timestamp);
      const distance = Number.isFinite(at) && Number.isFinite(lineAt) ? Math.abs(lineAt - at) : window === Infinity ? 0 : Infinity;
      if (distance <= window && distance < gap) { best = line; gap = distance; }
    }
    if (best) used.add(best);
    return best;
  };

  let salesChanged = false;
  const sales = (store.sales || []).map((sale: Sale) => {
    if (sale.recordedByName) return sale;
    const prefix = `Completed sale: ${sale.productName} ×`;
    const line = closest(logs.filter(entry => String(entry.action || '').startsWith(prefix)), time(sale.date), SALE_WINDOW_MS);
    if (!line?.user) return sale;
    salesChanged = true;
    return { ...sale, recordedByName: line.user, recordedByRole: line.role || undefined };
  });

  let expensesChanged = false;
  const expenses = (store.expenses || []).map((expense: Expense) => {
    if (expense.recordedBy?.name) return expense;
    const said = describeExpense(expense);
    const line = closest(
      logs.filter(entry => {
        const action = String(entry.action || '');
        return action.endsWith(`expense: ${said}`) && /^(Recorded|Added)\b/.test(action);
      }),
      time(expense.date),
    );
    if (!line?.user) return expense;
    expensesChanged = true;
    const member = staff.find(person => person.name === line.user);
    return {
      ...expense,
      recordedBy: { staffId: member?.id ? String(member.id) : (line.role === 'owner' ? 'owner' : ''), name: line.user, role: line.role || 'owner' },
    };
  });

  if (!salesChanged && !expensesChanged) return store;
  return {
    ...store,
    ...(salesChanged ? { sales } : {}),
    ...(expensesChanged ? { expenses } : {}),
  };
}
