import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  applyFlowConversationOrderLocalEffects,
  buildFlowConversationWhatsAppMessage,
  draftFromCustomerName,
  flowConversationDraftExamples,
  flowDraftBalance,
  formatFlowConversationDraft,
  mergeFlowConversationOrderDraft,
  nextFlowDraftQuestion,
  parseFlowConversationOrder,
} from '@/lib/flow-order-draft';

const product = (id: string, name: string, price: number, extra: any = {}) => ({
  id,
  name,
  costPrice: price / 2,
  sellingPrice: price,
  quantity: 100,
  category: 'General',
  ...extra,
});

const restaurantStore = () => ({
  id: '212f2223-24ce-4979-9a15-b1a75ee155e8',
  storeType: 'restaurant',
  businessType: 'restaurant',
  category: 'restaurant',
  storeName: 'Test Kitchen',
  accessCode: 'ABC123',
  profile: { storeType: 'restaurant', location: '1 Market Road', phone: '08011112222', email: '' },
  products: [
    product('rice', 'Jollof Rice', 2500),
    product('chicken', 'Chicken', 1800),
    product('coke', 'Coke', 700),
  ],
  customers: [
    { id: 'john', name: 'John Doe', phone: '08031234567', address: '12 Airport Road', totalPurchases: 0, outstandingDebt: 0, purchaseHistory: [], loyaltyPoints: 0, visitsCount: 0 },
    { id: 'mary', name: 'Mary James', phone: '08025556666', totalPurchases: 0, outstandingDebt: 0, purchaseHistory: [], loyaltyPoints: 0, visitsCount: 0 },
  ],
  pendingPayments: [],
  sales: [],
  expenses: [],
} as any);

const laundryStore = (garmentTypes: string[] = ['Trousers', 'Jeans', 'Bedsheet', 'Duvet']) => {
  const wash = product('wash', 'Wash & Iron', 0, { isService: true, servicePricing: 'per_piece', unit: 'pcs' });
  const matrix = Object.fromEntries(garmentTypes.map((garment, index) => [garment, 500 + index * 100]));
  return {
    ...restaurantStore(),
    storeName: 'Kanta Laundry',
    storeType: 'laundry',
    businessType: 'laundry',
    category: 'retail',
    products: [wash],
    customers: [],
    laundryPricing: {
      version: 1,
      garmentTypes,
      matrix: { wash: matrix },
    },
  } as any;
};

describe('Flow conversational order drafts', () => {
  it('keeps the picked items while asking only for a missing phone number', () => {
    const store = restaurantStore();
    const draft = parseFlowConversationOrder(store, 'Create an order for Ada, 2 Jollof Rice');

    expect(draft.customerName).toBe('Ada');
    expect(draft.items).toHaveLength(1);
    expect(draft.items[0].quantity).toBe(2);
    expect(nextFlowDraftQuestion(draft)).toContain('phone number');

    const updated = mergeFlowConversationOrderDraft(store, draft, '08033334444').draft;
    expect(updated.customerPhone).toBe('08033334444');
    expect(updated.items[0].quantity).toBe(2);
    expect(nextFlowDraftQuestion(updated)).toBeNull();
  });

  it('consumes a phone-only laundry answer as phone data and never invents a garment', () => {
    const store = laundryStore();
    const draft = draftFromCustomerName(store, 'john');
    expect(draft.items).toHaveLength(0);
    expect(nextFlowDraftQuestion(draft)).toContain('phone number');

    const result = mergeFlowConversationOrderDraft(store, draft, '09034246467');
    expect(result.draft.customerPhone).toBe('09034246467');
    expect(result.draft.items).toHaveLength(0);
    expect(result.note).toBe('Phone updated.');
    expect(nextFlowDraftQuestion(result.draft)).toBe('What items or services does the customer want?');
  });

  it('handles the exact jean bedsheet duvet follow-up without carrying a stale trouser', () => {
    const store = laundryStore();
    let draft = draftFromCustomerName(store, 'john');
    draft = mergeFlowConversationOrderDraft(store, draft, '09034246467').draft;
    draft = mergeFlowConversationOrderDraft(store, draft, 'jean bedsheet duvet').draft;

    const garments = draft.items.map(item => item.metadata?.garment_type);
    expect(garments).toEqual(['Jeans', 'Bedsheet', 'Duvet']);
    expect(garments).not.toContain('Trousers');
  });

  it('asks for the priced size when bedsheet or duvet names are ambiguous', () => {
    const store = laundryStore(['Trousers', 'Jeans', 'Single Bedsheet', 'Double Bedsheet', 'King Bedsheet', 'Small Duvet', 'Large Duvet']);
    let draft = draftFromCustomerName(store, 'john');
    draft = mergeFlowConversationOrderDraft(store, draft, '09034246467').draft;
    const result = mergeFlowConversationOrderDraft(store, draft, 'jean bedsheet duvet');

    expect(result.draft.items.map(item => item.metadata?.garment_type)).toEqual(['Jeans']);
    expect(result.note).toContain('Single Bedsheet');
    expect(result.note).toContain('Double Bedsheet');
    expect(result.note).toContain('Small Duvet');
    expect(result.note).toContain('Large Duvet');
  });

  it('uses the laundry catalogue for draft examples instead of restaurant products', () => {
    const store = laundryStore(['Shirt', 'Jeans', 'Bedsheet']);
    let draft = draftFromCustomerName(store, 'john');
    draft = mergeFlowConversationOrderDraft(store, draft, '09034246467').draft;
    draft = mergeFlowConversationOrderDraft(store, draft, 'shirt').draft;

    const examples = flowConversationDraftExamples(store, draft);
    expect(examples).toContain('Shirt');
    expect(examples).toContain('Jeans');
    expect(examples).not.toContain('Jollof Rice');
    expect(examples).not.toContain('Coke');
    expect(examples).not.toContain('Chicken');
  });

  it("finds a saved customer from a natural 'John's order' reference", () => {
    const draft = parseFlowConversationOrder(restaurantStore(), "John's order: 2 Jollof Rice and one Coke");
    expect(draft.customerMatched).toBe(true);
    expect(draft.customerId).toBe('john');
    expect(draft.customerName).toBe('John Doe');
    expect(draft.customerPhone).toBe('08031234567');
    expect(formatFlowConversationDraft(draft)).toContain('Saved customer ✓ John Doe');
  });

  it('lets the merchant change quantities, remove items and add another item before saving', () => {
    const store = restaurantStore();
    let draft = parseFlowConversationOrder(store, 'John Doe wants 2 Jollof Rice and one Coke');

    draft = mergeFlowConversationOrderDraft(store, draft, 'make Jollof Rice to 3').draft;
    expect(draft.items.find(item => item.productId === 'rice')?.quantity).toBe(3);

    draft = mergeFlowConversationOrderDraft(store, draft, 'remove Coke').draft;
    expect(draft.items.some(item => item.productId === 'coke')).toBe(false);

    draft = mergeFlowConversationOrderDraft(store, draft, 'add 2 Chicken').draft;
    expect(draft.items.find(item => item.productId === 'chicken')?.quantity).toBe(2);
    expect(draft.total).toBe(3 * 2500 + 2 * 1800);
  });

  it('can switch the treatment on an existing laundry draft and reprice every garment', () => {
    const wash = product('wash', 'Wash & Iron', 0, { isService: true, servicePricing: 'per_piece', unit: 'pcs' });
    const dry = product('dry', 'Dry Cleaning', 0, { isService: true, servicePricing: 'per_piece', unit: 'pcs' });
    const store = {
      ...restaurantStore(),
      storeType: 'laundry',
      businessType: 'laundry',
      category: 'retail',
      products: [wash, dry],
      laundryPricing: {
        version: 1,
        garmentTypes: ['Shirts', 'Trousers'],
        matrix: {
          wash: { Shirts: 500, Trousers: 700 },
          dry: { Shirts: 900, Trousers: 1200 },
        },
      },
    } as any;

    let draft = parseFlowConversationOrder(store, 'John Doe wants Wash and Iron 2 Shirts and one Trouser');
    expect(draft.items[0].unitPrice).toBe(500);

    draft = mergeFlowConversationOrderDraft(store, draft, 'change service to Dry Cleaning').draft;
    expect(draft.items.every(item => item.productId === 'dry')).toBe(true);
    expect(draft.items.find(item => String(item.metadata?.garment_type).startsWith('Shirt'))?.unitPrice).toBe(900);
  });

  it('understands natural laundry follow-ups with aliases and several garments in one message', () => {
    const wash = product('wash', 'Wash & Iron', 0, { isService: true, servicePricing: 'per_piece', unit: 'pcs' });
    const store = {
      ...restaurantStore(),
      storeType: 'laundry',
      businessType: 'laundry',
      category: 'retail',
      products: [wash],
      laundryPricing: {
        version: 1,
        garmentTypes: ['Shirts', 'Jeans', 'Shorts', 'Top', 'Bedsheet'],
        matrix: {
          wash: { Shirts: 500, Jeans: 700, Shorts: 400, Top: 450, Bedsheet: 1000 },
        },
      },
    } as any;

    let draft = parseFlowConversationOrder(store, 'John Doe wants Wash and Iron shirt');
    expect(draft.items.map(item => item.metadata?.garment_type)).toEqual(['Shirts']);

    draft = mergeFlowConversationOrderDraft(store, draft, 'short').draft;
    expect(draft.items.some(item => item.metadata?.garment_type === 'Shorts')).toBe(true);

    draft = mergeFlowConversationOrderDraft(store, draft, 'jean, top, bedsheet').draft;
    expect(draft.items.some(item => item.metadata?.garment_type === 'Jeans')).toBe(true);
    expect(draft.items.some(item => item.metadata?.garment_type === 'Top')).toBe(true);
    expect(draft.items.some(item => item.metadata?.garment_type === 'Bedsheet')).toBe(true);
  });

  it('understands deposit, balance, payment method, delivery address and requested time', () => {
    const store = restaurantStore();
    let draft = parseFlowConversationOrder(store, 'John Doe wants 3 Jollof Rice');
    draft = mergeFlowConversationOrderDraft(
      store,
      draft,
      'He paid ₦5,000 cash, balance later. Delivery to 12 Airport Road by tomorrow at 5pm',
    ).draft;

    expect(draft.payment.paidAmount).toBe(5000);
    expect(draft.payment.method).toBe('cash');
    expect(draft.payment.balanceLater).toBe(true);
    expect(flowDraftBalance(draft)).toBe(2500);
    expect(draft.fulfillment.mode).toBe('delivery');
    expect(draft.fulfillment.address).toBe('12 Airport Road');
    expect(draft.fulfillment.requestedTime?.toLowerCase()).toContain('tomorrow');
  });

  it('adds a pending balance locally and prepares a WhatsApp receipt with payment and delivery details', () => {
    const store = restaurantStore();
    let draft = parseFlowConversationOrder(store, 'Mary James wants 3 Jollof Rice');
    draft = mergeFlowConversationOrderDraft(store, draft, 'paid ₦5000 transfer, balance later, pickup tomorrow at 4pm').draft;

    const order = {
      id: 'order-1',
      order_number: 'FL-TEST12',
      customer_name: 'Mary James',
      customer_phone: '08025556666',
      total: 7500,
      subtotal: 7500,
      status: 'Pending',
      created_at: new Date().toISOString(),
      order_items: [{ product_id: 'rice', item_name: 'Jollof Rice', quantity: 3, price: 2500, subtotal: 7500 }],
    } as any;

    const next = applyFlowConversationOrderLocalEffects(store, order, draft);
    expect(next.pendingPayments).toHaveLength(1);
    expect(next.pendingPayments?.[0].paid).toBe(5000);
    expect(next.pendingPayments?.[0].balance).toBe(2500);

    const message = buildFlowConversationWhatsAppMessage(store, order, draft);
    expect(message).toContain('Receipt: FL-TEST12');
    expect(message).toContain('Paid: ₦5,000');
    expect(message).toContain('Balance: ₦2,500');
    expect(message).toContain('Fulfilment: Pickup');
    expect(message).toContain('Store phone: 08011112222');
  });
});
