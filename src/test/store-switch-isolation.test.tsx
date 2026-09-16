import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { workspaceKeyFor } from '@/pages/screens';
import { shopMemoryKey, recallDraft, rememberDraft, forgetDraft, forgetShopMemory, rememberScroll, recallScroll } from '@/lib/screen-memory';
import type { StoreData } from '@/types/store';

/**
 * What one shop's screens were holding must not follow you into another shop.
 *
 * While every screen was mounted at once, a switch swapped the shop underneath
 * screens that stayed exactly where they were, still holding the shop they
 * were built for: a cart, a filter, a search. Mounting only the active screen
 * is what makes it possible to say this cleanly - the screen belongs to a shop
 * and a trade, and changing either throws it away.
 */

const shopA = { id: 'uuid-a', accessCode: 'AAA111', storeName: 'Sunshine Laundry', businessType: 'laundry' } as unknown as StoreData;
const shopB = { id: 'uuid-b', accessCode: 'BBB222', storeName: 'Corner Game Centre', businessType: 'games' } as unknown as StoreData;

describe('the mounted screen belongs to one shop and one trade', () => {
  it('gives two shops two different keys', () => {
    expect(workspaceKeyFor(shopA)).not.toBe(workspaceKeyFor(shopB));
  });

  it('changes the key when the same shop changes trade', () => {
    const asProvision = { ...shopA, businessType: 'provision' } as unknown as StoreData;
    expect(workspaceKeyFor(asProvision)).not.toBe(workspaceKeyFor(shopA));
  });

  it('keeps the same key for the same shop, so ordinary work is not thrown away', () => {
    const laterSameShop = { ...shopA, products: [{ id: 'p1' }] } as unknown as StoreData;
    expect(workspaceKeyFor(laterSameShop)).toBe(workspaceKeyFor(shopA));
  });

  it('falls back to the code when a shop has no id yet', () => {
    const fresh = { accessCode: 'CCC333', businessType: 'laundry' } as unknown as StoreData;
    expect(workspaceKeyFor(fresh)).toContain('CCC333');
  });

  it('answers for no shop at all rather than throwing', () => {
    expect(workspaceKeyFor(null)).toBe('no-shop:none');
  });
});

function Probe({ onMount, onUnmount }: { onMount: () => void; onUnmount: () => void }) {
  const [typed] = useState(() => 'half-typed search');
  useEffect(() => {
    onMount();
    return onUnmount;
  }, [onMount, onUnmount]);
  return <div data-testid="probe">{typed}</div>;
}

describe('switching shops throws the previous shop\'s screen away', () => {
  afterEach(cleanup);

  it('remounts the screen when the shop changes', () => {
    let mounted = 0;
    let unmounted = 0;
    const onMount = () => { mounted += 1; };
    const onUnmount = () => { unmounted += 1; };

    const view = render(
      <div key={workspaceKeyFor(shopA)}><Probe onMount={onMount} onUnmount={onUnmount} /></div>,
    );
    expect(mounted).toBe(1);

    // The same shop again: nothing is disturbed.
    view.rerender(<div key={workspaceKeyFor(shopA)}><Probe onMount={onMount} onUnmount={onUnmount} /></div>);
    expect(mounted).toBe(1);
    expect(unmounted).toBe(0);

    // A different shop: the old screen goes, a new one arrives.
    view.rerender(<div key={workspaceKeyFor(shopB)}><Probe onMount={onMount} onUnmount={onUnmount} /></div>);
    expect(unmounted).toBe(1);
    expect(mounted).toBe(2);
  });

  it('remounts when the same shop is changed to another trade', () => {
    let mounted = 0;
    const onMount = () => { mounted += 1; };
    const onUnmount = () => { /* counted above */ };
    const asProvision = { ...shopA, businessType: 'provision' } as unknown as StoreData;

    const view = render(<div key={workspaceKeyFor(shopA)}><Probe onMount={onMount} onUnmount={onUnmount} /></div>);
    view.rerender(<div key={workspaceKeyFor(asProvision)}><Probe onMount={onMount} onUnmount={onUnmount} /></div>);
    expect(mounted).toBe(2);
  });
});

describe('what a screen is allowed to remember is kept per shop', () => {
  beforeEach(() => { sessionStorage.clear(); });
  afterEach(() => { sessionStorage.clear(); });

  const keyA = shopMemoryKey(shopA);
  const keyB = shopMemoryKey(shopB);

  it('does not show one shop\'s cart to another', () => {
    rememberDraft(keyA, 'sales-cart', [{ productId: 'p1', quantity: 2 }]);
    expect(recallDraft(keyA, 'sales-cart')).toHaveLength(1);
    // The whole point: the game centre must not inherit the laundry's cart.
    expect(recallDraft(keyB, 'sales-cart')).toBeNull();
  });

  it('keeps a scroll position per shop and per screen', () => {
    rememberScroll(keyA, 'inventory', 420);
    expect(recallScroll(keyA, 'inventory')).toBe(420);
    expect(recallScroll(keyA, 'customers')).toBe(0);
    expect(recallScroll(keyB, 'inventory')).toBe(0);
  });

  it('forgets a draft when it is finished', () => {
    rememberDraft(keyA, 'sales-cart', [{ productId: 'p1' }]);
    forgetDraft(keyA, 'sales-cart');
    expect(recallDraft(keyA, 'sales-cart')).toBeNull();
  });

  it('clears one shop without touching the other', () => {
    rememberDraft(keyA, 'sales-cart', [{ productId: 'p1' }]);
    rememberDraft(keyB, 'sales-cart', [{ productId: 'p9' }]);
    forgetShopMemory(keyA);
    expect(recallDraft(keyA, 'sales-cart')).toBeNull();
    expect(recallDraft(keyB, 'sales-cart')).toHaveLength(1);
  });

  it('remembers nothing at all when there is no shop open', () => {
    rememberDraft(null, 'sales-cart', [{ productId: 'p1' }]);
    expect(recallDraft(null, 'sales-cart')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('survives storage it cannot read rather than breaking a sale', () => {
    sessionStorage.setItem('storeflow_screen_memory_' + keyA, 'not json at all');
    expect(recallDraft(keyA, 'sales-cart')).toBeNull();
    rememberDraft(keyA, 'sales-cart', [{ productId: 'p1' }]);
    expect(recallDraft(keyA, 'sales-cart')).toHaveLength(1);
  });
});
