import type { Product, Sale, PaymentAllocation, PaymentMethod } from '@/types/store';

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const stockPrecision = (value: number) => Math.round(value * 1e9) / 1e9;
export function packSize(product: Product): number {
  return product.isCartonSingleEnabled && Number.isInteger(product.singlesPerCarton) && product.singlesPerCarton! > 0
    ? product.singlesPerCarton! : 1;
}
// Keep the existing carton quantity API for older screens. Arithmetic on packs
// happens in whole pieces; never round a fraction of a carton to two decimals.
export function stockBase(product: Product): number {
  return packSize(product) > 1 ? Math.round(product.quantity * packSize(product)) : stockPrecision(product.quantity);
}
export function saleUnits(product: Product, quantity: number, type?: 'carton' | 'single'): number {
  return stockPrecision(quantity * (type === 'single' ? 1 : packSize(product)));
}
export function salePrice(product: Product, type?: 'carton' | 'single'): number {
  return money(type === 'single' && product.isCartonSingleEnabled
    ? product.singleSellingPrice ?? product.sellingPrice / packSize(product) : product.sellingPrice);
}
export function historicalUnits(sale: Sale, product?: Product): number {
  if (sale.baseQuantity !== undefined) return sale.baseQuantity;
  return sale.productName.endsWith(' (Single)') ? sale.quantity : sale.quantity * (product ? packSize(product) : 1);
}
export function paymentAllocation(amount: number, method: PaymentMethod, split?: PaymentAllocation): PaymentAllocation {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Enter a valid payment amount.');
  if (method === 'mixed') {
    if (!split || !Number.isFinite(split.cash) || !Number.isFinite(split.bank) || split.cash < 0 || split.bank < 0 || money(split.cash + split.bank) !== money(amount)) {
      throw new Error('Enter cash and bank amounts that add up to the payment.');
    }
    return { cash: money(split.cash), bank: money(split.bank) };
  }
  if (!['cash', 'pos', 'transfer'].includes(method)) throw new Error('Choose a payment method.');
  return { cash: method === 'cash' ? money(amount) : 0, bank: method === 'cash' ? 0 : money(amount) };
}
// Historical mixed payments were recorded as 50/50. Reverse that recorded
// allocation for old rows, but require an explicit split for every new payment.
export function legacyAllocation(amount: number, method: PaymentMethod = 'cash'): PaymentAllocation {
  return method === 'mixed' ? { cash: money(amount / 2), bank: money(amount - money(amount / 2)) } : paymentAllocation(amount, method);
}
