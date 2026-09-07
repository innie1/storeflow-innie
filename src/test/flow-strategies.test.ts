import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  activeStrategies,
  clearStrategyCooldowns,
  snoozeStrategy,
  topStrategy,
} from '@/lib/flow-strategies';

/**
 * Flow's strategy engine.
 *
 * The app could already say what had happened. It could not say what to do
 * about it: the nearest thing was a line on the Customers page reading "0
 * inactive clients", with no way to act on it even when the number was not
 * zero.
 *
 * Half of these tests are about staying quiet. Advice that arrives every day
 * stops being advice, and the merchant has been clear that none of this may
 * become troublesome.
 */

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

function store(overrides: Record<string, unknown> = {}) {
  return {
    storeName: 'Shine Laundry',
    customers: [],
    sales: [],
    products: [],
    ...overrides,
  } as any;
}

const regular = (name: string, days: number, phone = '08031234567') => ({
  id: name, name, phone,
  visitsCount: 9, totalPurchases: 45_000,
  lastPurchaseDate: daysAgo(days),
});

beforeEach(() => clearStrategyCooldowns());
afterEach(() => clearStrategyCooldowns());

describe('winning back a regular who has gone quiet', () => {
  it('raises the customer by name and by how long it has been', () => {
    const strategy = topStrategy(store({ customers: [regular('Chidi', 40)] }));
    expect(strategy?.id).toBe('win-back-regular');
    expect(strategy?.title).toContain('Chidi');
    expect(strategy?.title).toContain('40 days');
  });

  it('offers a call, a message and an actual discount', () => {
    const strategy = topStrategy(store({ customers: [regular('Chidi', 40)] }));
    const labels = strategy?.actions.map(action => action.label);
    expect(labels).toEqual(['Call', 'WhatsApp', 'Offer 10% off']);
  });

  it('dials and messages the real number', () => {
    const strategy = topStrategy(store({ customers: [regular('Chidi', 40)] }));
    expect(strategy?.actions[0].href).toBe('tel:08031234567');
    // 0803... is a Nigerian local number; wa.me needs it in international form.
    expect(strategy?.actions[1].href).toContain('wa.me/2348031234567');
  });

  it('puts the discount in the message rather than just suggesting one', () => {
    const strategy = topStrategy(store({ customers: [regular('Chidi', 40)] }));
    expect(decodeURIComponent(strategy?.actions[2].href || '')).toContain('10% off');
  });

  it('says nothing about someone who was in last week', () => {
    const strategies = activeStrategies(store({ customers: [regular('Chidi', 5)] }));
    expect(strategies.find(s => s.id === 'win-back-regular')).toBeUndefined();
  });

  it('skips a customer with no phone number, because there is nothing to do', () => {
    const strategies = activeStrategies(store({ customers: [regular('Chidi', 40, '')] }));
    expect(strategies.find(s => s.id === 'win-back-regular')).toBeUndefined();
  });

  it('picks the most valuable of several who have gone quiet', () => {
    const strategy = topStrategy(store({
      customers: [
        { ...regular('Small Spender', 40), totalPurchases: 12_000 },
        { ...regular('Big Spender', 40), totalPurchases: 90_000 },
      ],
    }));
    expect(strategy?.title).toContain('Big Spender');
  });
});

describe('the phone-number habit', () => {
  const noPhone = (name: string) => ({ id: name, name, phone: '', totalPurchases: 3000, lastPurchaseDate: daysAgo(2) });

  it('counts how many are missing, out of how many', () => {
    const strategies = activeStrategies(store({
      customers: [noPhone('A'), noPhone('B'), { id: 'C', name: 'C', phone: '08031234567', lastPurchaseDate: daysAgo(1) }],
    }));
    const phone = strategies.find(s => s.id === 'collect-phone-numbers');
    expect(phone?.body).toContain('2 of your 3 customers');
  });

  it('stays quiet when nearly everyone has one', () => {
    const withPhone = (i: number) => ({ id: String(i), name: `C${i}`, phone: '08031234567', lastPurchaseDate: daysAgo(1) });
    const customers = [withPhone(1), withPhone(2), withPhone(3), withPhone(4), withPhone(5), noPhone('F')];
    const strategies = activeStrategies(store({ customers }));
    expect(strategies.find(s => s.id === 'collect-phone-numbers')).toBeUndefined();
  });

  it('stays quiet on day one, with barely any customers to judge by', () => {
    const strategies = activeStrategies(store({ customers: [noPhone('A'), noPhone('B')] }));
    expect(strategies.find(s => s.id === 'collect-phone-numbers')).toBeUndefined();
  });
});

describe('uncollected work', () => {
  it('outranks everything else, because it is money already earned', () => {
    const strategy = topStrategy(store({
      customers: [regular('Chidi', 40)],
      laundryRecords: [
        { id: '1', status: 'ready', promisedFor: daysAgo(4), customerName: 'Ada', customerPhone: '08031234567' },
      ],
    }));
    expect(strategy?.id).toBe('chase-uncollected');
  });

  it('offers to message the customer whose order it is', () => {
    const strategy = topStrategy(store({
      laundryRecords: [
        { id: '1', status: 'ready', promisedFor: daysAgo(4), customerName: 'Ada', customerPhone: '08031234567' },
      ],
    }));
    expect(strategy?.actions[0].label).toBe('WhatsApp Ada');
  });

  it('ignores work already collected', () => {
    const strategies = activeStrategies(store({
      laundryRecords: [{ id: '1', status: 'collected', promisedFor: daysAgo(9) }],
    }));
    expect(strategies.find(s => s.id === 'chase-uncollected')).toBeUndefined();
  });

  it('gives an order one day late the benefit of the doubt', () => {
    const strategies = activeStrategies(store({
      laundryRecords: [{ id: '1', status: 'ready', promisedFor: daysAgo(1) }],
    }));
    expect(strategies.find(s => s.id === 'chase-uncollected')).toBeUndefined();
  });
});

describe('it knows when to stop talking', () => {
  it('says nothing at all about an empty new shop', () => {
    expect(activeStrategies(store())).toEqual([]);
    expect(topStrategy(store())).toBeNull();
  });

  it('drops a strategy that was acted on until its cooldown passes', () => {
    const data = store({ customers: [regular('Chidi', 40)] });
    expect(topStrategy(data)?.id).toBe('win-back-regular');
    snoozeStrategy('win-back-regular', 10);
    expect(activeStrategies(data).find(s => s.id === 'win-back-regular')).toBeUndefined();
  });

  it('brings it back once the cooldown has expired', () => {
    const data = store({ customers: [regular('Chidi', 40)] });
    snoozeStrategy('win-back-regular', -1); // already elapsed
    expect(topStrategy(data)?.id).toBe('win-back-regular');
  });

  it('raises one thing at a time, in order of urgency', () => {
    const data = store({
      customers: [regular('Chidi', 40)],
      laundryRecords: [{ id: '1', status: 'ready', promisedFor: daysAgo(5) }],
    });
    const all = activeStrategies(data);
    expect(all.length).toBeGreaterThan(1);
    expect(all[0].priority).toBeGreaterThan(all[1].priority);
    // Recomputed each call, so compare by value rather than identity.
    expect(topStrategy(data)).toEqual(all[0]);
  });

  it('survives a store full of malformed records', () => {
    const data = store({
      customers: [null, undefined, {}, { name: 'X' }],
      laundryRecords: [null, {}, { promisedFor: 'not a date' }],
    });
    expect(() => activeStrategies(data)).not.toThrow();
  });
});
