import { StoreData, PurchaseOrderRecord } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';
import { RestockEntry, receiveStock } from './stock';

// Short, easy-to-type/share code identifying one Buy List / Purchase Order,
// so it can be redeemed later in the Import modal to bring those exact
// quantities into stock without retyping anything.
export function generatePurchaseImportCode(existing: PurchaseOrderRecord[]): string {
  const used = new Set(existing.map(po => po.importCode));
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids confusion when read aloud or handwritten
  let code = '';
  do {
    const body = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    code = `PO-${body}`;
  } while (used.has(code));
  return code;
}

export function addPurchaseOrder(store: StoreData, order: Omit<PurchaseOrderRecord, 'id' | 'createdAt' | 'importCode'>): StoreData {
  const record: PurchaseOrderRecord = {
    ...order,
    id: generateId(),
    createdAt: new Date().toISOString(),
    importCode: generatePurchaseImportCode(store.purchaseOrders || []),
  };
  const updated: StoreData = {
    ...store,
    purchaseOrders: [record, ...(store.purchaseOrders || [])].slice(0, 200), // cap to keep the local blob bounded
  };
  saveStore(updated);
  return updated;
}

export function updatePurchaseOrderStatus(store: StoreData, id: string, status: PurchaseOrderRecord['status']): StoreData {
  const updated: StoreData = {
    ...store,
    purchaseOrders: (store.purchaseOrders || []).map(po => po.id === id ? { ...po, status } : po),
  };
  saveStore(updated);
  return updated;
}

// Redeems a Purchase Import Code: finds the matching Buy List / Purchase
// Order, checks it hasn't already been used, and brings its exact items
// into stock via the same receiveStock path as a manual restock. Returns
// success/failure with a human-readable reason rather than throwing, so
// the UI can show it directly.
export function importPurchaseOrderByCode(
  store: StoreData,
  rawCode: string,
  actorName?: string,
  actorRole?: string
): { store: StoreData; success: boolean; message: string; po?: PurchaseOrderRecord } {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { store, success: false, message: 'Enter a code first.' };

  const po = (store.purchaseOrders || []).find(p => p.importCode === code);
  if (!po) {
    return { store, success: false, message: `No purchase order found for code "${code}". Double-check it matches exactly.` };
  }
  if (po.imported) {
    return { store, success: false, message: `This code was already imported on ${po.importedAt ? new Date(po.importedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'a previous date'}. Each code can only be used once.` };
  }
  if (po.status === 'cancelled') {
    return { store, success: false, message: 'This purchase order was cancelled — it can\'t be imported.' };
  }
  if (!po.items || po.items.length === 0) {
    return { store, success: false, message: 'This purchase order has no items to import.' };
  }

  const entries: RestockEntry[] = po.items
    .filter(it => it.productId && store.products.some(p => p.id === it.productId))
    .map(it => ({ productId: it.productId, quantity: it.qty, costPrice: it.costPrice }));

  if (entries.length === 0) {
    return { store, success: false, message: 'None of the products in this list still exist in your inventory — nothing to import.' };
  }

  let updated = receiveStock(store, entries, 'balance', `Purchase Import (${code})`, actorName, actorRole);
  updated = {
    ...updated,
    purchaseOrders: (updated.purchaseOrders || []).map(p =>
      p.id === po.id ? { ...p, imported: true, importedAt: new Date().toISOString(), status: 'received' as const } : p
    ),
  };
  saveStore(updated);

  const skipped = po.items.length - entries.length;
  return {
    store: updated,
    success: true,
    message: `Imported ${entries.length} item${entries.length === 1 ? '' : 's'} into stock.${skipped > 0 ? ` (${skipped} item${skipped === 1 ? '' : 's'} skipped — no longer in inventory.)` : ''}`,
    po: updated.purchaseOrders?.find(p => p.id === po.id),
  };
}
