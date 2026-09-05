import { describe, expect, it } from 'vitest';
import { generateAdvice, buildFlowReport } from '@/lib/manager-intel';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * "Open" on an advice card used to hand the Inventory tab a tab id and stop.
 *
 * The merchant was told "Raise price on Mineral", tapped Open, and landed on a
 * list of every product they own — left to scroll or search for the one thing
 * Flow had just named, then find the edit control, then find the price field.
 * All of that was already known at the point the advice was written.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

function makeStore(over: Partial<StoreData> = {}): StoreData {
  return {
    id: 's1', storeId: 'SF-T', storeName: 'T', accessCode: 'T1',
    storeType: 'provision', products: [], sales: [], expenses: [],
    createdAt: new Date(0).toISOString(), ...over,
  } as StoreData;
}

/** Priced barely above cost, and selling — the "raise price" case. */
const underpriced = { id: 'p-min', name: 'Mineral', category: 'Drinks', costPrice: 4700, sellingPrice: 4850, quantity: 40 };
const underpricedSales = Array.from({ length: 14 }, (_, i) => ({
  id: `s${i}`, productId: 'p-min', productName: 'Mineral', quantity: 3,
  unitPrice: 4850, total: 14550, profit: 450, date: daysAgo(i),
}));

describe('advice that names one product carries that product', () => {
  it('sends a price change straight to that product editor', () => {
    const store = makeStore({ products: [underpriced as any], sales: underpricedSales as any });
    const card = generateAdvice(store, []).find(a => a.title.includes('Mineral') && a.autoFix?.type === 'update_price');

    expect(card, 'expected a pricing card for Mineral').toBeTruthy();
    expect(card!.focus).toEqual({ productId: 'p-min', productName: 'Mineral', intent: 'edit' });
    expect(card!.goTo).toBe('inventory');
  });

  it('sends a restock to that product, not to the product list', () => {
    const store = makeStore({
      products: [{ id: 'p-rice', name: 'Rice', category: 'Groceries', costPrice: 7000, sellingPrice: 9000, quantity: 1 } as any],
      sales: Array.from({ length: 10 }, (_, i) => ({
        id: `r${i}`, productId: 'p-rice', productName: 'Rice', quantity: 3,
        unitPrice: 9000, total: 27000, profit: 6000, date: daysAgo(i),
      })) as any,
    });

    const card = generateAdvice(store, []).find(a => a.id === 'cr-p-rice');
    expect(card!.focus?.productId).toBe('p-rice');
    expect(card!.focus?.intent).toBe('restock');
  });

  it('leaves advice about several products pointing at the list', () => {
    // There is no single product to open, so sending the merchant to one would
    // be wrong — the reorder-level card covers two or more at once.
    const store = makeStore({
      products: [
        { id: 'a', name: 'A', category: 'x', costPrice: 10, sellingPrice: 20, quantity: 50 } as any,
        { id: 'b', name: 'B', category: 'x', costPrice: 10, sellingPrice: 20, quantity: 50 } as any,
      ],
      sales: ['a', 'b'].flatMap(id => Array.from({ length: 14 }, (_, i) => ({
        id: `${id}${i}`, productId: id, productName: id, quantity: 4,
        unitPrice: 20, total: 80, profit: 40, date: daysAgo(i),
      }))) as any,
    });

    const grouped = generateAdvice(store, []).find(a => a.id === 'reorder-levels');
    expect(grouped, 'expected the grouped reorder card').toBeTruthy();
    expect(grouped!.focus).toBeUndefined();
    expect(grouped!.goTo).toBe('inventory');
  });
});

describe('the destination opens what it was sent', () => {
  const inventory = () => readSource('src/components/Inventory.tsx');

  it('opens the editor for an edit, and the product for anything else', () => {
    const source = inventory();
    expect(source).toContain('focusProduct');
    expect(source).toContain("focusProduct.intent === 'edit'");
    expect(source).toContain('openEditFor(target)');
    expect(source).toContain('setSelectedDetailProduct(target)');
  });

  it('clears filters that would hide the product it was sent to', () => {
    const source = inventory();
    const effect = source.slice(source.indexOf('if (!focusProduct) return;'), source.indexOf('onFocusProductHandled?.();\n    // eslint'));
    expect(effect).toContain("setSearch('')");
    expect(effect).toContain('setShowDiscontinued');
    expect(effect).toContain('onClearFilter?.()');
  });

  it('says so rather than silently doing nothing when the product is gone', () => {
    const source = inventory();
    expect(source).toContain('is no longer in your inventory');
  });

  it('opens the edit form the same way from every entry point', () => {
    // Three places opened it by hand, each assigning five of the draft's nine
    // fields — so the carton and singles settings kept whatever the previous
    // edit had put there. Only the opening form is counted here; the modal's
    // own field handlers update the draft too, and should.
    const source = inventory();
    const openers = source.match(/setEditDraft\(\{\s*name:/g) || [];
    expect(openers.length).toBe(1);
    expect(source).toContain('isCartonSingleEnabled: p.isCartonSingleEnabled === true');
    // And both of the old call sites now go through it.
    expect(source).toContain('onClick={() => openEditFor(p)}');
    expect(source).toContain('openEditFor(selectedDetailProduct)');
  });
});

describe('the advice report passes it through too', () => {
  it('threads focus from a report action to the navigator', () => {
    expect(readSource('src/components/FlowAdviceReport.tsx')).toContain('onNavigate?.(a.goTo, a.focus)');
    expect(readSource('src/components/Manager.tsx')).toContain('onNavigate?.(a.goTo!, a.focus)');
  });

  it('still produces a report without needing a focus on every action', () => {
    const store = makeStore({ products: [underpriced as any], sales: underpricedSales as any });
    expect(() => buildFlowReport(store)).not.toThrow();
  });
});
