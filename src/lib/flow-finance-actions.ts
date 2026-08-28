import type { Expense, PaymentMethod, StoreData } from '@/types/store';
import {
  addExpense,
  addInvestment,
  addLoan,
  addPaymentToPending,
  addWithdrawal,
  receiveStock,
} from '@/lib/store-data';

/**
 * Flow's financial mutations all delegate to StoreFlow's existing data-layer
 * functions. This keeps Flow local/offline and prevents a second financial
 * ledger from being created just for chat commands.
 */
export function flowAddExpense(
  store: StoreData,
  amount: number,
  category: Expense['category'],
  note = 'Recorded by Flow'
): StoreData {
  if (!Number.isFinite(amount) || amount <= 0) return store;
  return addExpense(store, {
    amount: Math.round(amount * 100) / 100,
    category,
    date: new Date().toISOString(),
    note,
  }, 'Flow', 'owner');
}

export function flowRecordPayment(
  store: StoreData,
  pendingPaymentId: string,
  amount: number,
  method: PaymentMethod = 'cash'
): StoreData {
  if (!Number.isFinite(amount) || amount <= 0) return store;
  return addPaymentToPending(store, pendingPaymentId, Math.round(amount * 100) / 100, method);
}

export function flowAddInvestment(
  store: StoreData,
  amount: number,
  source = 'Cash Drawer',
  note = 'Investment recorded by Flow'
): StoreData {
  if (!Number.isFinite(amount) || amount <= 0) return store;
  return addInvestment(store, {
    amount: Math.round(amount * 100) / 100,
    note,
    date: new Date().toISOString(),
    type: 'additional',
    source,
  });
}

export function flowAddLoan(
  store: StoreData,
  amount: number,
  source = 'Cash Drawer',
  note = 'Loan recorded by Flow'
): StoreData {
  if (!Number.isFinite(amount) || amount <= 0) return store;
  return addLoan(store, amount, source, note);
}

export function flowAddWithdrawal(
  store: StoreData,
  amount: number,
  note = 'Withdrawal recorded by Flow'
): StoreData {
  if (!Number.isFinite(amount) || amount <= 0) return store;
  return addWithdrawal(store, amount, note);
}

/**
 * Correct funding semantics for Flow restocking:
 * - balance: deducts from the business balances through the existing ledger.
 * - new_money: NEVER deducts cash/bank/wallet. The inventory is funded by
 *   money supplied from outside the business balance.
 *
 * The current receiveStock implementation has historically treated both
 * funding modes as balance-funded. This wrapper gives Flow the correct
 * semantics until the shared UI restock path is migrated to the same core.
 */
export function flowReceiveStock(
  store: StoreData,
  entries: { productId: string; quantity: number; costPrice: number }[],
  funding: 'balance' | 'new_money',
  source = 'Flow Restock'
): StoreData {
  if (funding === 'balance') {
    return receiveStock(store, entries, 'balance', source, 'Flow', 'owner');
  }

  // New-money inventory still needs the stock/restock record, but it must not
  // consume the business cash/bank/wallet balances. We call the existing
  // restock path on a zeroed funding ledger and then restore the original
  // balances. The generated Restock record retains funding='new_money'.
  const originalBalances = {
    cashBalance: store.cashBalance ?? 0,
    bankBalance: store.bankBalance ?? 0,
    walletBalance: store.walletBalance ?? 0,
  };
  const result = receiveStock(store, entries, 'new_money', source, 'Flow', 'owner');
  return {
    ...result,
    cashBalance: originalBalances.cashBalance,
    bankBalance: originalBalances.bankBalance,
    walletBalance: originalBalances.walletBalance,
    expenses: (result.expenses || []).map(expense =>
      expense.restockBatchId && expense.source === 'restock'
        ? { ...expense, note: `${expense.note || 'Stock from supplier'} (funded with new money; business balance unchanged)` }
        : expense
    ),
  };
}

export interface FlowPurchaseImportPreviewItem {
  productId: string;
  name: string;
  quantity: number;
  costPrice: number;
  availableStock: number;
}

export interface FlowPurchaseImportPreview {
  found: boolean;
  used: boolean;
  message: string;
  code: string;
  orderId?: string;
  items: FlowPurchaseImportPreviewItem[];
  totalCost: number;
}

/**
 * Preview a shared Buy List code without changing inventory or consuming it.
 * The caller can edit quantities before committing the import.
 */
export function previewFlowPurchaseCode(store: StoreData, rawCode: string): FlowPurchaseImportPreview {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { found: false, used: false, message: 'Enter a code first.', code: '', items: [], totalCost: 0 };

  const order = (store.purchaseOrders || []).find(po => po.importCode.toUpperCase() === code);
  if (!order) return { found: false, used: false, message: `No restock list was found for ${code}.`, code, items: [], totalCost: 0 };
  if (order.imported) {
    return {
      found: true,
      used: true,
      message: `This code has already been used${order.importedAt ? ` on ${new Date(order.importedAt).toLocaleDateString('en-NG')}` : ''}.`,
      code,
      orderId: order.id,
      items: [],
      totalCost: 0,
    };
  }
  if (order.status === 'cancelled') return { found: true, used: false, message: 'This restock list was cancelled.', code, orderId: order.id, items: [], totalCost: 0 };

  const items = order.items
    .filter(item => store.products.some(p => p.id === item.productId))
    .map(item => ({
      productId: item.productId,
      name: item.name,
      quantity: Math.max(0, Math.round(item.qty * 100) / 100),
      costPrice: item.costPrice,
      availableStock: store.products.find(p => p.id === item.productId)?.quantity ?? 0,
    }));

  return {
    found: true,
    used: false,
    message: items.length ? `Restock list ${code} is ready to import. Review the quantities first.` : 'This list has no matching products in this store.',
    code,
    orderId: order.id,
    items,
    totalCost: items.reduce((sum, item) => sum + item.quantity * item.costPrice, 0),
  };
}

/**
 * Consume a previously previewed code with the quantities the merchant
 * approved. This is intentionally separate from preview so simply entering
 * a code can never change inventory.
 */
export function commitFlowPurchaseCode(
  store: StoreData,
  rawCode: string,
  items: { productId: string; quantity: number; costPrice: number }[],
  funding: 'balance' | 'new_money' = 'balance'
): { store: StoreData; success: boolean; message: string } {
  const preview = previewFlowPurchaseCode(store, rawCode);
  if (!preview.found || preview.used || !preview.orderId) return { store, success: false, message: preview.message };

  const approvedItems = items
    .filter(item => item.quantity > 0 && store.products.some(p => p.id === item.productId))
    .map(item => ({ ...item, quantity: Math.round(item.quantity * 100) / 100 }));
  if (!approvedItems.length) return { store, success: false, message: 'Select at least one item and quantity before importing.' };

  const updated = flowReceiveStock(store, approvedItems, funding, `Purchase Import (${preview.code})`);
  const finalStore: StoreData = {
    ...updated,
    purchaseOrders: (updated.purchaseOrders || []).map(po =>
      po.id === preview.orderId
        ? { ...po, imported: true, importedAt: new Date().toISOString(), status: 'received' as const }
        : po
    ),
  };

  return {
    store: finalStore,
    success: true,
    message: `Imported ${approvedItems.length} selected item${approvedItems.length === 1 ? '' : 's'} from ${preview.code}. The code is now marked as used.`,
  };
}
