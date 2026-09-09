import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  createFlowConversationOrder,
  draftFromCustomerName,
  mergeFlowConversationOrderDraft,
  nextFlowDraftQuestion,
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

function laundryStore() {
  const wash = product('wash', 'Wash & Iron', 0, {
    isService: true,
    servicePricing: 'per_piece',
    unit: 'pcs',
  });
  return {
    id: 'local-kanta',
    storeName: 'Kanta Laundry',
    accessCode: 'KANTA1',
    storeType: 'laundry',
    businessType: 'laundry',
    category: 'retail',
    products: [wash],
    customers: [],
    pendingPayments: [],
    sales: [],
    expenses: [],
    laundryPricing: {
      version: 1,
      garmentTypes: [
        'Jeans',
        'Single Bedsheet',
        'Double Bedsheet',
        'King Bedsheet',
        'Small Duvet',
        'Large Duvet',
      ],
      matrix: {
        wash: {
          Jeans: 600,
          'Single Bedsheet': 800,
          'Double Bedsheet': 1000,
          'King Bedsheet': 1200,
          'Small Duvet': 1500,
          'Large Duvet': 2000,
        },
      },
    },
  } as any;
}

describe('Flow unresolved laundry garments', () => {
  it('keeps ambiguous duvet and bedsheet choices unresolved and blocks creation', async () => {
    const store = laundryStore();
    let draft = draftFromCustomerName(store, 'john');
    draft = mergeFlowConversationOrderDraft(store, draft, '09028733212').draft;

    const ambiguous = mergeFlowConversationOrderDraft(store, draft, 'jean duvet bedsheet');
    draft = ambiguous.draft;

    expect(draft.items.map(item => item.metadata?.garment_type)).toEqual(['Jeans']);
    expect(ambiguous.note).toContain('Small Duvet');
    expect(ambiguous.note).toContain('Double Bedsheet');

    const question = nextFlowDraftQuestion(draft);
    expect(question).toContain('Small Duvet');
    expect(question).toContain('Large Duvet');
    expect(question).toContain('Single Bedsheet');
    expect(question).toContain('King Bedsheet');

    await expect(createFlowConversationOrder(store, draft)).rejects.toThrow('resolve the clothing');
  });

  it('accepts short clarification answers and clears only the family resolved', () => {
    const store = laundryStore();
    let draft = draftFromCustomerName(store, 'john');
    draft = mergeFlowConversationOrderDraft(store, draft, '09028733212').draft;
    draft = mergeFlowConversationOrderDraft(store, draft, 'jean duvet bedsheet').draft;

    draft = mergeFlowConversationOrderDraft(store, draft, 'small').draft;
    expect(draft.items.map(item => item.metadata?.garment_type)).toEqual(['Jeans', 'Small Duvet']);
    expect(nextFlowDraftQuestion(draft)).not.toContain('Large Duvet');
    expect(nextFlowDraftQuestion(draft)).toContain('Double Bedsheet');

    draft = mergeFlowConversationOrderDraft(store, draft, 'double').draft;
    expect(draft.items.map(item => item.metadata?.garment_type)).toEqual(['Jeans', 'Small Duvet', 'Double Bedsheet']);
    expect(nextFlowDraftQuestion(draft)).toBeNull();
  });

  it('lets the merchant explicitly remove an unresolved family', () => {
    const store = laundryStore();
    let draft = draftFromCustomerName(store, 'john');
    draft = mergeFlowConversationOrderDraft(store, draft, '09028733212').draft;
    draft = mergeFlowConversationOrderDraft(store, draft, 'jean duvet bedsheet').draft;

    const removed = mergeFlowConversationOrderDraft(store, draft, 'remove duvet');
    draft = removed.draft;

    expect(removed.note).toContain('Removed unresolved duvet');
    expect(nextFlowDraftQuestion(draft)).not.toContain('Duvet');
    expect(nextFlowDraftQuestion(draft)).toContain('Bedsheet');
  });
});
