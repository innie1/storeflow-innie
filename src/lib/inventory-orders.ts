import type { StoreData, PaymentMethod, PaymentAllocation } from '@/types/store';
import { recordCheckout, recordInventoryMovement } from './store-data';
import { money, packSize, saleUnits, stockBase, stockPrecision } from './inventory-sale-math';

export interface OrderPayment { paid: number; method: PaymentMethod; allocation?: PaymentAllocation }
export function orderNotes(order: any): Record<string, any> {
  try { const value = JSON.parse(order.notes || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return { instructions: order.notes || '' }; }
}
/** Pure proposal. It is persisted only by the atomic server commit. */
export function prepareInventoryOrder(store: StoreData, order: any, status: string, metadata: Record<string, any> = {}) {
  const notes = { ...orderNotes(order), ...metadata };
  const allowed: Record<string, string[]> = { Pending: ['Accepted','Rejected','Cancelled'], Accepted: ['Preparing','Cancelled','Rejected'], Preparing: ['Ready','Cancelled','Rejected'], Ready: ['Completed','Cancelled','Rejected'] };
  if (!(allowed[order.status] || []).includes(status)) throw new Error('This order status changed. Refresh the order before continuing.');
  const serviceOrder = ['service','appointment','session','metered'].includes(order.order_kind) || (order.order_items || []).some((i: any) => store.products.find(p => p.id === i.product_id)?.isService);
  if (serviceOrder) {
    // Service execution/payment is owned by the existing service workflow.
    if (status === 'Completed') throw new Error('Complete this order through its service workflow.');
    return { store, notes };
  }
  if (!['Accepted','Completed','Cancelled','Rejected'].includes(status)) return { store, notes };
  if (order.status === 'Pending' && status !== 'Accepted') return { store, notes };
  const items = (order.order_items || []).map((i: any) => {
    const product = store.products.find(p => p.id === String(i.product_id));
    if (!product) throw new Error('An order product is missing. Restore it before continuing.');
    const quantity = Number(i.quantity), price = Number(i.price);
    const saleType: 'single' | 'carton' = i.metadata?.saleType === 'single' || i.options?.saleType === 'single' ? 'single' : 'carton';
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) throw new Error('The order has an invalid quantity or price.');
    const units = saleUnits(product, quantity, saleType);
    if (packSize(product) > 1 && !Number.isInteger(units)) throw new Error('Order quantities must contain whole pieces.');
    return { productId: product.id, quantity, saleType, agreedUnitPrice: money(price), units };
  });
  if (!items.length) throw new Error('This order has no items.');
  const needed = new Map<string, number>();
  for (const i of items) needed.set(i.productId, stockPrecision((needed.get(i.productId) || 0) + i.units));
  let updated = { ...store, products: store.products.map(p => ({ ...p })) };
  if (status === 'Accepted') {
    for (const [id, units] of needed) {
      const product = updated.products.find(p => p.id === id)!;
      if (product.discontinued || stockBase(product) + 1e-8 < units) throw new Error(`Not enough stock for ${product.name}. The order was not accepted.`);
      product.quantity = stockPrecision(stockBase(product) - units) / packSize(product);
      updated = recordInventoryMovement(updated, id, 'Adjustment', -units / packSize(product), 'Online order', `Reserve order ${order.id}`);
    }
    notes.inventoryReservation = [...needed].map(([productId, baseQuantity]) => ({ productId, baseQuantity }));
    // Keep historical units/prices so later pack or price edits cannot change this order.
    notes.inventoryItems = items.map(i => ({ ...i, unitsPerStockUnit: packSize(store.products.find(p => p.id === i.productId)!) }));
    return { store: updated, notes };
  }
  const reservations = notes.inventoryReservation || [...needed].map(([productId, baseQuantity]) => ({ productId, baseQuantity }));
  for (const reserved of reservations) {
    const p = updated.products.find(p => p.id === reserved.productId);
    if (!p || !Number.isFinite(reserved.baseQuantity) || reserved.baseQuantity <= 0) throw new Error('The stock reservation needs review.');
    p.quantity = stockPrecision(stockBase(p) + reserved.baseQuantity) / packSize(p);
    updated = recordInventoryMovement(updated, p.id, 'Adjustment', reserved.baseQuantity / packSize(p), 'Online order', `${status === 'Completed' ? 'Consume' : 'Release'} reservation ${order.id}`);
  }
  if (status !== 'Completed') { notes.inventoryReservation = []; return { store: updated, notes }; }
  if (store.sales.some(s => s.transactionId === `order-${order.id}`)) throw new Error('This order already has sales records. Review it before completing again.');
  const payment = metadata.confirmedPayment as OrderPayment | undefined;
  if (!payment || !Number.isFinite(payment.paid) || payment.paid < 0 || payment.paid > Number(order.total)) throw new Error('Confirm the amount received and payment method.');
  const historical = notes.inventoryItems || items;
  const checkoutItems = historical.map((i: any) => {
    const p = updated.products.find(p => p.id === i.productId)!;
    if (i.unitsPerStockUnit && i.unitsPerStockUnit !== packSize(p)) throw new Error('The pack size changed after acceptance. Restore the original pack size before completing this order.');
    return i;
  });
  const subtotal = money(checkoutItems.reduce((sum: number, i: any) => sum + money(i.quantity * i.agreedUnitPrice), 0));
  const total = Number(order.total);
  if (!Number.isFinite(total) || total < 0 || total > subtotal) throw new Error('Order total needs review before completion.');
  const result = recordCheckout(updated, checkoutItems, { ...payment, discount: money(subtotal - total), customerName: order.customer_name || 'Online Customer', customerPhone: order.customer_phone, deferSave: true });
  if (result.error) throw new Error(result.error);
  const generatedId = result.sales[0].transactionId;
  const transactionId = `order-${order.id}`;
  const next = { ...result.store,
    sales: result.store.sales.map(s => s.transactionId === generatedId ? { ...s, transactionId, channel: 'online_order' as const } : s),
    customers: result.store.customers?.map(c => ({ ...c, purchaseHistory: c.purchaseHistory?.map(h => h.transactionId === generatedId ? { ...h, transactionId } : h) })),
  };
  notes.inventoryReservation = [];
  notes.inventoryItems = checkoutItems;
  return { store: next, notes };
}
