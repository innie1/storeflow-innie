import { describe, expect, it } from 'vitest';
import { understand } from '@/lib/flow-operating-engine';
import { answerTradeQuestion } from '@/lib/flow-trade-brain';
import { serviceOverview } from '@/lib/flow-service-brain';
import { BUSINESS_TEMPLATES } from '@/lib/business-templates';
import type { StoreData } from '@/types/store';

const product = (id: string, name: string, extra = {}) => ({
  id, name, category: 'General', costPrice: 10, sellingPrice: 15, quantity: 20, ...extra,
});

function store(type: string, extra: Partial<StoreData> = {}): StoreData {
  return {
    id: 'store-1', storeId: 'SF-1', accessCode: 'SHOP1', storeName: 'Test business',
    storeType: type as StoreData['storeType'], createdAt: new Date().toISOString(),
    products: [], sales: [], expenses: [], ...extra,
  } as StoreData;
}

describe('trade-specific Flow answers', () => {
  it('uses every registered trade template for help and workflow answers', () => {
    for (const template of Object.values(BUSINESS_TEMPLATES)) {
      const business = store(template.type);
      expect(answerTradeQuestion(business, 'help')?.reply).toContain(template.name);
      const workflow = answerTradeQuestion(business, 'show my workflow')?.reply || '';
      for (const stage of template.workflow) expect(workflow).toContain(stage.replace(/_/g, ' '));
    }
  });

  it('uses the configured tailoring workflow', () => {
    const answer = answerTradeQuestion(store('tailoring'), 'show my workflow');
    expect(answer?.reply).toContain('Tailoring / Fashion Design');
    expect(answer?.reply).toContain('2. measuring');
    expect(answer?.reply).toContain('6. ready');
  });

  it('counts overdue appointments from loaded records and discloses missing dates', () => {
    const answer = answerTradeQuestion(store('barber', {
      orders: [
        { id: 'old', customerName: 'Ada', status: 'booked', scheduledFor: '2020-01-01' },
        { id: 'unknown', customerName: 'Tola', status: 'booked' },
        { id: 'done', customerName: 'Ngozi', status: 'completed', scheduledFor: '2020-01-01' },
      ],
    } as Partial<StoreData>), 'which appointments are overdue?');
    expect(answer?.reply).toContain('**1 appointment overdue**');
    expect(answer?.reply).toContain('Ada');
    expect(answer?.reply).toContain('1 active record has no valid due date');
    expect(answer?.reply).not.toContain('Ngozi');
  });

  it('does not pretend an unloaded work book is empty', () => {
    const answer = answerTradeQuestion(store('repair'), 'how many repair jobs are pending?');
    expect(answer?.reply).toContain('do not have the repair job records loaded yet');
  });

  it('lists the business own services instead of generic examples', () => {
    const answer = answerTradeQuestion(store('spa', {
      products: [product('massage', 'Deep Tissue Massage', { isService: true })],
      businessTemplate: { offerings: [{ id: 'facial', name: 'Glow Facial' }] },
    }), 'what treatments do I offer?');
    expect(answer?.reply).toContain('Deep Tissue Massage');
    expect(answer?.reply).toContain('Glow Facial');
  });

  it('lists products for product trades', () => {
    const answer = answerTradeQuestion(store('electronics', {
      products: [product('charger', 'USB-C Charger')],
    }), 'which products are available?');
    expect(answer?.reply).toContain('USB-C Charger');
  });

  it('builds a service overview from that trade records', () => {
    const answer = serviceOverview(store('barber', {
      orders: [{ id: 'booking-1', status: 'booked', scheduledFor: '2099-01-01' }],
    } as Partial<StoreData>));
    expect(answer).toContain('1 active appointment');
    expect(answer).not.toContain('laundry');
  });

  it('is honest that recorded game sessions lack live status', () => {
    const answer = answerTradeQuestion(store('games', { gameSessions: [{ id: '1' }] as StoreData['gameSessions'] }), 'which sessions are active?');
    expect(answer?.reply).toContain('1 recorded session');
    expect(answer?.reply).toContain('cannot tell which sessions are still active');
  });
});

describe('safe catalog actions', () => {
  const shop = store('provision', {
    products: [product('rice', 'Golden Rice'), product('beans', 'Brown Beans')],
  });

  it('parses a complete multi-item command', () => {
    const plan = understand(shop, 'sell 2 Golden Rice and 3 Brown Beans');
    expect(plan.clarification).toBeUndefined();
    expect(plan.items.map(item => [item.product.product.id, item.quantity])).toEqual([['rice', 2], ['beans', 3]]);
  });

  it('preserves quantities for alternate action wording', () => {
    expect(understand(shop, 'record a sale 2 Golden Rice').items[0]?.quantity).toBe(2);
    expect(understand(shop, 'increase 4 Brown Beans').items[0]?.quantity).toBe(4);
  });

  it('changes nothing when one line cannot be matched safely', () => {
    const plan = understand(shop, 'sell 2 Golden Rice and 3 Mystery Flour');
    expect(plan.items).toEqual([]);
    expect(plan.clarification).toContain('Mystery Flour');
  });

  it('asks about ambiguous names', () => {
    const plan = understand(store('provision', {
      products: [product('coca', 'Coca Cola'), product('pepsi', 'Pepsi Cola')],
    }), 'sell 1 Cola');
    expect(plan.items).toEqual([]);
    expect(plan.clarification).toContain('more than one catalog match');
  });

  it('rejects invalid quantities and discontinued products', () => {
    expect(understand(shop, 'sell -2 Golden Rice').clarification).toContain('quantity must be positive');
    const discontinued = store('provision', { products: [product('old', 'Old Soap', { discontinued: true })] });
    expect(understand(discontinued, 'sell 1 Old Soap').clarification).toContain('Old Soap');
  });
});
