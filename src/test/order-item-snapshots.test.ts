import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

describe('order item snapshots', () => {
  it('shows the exact Flow-created item name in Orders', () => {
    expect(readSource('src/components/Orders.tsx')).toContain('item.item_name || item.product_name');
  });

  it('shows the exact Flow-created item name on the receipt', () => {
    expect(readSource('src/components/OrderReceipt.tsx')).toContain(
      "productName: item.item_name || item.product_name || product?.name || 'Item'",
    );
  });
});
