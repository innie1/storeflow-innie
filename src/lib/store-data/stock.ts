import { stockPrecision, packSize, stockBase, saleUnits } from '@/lib/inventory-sale-math';
import { enterExpenses } from '../expense-log';
import { Product, StoreData, Restock, Expense, Investment } from '@/types/store';
import { attribution } from '@/lib/recorded-by';
import { currentActor } from '@/lib/current-actor';
import { recordInventoryMovement } from './inventory-movements';
import { generateId } from './ids';
import { saveStore } from './load-save';

export function importProducts(
  store: StoreData,
  products: Omit<Product, 'id'>[],
  source: string = 'Supplier Invoice',
  actorName?: string
): StoreData {
  const now = new Date().toISOString();
  const newProducts = products.map(p => ({
    ...p,
    id: generateId(),
    initialQuantity: p.quantity,
    addedAt: now,
    restock_count: p.quantity > 0 ? 1 : 0,
    units_sold: 0,
    total_revenue: 0,
    total_profit: 0
  }));

  let importTotal = 0;
  products.forEach(p => {
    importTotal += p.costPrice * p.quantity;
  });
  importTotal = Math.round(importTotal * 100) / 100;

  const newInvestments = [...(store.investments || [])];
  const newExpenses: Expense[] = [];

  // Initial mass import check: no sales yet and no existing restock expenses
  const isInitialImport = (store.sales || []).length === 0 &&
    (store.expenses || []).filter(e => e.source === 'restock').length === 0;

  if (importTotal > 0) {
    newInvestments.push({
      id: generateId(),
      amount: importTotal,
      note: isInitialImport
        ? `Initial Inventory Import (${products.length} products)`
        : `Bulk Imported Inventory (${products.length} products)`,
      date: now,
      type: isInitialImport ? 'initial' : 'additional',
    });

    if (!isInitialImport) {
      newExpenses.push({
        id: generateId(),
        amount: importTotal,
        category: 'Restock',
        date: now,
        note: `Bulk Imported Inventory (${products.length} products)`,
        source: 'restock',
      });
    }
  }

  let updated: StoreData = {
    ...store,
    products: [...store.products, ...newProducts],
    investments: newInvestments,
  };
  updated = enterExpenses(updated, newExpenses);

  newProducts.forEach(p => {
    if (p.quantity > 0) {
      updated = recordInventoryMovement(
        updated,
        p.id,
        'Restock',
        p.quantity,
        actorName,
        source
      );
    }
  });

  saveStore(updated);
  return updated;
}

export interface RestockEntry {
  productId: string;
  quantity: number;
  costPrice: number;
}

export type RestockFunding = 'balance' | 'new_money';

export function receiveStock(
  store: StoreData,
  entries: RestockEntry[],
  funding: RestockFunding = 'balance',
  source: string = 'Restock Button',
  actorName?: string,
  actorRole?: string
): StoreData {
  const grouped = new Map<string, RestockEntry>();
  for (const entry of entries) {
    const product = store.products.find(p => p.id === entry.productId);
    if (!product || !Number.isFinite(entry.quantity) || entry.quantity <= 0 || !Number.isFinite(entry.costPrice) || entry.costPrice < 0) throw new Error('Check the restock products, quantities and costs.');
    if (packSize(product) > 1 && !Number.isInteger(saleUnits(product, entry.quantity))) throw new Error('Pack stock must contain whole pieces.');
    const old = grouped.get(entry.productId);
    grouped.set(entry.productId, old ? { ...entry, quantity: old.quantity + entry.quantity, costPrice: (old.quantity * old.costPrice + entry.quantity * entry.costPrice) / (old.quantity + entry.quantity) } : entry);
  }
  entries = [...grouped.values()];
  const now = new Date().toISOString();
  const batchId = generateId();
  const newRestocks: Restock[] = [];
  let restockTotal = 0;
  const itemNames: string[] = [];
  const updatedProducts = store.products.map(p => {
    const entry = entries.find(e => e.productId === p.id);
    if (!entry || entry.quantity <= 0) return p;
    const lineTotal = Math.round(entry.quantity * entry.costPrice * 100) / 100;
    restockTotal += lineTotal;
    itemNames.push(`${p.name} ×${entry.quantity}`);
    newRestocks.push({
      id: generateId(),
      productId: p.id,
      productName: p.name,
      quantity: entry.quantity,
      costPrice: entry.costPrice,
      total: lineTotal,
      date: now,
      batchId,
      funding,
      // Who received it, so History can say so as it does for a sale.
      ...attribution(actorName ? { name: actorName, role: actorRole } : currentActor()),
    });
    const currentPriceHistory = p.priceHistory || (p.costPrice > 0 ? [{ costPrice: p.costPrice, date: p.addedAt || now }] : []);
    const newPriceHistory = entry.costPrice > 0
      ? [...currentPriceHistory, { costPrice: entry.costPrice, date: now }]
      : currentPriceHistory;
    return {
      ...p,
      quantity: stockPrecision(stockBase(p) + saleUnits(p, entry.quantity)) / packSize(p),
      costPrice: (Math.max(0, p.quantity) * p.costPrice + entry.quantity * entry.costPrice) / (Math.max(0, p.quantity) + entry.quantity),
      initialQuantity: p.initialQuantity ?? p.quantity,
      priceHistory: newPriceHistory,
      restock_count: (p.restock_count || 0) + 1,
    };
  });

  // Auto-create a single Restock expense for the entire batch (always — reduces net income / cash)
  const newExpenses: Expense[] = [];
  const newInvestments: Investment[] = [];

  let newCashBalance = store.cashBalance ?? 0;
  let newBankBalance = store.bankBalance ?? 0;
  let newWalletBalance = store.walletBalance ?? 0;

  if (restockTotal > 0) {
    {
      const availableCash = newCashBalance + newBankBalance + newWalletBalance;
      let autoInvestedAmt = 0;
      let cashDeduction = 0;

      // Honour what the merchant said. The intake screens already ask "from
      // balance" or "new money", but that answer used to be filed against the
      // restock and then ignored: the till was drained either way, and any
      // shortfall was booked as capital the merchant never said they had put
      // in. Those invented injections then inflated the balance.
      if (funding === 'new_money') {
        // Came from outside and went straight to the supplier, so it never sat
        // in the till and nothing is deducted from it.
        autoInvestedAmt = restockTotal;
      } else {
        // Paid from the balance. Spending past what is there is a debt, and
        // the balance is allowed to say so — it is no longer floored at zero
        // and no capital is invented to cover the gap.
        cashDeduction = restockTotal;
      }
      const shortfall = funding !== 'new_money' && restockTotal > availableCash;

      // Spend the balance, drawing on cash first, then bank, then wallet.
      // Whatever is left over runs the cash account negative rather than being
      // clamped away: overspending is a debt, and the shop should be told.
      let remainingDeduct = cashDeduction;
      for (const account of ['cash', 'bank', 'wallet'] as const) {
        if (remainingDeduct <= 0) break;
        const held = account === 'cash' ? newCashBalance : account === 'bank' ? newBankBalance : newWalletBalance;
        const taken = Math.min(Math.max(held, 0), remainingDeduct);
        if (account === 'cash') newCashBalance -= taken;
        else if (account === 'bank') newBankBalance -= taken;
        else newWalletBalance -= taken;
        remainingDeduct -= taken;
      }
      if (remainingDeduct > 0) newCashBalance -= remainingDeduct;

      const fundingLabel = funding === 'new_money'
        ? ' (paid with new money)'
        : shortfall
          ? ' (balance was short — check your cash)'
          : ' (from available balance)';
      newExpenses.push({
        id: generateId(),
        amount: Math.round(restockTotal * 100) / 100,
        category: 'Restock',
        date: now,
        note: `Stock from supplier${fundingLabel}: ${itemNames.slice(0, 4).join(', ')}${itemNames.length > 4 ? `, +${itemNames.length - 4} more` : ''}`,
        source: 'restock',
        restockBatchId: batchId,
      });

      if (autoInvestedAmt > 0) {
        newInvestments.push({
          id: generateId(),
          amount: Math.round(autoInvestedAmt * 100) / 100,
          // Say which of the two this was. A shortfall is not the merchant
          // telling us they injected capital — it is the books disagreeing
          // with the till, and it should read that way in the ledger.
          note: shortfall
            ? `Unfunded restock — available balance was short by this much`
            : `Stock bought with new money`,
          source: 'Inventory Restock',
          date: now,
          type: 'additional',
        });
      }
    }
  }

  let updated: StoreData = {
    ...store,
    products: updatedProducts,
    restocks: [...newRestocks, ...(store.restocks || [])],
    investments: [...newInvestments, ...(store.investments || [])],
    cashBalance: Math.round(newCashBalance * 100) / 100,
    bankBalance: Math.round(newBankBalance * 100) / 100,
    walletBalance: Math.round(newWalletBalance * 100) / 100,
  };
  updated = enterExpenses(updated, newExpenses);

  for (const entry of entries) {
    if (entry.quantity > 0) {
      updated = recordInventoryMovement(
        updated,
        entry.productId,
        'Restock',
        entry.quantity,
        actorName,
        source
      );
    }
  }

  saveStore(updated);
  return updated;
}

export function findProductByBarcode(store: StoreData, barcode: string): Product | undefined {
  return store.products.find(p => p.barcode === barcode);
}
