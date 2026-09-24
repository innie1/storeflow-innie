import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

/**
 * Save Sale on a line that drops.
 *
 * The data client retries a failed read three more times, 1, 2 and 4 seconds
 * apart. The sale's "is this shop in the cloud?" check was one of those reads,
 * so on a dropping line the customer stood there for seven seconds or more
 * before the sale was saved on the phone anyway - and on a line that hangs
 * instead of failing, for as long as the browser cared to wait.
 */

const cloud = vi.hoisted(() => ({
  session: null as unknown,
  lookups: 0,
  retryArgs: [] as unknown[],
  signals: [] as unknown[],
  answer: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: cloud.session }, error: null }) },
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        retry: (enabled: unknown) => { cloud.retryArgs.push(enabled); return query; },
        abortSignal: (signal: unknown) => { cloud.signals.push(signal); return query; },
        maybeSingle: async () => { cloud.lookups += 1; return cloud.answer; },
      };
      return query;
    },
    rpc: async () => ({ data: null, error: { code: '42501', message: 'not in this test' } }),
  },
}));

import { commitCheckout } from '@/lib/committed-checkout';
import { noteCloudReached } from '@/lib/cloud-reach';

function shop(code: string): StoreData {
  const store = {
    storeName: 'Corner Provisions', accessCode: code, storeId: `SF-${code}`, createdAt: '2026-09-01T00:00:00.000Z',
    products: [{ id: 'p1', name: 'Rice 1kg', costPrice: 1200, sellingPrice: 1500, quantity: 20, category: 'Food' }],
    sales: [], customers: [], pendingPayments: [], managerSettings: { autoBackupsEnabled: false },
  } as unknown as StoreData;
  localStorage.setItem(`storeflow_${code}`, JSON.stringify(store));
  return store;
}

const sell = (store: StoreData) => commitCheckout(store, [{ productId: 'p1', quantity: 1 }] as never, { paid: 1500, method: 'cash' } as never);
const stock = (code: string) => JSON.parse(localStorage.getItem(`storeflow_${code}`) || '{}').products[0].quantity;

beforeEach(() => {
  localStorage.clear();
  noteCloudReached();
  cloud.session = null;
  cloud.lookups = 0;
  cloud.retryArgs = [];
  cloud.signals = [];
  cloud.answer = { data: null, error: null };
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

describe('a shop with no cloud account on this phone', () => {
  it('saves the sale without asking the cloud anything', async () => {
    // The cloud refuses a commit from nobody, so there is nothing to ask.
    const store = shop('ALONE1');
    const result = await sell(store);

    expect(result.error).toBeUndefined();
    expect(cloud.lookups).toBe(0);
    expect(stock('ALONE1')).toBe(19);
  });
});

describe('a signed-in shop on a line that drops', () => {
  beforeEach(() => {
    cloud.session = { user: { id: 'owner' } };
    // What the data client hands back when fetch itself fails.
    cloud.answer = { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };
  });

  it('asks once, without retries and with a time limit, then saves on the phone', async () => {
    const store = shop('DROP01');
    const result = await sell(store);

    expect(result.error).toBeUndefined();
    expect(stock('DROP01')).toBe(19);
    expect(cloud.retryArgs, 'the check must not be retried while the customer waits').toContain(false);
    expect(cloud.signals.length, 'the check must have a time limit').toBeGreaterThan(0);
    expect(cloud.signals.every(signal => signal instanceof AbortSignal)).toBe(true);
  });

  it('does not ask again for the next sale', async () => {
    const store = shop('DROP02');
    await sell(store);
    const asked = cloud.lookups;

    const next = JSON.parse(localStorage.getItem('storeflow_DROP02') || '{}');
    const result = await sell(next);

    expect(result.error).toBeUndefined();
    expect(stock('DROP02')).toBe(18);
    expect(cloud.lookups, 'the second sale waited on a cloud that had just failed').toBe(asked);
  });

  it('asks again once the phone comes back online', async () => {
    const store = shop('DROP03');
    await sell(store);
    const asked = cloud.lookups;

    window.dispatchEvent(new Event('online'));
    await sell(JSON.parse(localStorage.getItem('storeflow_DROP03') || '{}'));

    expect(cloud.lookups).toBeGreaterThan(asked);
  });

  it('treats a real database answer as an answer, not a dropped line', async () => {
    cloud.answer = { data: null, error: { message: 'permission denied', code: '42501' } };
    const store = shop('DROP04');
    await sell(store);
    const asked = cloud.lookups;

    await sell(JSON.parse(localStorage.getItem('storeflow_DROP04') || '{}'));

    expect(cloud.lookups).toBeGreaterThan(asked);
  });
});
