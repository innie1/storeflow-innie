import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { StoreData } from '@/types/store';

/**
 * A till that only works in flight mode.
 *
 * Every sale was routed through a cloud commit, and the gate in front of it
 * asked the wrong question: "does this shop have a storeId?" - which
 * ensureStoreId stamps on every shop on every device, cloud account or not.
 * So a shop that had never touched the cloud took the cloud path, could not
 * read a row it does not have, and the sale was refused. Worse, every ordinary
 * save left a record waiting to sync; with no account to sync to, that record
 * never cleared, and requireStoreSynced refused every sale after it.
 *
 * Reproduced in the browser before this was written: online, "Sign in to your
 * cloud account to sync these records", nothing sold, stock untouched. With
 * the phone offline, the same cart sold and stock moved 20 to 19.
 *
 * The laundry has always done this the other way round - write the bundle
 * down, mirror it afterwards - and that is the shape sales now follows. What
 * still stops the counter is a real disagreement: the cloud refused a change,
 * or a sale went out and its answer was lost.
 */

const sessionResponse = { data: { session: null as unknown }, error: null as unknown };
const storeRowResponse = { data: null as unknown, error: null as unknown };
const rpcResponse = { data: null as unknown, error: null as unknown };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: async () => sessionResponse },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => storeRowResponse,
          single: async () => storeRowResponse,
        }),
      }),
      insert: () => ({ select: () => ({ single: async () => storeRowResponse }) }),
    }),
    rpc: async () => rpcResponse,
  },
}));

const shop = (): StoreData => ({
  storeName: 'Corner Provisions',
  accessCode: 'TEST02',
  storeId: 'SF-W6NP2V',
  createdAt: new Date().toISOString(),
  products: [{ id: 'p1', name: 'Rice 5kg', costPrice: 4000, sellingPrice: 5200, quantity: 20, category: 'Food' }],
  sales: [],
  customers: [],
  pendingPayments: [],
  managerSettings: { autoBackupsEnabled: false },
} as unknown as StoreData);

beforeEach(() => {
  localStorage.clear();
  sessionResponse.data = { session: null };
  sessionResponse.error = null;
  storeRowResponse.data = null;
  storeRowResponse.error = null;
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  localStorage.setItem('storeflow_TEST02', JSON.stringify(shop()));
});

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('a shop with no cloud account can still sell', () => {
  it('records the sale and moves the stock while the phone is online', async () => {
    const { commitCheckout } = await import('@/lib/committed-checkout');
    const store = shop();

    const result = await commitCheckout(store, [{ productId: 'p1', quantity: 1, saleType: 'carton' }] as never, { paid: 5200, method: 'cash' } as never);

    expect(result.error, 'the sale was refused').toBeUndefined();
    expect(result.sales).toHaveLength(1);
    const saved = JSON.parse(localStorage.getItem('storeflow_TEST02') || '{}');
    expect(saved.products[0].quantity).toBe(19);
    expect(saved.sales).toHaveLength(1);
  });

  it('keeps the sale ready to send rather than reporting it as failed', async () => {
    const { commitCheckout } = await import('@/lib/committed-checkout');
    await commitCheckout(shop(), [{ productId: 'p1', quantity: 1 }] as never, { paid: 5200, method: 'cash' } as never);

    const { retryStoreSync, getPendingStoreSync } = await import('@/lib/store-cloud-sync');
    await retryStoreSync('TEST02');
    const pending = getPendingStoreSync('TEST02');

    expect(pending, 'the sale was not kept for sending').toBeTruthy();
    expect(pending?.awaitingAccount).toBe(true);
    // Nothing is wrong, so nothing is reported as wrong.
    expect(pending?.error).toBeUndefined();
    expect(pending?.state).not.toBe('error');
  });

  it('sells again straight afterwards, instead of locking the till', async () => {
    const { commitCheckout } = await import('@/lib/committed-checkout');
    await commitCheckout(shop(), [{ productId: 'p1', quantity: 1 }] as never, { paid: 5200, method: 'cash' } as never);

    const second = JSON.parse(localStorage.getItem('storeflow_TEST02') || '{}');
    const result = await commitCheckout(second, [{ productId: 'p1', quantity: 2 }] as never, { paid: 10400, method: 'cash' } as never);

    expect(result.error, 'the second sale was refused').toBeUndefined();
    const saved = JSON.parse(localStorage.getItem('storeflow_TEST02') || '{}');
    expect(saved.products[0].quantity).toBe(17);
    expect(saved.sales).toHaveLength(2);
  });
});

describe('what may still stop the counter', () => {
  it('lets ordinary unsent records through', async () => {
    const { requireStoreSynced } = await import('@/lib/store-cloud-sync');
    localStorage.setItem('storeflow_sync_pending_TEST02', JSON.stringify({ next: shop(), state: 'pending' }));
    await expect(requireStoreSynced('TEST02')).resolves.toBeUndefined();
  });

  it('stops on a disagreement the cloud has already refused', async () => {
    const { requireStoreSynced } = await import('@/lib/store-cloud-sync');
    localStorage.setItem('storeflow_sync_pending_TEST02', JSON.stringify({
      next: shop(), state: 'conflict', error: 'Another device changed stock or payments.',
    }));
    await expect(requireStoreSynced('TEST02')).rejects.toThrow(/Another device changed/);
  });

  it('stops when a sale went out and its answer was lost', async () => {
    // The same money may already be recorded in the cloud; selling over the
    // top of that would double it.
    const { requireStoreSynced } = await import('@/lib/store-cloud-sync');
    localStorage.setItem('storeflow_sync_pending_TEST02', JSON.stringify({
      next: shop(), uncertainCheckout: shop(), state: 'pending', error: 'Sale status is uncertain.',
    }));
    await expect(requireStoreSynced('TEST02')).rejects.toThrow(/uncertain/i);
  });
});

describe('the shop is not told its records are stuck when they are not', () => {
  it('says nothing is waiting when there is no cloud account to wait for', async () => {
    const panel = (await import('./helpers/source')).readSource('src/components/StoreIntegrityPanel.tsx');
    expect(panel).toContain('const unsent = pending && !pending.awaitingAccount ? pending : null;');
  });

  it('says nothing about a shop with nothing waiting', async () => {
    /*
     * A shop with everything saved had a line telling it so, and a Refresh
     * button for records that did not need refreshing, sitting above the day's
     * takings on every single visit. It is drawn now only when there is
     * something to act on, and is absent otherwise - which is both the true
     * state of affairs and the quieter screen.
     */
    const panel = (await import('./helpers/source')).readSource('src/components/StoreIntegrityPanel.tsx');
    // What it draws, not what it says about itself: the comment above the
    // change quotes the old wording on purpose.
    const markup = panel.slice(panel.indexOf('return <section'));
    expect(markup).not.toContain('No records waiting to sync');
    expect(markup).not.toContain('Refresh cloud records');
    // Drawn only when there is something waiting; otherwise nothing at all.
    expect(panel).toContain('if (!unsent) return null;');
  });
});
