import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { generateAdvice, generateNotifications } from '@/lib/manager-intel';
import Inventory from '@/components/Inventory';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * Three ways the restock flow left the merchant with nowhere to go.
 *
 * 1. A buy list created by Auto Fix, or by approving one, could only be found
 *    by opening Flow, going to Advice and scrolling to a link at the very
 *    bottom. MyBuyLists — search, import code, sharing — was fully built and
 *    nothing in the app opened it.
 * 2. Advice naming several products could not carry any of them, so "2
 *    products need restocking" dropped the merchant on the whole inventory to
 *    work out which two.
 * 3. A restock notification said "Go to Inventory" and did exactly that,
 *    landing on the product list with no indication of which product it meant.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

const lowSeller = (id: string, name: string) => ({
  id, name, category: 'Groceries', costPrice: 700, sellingPrice: 900, quantity: 1,
});

function store(): StoreData {
  return {
    id: 's1', storeId: 'SF-T', storeName: 'T', accessCode: 'T1', storeType: 'provision',
    createdAt: daysAgo(60), expenses: [],
    products: [lowSeller('p-a', 'Rice'), lowSeller('p-b', 'Beans')] as any,
    sales: ['p-a', 'p-b'].flatMap(id => Array.from({ length: 12 }, (_, i) => ({
      id: `${id}-${i}`, productId: id, productName: id, quantity: 3,
      unitPrice: 900, total: 2700, profit: 600, date: daysAgo(i),
    }))) as any,
  } as StoreData;
}

describe('advice about several products carries all of them', () => {
  it('names every product in the group, not just the first', () => {
    const group = generateAdvice(store(), []).find(a => a.id === 'cr-group' || a.id === 'soon-group');
    expect(group, 'expected a grouped restock card').toBeTruthy();
    expect(group!.focus?.productIds).toEqual(expect.arrayContaining(['p-a', 'p-b']));
    expect(group!.focus?.groupLabel).toMatch(/products/);
  });

  it('shows just those products, and says why the list is short', () => {
    const group = generateAdvice(store(), []).find(a => a.id === 'cr-group' || a.id === 'soon-group')!;

    const { container } = render(
      <Inventory
        store={{ ...store(), products: [...store().products, lowSeller('p-c', 'Sugar')] as any }}
        onUpdate={() => {}}
        focusProduct={group.focus}
      />
    );

    // The two the advice named are shown; the third is filtered out.
    expect(container.textContent).toContain('Rice');
    expect(container.textContent).toContain('Beans');
    expect(container.textContent).not.toContain('Sugar');

    // A filter with nothing explaining it is how a screen feels broken.
    expect(container.textContent).toMatch(/Showing just these 2/);
    expect(screen.getByText('Show all')).toBeTruthy();
  });
});

describe('a restock notification opens the product it is about', () => {
  it('carries the product rather than pointing at the inventory list', () => {
    const alerts = generateNotifications(store()).filter(n => /Restock/.test(n.title || ''));
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      expect(alert.actionTab).toBe('inventory');
      expect(alert.actionParam, `${alert.title} still has no product`).toMatch(/^product:/);
      expect(alert.actionLabel).not.toBe('Go to Inventory');
    }
  });

  it('is routed to the product by the shell', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain("param?.startsWith('product:')");
    expect(index).toContain('setFocusProduct(');
  });
});

describe('created buy lists can be found', () => {
  it('opens the buy list screen from Stock, where restocking happens', () => {
    const inventory = readSource('src/components/Inventory.tsx');
    expect(inventory).toContain("import MyBuyLists from '@/components/MyBuyLists'");
    expect(inventory).toContain('setShowBuyLists(true)');
    expect(inventory).toContain('My Buy Lists');
  });

  it('says what was created and where it lives, instead of closing behind a toast', () => {
    const engine = readSource('src/components/SmartRestockEngine.tsx');
    // Approving used to fire a toast naming two destinations and then close.
    expect(engine).toContain('setApproved({');
    expect(engine).toContain('Buy list saved');
    expect(engine).toContain('Stock → My Buy Lists');
    const approve = engine.slice(engine.indexOf('setApproved({'), engine.indexOf('setApproved({') + 400);
    expect(approve).not.toContain('onClose()');
  });
});
