import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { buildFlowOrderWhatsAppMessage, formatFlowOrderReceipt, isFlowMessageOrderRequest, parseFlowMessageOrder, supportsFlowMessageOrders } from '@/lib/flow-message-orders';

const baseStore = (type: string, products: any[] = []) => ({
  id: '212f2223-24ce-4979-9a15-b1a75ee155e8',
  storeType: type,
  businessType: type,
  category: type === 'restaurant' ? 'restaurant' : 'retail',
  storeName: 'Test Shop',
  accessCode: 'ABC123',
  products,
  customers: [{ id: 'c1', name: 'John Doe', phone: '08031234567', totalSpent: 0, totalPurchases: 0, lastPurchaseDate: '', createdDate: '' }],
  sales: [], expenses: [], pendingPayments: [],
} as any);

const product = (id: string, name: string, price: number, extra: any = {}) => ({
  id, name, costPrice: price / 2, sellingPrice: price, quantity: 100, category: 'General', ...extra,
});

describe('Flow message orders', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('only enables message-order creation for business templates with Orders', () => {
    expect(supportsFlowMessageOrders(baseStore('restaurant'))).toBe(true);
    expect(supportsFlowMessageOrders(baseStore('laundry'))).toBe(true);
    expect(supportsFlowMessageOrders(baseStore('barber'))).toBe(true);
    expect(supportsFlowMessageOrders(baseStore('provision'))).toBe(false);
  });

  it('recognizes a spoken customer order without stealing ordinary order queries', () => {
    const store = baseStore('restaurant', [product('p1', 'Jollof Rice', 2500)]);
    expect(isFlowMessageOrderRequest(store, 'Create an order for John Doe, 2 Jollof Rice')).toBe(true);
    expect(isFlowMessageOrderRequest(store, 'Show me pending orders')).toBe(false);
  });

  it('matches several spoken catalog items, quantities and a saved customer', () => {
    const store = baseStore('restaurant', [
      product('p1', 'Jollof Rice', 2500),
      product('p2', 'Chicken', 1800),
      product('p3', 'Coke', 700),
    ]);
    const draft = parseFlowMessageOrder(store, 'John Doe wants 2 Jollof Rice, 3 Chicken and one Coke');
    expect(draft.customerName).toBe('John Doe');
    expect(draft.customerPhone).toBe('08031234567');
    expect(draft.items.map(item => [item.label, item.quantity])).toEqual([
      ['Jollof Rice', 2], ['Chicken', 3], ['Coke', 1],
    ]);
    expect(draft.total).toBe(2 * 2500 + 3 * 1800 + 700);
  });

  it('uses laundry garment pricing when a service and clothes are spoken', () => {
    const wash = product('wash-iron', 'Wash & Iron', 0, { isService: true, servicePricing: 'per_piece', unit: 'pcs' });
    const store = {
      ...baseStore('laundry', [wash]),
      laundryPricing: {
        version: 1,
        garmentTypes: ['Shirts', 'Trousers'],
        matrix: { 'wash-iron': { Shirts: 500, Trousers: 700 } },
      },
    } as any;
    const draft = parseFlowMessageOrder(store, 'Create order for John Doe: Wash and Iron 2 Shirts and 3 Trousers');
    expect(draft.items.map(item => [item.label, item.quantity, item.unitPrice])).toEqual([
      ['Shirts — Wash & Iron', 2, 500],
      ['Trousers — Wash & Iron', 3, 700],
    ]);
    expect(draft.total).toBe(3100);
  });

  it('builds an itemized receipt and WhatsApp-ready customer message', () => {
    const store = baseStore('restaurant', [product('p1', 'Jollof Rice', 2500)]);
    const order = {
      order_number: 'FL-AB12CD', customer_name: 'John Doe', total: 5000,
      order_items: [{ product_id: 'p1', item_name: 'Jollof Rice', quantity: 2, price: 2500, subtotal: 5000 }],
    } as any;
    const receipt = formatFlowOrderReceipt(store, order);
    const message = buildFlowOrderWhatsAppMessage(store, order);
    expect(receipt).toContain('FL-AB12CD');
    expect(receipt).toContain('2 × Jollof Rice');
    expect(message).toContain('Receipt: FL-AB12CD');
    expect(message).toContain('Please reply here if anything needs to be changed');
  });
});
