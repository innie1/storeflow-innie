import { describe, expect, it, vi } from 'vitest';
import { FULL_REFRESH_MS, loadStoreOrders, mergeOrders, newestUpdate, readOrdersCache, type OrdersCache } from '@/lib/orders-cache';
import { readSource } from './helpers/source';

/**
 * The owner's phone keeps its own copy of the shop's orders and downloads
 * only what changed, instead of every order the shop ever had on every open.
 * The cloud's half - an order counts as changed when its items do, and
 * touching it fires nothing else - was tested against the live database in
 * the migration's dry run.
 */

const order = (id: string, created: string, updated: string, extra: Record<string, unknown> = {}) =>
  ({ id, created_at: created, updated_at: updated, status: 'Pending', order_items: [], ...extra });

function memory(initial: OrdersCache | null = null) {
  let saved = initial;
  return {
    read: vi.fn(async () => saved),
    write: vi.fn(async (entry: OrdersCache) => { saved = entry; }),
    get saved() { return saved; },
  };
}

const NOW = new Date('2026-10-12T20:00:00Z');

describe('the first open on a phone', () => {
  it('downloads everything once and keeps it', async () => {
    const store = memory();
    const all = vi.fn(async () => [order('a', '2026-10-01T10:00:00Z', '2026-10-01T10:00:00.123456+00:00'), order('b', '2026-10-02T10:00:00Z', '2026-10-03T09:00:00.654321+00:00')]);
    const since = vi.fn();
    const loaded = await loadStoreOrders('shop', { all, since }, NOW, store);
    expect(loaded).toMatchObject({ full: true, downloaded: 2 });
    expect(loaded.orders.map(o => o.id)).toEqual(['b', 'a']);
    expect(since).not.toHaveBeenCalled();
    expect(store.saved).toMatchObject({ watermark: '2026-10-03T09:00:00.654321+00:00', fullAt: NOW.toISOString() });
  });
});

describe('every open after that', () => {
  const saved: OrdersCache = {
    storeId: 'shop',
    orders: [order('b', '2026-10-02T10:00:00Z', '2026-10-03T09:00:00Z'), order('a', '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z')],
    watermark: '2026-10-03T09:00:00Z',
    fullAt: '2026-10-10T00:00:00Z',
  };

  it('asks only for what changed since the newest change the cloud sent', async () => {
    const store = memory(saved);
    const all = vi.fn();
    const since = vi.fn(async () => [order('a', '2026-10-01T10:00:00Z', '2026-10-12T19:00:00Z', { status: 'Ready' }), order('c', '2026-10-12T18:00:00Z', '2026-10-12T18:00:00Z')]);
    const loaded = await loadStoreOrders('shop', { all, since }, NOW, store);
    expect(all).not.toHaveBeenCalled();
    expect(since).toHaveBeenCalledWith('2026-10-03T09:00:00Z');
    expect(loaded).toMatchObject({ full: false, downloaded: 2 });
    expect(loaded.orders.map(o => o.id)).toEqual(['c', 'b', 'a']);
    expect(loaded.orders.find(o => o.id === 'a')?.status).toBe('Ready');
    expect(store.saved?.watermark).toBe('2026-10-12T19:00:00Z');
  });

  it('downloads nothing when nothing changed, and keeps its place', async () => {
    const store = memory(saved);
    const loaded = await loadStoreOrders('shop', { all: vi.fn(), since: vi.fn(async () => []) }, NOW, store);
    expect(loaded.downloaded).toBe(0);
    expect(loaded.orders).toHaveLength(2);
    expect(store.saved?.watermark).toBe('2026-10-03T09:00:00Z');
  });

  it('downloads everything again once a week', async () => {
    const store = memory({ ...saved, fullAt: new Date(NOW.getTime() - FULL_REFRESH_MS - 1).toISOString() });
    const all = vi.fn(async () => [order('b', '2026-10-02T10:00:00Z', '2026-10-03T09:00:00Z')]);
    const loaded = await loadStoreOrders('shop', { all, since: vi.fn() }, NOW, store);
    expect(all).toHaveBeenCalled();
    expect(loaded.full).toBe(true);
    // Nothing that is gone from the cloud lingers on the phone.
    expect(loaded.orders.map(o => o.id)).toEqual(['b']);
  });

  it('keeps the saved copy when the cloud cannot be reached', async () => {
    const store = memory(saved);
    await expect(loadStoreOrders('shop', { all: vi.fn(), since: vi.fn(async () => { throw new Error('offline'); }) }, NOW, store)).rejects.toThrow('offline');
    expect(store.saved).toBe(saved);
  });
});

describe('small parts', () => {
  it('takes the cloud’s own time, to the microsecond, never this phone’s clock', () => {
    expect(newestUpdate([{ updated_at: '2026-10-12T10:00:00.000001+00:00' }, { updated_at: '2026-10-12T10:00:00.000009+00:00' }], null))
      .toBe('2026-10-12T10:00:00.000009+00:00');
    expect(newestUpdate([], '2026-10-01T00:00:00Z')).toBe('2026-10-01T00:00:00Z');
  });

  it('lets what changed replace what was there', () => {
    const merged = mergeOrders([order('a', '1', '1', { status: 'Pending' })], [order('a', '1', '2', { status: 'Ready' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('Ready');
  });

  it('has no saved copy without IndexedDB, so it downloads as before', async () => {
    expect(await readOrdersCache('shop')).toBeNull();
  });
});

describe('the app uses it', () => {
  const index = readSource('src/pages/Index.tsx');
  it('shows the saved copy, then asks only for changes', () => {
    expect(index).toContain('readOrdersCache(String(store.id))');
    expect(index).toContain("gte('updated_at', watermark)");
    expect(index).not.toMatch(/from\('orders'\)\s*\.select\('\*, order_items\(\*\)'\)\s*\.eq\('store_id', store\.id\)\s*\.order\('created_at'/);
  });
});
