import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { patchOrderItemSnapshots } from '../../vite-plugin-order-item-snapshots';

describe('order item snapshots', () => {
  it('shows the exact Flow-created item name in Orders', () => {
    const source = fs.readFileSync('src/components/Orders.tsx', 'utf8');
    const transformed = patchOrderItemSnapshots(source, '/src/components/Orders.tsx');
    expect(transformed).toContain('item.item_name || item.product_name');
  });

  it('shows the exact Flow-created item name on the receipt', () => {
    const source = fs.readFileSync('src/components/OrderReceipt.tsx', 'utf8');
    const transformed = patchOrderItemSnapshots(source, '/src/components/OrderReceipt.tsx');
    expect(transformed).toContain("productName: item.item_name || item.product_name || product?.name || 'Item'");
  });
});
