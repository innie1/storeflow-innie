import { describe, expect, it } from 'vitest';
import { understand } from './flow-brain';

const store = { name: 'Test Store', products: [{ id: '1', name: 'Lacasera S/M', quantity: 1, sellingPrice: 3000, costPrice: 2600 }] } as any;

describe('Flow store-level routing', () => {
  it('does not resolve How is the store? as a product', () => {
    expect(understand(store, 'How is the store?').intent).toBe('store_overview');
  });
  it('keeps explicit product questions as product lookups', () => {
    expect(understand(store, 'Tell me about Lacasera S/M').intent).toBe('product_lookup');
  });
});
