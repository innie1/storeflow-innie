import { stockPrecision, packSize, stockBase } from '@/lib/inventory-sale-math';
import { recordActivityLog } from '../activity-log';
import { Product, StoreData } from '@/types/store';
import { recordInventoryMovement } from './inventory-movements';
import { generateId } from './ids';
import { saveStore } from './load-save';
import { pushTrash } from './trash';

export function addProduct(store: StoreData, product: Omit<Product, 'id'>, actorName?: string, actorRole?: string): StoreData {
  const id = generateId();
  const now = new Date().toISOString();
  const costTotal = Math.round(product.costPrice * product.quantity * 100) / 100;
  const newInvestments = [...(store.investments || [])];
  if (costTotal > 0) {
    // Stock a merchant already owns is capital they put into the shop, not
    // money the shop spent. This used to record the same cost twice — once
    // here as an investment and again as a Restock expense — so uploading a
    // catalogue instantly reported a loss the size of the opening stock, and
    // every figure derived from expenses was wrong by that amount.
    newInvestments.push({
      id: generateId(),
      amount: costTotal,
      note: `Added Inventory: ${product.name}`,
      date: now,
      type: 'additional',
    });
  }
  let updated: StoreData = {
    ...store,
    products: [...store.products, {
      ...product,
      id,
      initialQuantity: product.quantity,
      addedAt: now,
      priceHistory: product.costPrice > 0 ? [{ costPrice: product.costPrice, date: now }] : [],
      restock_count: 0,
      units_sold: 0,
      total_revenue: 0,
      total_profit: 0
    }],
    investments: newInvestments,
  };
  if (actorName) {
    updated = recordActivityLog(updated, actorName, actorRole, `Added product: ${product.name} (${product.quantity} units)`);
  }
  if (product.quantity > 0) {
    updated = recordInventoryMovement(
      updated,
      id,
      'Adjustment',
      product.quantity,
      actorName,
      'Manual'
    );
  }
  saveStore(updated);
  return updated;
}

export function updateProduct(store: StoreData, id: string, updates: Partial<Product>, actorName?: string, actorRole?: string): StoreData {
  const oldProd = store.products.find(p => p.id === id);
  const oldQty = oldProd ? oldProd.quantity : 0;
  const pName = oldProd?.name || 'Product';
  let updated: StoreData = {
    ...store,
    products: store.products.map(p => {
      if (p.id === id) {
        const newHistory = [...(p.priceHistory || [])];
        if (updates.costPrice !== undefined && updates.costPrice !== p.costPrice && updates.costPrice > 0) {
          newHistory.push({ costPrice: updates.costPrice, date: new Date().toISOString() });
        }
        const next = { ...p, ...updates, priceHistory: newHistory };
        if (packSize(next) !== packSize(p)) {
          if (updates.quantity === undefined || updates.quantity === p.quantity) next.quantity = stockBase(p) / packSize(next);
          next.backorderedQty = stockPrecision((p.backorderedQty || 0) * packSize(p)) / packSize(next);
        }
        return next;
      }
      return p;
    }),
  };
  if (actorName) {
    const details = updates.quantity !== undefined ? ` (set qty to ${updates.quantity})` : '';
    updated = recordActivityLog(updated, actorName, actorRole, `Updated product: ${pName}${details}`);
  }
  if (updates.quantity !== undefined && oldProd && updates.quantity !== oldQty) {
    const diff = updates.quantity - oldQty;
    updated = recordInventoryMovement(
      updated,
      id,
      'Adjustment',
      diff,
      actorName,
      'Manual'
    );
  }
  saveStore(updated);
  return updated;
}

export function deleteProduct(store: StoreData, id: string, actorName?: string, actorRole?: string): StoreData {
  const product = store.products.find(p => p.id === id);
  if (!product || product.discontinued) return store;
  let updated: StoreData = { ...store, products: store.products.map(p => p.id === id ? { ...p, discontinued: true } : p), trash: pushTrash(store, 'product', product) };
  updated = recordActivityLog(updated, actorName, actorRole, `Archived product: ${product.name}; sales history retained`);
  saveStore(updated);
  return updated;
}

export function clearInventory(store: StoreData): StoreData {
  // Total clean wipe: resets all products, sales history, balances, learned data, and investments
  const updated = {
    ...store,
    products: [],
    sales: [],
    expenses: [],
    debtors: [],
    suppliers: [],
    cashBalance: 0,
    bankBalance: 0,
    walletBalance: 0,
    plannedRestocks: [],
    activityLogs: [],
    trash: [],
    similarProductReviews: [],
    dismissedSimilarPairs: [],
    learnedProducts: [],
    investments: [],
    loans: [],
    withdrawals: [],
    otherAssets: 0,
    liabilities: 0
  };
  saveStore(updated);
  return updated;
}
