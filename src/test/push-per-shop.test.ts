import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readSource } from './helpers/source';

/**
 * One phone, reachable for more than one shop.
 *
 * push_subscriptions.endpoint was UNIQUE, and a browser gives a device one
 * push endpoint per site, so the table could only hold one row per phone. A
 * merchant running two shops from one handset had their order alerts moved to
 * whichever shop they opened last: opening the second shop rewrote that row's
 * store_id and the first shop's orders pushed to nobody, with nothing on
 * screen to say so.
 *
 * The uniqueness that was wanted is one row per shop per device. These cover
 * the phone's half of that - the half that has to be safe both before and
 * after the constraint changes, since the app deploys on its own.
 */

interface Row { id: string; store_id: string; endpoint: string; p256dh?: string; auth?: string }

const ENDPOINT = 'https://push.example/device-1';

let rows: Row[] = [];
let upserts: { row: Row; onConflict?: string }[] = [];
/** Error the next upsert should answer with, once. */
let nextUpsertError: { code?: string; message: string } | null = null;
const unsubscribed = vi.fn(async () => true);

vi.mock('@/integrations/supabase/client', () => {
  function builder(table: string) {
    const filters: Record<string, string> = {};
    let pending: 'select' | 'delete' | null = null;

    const matches = (row: Row) => Object.entries(filters).every(([key, value]) => (row as unknown as Record<string, string>)[key] === value);

    const run = () => {
      if (table !== 'push_subscriptions') return { data: [], error: null };
      if (pending === 'delete') {
        const kept = rows.filter(row => !matches(row));
        rows = kept;
        return { data: null, error: null };
      }
      return { data: rows.filter(matches), error: null };
    };

    const api: Record<string, unknown> = {
      select: () => { pending = 'select'; return api; },
      delete: () => { pending = 'delete'; return api; },
      eq: (column: string, value: string) => { filters[column] = value; return api; },
      limit: () => api,
      maybeSingle: async () => {
        const result = run() as { data: Row[] | null; error: null };
        return { data: (result.data && result.data[0]) || null, error: null };
      },
      upsert: async (row: Row, options?: { onConflict?: string }) => {
        upserts.push({ row, onConflict: options?.onConflict });
        if (nextUpsertError) {
          const error = nextUpsertError;
          nextUpsertError = null;
          return { data: null, error };
        }
        const existing = rows.find(candidate => candidate.endpoint === row.endpoint
          && (options?.onConflict === 'endpoint' || candidate.store_id === row.store_id));
        if (existing) Object.assign(existing, row);
        else rows.push({ ...row, id: `row-${rows.length + 1}` });
        return { data: null, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return api;
  }

  return { supabase: { from: (table: string) => builder(table) } };
});

function stubBrowserPush() {
  const subscription = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe: unsubscribed,
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => subscription,
          subscribe: async () => subscription,
        },
      }),
    },
  });
  Object.defineProperty(window, 'PushManager', { configurable: true, writable: true, value: function PushManager() { /* present is all that matters */ } });
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    writable: true,
    value: Object.assign(function FakeNotification() { /* not raised here */ }, {
      permission: 'granted',
      requestPermission: async () => 'granted',
    }),
  });
}

beforeEach(() => {
  rows = [];
  upserts = [];
  nextUpsertError = null;
  unsubscribed.mockClear();
  stubBrowserPush();
});

afterEach(() => { vi.restoreAllMocks(); });

describe('a device can be saved for more than one shop', () => {
  it('saves against the shop and the device, not the device alone', async () => {
    const { subscribeToOrderPush } = await import('@/lib/push-notifications');
    const result = await subscribeToOrderPush('shop-a');

    expect(result.success).toBe(true);
    expect(upserts[0].onConflict, 'saving on the endpoint alone is what moved alerts between shops')
      .toBe('store_id,endpoint');
    expect(rows).toHaveLength(1);
  });

  it('keeps both shops on the same phone instead of moving the row', async () => {
    const { subscribeToOrderPush } = await import('@/lib/push-notifications');
    await subscribeToOrderPush('shop-a');
    await subscribeToOrderPush('shop-b');

    expect(rows.map(row => row.store_id).sort()).toEqual(['shop-a', 'shop-b']);
    expect(rows.every(row => row.endpoint === ENDPOINT)).toBe(true);
  });

  it('still works on a database where the constraint has not changed yet', async () => {
    // Postgres refuses an upsert whose conflict target has no matching unique
    // index. The app deploys on its own, so it has to survive that window with
    // the old one-shop behaviour rather than a toggle that cannot be turned on.
    nextUpsertError = { code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' };

    const { subscribeToOrderPush } = await import('@/lib/push-notifications');
    const result = await subscribeToOrderPush('shop-a');

    expect(result.success).toBe(true);
    expect(upserts.map(call => call.onConflict)).toEqual(['store_id,endpoint', 'endpoint']);
  });

  it('reports a failure that is not about the constraint', async () => {
    nextUpsertError = { code: '42501', message: 'new row violates row-level security policy' };
    const { subscribeToOrderPush } = await import('@/lib/push-notifications');
    const result = await subscribeToOrderPush('shop-a');

    expect(result.success).toBe(false);
    expect(result.message).toContain('row-level security');
    expect(upserts).toHaveLength(1);
  });
});

describe('the toggle answers for the shop you are in', () => {
  it('says not-subscribed for a shop that has no row, even when another shop does', async () => {
    rows = [{ id: 'row-1', store_id: 'shop-a', endpoint: ENDPOINT }];
    const { getPushSubscriptionState } = await import('@/lib/push-notifications');
    expect(await getPushSubscriptionState('shop-b')).toBe('not-subscribed');
    expect(await getPushSubscriptionState('shop-a')).toBe('subscribed');
  });

  it('answers for each shop when the phone is saved for both', async () => {
    rows = [
      { id: 'row-1', store_id: 'shop-a', endpoint: ENDPOINT },
      { id: 'row-2', store_id: 'shop-b', endpoint: ENDPOINT },
    ];
    const { getPushSubscriptionState } = await import('@/lib/push-notifications');
    expect(await getPushSubscriptionState('shop-a')).toBe('subscribed');
    expect(await getPushSubscriptionState('shop-b')).toBe('subscribed');
  });
});

describe('turning it off for one shop leaves the others alone', () => {
  it('removes this shop\'s row and keeps the phone subscribed for the rest', async () => {
    rows = [
      { id: 'row-1', store_id: 'shop-a', endpoint: ENDPOINT },
      { id: 'row-2', store_id: 'shop-b', endpoint: ENDPOINT },
    ];
    const { unsubscribeFromOrderPush } = await import('@/lib/push-notifications');
    const result = await unsubscribeFromOrderPush('shop-a');

    expect(result.success).toBe(true);
    expect(rows.map(row => row.store_id)).toEqual(['shop-b']);
    // The browser has one subscription for the whole site; ending it here
    // would have silenced the other shop too.
    expect(unsubscribed).not.toHaveBeenCalled();
    expect(result.message).toContain('other shops');
  });

  it('ends the device subscription once no shop is left using it', async () => {
    rows = [{ id: 'row-1', store_id: 'shop-a', endpoint: ENDPOINT }];
    const { unsubscribeFromOrderPush } = await import('@/lib/push-notifications');
    const result = await unsubscribeFromOrderPush('shop-a');

    expect(rows).toHaveLength(0);
    expect(unsubscribed).toHaveBeenCalledTimes(1);
    expect(result.message).toContain('this device');
  });
});

/**
 * The worker and the senders cannot be imported here - one is a service
 * worker, the others run on Deno - so they are read, the way the rest of this
 * suite reads them.
 */
describe('a push is judged by the switches of the shop it is for', () => {
  const sw = readSource('src/sw.ts');

  it('carries the shop on the payload', () => {
    expect(sw).toContain('store_id?: string');

    // Scoped to the payload the merchant's phone receives. Searched across the
    // whole file, `store_id: order.store_id` also matches the in-app
    // notification row inserted a few lines below, which would wave through a
    // payload that had lost it.
    const orderFn = readSource('supabase/functions/send-order-push/index.ts');
    const merchantPush = orderFn.slice(orderFn.indexOf('merchantSubs } = await'), orderFn.indexOf('merchantSent = await'));
    expect(merchantPush.length, 'the merchant push block moved; this test is reading nothing').toBeGreaterThan(0);
    expect(merchantPush).toContain('store_id: order.store_id');

    expect(readSource('supabase/functions/send-flow-reminders/index.ts')).toContain('store_id: sub.store_id');
  });

  it('reads that shop\'s switches, not whichever shop is open', () => {
    expect(sw).toContain('async function readPreferences(storeId?: string)');
    expect(sw).toContain('get(`shop:${storeId}`)');
    expect(sw).toContain('readPreferences(data.store_id)');
  });

  it('still falls back to the open shop for a sender that has not been updated', () => {
    // The edge functions deploy separately from the app. Until they do, a push
    // arrives with no shop on it and must still be judged by something.
    expect(sw).toContain("await get('global')");
  });

  it('keeps sending to every device saved for the shop', () => {
    // The senders already fanned out per store; this is what makes two phones,
    // or one phone saved twice, both work.
    expect(readSource('supabase/functions/send-order-push/index.ts')).toContain('.eq("store_id", order.store_id)');
  });
});

describe('the migration that lets a second row exist', () => {
  const sql = readSource('supabase/migrations/20260916200000_push_subscriptions_per_store.sql');

  it('replaces uniqueness on the endpoint with uniqueness per shop', () => {
    expect(sql).toContain('drop constraint if exists push_subscriptions_endpoint_key');
    expect(sql).toContain('unique (store_id, endpoint)');
  });

  it('deletes nothing on the way in', () => {
    const upToRollback = sql.slice(0, sql.indexOf('-- To undo'));
    expect(upToRollback.toLowerCase()).not.toContain('delete from');
    expect(upToRollback.toLowerCase()).not.toContain('truncate');
  });
});
