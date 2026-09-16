import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCoins,
  addSupplier,
  claimLegacyFlowMemory,
  getCoins,
  getFlowMemory,
  legacyFlowMemoryAwaitingOwner,
  setFlowMemoryShop,
} from '@/lib/flow-memory';

const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => Promise.resolve({ error: null }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => rpc(name, args),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }),
  },
}));

/**
 * Flow's memory belongs to one shop.
 *
 * It used to live under a single key shared by every shop on the phone, while
 * the cloud target followed whichever shop was open: a supplier added in one
 * shop turned up in the next, and a save could write one shop's coins and
 * streak into another shop's cloud record.
 */

const shopA = { id: 'cloud-a', accessCode: 'SHOPA1' };
const shopB = { id: 'cloud-b', accessCode: 'SHOPB2' };

const twoShopsOnThePhone = () =>
  localStorage.setItem('storeflow_index', JSON.stringify([{ code: 'SHOPA1' }, { code: 'SHOPB2' }]));
const oneShopOnThePhone = () =>
  localStorage.setItem('storeflow_index', JSON.stringify([{ code: 'SHOPA1' }]));

const legacyPile = JSON.stringify({
  suppliers: [{ id: 'old-1', name: 'Mama Ngozi', products: ['Rice'], pricePerUnit: 500, addedAt: '2026-01-01' }],
  coins: 120, flowBalance: 120, lifetimeFlowEarned: 300, flowEarnedToday: 0,
  flowTransactions: [], streak: 4, streakDate: '2026-01-01', referralEarnings: 0, gameEarnings: 0,
});

beforeEach(() => {
  localStorage.clear();
  rpc.mockClear();
  setFlowMemoryShop(null);
});

describe('one shop, one memory', () => {
  it('keeps each shop to itself', () => {
    twoShopsOnThePhone();

    setFlowMemoryShop(shopA);
    addSupplier({ name: 'Ada Supplies', products: ['Soap'], pricePerUnit: 700 });
    // Finding a supplier earns FLOW. One reward per shop here on purpose: two
    // within half a second are refused as rapid clicking, which is the app
    // guarding itself rather than anything to do with shops.
    const balanceInA = getCoins();
    expect(balanceInA).toBeGreaterThan(0);

    setFlowMemoryShop(shopB);
    expect(getFlowMemory().suppliers).toEqual([]);
    expect(getCoins()).toBe(0);
    addSupplier({ name: 'Bola Chemicals', products: ['Starch'], pricePerUnit: 900 });

    setFlowMemoryShop(shopA);
    expect(getFlowMemory().suppliers.map(s => s.name)).toEqual(['Ada Supplies']);
    expect(getCoins()).toBe(balanceInA);
  });

  it('never writes to the shared key again', () => {
    twoShopsOnThePhone();
    setFlowMemoryShop(shopA);
    addSupplier({ name: 'Ada Supplies', products: [], pricePerUnit: 0 });

    expect(localStorage.getItem('storeflow_flow_memory')).toBeNull();
    expect(localStorage.getItem('storeflow_flow_memory_v2_cloud-a')).toBeTruthy();
  });

  it('reads and writes nothing at all when no shop is open', () => {
    setFlowMemoryShop(null);

    expect(getFlowMemory().suppliers).toEqual([]);
    addCoins(75);

    expect(getCoins()).toBe(0);
    expect(Object.keys(localStorage).filter(key => key.includes('flow_memory'))).toEqual([]);
  });

  it('does not fall back to the old shared pile before a shop is open', () => {
    // The moment the app starts, before it has said which shop is open. Reading
    // the old pile here is how one shop's suppliers used to reach another.
    localStorage.setItem('storeflow_flow_memory', legacyPile);
    setFlowMemoryShop(null);

    expect(getFlowMemory().suppliers).toEqual([]);
    expect(getCoins()).toBe(0);
  });

  it('sends a save to the shop it was saved in', async () => {
    vi.useFakeTimers();
    try {
      twoShopsOnThePhone();
      setFlowMemoryShop(shopB);
      addCoins(10);
      vi.advanceTimersByTime(2500);
    } finally {
      vi.useRealTimers();
    }

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ store_id_input: 'cloud-b', key_input: 'flowMemory' });
  });
});

describe('the pile from the older version', () => {
  it('moves across on a phone with one shop', () => {
    oneShopOnThePhone();
    localStorage.setItem('storeflow_flow_memory', legacyPile);

    setFlowMemoryShop(shopA);

    expect(getFlowMemory().suppliers.map(s => s.name)).toEqual(['Mama Ngozi']);
    expect(getCoins()).toBe(120);
    expect(localStorage.getItem('storeflow_flow_memory')).toBeNull();
    expect(legacyFlowMemoryAwaitingOwner()).toBe(false);
  });

  it('waits on a phone with several, rather than guessing', () => {
    twoShopsOnThePhone();
    localStorage.setItem('storeflow_flow_memory', legacyPile);

    setFlowMemoryShop(shopA);

    expect(getFlowMemory().suppliers).toEqual([]);
    expect(localStorage.getItem('storeflow_flow_memory')).toBeTruthy();
    expect(legacyFlowMemoryAwaitingOwner()).toBe(true);
  });

  it('goes where the owner says, keeping what that shop already had', () => {
    twoShopsOnThePhone();
    localStorage.setItem('storeflow_flow_memory', legacyPile);
    setFlowMemoryShop(shopA);
    addSupplier({ name: 'Ada Supplies', products: [], pricePerUnit: 0 });
    addCoins(10);

    expect(claimLegacyFlowMemory()).toBe(true);

    const mine = getFlowMemory();
    expect(mine.suppliers.map(s => s.name).sort()).toEqual(['Ada Supplies', 'Mama Ngozi']);
    // The better of the two, so neither is lost.
    expect(mine.flowBalance).toBe(120);
    expect(mine.streak).toBe(4);
    expect(legacyFlowMemoryAwaitingOwner()).toBe(false);
    // And the other shop is still untouched.
    setFlowMemoryShop(shopB);
    expect(getFlowMemory().suppliers).toEqual([]);
  });
});

describe('where the shop is set', () => {
  it('is the app itself, before any screen reads it', async () => {
    const { readSource } = await import('./helpers/source');
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain('setFlowMemoryShop(store);');
  });

  it('offers the older pile to a shop, on the Flow page', async () => {
    const { readSource } = await import('./helpers/source');
    const manager = readSource('src/components/Manager.tsx');
    expect(manager).toContain('legacyFlowMemoryAwaitingOwner()');
    expect(manager).toContain('claimLegacyFlowMemory()');
  });
});
