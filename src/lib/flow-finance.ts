import { StoreData } from '@/types/store';
import { isStockPurchase } from '@/lib/store-data';

/**
 * Read-only finance intelligence. This intentionally does not mutate StoreData
 * or replace any existing Flow action. It consumes the data Flow already has.
 */
export interface FlowFinanceSnapshot {
  revenue: number;
  grossProfit: number;
  operatingExpenses: number;
  restockSpend: number;
  netProfit: number;
  pendingBalance: number;
  cashCollected: number;
}

export interface FlowRestockSuggestion {
  productId: string;
  productName: string;
  currentStock: number;
  reorderLevel: number;
  unitsSold: number;
  suggestedQuantity: number;
  reason: string;
}

const n = (value: unknown) => Number(value) || 0;

export function getFlowFinanceSnapshot(store: StoreData): FlowFinanceSnapshot {
  const sales = store.sales || [];
  const expenses = store.expenses || [];
  const pending = store.pendingPayments || [];
  const restocks = store.restocks || [];

  const revenue = sales.reduce((sum, sale) => sum + n(sale.total), 0);
  const grossProfit = sales.reduce((sum, sale) => sum + n(sale.profit), 0);
  // Stock purchases are excluded: gross profit already carries cost of goods.
  const operatingExpenses = expenses.filter(expense => !isStockPurchase(expense)).reduce((sum, expense) => sum + n(expense.amount), 0);
  const restockSpend = restocks.reduce((sum, restock) => sum + n(restock.total), 0);
  const pendingBalance = pending
    .filter(payment => payment.status === 'pending')
    .reduce((sum, payment) => sum + n(payment.balance), 0);
  const cashCollected = sales
    .filter(sale => !sale.pendingPaymentId)
    .reduce((sum, sale) => sum + n(sale.total), 0);

  return {
    revenue,
    grossProfit,
    operatingExpenses,
    restockSpend,
    netProfit: grossProfit - operatingExpenses,
    pendingBalance,
    cashCollected,
  };
}

/**
 * Conservative buy-list logic. Only products already below their existing
 * reorder level are suggested. It never writes stock or creates a restock.
 */
export function getFlowRestockSuggestions(store: StoreData): FlowRestockSuggestion[] {
  return (store.products || [])
    .map(product => {
      const currentStock = n(product.stock);
      const reorderLevel = n(product.reorderLevel);
      const unitsSold = n(product.units_sold);

      if (reorderLevel <= 0 || currentStock > reorderLevel) return null;

      const suggestedQuantity = Math.max(1, Math.ceil(reorderLevel * 2 - currentStock));
      const reason = currentStock <= 0
        ? 'Out of stock'
        : `Stock is at or below the reorder level of ${reorderLevel}`;

      return {
        productId: String(product.id),
        productName: product.name,
        currentStock,
        reorderLevel,
        unitsSold,
        suggestedQuantity,
        reason,
      };
    })
    .filter((item): item is FlowRestockSuggestion => item !== null)
    .sort((a, b) => {
      if (a.currentStock === 0 && b.currentStock !== 0) return -1;
      if (b.currentStock === 0 && a.currentStock !== 0) return 1;
      return b.unitsSold - a.unitsSold;
    });
}
