import { describe, expect, it } from 'vitest';
import type { Product } from '@/types/store';
import { createFlowShirtCode, parseFlowShirtText } from '@/lib/flow-shirt';

const products: Product[] = [
  { id: 'indomie', name: 'Indomie', costPrice: 300, sellingPrice: 500, quantity: 20, category: 'Food', addedAt: '2026-01-01' },
  { id: 'garri', name: 'Garri White', costPrice: 500, sellingPrice: 800, quantity: 12, category: 'Food', addedAt: '2026-01-01', voiceAliases: ['white garri'] },
];

describe('Flow Shirt smart sale parser', () => {
  it('builds a multi-item list from normal typed selling language', () => {
    const result = parseFlowShirtText('2 Indomie, 1 white garri', products);
    expect(result).toHaveLength(2);
    expect(result[0].product?.id).toBe('indomie');
    expect(result[0].quantity).toBe(2);
    expect(result[1].product?.id).toBe('garri');
  });

  it('keeps an unknown item as a new item and extracts its price', () => {
    const [item] = parseFlowShirtText('3 chin chin for 700', products);
    expect(item.product).toBeNull();
    expect(item.name).toBe('Chin Chin');
    expect(item.quantity).toBe(3);
    expect(item.priceGuess).toBe(700);
  });

  it('creates short transaction codes for saved Flow Shirt sales', () => {
    expect(createFlowShirtCode(1_787_872_000_000)).toMatch(/^FS-[A-Z0-9]{8}$/);
  });
});
