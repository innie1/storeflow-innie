import {
  money,
  stockPrecision,
  packSize,
  stockBase,
  saleUnits,
  salePrice,
  historicalUnits,
  legacyAllocation,
} from '@/lib/inventory-sale-math';
import { recordActivityLog } from '../activity-log';
import { Sale, StoreData, TrashItem } from '@/types/store';
import { attribution } from '@/lib/recorded-by';
import { recordInventoryMovement, syncProductPerformance } from './inventory-movements';
import { generateId } from './ids';
import { saveStore } from './load-save';

export function deleteSale(store: StoreData, id: string, deferSave = false): StoreData {
  const selected = store.sales.find(s => s.id === id || s.transactionId === id);
  if (!selected) return store;
  // A credit invoice and its payments are indivisible. Delete the transaction,
  // even when a caller passed one of its line IDs.
  const sales = store.sales.filter(s => s.id === selected.id || (!!selected.transactionId && s.transactionId === selected.transactionId) || (!!selected.pendingPaymentId && s.pendingPaymentId === selected.pendingPaymentId));
  const ids = new Set(sales.map(s => s.id));
  const pending = (store.pendingPayments || []).filter(p => sales.some(s => s.pendingPaymentId === p.id) || (p.saleIds || []).some(id => ids.has(id)));
  const allocation = { cash: 0, bank: 0 };
  for (const payment of pending) {
    let accounted = 0;
    for (const event of payment.events || []) {
      const split = event.allocation || legacyAllocation(event.amount, event.method || selected.paymentMethod);
      allocation.cash += split.cash; allocation.bank += split.bank; accounted += event.amount;
    }
    if (payment.paid > accounted) {
      const split = legacyAllocation(payment.paid - accounted, selected.paymentMethod);
      allocation.cash += split.cash; allocation.bank += split.bank;
    }
  }
  for (const sale of sales.filter(s => !pending.some(p => p.id === s.pendingPaymentId || (p.saleIds || []).includes(s.id)))) {
    const split = sale.paymentAllocation || legacyAllocation(sale.total, sale.paymentMethod);
    allocation.cash += split.cash; allocation.bank += split.bank;
  }
  const stock: NonNullable<TrashItem['saleUndo']>['stock'] = [];
  let updated: StoreData = { ...store, products: store.products.map(p => ({ ...p })) };
  for (const sale of sales) {
    const product = updated.products.find(p => p.id === sale.productId);
    if (!product || sale.pendingPaymentId?.startsWith('laundry-')) continue;
    const backorderQuantity = sale.backorderQuantity || 0;
    const baseQuantity = Math.max(0, historicalUnits(sale, product) - backorderQuantity);
    stock.push({ productId: product.id, baseQuantity, backorderQuantity });
    product.quantity = stockPrecision(stockBase(product) + baseQuantity) / packSize(product);
    product.backorderedQty = Math.max(0, stockPrecision((product.backorderedQty || 0) * packSize(product) - backorderQuantity)) / packSize(product);
    updated = recordInventoryMovement(updated, product.id, 'Return', baseQuantity / packSize(product), 'Staff', 'Sale reversal');
  }
  const customerIds = new Set(sales.map(s => s.customerId).filter(Boolean));
  for (const payment of pending) {
    const matches = (store.customers || []).filter(c => payment.customerId ? c.id === payment.customerId : payment.customerPhone ? c.phone.replace(/\D/g, '') === payment.customerPhone.replace(/\D/g, '') : c.name.toLowerCase() === payment.customerName.toLowerCase());
    if (matches.length === 1) customerIds.add(matches[0].id);
  }
  const customerDeltas = [...customerIds].map(customerId => {
    const customer = (store.customers || []).find(c => c.id === customerId);
    return {
      id: customerId!,
      purchases: money(Math.min(customer?.totalPurchases || 0, sales.reduce((sum, s) => sum + s.total, 0))),
      debt: money(Math.min(customer?.outstandingDebt || 0, pending.reduce((sum, p) => sum + p.balance, 0))),
      visits: Math.min(customer?.visitsCount || 0, 1),
      points: Math.min(customer?.loyaltyPoints || 0, Math.floor(sales.reduce((sum, s) => sum + s.total, 0) / 1000)),
      history: (customer?.purchaseHistory || []).filter(p => p.transactionId && p.transactionId === selected.transactionId),
    };
  });
  updated = { ...updated,
    sales: store.sales.filter(s => !ids.has(s.id)),
    pendingPayments: (store.pendingPayments || []).filter(p => !pending.some(x => x.id === p.id)),
    cashBalance: money((store.cashBalance || 0) - allocation.cash), bankBalance: money((store.bankBalance || 0) - allocation.bank),
    customers: (store.customers || []).map(c => { const delta = customerDeltas.find(d => d.id === c.id); return delta ? { ...c, purchaseHistory: (c.purchaseHistory || []).filter(p => !p.transactionId || !delta.history.some(h => h.transactionId === p.transactionId)), totalPurchases: money(Math.max(0, c.totalPurchases - delta.purchases)), outstandingDebt: money(Math.max(0, c.outstandingDebt - delta.debt)), visitsCount: Math.max(0, c.visitsCount - delta.visits), loyaltyPoints: Math.max(0, c.loyaltyPoints - delta.points) } : c; }),
    trash: [{ id: generateId(), kind: 'sale', deletedAt: new Date().toISOString(), payload: selected, saleUndo: { sales, pending, allocation, stock, customers: customerDeltas } }, ...(store.trash || [])],
  };
  updated = syncProductPerformance(updated);
  if (!deferSave) saveStore(updated);
  return updated;
}

export function recordSale(
  store: StoreData,
  productId: string,
  quantity: number,
  actorName?: string,
  actorRole?: string,
  transactionId?: string,
  saleType?: 'carton' | 'single',
  deferSave = false
): StoreData {
  const product = store.products.find(p => p.id === productId);
  if (!product || product.discontinued) return store;
  if (!Number.isFinite(quantity) || quantity <= 0) return store;
  if ((saleType === 'single' || packSize(product) > 1) && !Number.isInteger(saleUnits(product, quantity, saleType))) return store;

  let unitPrice = salePrice(product, saleType);
  let costPrice = product.costPrice;
  let qtyDeduction = quantity;
  const isSingle = saleType === 'single' && product.isCartonSingleEnabled;

  if (isSingle) {
    const singles = product.singlesPerCarton || 1;
    unitPrice = salePrice(product, saleType);
    costPrice = product.costPrice / singles;
    qtyDeduction = quantity / singles;
  }

  const backorderEnabled = !!store.managerSettings?.backorderSellingEnabled;
  const baseQuantity = saleUnits(product, quantity, saleType);
  const shortfallBase = Math.max(0, stockPrecision(baseQuantity - stockBase(product)));
  const shortfall = shortfallBase / packSize(product);
  if (shortfall > 0 && !backorderEnabled) return store;

  const sale: Sale = {
    id: generateId(),
    productId,
    productName: product.name + (isSingle ? ' (Single)' : ''),
    quantity: stockPrecision(quantity), // Preserve weighed quantities and fractional cartons
    unitPrice: Math.round(unitPrice * 100) / 100,
    total: Math.round(unitPrice * quantity * 100) / 100,
    profit: Math.round((unitPrice - costPrice) * quantity * 100) / 100,
    date: new Date().toISOString(),
    transactionId,
    channel: 'in_store',
    saleType: isSingle ? 'single' : 'carton',
    stockQuantity: qtyDeduction,
    baseQuantity,
    unitsPerStockUnit: packSize(product),
    backorderQuantity: shortfallBase,
    costAtSale: costPrice,
    ...(deferSave ? {} : { paymentMethod: 'cash' as const, paymentAllocation: { cash: money(unitPrice * quantity), bank: 0 } }),
    // The actor reached this function already; it was spent on a log line and
    // thrown away, so nothing could say who sold what.
    ...attribution({ name: actorName, role: actorRole }),
  };

  const newQty = Math.max(0, stockPrecision(stockBase(product) - baseQuantity)) / packSize(product);
  const newBackorderedQty = stockPrecision((product.backorderedQty || 0) + shortfall);
  const newUnitsSold = stockPrecision((product.units_sold || 0) + baseQuantity);
  const newTotalRevenue = Math.round(((product.total_revenue || 0) + sale.total) * 100) / 100;
  const newTotalProfit = Math.round(((product.total_profit || 0) + sale.profit) * 100) / 100;

  let updated: StoreData = {
    ...store,
    products: store.products.map(p => p.id === productId ? {
      ...p,
      quantity: newQty,
      backorderedQty: newBackorderedQty,
      units_sold: newUnitsSold,
      total_revenue: newTotalRevenue,
      total_profit: newTotalProfit,
      first_sale_at: p.first_sale_at || sale.date,
      last_sold_at: sale.date
    } : p),
    sales: [sale, ...store.sales],
    cashBalance: money((store.cashBalance || 0) + (deferSave ? 0 : sale.total)),
  };

  updated = recordInventoryMovement(
    updated,
    productId,
    'Sale',
    -(baseQuantity - shortfallBase) / packSize(product),
    actorName,
    'Sales Checkout'
  );

  if (actorName) {
    const displayQty = isSingle ? `${quantity} pcs` : `${quantity} ctn`;
    const backorderNote = shortfall > 0 ? ' [backorder]' : '';
    updated = recordActivityLog(updated, actorName, actorRole, `Completed sale: ${product.name} × ${displayQty} (Total: ₦${sale.total.toLocaleString()})${backorderNote}`);
  }
  if (!deferSave) saveStore(updated);
  return updated;
}

// Settle a product's backorder against its current stock (call after restocking).
// Subtracts the owed quantity from stock and clears the backorder counter.
export function syncBackorder(store: StoreData, productId: string): StoreData {
  const product = store.products.find(p => p.id === productId);
  if (!product || !product.backorderedQty) return store;
  const owed = stockPrecision(product.backorderedQty * packSize(product));
  const fulfilled = Math.min(stockBase(product), owed);
  let remaining = fulfilled;
  const sales = [...store.sales].reverse().map(sale => {
    if (sale.productId !== productId || !sale.backorderQuantity) return sale;
    const applied = Math.min(remaining, sale.backorderQuantity);
    remaining -= applied;
    return { ...sale, backorderQuantity: stockPrecision(sale.backorderQuantity - applied) };
  }).reverse();
  let updated = { ...store, sales, products: store.products.map(p => p.id === productId ? {
    ...p, quantity: stockPrecision(stockBase(p) - fulfilled) / packSize(p), backorderedQty: stockPrecision(owed - fulfilled) / packSize(p),
  } : p) };
  updated = recordInventoryMovement(updated, productId, 'Sale', -fulfilled / packSize(product), 'Staff', 'Backorder fulfilment');
  saveStore(updated);
  return updated;
}

// Clear a product's backorder counter without touching stock (owner chose to write it off).
export function clearBackorder(store: StoreData, productId: string): StoreData {
  const updated = {
    ...store,
    products: store.products.map(p => p.id === productId ? {
      ...p,
      backorderedQty: 0,
    } : p),
  };
  saveStore(updated);
  return updated;
}

export function clearSales(store: StoreData): StoreData {
  let updated = store;
  while (updated.sales.length) updated = deleteSale(updated, updated.sales[0].id, true);
  saveStore(updated);
  return updated;
}
