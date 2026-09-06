import { describe, expect, it } from 'vitest';
import { fuzzyIntent, wordSimilarity } from '@/lib/flow-fuzzy-intent';
import { flowQuickActions } from '@/lib/flow-quick-actions';
import { understand, responseFor } from '@/lib/flow-operating-engine';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * Flow answered from its own reading of the shop, and only if you spelled
 * things correctly.
 *
 * Intent detection was a ladder of exact-word regexes, so "wats low" or
 * "best seler" matched nothing and landed on the help text. And its idea of
 * what was urgent was `a.out[0]` — the first out-of-stock product in array
 * order, which is the order they were added to the shop. So the chat could
 * name one product as the priority while the Manager screen, which ranks by
 * profit lost per day and ignores anything with no recent demand, named
 * another. Two answers to the same question from the same records.
 */

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

/** Rice sells six a day at ₦17,500 profit. The lamp sold once, ninety days back. */
function shop(): StoreData {
  const sales: any[] = [];
  for (let day = 0; day < 14; day++) {
    for (let i = 0; i < 6; i++) {
      sales.push({ id: `r-${day}-${i}`, productId: 'rice', productName: 'Rice 50kg', quantity: 1,
        unitPrice: 87500, total: 87500, profit: 17500, date: daysAgo(day) });
    }
  }
  sales.push({ id: 'lamp-old', productId: 'lamp', productName: 'Kerosene lamp', quantity: 1,
    unitPrice: 3500, total: 3500, profit: 500, date: daysAgo(90) });

  return {
    id: 's', storeId: 'SF', storeName: 'S', accessCode: 'A', storeType: 'provision',
    createdAt: daysAgo(200),
    products: [
      // Added first, so array order puts the dead one at the front.
      { id: 'lamp', name: 'Kerosene lamp', category: 'x', costPrice: 3000, sellingPrice: 3500, quantity: 0 },
      { id: 'rice', name: 'Rice 50kg', category: 'x', costPrice: 70000, sellingPrice: 87500, quantity: 0 },
    ] as any,
    sales: sales as any,
    expenses: [],
  } as StoreData;
}

describe('a mistyped question still gets an answer', () => {
  it('reads common typos', () => {
    expect(fuzzyIntent('wats low')?.intent).toBe('inventory');
    expect(fuzzyIntent('best seler')?.intent).toBe('best_sellers');
    expect(fuzzyIntent('profitt this week')?.intent).toBe('profit');
    expect(fuzzyIntent('how is my stor')?.intent).toBe('store_overview');
    expect(fuzzyIntent('custmers owing me')?.intent).toBe('customers');
  });

  it('does not guess from filler words alone', () => {
    // Guessing an intent from "can you show me the" would be worse than
    // admitting it did not understand.
    expect(fuzzyIntent('can you show me the')).toBeNull();
    expect(fuzzyIntent('')).toBeNull();
  });

  it('does not match short words loosely', () => {
    // A 3-letter word is one edit from dozens of others.
    expect(wordSimilarity('cat', 'cot')).toBe(0);
    expect(wordSimilarity('low', 'low')).toBe(1);
  });

  it('reaches the engine, not just the helper', () => {
    const plan = understand(shop(), 'wats low');
    expect(plan.intent).toBe('inventory');
    expect(plan.reason).toContain('read');
  });

  it('leaves an exactly-typed question alone', () => {
    // The fuzzy pass runs only after the precise rules fail, so it can never
    // steal a match from a rule that was already sure.
    const plan = understand(shop(), "what's low?");
    expect(plan.intent).toBe('inventory');
    // Matched by the precise rule, not guessed at. That rule was itself dead
    // until now: norm() strips apostrophes, so the pattern "what's low" could
    // never match the "what s low" it was tested against.
    expect(plan.reason).toBe('inventory query');
  });
});

describe('Flow and the Manager screen give the same priority', () => {
  it('names the product that costs most to be out of, not the first one listed', () => {
    // The lamp is products[0] and out of stock; rice is what actually earns.
    const answer = responseFor(shop(), understand(shop(), "how's my store?"));
    expect(answer).toContain('Rice 50kg');
    expect(answer).not.toContain('Kerosene lamp');
  });

  it('does not recommend restocking something with no recent demand', () => {
    const answer = responseFor(shop(), understand(shop(), 'what should I fix?'));
    expect(answer).not.toContain('Kerosene lamp');
  });

  it('takes its ranking from the same engine the restock screen uses', () => {
    const src = readSource('src/lib/flow-operating-engine.ts');
    expect(src).toContain("from '@/lib/manager-intel'");
    expect(src).toContain('inventoryIntelligence');
    // Comments still describe the old behaviour, so only the code counts.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain('a.out.slice(0,3)');
    expect(code).not.toContain('a.out[0].name');
  });
});

describe('there are three buttons, and they know the shop', () => {
  it('offers exactly three', () => {
    expect(flowQuickActions(shop())).toHaveLength(3);
  });

  it('leads with the product worth restocking first', () => {
    expect(flowQuickActions(shop())[0].label).toBe('Restock Rice 50kg');
  });

  it('still offers three when nothing is wrong', () => {
    const quiet = { ...shop(), products: [], sales: [] } as StoreData;
    const actions = flowQuickActions(quiet);
    expect(actions).toHaveLength(3);
    for (const a of actions) expect(a.prompt.length).toBeGreaterThan(0);
  });

  it('never repeats a label', () => {
    const labels = flowQuickActions(shop()).map(a => a.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('the chat opens quietly', () => {
  const chat = readSource('src/components/FlowChat.tsx');

  it('greets in one line', () => {
    expect(chat).toContain("Hey 👋 I'm Flow. You can ask me to do anything.");
  });

  it('no longer opens with nine chips', () => {
    // Five fixed prompts plus four import shortcuts that duplicate the
    // attachment menu.
    expect(chat).not.toContain('const QUICK');
    // The restock-code modal itself stays — it is reachable from the
    // attachment menu. Only the opening chip that duplicated it is gone.
    expect(chat).not.toContain('Import stock file');
    expect(chat).not.toMatch(/setShowRestockCodeImport\(true\)[\s\S]{0,80}Import restock code/);
  });

  it('puts its three above the composer', () => {
    expect(chat).toContain('quickActions.map');
  });

  it('caps the buttons on a reply at three', () => {
    expect(chat).toContain('actions: actions.slice(0, 3)');
  });
});
