import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: null, error: { message: 'cloud unavailable' } })),
  },
}));

import {
  createFlowConversationOrder,
  draftFromCustomerName,
  mergeFlowConversationOrderDraft,
} from '@/lib/flow-order-draft';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';

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

const localLaundry = () => ({
  id: 'local-kanta',
  storeId: 'local-kanta',
  accessCode: 'KANTA1',
  storeName: 'Kanta',
  storeType: 'laundry',
  businessType: 'laundry',
  category: 'retail',
  profile: { storeType: 'laundry', location: '', phone: '', email: '' },
  products: [service],
  customers: [],
  pendingPayments: [],
  sales: [],
  expenses: [],
  laundryPricing: {
    version: 1,
    garmentTypes: ['Jeans', 'Shirt', 'Shorts'],
    matrix: {
      wash: { Jeans: 600, Shirt: 500, Shorts: 400 },
    },
  },
} as any);

beforeEach(() => localStorage.clear());

describe('Flow laundry local-first creation', () => {
  it('creates a real local laundry record even when the store has no cloud UUID', async () => {
    const store = localLaundry();
    let draft = draftFromCustomerName(store, 'john');
    draft = mergeFlowConversationOrderDraft(store, draft, '09023675726').draft;
    draft = mergeFlowConversationOrderDraft(store, draft, 'jean shirt short').draft;

    expect(draft.total).toBe(1500);

    const order = await createFlowConversationOrder(store, draft);
    const records = getLocalLaundryRecords(store.accessCode);

    expect(records).toHaveLength(1);
    expect(records[0].customerName).toBe('john');
    expect(records[0].customerPhone).toBe('09023675726');
    expect(records[0].serviceName).toBe('Wash & Iron');
    expect(records[0].pieceCount).toBe(3);
    expect(records[0].total).toBe(1500);
    expect(records[0].garments.map(item => item.garmentType)).toEqual(['Jeans', 'Shirt', 'Shorts']);
    expect(records[0].syncStatus).toBe('pending');

    expect(order.id).toBe(`local:${records[0].clientRef}`);
    expect(order.order_number).toBe(records[0].tagCode);
    expect(order.total).toBe(1500);
    expect(order.business_type).toBe('laundry');
    expect(order.flow_details).toMatchObject({ source: 'flow_message', local_first: true });
  });
});
