import { StoreData, Expense, ExpensePaidFrom, BalanceAdjustment } from '@/types/store';
import { generateId } from './ids';

/**
 * Buying stock is not an operating expense.
 *
 * Paying a supplier turns cash into inventory: the shop is no poorer for it,
 * it just holds goods instead of money. The cost reaches the books when the
 * goods are *sold* — every sale already records `(unitPrice - costPrice) *
 * quantity` as its profit. Counting the supplier payment as an expense too
 * charges the same stock twice, which pushed profit negative the moment a
 * merchant restocked and triggered "your expenses are too high" while they
 * were doing the healthiest thing a shop can do.
 *
 * So: restock still reduces cash (the money really did leave), but it is
 * excluded from profit, balance and overspending figures.
 */
export function isStockPurchase(expense: Pick<Expense, 'category' | 'source'>): boolean {
  return expense.source === 'restock' || expense.category === 'Restock';
}

/** Expenses that are genuinely the cost of running the shop. */
export function getOperatingExpenses(store: Pick<StoreData, 'expenses'>): Expense[] {
  return (store.expenses || []).filter(expense => !isStockPurchase(expense));
}

/**
 * Total running cost, optionally within a period. Use this anywhere a figure
 * represents profit, balance or spending — never a raw sum over `expenses`,
 * which silently includes stock purchases.
 */
export function sumOperatingExpenses(
  store: Pick<StoreData, 'expenses'>,
  inRange?: (date: string) => boolean,
): number {
  return getOperatingExpenses(store)
    .filter(expense => !inRange || inRange(expense.date))
    .reduce((sum, expense) => sum + expense.amount, 0);
}

/**
 * Money the shop actually has to spend, derived from its own records.
 *
 *   collected sales − expenses − stock bought from the balance
 *                   − money withdrawn − money set aside as savings
 *
 * Capital never counts. Whether it is opening stock or a restock the owner
 * paid for out of their own pocket, that money came from outside and went
 * straight into goods; it was never in the till. Formally it is cash in then
 * cash out, netting to nothing, so leaving it out reaches the same answer.
 *
 * The figure is allowed to go negative. Buying more stock than the shop can
 * afford is a debt, and saying so is more useful than clamping to zero and
 * inventing capital to cover the gap, which is what used to happen.
 *
 * Deriving it from history rather than keeping a running total means an
 * existing shop is corrected the moment it opens the app, without anyone
 * having to reconcile anything by hand.
 */
export function getAvailableBalance(store: StoreData): number {
  // Goods handed over on credit are not money in hand until the customer pays.
  const collected = (store.sales || [])
    .filter(sale => !sale.pendingPaymentId)
    .reduce((sum, sale) => sum + (Number(sale.total) || 0), 0)
    + (store.pendingPayments || []).reduce((sum, payment) => sum + (Number(payment.paid) || 0), 0);

  const running = sumOperatingExpenses(store);

  // Which stock purchases came out of the till. A restock records the answer
  // the merchant gave; anything older than that field, or bought before there
  // was a balance to spend, is treated as having come from the balance.
  // Opening stock added through addProduct has no batch and is capital.
  const restockFunding = new Map<string, string>();
  for (const restock of store.restocks || []) {
    if (restock.batchId) restockFunding.set(restock.batchId, restock.funding || 'balance');
  }
  const stockFromBalance = (store.expenses || [])
    .filter(expense => isStockPurchase(expense))
    .filter(expense => {
      if (!expense.restockBatchId) return false; // opening stock: capital, not spend
      return restockFunding.get(expense.restockBatchId) !== 'new_money';
    })
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  const withdrawn = (store.withdrawals || []).reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
  const saved = Number(store.savingsGoal?.saved) || 0;

  // A merchant who counted their money and said the figure was wrong is a
  // better authority than the records. Their corrections carry forward.
  const corrections = (store.balanceAdjustments || [])
    .reduce((sum, adjustment) => sum + (Number(adjustment.difference) || 0), 0);

  return Math.round((collected - running - stockFromBalance - withdrawn - saved + corrections) * 100) / 100;
}

/**
 * Correct a tracked balance to what the merchant actually holds.
 *
 * StoreFlow can only ever know the money it was told about, so a shop that
 * takes cash outside the app, starts with a float, or miscounts will drift.
 * Nothing let a merchant say what was really in the till, so the drift was
 * permanent. Each correction is written to balanceAdjustments with the old
 * and new figure, rather than quietly overwriting the balance.
 */
export function setActualBalance(
  store: StoreData,
  input: { cash?: number; bank?: number; wallet?: number; reason?: string; actorName?: string },
): StoreData {
  const now = new Date().toISOString();
  const adjustments: BalanceAdjustment[] = [];

  const accounts: { key: 'cash' | 'bank' | 'wallet'; field: 'cashBalance' | 'bankBalance' | 'walletBalance'; next?: number }[] = [
    { key: 'cash', field: 'cashBalance', next: input.cash },
    { key: 'bank', field: 'bankBalance', next: input.bank },
    { key: 'wallet', field: 'walletBalance', next: input.wallet },
  ];

  const updated: StoreData = { ...store };
  for (const account of accounts) {
    if (account.next === undefined || !Number.isFinite(account.next)) continue;
    const to = Math.round(Math.max(0, account.next) * 100) / 100;
    const from = Math.round((store[account.field] ?? 0) * 100) / 100;
    if (to === from) continue;

    adjustments.push({
      id: generateId(),
      date: now,
      account: account.key,
      from,
      to,
      difference: Math.round((to - from) * 100) / 100,
      reason: input.reason?.trim() || undefined,
      actorName: input.actorName,
    });
    updated[account.field] = to;
  }

  if (adjustments.length === 0) return store;
  return { ...updated, balanceAdjustments: [...adjustments, ...(store.balanceAdjustments || [])] };
}

/** What the shop paid suppliers for stock — cash out, but not a cost of trading. */
export function sumStockPurchases(
  store: Pick<StoreData, 'expenses'>,
  inRange?: (date: string) => boolean,
): number {
  return (store.expenses || [])
    .filter(expense => isStockPurchase(expense) && (!inRange || inRange(expense.date)))
    .reduce((sum, expense) => sum + expense.amount, 0);
}

/**
 * Which balance an expense is taken from. Cash unless the expense says
 * otherwise, which is what every expense meant before it could say.
 */
export const EXPENSE_BALANCE_FIELD: Record<ExpensePaidFrom, 'cashBalance' | 'bankBalance' | 'walletBalance'> = {
  cash: 'cashBalance',
  bank: 'bankBalance',
  wallet: 'walletBalance',
};
