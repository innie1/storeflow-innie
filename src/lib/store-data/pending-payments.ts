import {
  money,
  packSize,
  stockBase,
  saleUnits,
  salePrice,
  paymentAllocation,
} from '@/lib/inventory-sale-math';
import type { PaymentAllocation } from '@/types/store';
import { Sale, StoreData, Customer } from '@/types/store';
import { countDebtors } from '@/lib/customer-key';
import type { PendingPayment, PaymentMethod } from '@/types/store';
import { syncProductPerformance } from './inventory-movements';
import { saveStore } from './load-save';
import { recordSale } from './sales';

export function pid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/**
 * Records the sale (decrements stock, creates Sale rows) AND creates a PendingPayment
 * if `paid < total`. If paid >= total it just records a normal paid sale.
 */
export function recordCheckout(
  store: StoreData,
  items: { productId: string; quantity: number; saleType?: 'carton' | 'single'; expectedUnitPrice?: number; agreedUnitPrice?: number }[],
  opts: {
    paid: number; method: PaymentMethod; allocation?: PaymentAllocation;
    customerId?: string; customerName?: string; customerPhone?: string; customerNote?: string;
    dueDate?: string; discount?: number; actorName?: string; actorRole?: string; deferSave?: boolean;
    /** What the customer handed over, when it is more than the goods cost. */
    tendered?: number;
  }
): { store: StoreData; sales: Sale[]; pending?: PendingPayment; error?: string; subtotal: number; total: number; discount: number; paid: number; balance: number; tendered?: number; changeGiven?: number } {
  const failed = (error: string) => ({ store, sales: [] as Sale[], error, subtotal: 0, total: 0, discount: 0, paid: 0, balance: 0 });
  try {
    if (!items.length) return failed('Add an item before checkout.');
    if (!Number.isFinite(opts.paid) || opts.paid < 0 || !Number.isFinite(opts.discount ?? 0) || (opts.discount ?? 0) < 0) return failed('Check the payment and discount amounts.');
    const needed = new Map<string, number>();
    for (const item of items) {
      const product = store.products.find(p => p.id === item.productId && !p.discontinued);
      if (!product) return failed('An item is no longer available. Review your cart.');
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) return failed(`Enter a valid quantity for ${product.name}.`);
      if (item.agreedUnitPrice !== undefined && (!opts.deferSave || !Number.isFinite(item.agreedUnitPrice) || item.agreedUnitPrice < 0)) return failed('Invalid agreed order price.');
      const units = saleUnits(product, item.quantity, item.saleType);
      if ((packSize(product) > 1 || item.saleType === 'single') && !Number.isInteger(units)) return failed(`${product.name} must be sold in whole pieces.`);
      if (item.expectedUnitPrice !== undefined && money(item.expectedUnitPrice) !== salePrice(product, item.saleType)) return failed(`The price of ${product.name} changed. Remove it and add it again.`);
      if (!Number.isFinite(product.costPrice) || product.costPrice < 0 || !Number.isFinite(salePrice(product, item.saleType)) || salePrice(product, item.saleType) < 0) return failed(`Check the price of ${product.name}.`);
      needed.set(product.id, (needed.get(product.id) || 0) + units);
      if (!store.managerSettings?.backorderSellingEnabled && needed.get(product.id)! > stockBase(product) + 1e-8) return failed(`Not enough stock for ${product.name}. Nothing was sold.`);
    }
    const customerName = opts.customerName?.trim();
    const customers = store.customers || [];
    const phone = String(opts.customerPhone || '').replace(/\D/g, '');
    let customer = opts.customerId ? customers.find(c => c.id === opts.customerId) : undefined;
    if (opts.customerId && !customer) return failed('Select the customer again.');
    if (!customer && customerName) {
      const matches = phone ? customers.filter(c => String(c.phone || '').replace(/\D/g, '') === phone) : customers.filter(c => c.name.trim().toLowerCase() === customerName.toLowerCase());
      if (matches.length > 1) return failed('More than one customer matches. Select the correct customer.');
      customer = matches[0];
    }
    const customerId = customer?.id || (customerName ? pid() : undefined);
    const transactionId = pid();
    let updated = store;
    for (const item of items) {
      const original = updated.products.find(p => p.id === item.productId)!;
      if (item.agreedUnitPrice !== undefined) updated = { ...updated, products: updated.products.map(p => p.id === item.productId ? { ...p, ...(item.saleType === 'single' ? { singleSellingPrice: item.agreedUnitPrice } : { sellingPrice: item.agreedUnitPrice }) } : p) };
      updated = recordSale(updated, item.productId, item.quantity, opts.actorName, opts.actorRole, transactionId, item.saleType, true);
      if (item.agreedUnitPrice !== undefined) updated = { ...updated, products: updated.products.map(p => p.id === item.productId ? { ...p, sellingPrice: original.sellingPrice, singleSellingPrice: original.singleSellingPrice } : p) };
    }
    const rawSales = updated.sales.filter(s => s.transactionId === transactionId);
    if (rawSales.length !== items.length) return failed('The cart could not be recorded. Nothing was sold.');
    const subtotal = money(rawSales.reduce((sum, sale) => sum + sale.total, 0));
    const discount = money(opts.discount || 0);
    if (discount > subtotal) return failed('Discount cannot exceed the sale total.');
    const total = money(subtotal - discount);
    const paid = money(Math.min(opts.paid, total));
    const balance = money(total - paid);
    /*
     * Change is the customer's own money going back to them: never income,
     * never added to the drawer. The shop is paid the price of the goods, and
     * that is what `paid` above already is.
     */
    const tendered = Number.isFinite(opts.tendered as number) ? money(Math.max(0, opts.tendered as number)) : paid;
    const changeGiven = money(Math.max(0, tendered - total));
    if (balance > 0 && !customerName) return failed('Enter a customer for the unpaid balance.');
    const allocation = paymentAllocation(paid, opts.method, opts.allocation);
    let remainingDiscount = Math.round(discount * 100);
    let remainingCash = Math.round(allocation.cash * 100);
    let remainingBank = Math.round(allocation.bank * 100);
    const pendingId = balance > 0 ? pid() : undefined;
    const sales = rawSales.map((sale, index) => {
      const last = index === rawSales.length - 1;
      const discountCents = last ? remainingDiscount : Math.min(remainingDiscount, Math.floor(discount * 100 * sale.total / (subtotal || 1)));
      remainingDiscount -= discountCents;
      const saleTotal = money(sale.total - discountCents / 100);
      const cash = last ? remainingCash : Math.min(remainingCash, Math.floor(allocation.cash * 100 * saleTotal / (total || 1)));
      const bank = last ? remainingBank : Math.min(remainingBank, Math.floor(allocation.bank * 100 * saleTotal / (total || 1)));
      remainingCash -= cash; remainingBank -= bank;
      return { ...sale, total: saleTotal, profit: money(sale.profit - discountCents / 100), customerId, pendingPaymentId: pendingId, paymentMethod: opts.method, paymentAllocation: { cash: cash / 100, bank: bank / 100 } };
    });
    // Once per checkout, on the row that opens it - see Sale.amountTendered.
    if (changeGiven > 0 && sales.length) sales[0] = { ...sales[0], amountTendered: tendered, changeGiven };
    const now = new Date().toISOString();
    const pending: PendingPayment | undefined = pendingId ? {
      id: pendingId, customerId, customerName: customerName!, customerPhone: opts.customerPhone || customer?.phone,
      customerNote: opts.customerNote, dueDate: opts.dueDate, createdAt: now,
      items: sales.map(s => ({ productId: s.productId, productName: s.productName, quantity: s.quantity, unitPrice: s.unitPrice })),
      total, paid, balance, status: 'pending', saleIds: sales.map(s => s.id),
      events: paid > 0 ? [{ date: now, amount: paid, method: opts.method, allocation }] : [],
    } : undefined;
    updated = { ...updated, sales: [...sales, ...store.sales],
      pendingPayments: pending ? [pending, ...(store.pendingPayments || [])] : store.pendingPayments,
      cashBalance: money((store.cashBalance || 0) + allocation.cash), bankBalance: money((store.bankBalance || 0) + allocation.bank) };
    if (customerName && customerId) {
      const purchase = { date: now, amount: total, items: sales.map(s => `${s.productName} (x${s.quantity})`).join(', '), transactionId };
      const nextCustomer: Customer = {
        ...(customer || {}), id: customerId, name: customer?.name || customerName, phone: customer?.phone || opts.customerPhone || '',
        totalPurchases: money((customer?.totalPurchases || 0) + total), outstandingDebt: money((customer?.outstandingDebt || 0) + balance),
        lastPurchaseDate: now, purchaseHistory: [purchase, ...(customer?.purchaseHistory || [])],
        visitsCount: (customer?.visitsCount || 0) + 1, loyaltyPoints: (customer?.loyaltyPoints || 0) + Math.floor(total / 1000),
      };
      updated = { ...updated, customers: customer ? customers.map(c => c.id === customerId ? nextCustomer : c) : [nextCustomer, ...customers] };
    }
    updated = syncProductPerformance(updated);
    if (!opts.deferSave) saveStore(updated);
    return { store: updated, sales, pending, subtotal, total, discount, paid, balance, tendered, changeGiven };
  } catch (error) {
    return failed(error instanceof Error ? error.message : 'Checkout failed. Your cart has been kept.');
  }
}

/** Atomic cash checkout used by barcode, voice and receipt entry points. */
export function recordCashCheckout(store: StoreData, items: { productId: string; quantity: number }[], actorName?: string, actorRole?: string) {
  const total = items.reduce((sum, item) => { const p = store.products.find(p => p.id === item.productId); return sum + (p ? money(salePrice(p) * item.quantity) : 0); }, 0);
  return recordCheckout(store, items, { paid: money(total), method: 'cash', actorName, actorRole });
}

export function addPaymentToPending(store: StoreData, id: string, amount: number, method: PaymentMethod = 'cash', split?: PaymentAllocation): StoreData {
  const p = (store.pendingPayments || []).find(x => x.id === id);
  if (!p || p.balance <= 0) throw new Error('This payment is no longer outstanding.');
  if (!Number.isFinite(amount) || amount <= 0 || money(amount) > money(p.balance)) throw new Error('Enter an amount no greater than the outstanding balance.');
  amount = money(amount);
  const allocation = paymentAllocation(amount, method, split);
  const numberOf = (value: unknown) => String(value || '').replace(/\D/g, '');
  const customers = store.customers || [];
  const byNumber = numberOf(p.customerPhone) ? customers.filter(c => numberOf(c.phone) === numberOf(p.customerPhone)) : [];
  const byName = customers.filter(c => c.name.toLowerCase() === p.customerName.toLowerCase());
  const payerId = p.customerId || (byNumber.length === 1 ? byNumber[0].id : '') || (byName.length === 1 ? byName[0].id : '');
  const date = new Date().toISOString();
  const updated: StoreData = { ...store,
    customers: customers.map(c => c.id === payerId ? { ...c, outstandingDebt: money(Math.max(0, c.outstandingDebt - amount)) } : c),
    cashBalance: money((store.cashBalance || 0) + allocation.cash), bankBalance: money((store.bankBalance || 0) + allocation.bank),
    pendingPayments: (store.pendingPayments || []).map(entry => entry.id !== id ? entry : {
      ...entry, paid: money(entry.paid + amount), balance: money(entry.balance - amount), status: money(entry.balance - amount) === 0 ? 'paid' : 'pending',
      events: [...(entry.events || []), { date, amount, method, allocation }],
    }),
  };
  // Laundry sales are receipts, whereas inventory sales are invoices. Preserve
  // the laundry receipt convention when a bundle is paid from this screen.
  if (id.startsWith('laundry-')) {
    updated.sales = [...store.sales, { id: pid(), productId: p.items[0]?.productId || id, productName: p.items[0]?.productName || 'Laundry payment', quantity: 1, unitPrice: amount, total: amount, profit: amount, date, pendingPaymentId: id, paymentMethod: method, paymentAllocation: allocation, channel: 'in_store' }];
  }
  saveStore(updated);
  return updated;
}

export function markPendingPaid(store: StoreData, id: string, method: PaymentMethod = 'cash'): StoreData {
  const p = (store.pendingPayments || []).find(x => x.id === id);
  if (!p) return store;
  return addPaymentToPending(store, id, p.balance, method);
}

export function deletePendingPayment(store: StoreData, id: string): StoreData {
  // A write-off forgives the debt; it is not a payment and must retain history.
  const pending = (store.pendingPayments || []).find(p => p.id === id);
  if (!pending || pending.balance <= 0) return store;
  const candidates = (store.customers || []).filter(c => pending.customerId ? c.id === pending.customerId : pending.customerPhone ? c.phone.replace(/\D/g, '') === pending.customerPhone.replace(/\D/g, '') : c.name.toLowerCase() === pending.customerName.toLowerCase());
  const updated: StoreData = { ...store,
    customers: (store.customers || []).map(c => candidates.length === 1 && c.id === candidates[0].id ? { ...c, outstandingDebt: money(Math.max(0, c.outstandingDebt - pending.balance)) } : c),
    pendingPayments: (store.pendingPayments || []).map(p => p.id === id ? { ...p, writtenOffAmount: money((p.writtenOffAmount || 0) + p.balance), writtenOffAt: new Date().toISOString(), balance: 0, status: 'written_off' } : p),
  };
  saveStore(updated);
  return updated;
}

/**
 * Whether anybody ever owed money on this.
 *
 * A laundry writes one of these for every bundle, so it can take a part
 * payment later, and most are paid in full at the counter the day they come
 * in. Counted as debts, a customer who always paid on the spot read as having
 * "delayed payment" once per bundle and the average debt was the average
 * bundle. Owed means something was still unpaid at the end of the day it was
 * brought, or is unpaid now.
 */
export function wasEverOwed(payment: PendingPayment): boolean {
  if (payment.status === 'pending') return true;
  if (payment.status === 'written_off') return true;
  const created = new Date(payment.createdAt);
  const endOfDay = new Date(created);
  endOfDay.setHours(24, 0, 0, 0);
  const events = payment.events || [];
  // Nothing to go by: trust the record's own figure.
  if (!events.length) return (Number(payment.paid) || 0) < (Number(payment.total) || 0) && !Number.isNaN(created.getTime());
  const paidThatDay = events
    .filter(event => new Date(event.date).getTime() < endOfDay.getTime())
    .reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
  return paidThatDay < (Number(payment.total) || 0);
}

export function getPendingSummary(store: StoreData) {
  const list = (store.pendingPayments || []).filter(p => p.status === 'pending');
  const totalOwed = list.reduce((s, p) => s + p.balance, 0);
  // By customer, not by name: two customers who share a name are two debtors.
  const customerCount = countDebtors(list);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  let collectedThisMonth = 0;
  let collectedAllTime = 0;
  let originatedAllTime = 0;
  // Recovered of what was actually owed: a bundle paid at the counter was
  // never a debt, and counting it made every laundry look 95% recovered.
  (store.pendingPayments || []).filter(wasEverOwed).forEach(p => {
    originatedAllTime += p.total;
    (p.events || []).forEach(e => {
      collectedAllTime += e.amount;
      if (new Date(e.date) >= monthStart) collectedThisMonth += e.amount;
    });
  });
  const recoveryRate = originatedAllTime > 0 ? Math.round((collectedAllTime / originatedAllTime) * 100) : 0;
  const overdue = list.filter(p => p.dueDate && new Date(p.dueDate) < new Date());
  return { totalOwed, customerCount, collectedThisMonth, recoveryRate, overdue, list };
}
