import { money, stockPrecision, packSize, stockBase } from '@/lib/inventory-sale-math';
import { describeExpense, enterExpenses } from '../expense-log';
import { Product, Sale, StoreData, Expense, TrashItem, TrashKind } from '@/types/store';
import { TRASH_RETENTION_MS } from './keys';
import { recordInventoryMovement, syncProductPerformance } from './inventory-movements';
import { generateId } from './ids';
import { EXPENSE_BALANCE_FIELD } from './money';
import { saveStore } from './load-save';

export function pushTrash(store: StoreData, kind: TrashKind, payload: Product | Sale | Expense): TrashItem[] {
  const item: TrashItem = {
    id: generateId(),
    kind,
    deletedAt: new Date().toISOString(),
    payload,
  };
  return [item, ...(store.trash || [])];
}

// ---------- Trash ----------

export function getTrash(store: StoreData): TrashItem[] {
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  return (store.trash || [])
    .filter(t => new Date(t.deletedAt).getTime() > cutoff)
    .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
}

export function restoreTrashItem(store: StoreData, trashId: string): StoreData {
  const item = (store.trash || []).find(t => t.id === trashId);
  if (!item) return store;
  const remaining = (store.trash || []).filter(t => t.id !== trashId);
  let updated: StoreData = { ...store, trash: remaining };
  if (item.kind === 'product') {
    const p = item.payload as Product;
    updated = { ...updated, products: updated.products.some(x => x.id === p.id) ? updated.products.map(x => x.id === p.id ? { ...x, discontinued: false } : x) : [...updated.products, p] };
  } else if (item.kind === 'sale') {
    const undo = item.saleUndo;
    // Old trash lacks the payment/stock reversal snapshot. Guessing here can
    // invent cash or goods (old Clear Sales did not reverse either).
    if (!undo) throw new Error('This older sale has no reversal record. Re-enter it after checking stock and payments.');
    if (undo.sales.some(s => updated.sales.some(existing => existing.id === s.id))) throw new Error('This transaction is already restored.');
    const required = new Map<string, number>();
    for (const delta of undo.stock) required.set(delta.productId, (required.get(delta.productId) || 0) + delta.baseQuantity);
    for (const [productId, units] of required) {
      const product = updated.products.find(p => p.id === productId);
      if (!product || stockBase(product) + 1e-8 < units) throw new Error('Not enough stock to restore this sale. Restore or restock the product first.');
    }
    updated = { ...updated, products: updated.products.map(p => ({ ...p })) };
    for (const delta of undo.stock) {
      const p = updated.products.find(p => p.id === delta.productId)!;
      p.quantity = stockPrecision(stockBase(p) - delta.baseQuantity) / packSize(p);
      p.backorderedQty = stockPrecision((p.backorderedQty || 0) * packSize(p) + delta.backorderQuantity) / packSize(p);
      updated = recordInventoryMovement(updated, p.id, 'Sale', -delta.baseQuantity / packSize(p), 'Staff', 'Restored transaction');
    }
    updated = { ...updated, sales: [...undo.sales, ...updated.sales], pendingPayments: [...undo.pending, ...(updated.pendingPayments || [])],
      cashBalance: money((updated.cashBalance || 0) + undo.allocation.cash), bankBalance: money((updated.bankBalance || 0) + undo.allocation.bank),
      customers: (updated.customers || []).map(c => { const delta = undo.customers.find(d => d.id === c.id); return delta ? { ...c, purchaseHistory: [...(delta.history || []), ...(c.purchaseHistory || [])], totalPurchases: money(c.totalPurchases + delta.purchases), outstandingDebt: money(c.outstandingDebt + delta.debt), visitsCount: c.visitsCount + delta.visits, loyaltyPoints: c.loyaltyPoints + delta.points } : c; }),
    };
    updated = syncProductPerformance(updated);
  } else if (item.kind === 'expense') {
    const e = item.payload as Expense;
    const list = updated.expenses || [];
    if (!list.some(x => x.id === e.id)) {
      // Restoring does not make the restorer its author. One from before
      // expenses named anybody was the owner's.
      const original = e.recordedBy ? e : { ...e, recordedBy: { staffId: 'owner', name: 'Owner', role: 'owner' } };
      // Deleting gave the money back to the balance it came from, so putting
      // the expense back takes it out again - or the balance stays too high.
      const field = EXPENSE_BALANCE_FIELD[e.paidFrom || 'cash'];
      updated = enterExpenses(
        { ...updated, [field]: Math.round(Math.max(0, (updated[field] ?? 0) - e.amount) * 100) / 100 },
        [original],
        { action: restored => `Restored expense: ${describeExpense(restored)}` },
      );
    }
  }
  saveStore(updated);
  return updated;
}

export function purgeTrashItem(store: StoreData, trashId: string): StoreData {
  const updated: StoreData = {
    ...store,
    trash: (store.trash || []).filter(t => t.id !== trashId),
  };
  saveStore(updated);
  return updated;
}

export function emptyTrash(store: StoreData): StoreData {
  const updated: StoreData = { ...store, trash: [] };
  saveStore(updated);
  return updated;
}
