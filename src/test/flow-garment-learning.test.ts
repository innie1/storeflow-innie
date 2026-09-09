import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  learnBrainGarmentAlias,
  loadBrainMemory,
  pendingBrainGarmentCorrection,
  resolveBrainGarmentAlias,
} from '@/lib/flow-brain-memory';
import {
  mergeFlowConversationOrderDraft,
  parseFlowConversationOrder,
} from '@/lib/flow-order-draft';

const service = {
  id: 'wash',
  name: 'Wash & Iron',
  costPrice: 0,
  sellingPrice: 0,
  quantity: 0,
  category: 'Laundry',
  isService: true,
  servicePricing: 'per_piece',
  unit: 'pcs',
} as any;

const store = (id: string, accessCode: string) => ({
  id,
  storeId: id,
  accessCode,
  storeName: `Laundry ${accessCode}`,
  storeType: 'laundry',
  businessType: 'laundry',
  category: 'retail',
  products: [service],
  customers: [{
    id: 'john', name: 'John Doe', phone: '08031234567', totalPurchases: 0,
    outstandingDebt: 0, purchaseHistory: [], loyaltyPoints: 0, visitsCount: 0,
  }],
  sales: [],
  expenses: [],
  pendingPayments: [],
  laundryPricing: {
    version: 1,
    garmentTypes: ['Shirts', 'Jeans', 'Bedsheet'],
    matrix: { wash: { Shirts: 500, Jeans: 700, Bedsheet: 1000 } },
  },
} as any);

beforeEach(() => localStorage.clear());

describe('Flow laundry garment learning', () => {
  it('keeps learned garment aliases isolated to the shop that taught them', () => {
    const a = store('store-a', 'AAAAAA');
    const b = store('store-b', 'BBBBBB');

    learnBrainGarmentAlias(a, 'denm', 'Jeans');

    expect(resolveBrainGarmentAlias(a, 'denm')).toBe('Jeans');
    expect(resolveBrainGarmentAlias(b, 'denm')).toBeNull();
    expect(loadBrainMemory(a).corrections).toBe(1);
    expect(loadBrainMemory(b).corrections).toBe(0);
  });

  it('asks before learning an uncertain garment, then remembers a confirmed correction', () => {
    const laundry = store('store-a', 'AAAAAA');
    let draft = parseFlowConversationOrder(laundry, 'John Doe wants Wash and Iron one Shirt');
    expect(draft.items.some(item => item.metadata?.garment_type === 'Shirts')).toBe(true);

    const uncertain = mergeFlowConversationOrderDraft(laundry, draft, 'bedsht');
    expect(uncertain.changed).toBe(true);
    expect(uncertain.note).toContain('Did you mean **Bedsheet**?');
    expect(pendingBrainGarmentCorrection(laundry)).toMatchObject({ alias: 'bedsht', garment: 'Bedsheet' });

    const confirmed = mergeFlowConversationOrderDraft(laundry, uncertain.draft, 'correct');
    draft = confirmed.draft;
    expect(confirmed.note).toContain('I’ll remember **bedsht** means **Bedsheet**');
    expect(draft.items.some(item => item.metadata?.garment_type === 'Bedsheet')).toBe(true);
    expect(resolveBrainGarmentAlias(laundry, 'bedsht')).toBe('Bedsheet');
    expect(pendingBrainGarmentCorrection(laundry)).toBeNull();

    const nextOrder = parseFlowConversationOrder(laundry, 'John Doe wants Wash and Iron bedsht');
    expect(nextOrder.items.some(item => item.metadata?.garment_type === 'Bedsheet')).toBe(true);
  });

  it('does not learn a rejected correction', () => {
    const laundry = store('store-a', 'AAAAAA');
    const draft = parseFlowConversationOrder(laundry, 'John Doe wants Wash and Iron one Shirt');
    const uncertain = mergeFlowConversationOrderDraft(laundry, draft, 'bedsht');

    const rejected = mergeFlowConversationOrderDraft(laundry, uncertain.draft, 'wrong');
    expect(rejected.note).toContain('I won’t learn **bedsht**');
    expect(resolveBrainGarmentAlias(laundry, 'bedsht')).toBeNull();
    expect(pendingBrainGarmentCorrection(laundry)).toBeNull();
  });

  it('accepts bare laundry follow-ups while an order is already open', () => {
    const laundry = store('store-a', 'AAAAAA');
    let draft = parseFlowConversationOrder(laundry, 'John Doe wants Wash and Iron one Shirt');
    draft = mergeFlowConversationOrderDraft(laundry, draft, 'jean, bedsheet').draft;

    expect(draft.items.some(item => item.metadata?.garment_type === 'Jeans')).toBe(true);
    expect(draft.items.some(item => item.metadata?.garment_type === 'Bedsheet')).toBe(true);
  });
});
