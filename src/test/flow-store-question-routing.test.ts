import { describe, expect, it } from 'vitest';
import { understand } from '@/lib/flow-operating-engine';

/**
 * Store-level questions must not be answered with a product card.
 *
 * This coverage used to live in flow-brain-store-routing.test.ts, against
 * src/lib/flow-brain.ts — a second, complete intent engine that nothing in the
 * shipped app imported. The test passed for years while testing code no user
 * ever reached. It has been moved here, onto flow-operating-engine, which is
 * what FlowChat actually calls.
 *
 * The case that drove this file: "How's the store?" against a catalog holding
 * a name with a standalone single letter ("Lacasera S/M") used to resolve to
 * that product. norm() dropped the apostrophe leaving a bare "s", "store" is a
 * stop word so it went too, and the query reduced to ["s"] - which every()
 * matched against the "S" in the name at 0.97.
 */

const store = {
  name: 'Test Store',
  products: [
    { id: '1', name: 'Lacasera S/M', quantity: 1, sellingPrice: 3000, costPrice: 2600 },
    { id: '2', name: 'Peak Milk', quantity: 4, sellingPrice: 1500, costPrice: 1200 },
  ],
} as any;

describe('questions about the whole store', () => {
  const storeLevel = [
    'How is the store?',
    'How is my store?',
    "How's my store?",
    // The case this file was written without: it resolved to "Lacasera S/M",
    // because norm() left a bare "s" that matched the S in the product name.
    "How's the store?",
    "How's our store?",
    'Tell me about the business',
    'How is the business?',
    "How's business?",
    'How are we doing?',
    'How is the shop doing?',
    'Tell me about the store',
    'Tell me about my store',
    'Give me an overview',
  ];

  for (const question of storeLevel) {
    it(`reads "${question}" as a question about the store`, () => {
      expect(understand(store, question).intent).toBe('store_overview');
    });
  }
});

describe('questions about one product', () => {
  it('still resolves an explicit product question to that product', () => {
    const result: any = understand(store, 'Tell me about Lacasera S/M');
    expect(result.intent).toBe('product_lookup');
    expect(result.product?.product?.name ?? result.productName).toBe('Lacasera S/M');
  });

  it('reads a named product asked about the same way as the store', () => {
    const result: any = understand(store, 'How is Peak Milk doing?');
    expect(result.intent).toBe('product_lookup');
    expect(result.product?.product?.name ?? result.productName).toBe('Peak Milk');
  });
});
