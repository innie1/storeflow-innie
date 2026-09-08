import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { createLocalLaundryRecord } from '@/lib/laundry-offline';
import { pricingAdvice, simulatePrice, MIN_SALES_TO_ADVISE } from '@/lib/pricing-advisor';

const CODE = 'ADVISE';
const today = () => new Date().toISOString();

const laundry = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-A', storeName: 'Shine', accessCode: CODE,
  storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], createdAt: new Date(0).toISOString(),
  ...over,
} as unknown as StoreData);

const service = (id: string, name: string, price: number) => ({
  id, name, sellingPrice: price, costPrice: 0, quantity: 0, isService: true,
});

const consumables = (amount: number) => ({ id: 'e1', amount, category: 'Consumables', date: today() });

/** `pieces` pieces of `serviceId`, charged `total`. */
const job = (serviceId: string, pieces: number, total: number) => createLocalLaundryRecord({
  accessCode: CODE,
  customerName: 'A', customerPhone: '08010000000',
  serviceId, serviceName: 'S',
  pricing: 'per_piece', billingQuantity: 1, total,
  garments: [{ garmentType: 'Shirt', quantity: pieces, unitPrice: total / pieces, subtotal: total }],
});

describe('it says when it does not know', () => {
  beforeEach(() => localStorage.clear());

  /**
   * A confident recommendation built on three sales is how somebody talks
   * themselves into a price change that costs them customers.
   */
  it('reports that it is still learning below enough trade', () => {
    job('svc', 3, 1_500);
    const state = pricingAdvice(laundry({ products: [service('svc', 'Wash & Iron', 500)] as any }));

    expect(state.learning).toBe(true);
    expect(state.seen).toBe(3);
    expect(state.needed).toBe(MIN_SALES_TO_ADVISE);
    expect(state.advice[0].kind).toBe('learning');
    expect(state.advice[0].suggested).toBeNull();
  });

  it('says how much more it needs, rather than just refusing', () => {
    job('svc', 4, 2_000);
    const state = pricingAdvice(laundry({ products: [service('svc', 'Wash & Iron', 500)] as any }));
    expect(state.advice[0].why).toContain(`${MIN_SALES_TO_ADVISE - 4} more sales`);
  });

  it('will not judge a price with no cost behind it', () => {
    for (let i = 0; i < 4; i += 1) job('svc', 5, 2_500);
    // No consumables recorded, so nothing is known about what a piece costs.
    const state = pricingAdvice(laundry({ products: [service('svc', 'Wash & Iron', 500)] as any }));
    expect(state.advice[0].kind).toBe('learning');
    expect(state.advice[0].why).toContain('No cost recorded');
  });
});

describe('what it says once it knows', () => {
  beforeEach(() => localStorage.clear());

  const traded = (price: number) => {
    for (let i = 0; i < 4; i += 1) job('svc', 5, price * 5);
    return laundry({ products: [service('svc', 'Wash & Iron', price)] as any, expenses: [consumables(8_000)] as any });
  };

  /** 20 pieces, ₦8,000 of consumables → ₦400 a piece. */
  it('calls out a service sold below what it costs', () => {
    const item = pricingAdvice(traded(300)).advice[0];
    expect(item.kind).toBe('losing');
    expect(item.why).toContain('lose money on every one');
    expect(item.suggested).toBeGreaterThan(300);
  });

  it('flags a thin margin without calling it a loss', () => {
    const item = pricingAdvice(traded(450)).advice[0];
    expect(item.kind).toBe('thin');
    expect(item.suggested).toBeGreaterThan(450);
  });

  it('leaves a healthy price alone', () => {
    const item = pricingAdvice(traded(1_000)).advice[0];
    expect(item.kind).toBe('healthy');
    expect(item.suggested).toBeNull();
  });

  it('shows what the change would be worth at this month’s volume', () => {
    const item = pricingAdvice(traded(300)).advice[0];
    expect(item.monthlyImpact).toBe((item.suggested! - 300) * item.volume);
  });

  it('puts money being lost above everything else', () => {
    for (let i = 0; i < 4; i += 1) { job('cheap', 5, 1_500); job('fine', 5, 10_000); }
    const state = pricingAdvice(laundry({
      products: [service('fine', 'Dry Cleaning', 2_000), service('cheap', 'Wash Only', 300)] as any,
      expenses: [consumables(16_000)] as any,
    }));
    expect(state.advice[0].name).toBe('Wash Only');
  });
});

describe('what it refuses to claim', () => {
  beforeEach(() => localStorage.clear());

  /**
   * Whether a lower price would sell more cannot be known from a shop's own
   * history: it only ever contains the prices actually charged. So a quiet
   * service is a question for the owner, not a recommendation to cut.
   */
  it('never proposes a price cut for something nobody is buying', () => {
    for (let i = 0; i < 4; i += 1) job('busy', 5, 10_000);
    const state = pricingAdvice(laundry({
      products: [service('busy', 'Wash & Iron', 2_000), service('idle', 'Dry Cleaning', 5_000)] as any,
      expenses: [consumables(4_000)] as any,
    }));

    const quiet = state.advice.find(a => a.name === 'Dry Cleaning')!;
    expect(quiet.kind).toBe('quiet');
    expect(quiet.suggested).toBeNull();
    expect(quiet.why).not.toMatch(/lower|reduce|cut/i);
  });

  it('never changes a price itself', () => {
    const store = laundry({ products: [service('svc', 'Wash & Iron', 300)] as any, expenses: [consumables(8_000)] as any });
    for (let i = 0; i < 4; i += 1) job('svc', 5, 1_500);
    pricingAdvice(store);
    expect(store.products![0].sellingPrice).toBe(300);
  });
});

describe('simulating without touching anything', () => {
  beforeEach(() => localStorage.clear());

  it('works out the margin and what it would be worth', () => {
    const item = { productId: 'p', name: 'X', kind: 'thin' as const, price: 500, unitCost: 400, margin: 100, volume: 20, why: '', suggested: null, monthlyImpact: null };
    const result = simulatePrice(item, 600);
    expect(result.margin).toBe(200);
    expect(result.marginShare).toBeCloseTo(0.333, 2);
    expect(result.monthlyChange).toBe(2_000);
  });

  it('says nothing about a month with no volume to base it on', () => {
    const item = { productId: 'p', name: 'X', kind: 'quiet' as const, price: 500, unitCost: 400, margin: 100, volume: 0, why: '', suggested: null, monthlyImpact: null };
    expect(simulatePrice(item, 600).monthlyChange).toBeNull();
  });
});

describe('advice it will not then criticise', () => {
  beforeEach(() => localStorage.clear());

  /**
   * Found by accepting one. Rounding to nearest landed the suggested price a
   * hair under the very threshold it was calculated to clear, so the advisor
   * proposed 204, the owner accepted it, and it immediately called that same
   * price thin - a complaint about its own advice, with no remedy offered.
   */
  it('accepting the suggestion clears the warning', () => {
    for (let i = 0; i < 4; i += 1) job('svc', 5, 600);
    const base = laundry({ products: [service('svc', 'Wash & Iron', 120)] as any, expenses: [consumables(8_000)] as any });

    const first = pricingAdvice(base).advice[0];
    expect(first.kind).toBe('losing');
    expect(first.suggested).not.toBeNull();

    // The shop takes the advice.
    const after = laundry({
      products: [service('svc', 'Wash & Iron', first.suggested!)] as any,
      expenses: [consumables(8_000)] as any,
    });
    expect(pricingAdvice(after).advice[0].kind).toBe('healthy');
  });
});
