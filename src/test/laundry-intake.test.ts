import { describe, expect, it } from 'vitest';
import {
  buildLaundryOrderItems,
  countLaundryPieces,
  expandLaundryGarments,
  generateLaundryReceiptNumber,
  suggestedLaundryTotal,
} from '@/lib/laundry-intake';

const service = (pricing: string, price: number) => ({
  id: 'svc-1',
  name: 'Full Service',
  costPrice: 0,
  sellingPrice: price,
  quantity: 999999,
  category: 'Service',
  isService: true,
  servicePricing: pricing,
} as any);

describe('laundry walk-in intake', () => {
  it('creates one short six-character handwritten-friendly tag code', () => {
    const code = generateLaundryReceiptNumber(new Date(2026, 7, 27, 14, 5, 0), () => 0);
    expect(code).toBe('AAAAAA');
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('uses the same tag code for every physical piece in one customer bundle', () => {
    const selections = [
      { garmentType: 'Shirt', quantity: 2 },
      { garmentType: 'Trouser', quantity: 1 },
    ];
    expect(countLaundryPieces(selections)).toBe(3);
    expect(expandLaundryGarments('K7M2Q9', selections)).toEqual([
      { garmentType: 'Shirt', tagCode: 'K7M2Q9', sequence: 1 },
      { garmentType: 'Shirt', tagCode: 'K7M2Q9', sequence: 2 },
      { garmentType: 'Trouser', tagCode: 'K7M2Q9', sequence: 3 },
    ]);
  });

  it('calculates configured laundry pricing for pieces, weight, loads and fixed service', () => {
    expect(suggestedLaundryTotal(service('per_piece', 500), 4)).toBe(2000);
    expect(suggestedLaundryTotal(service('per_kg', 800), 4, 3)).toBe(2400);
    expect(suggestedLaundryTotal(service('per_load', 2500), 4, 2)).toBe(5000);
    expect(suggestedLaundryTotal(service('fixed', 3000), 4)).toBe(3000);
  });

  it('keeps a manually agreed per-piece total equal to the saved order-item total', () => {
    const rows = buildLaundryOrderItems(
      service('per_piece', 500),
      [{ garmentType: 'Shirt', quantity: 2 }, { garmentType: 'Trouser', quantity: 1 }],
      1200,
    );
    expect(rows.reduce((sum, row) => sum + row.subtotal, 0)).toBeCloseTo(1200);
    expect(rows.every(row => row.offering_id === 'svc-1' && row.item_kind === 'service')).toBe(true);
  });

  it('keeps garment identification lines visible for fixed/KG/load pricing and uses one charge row', () => {
    const rows = buildLaundryOrderItems(
      service('fixed', 3000),
      [{ garmentType: 'Gown / Dress', quantity: 1 }, { garmentType: 'Towel', quantity: 2 }],
      3500,
    );
    expect(rows.slice(0, -1).every(row => row.price === 0)).toBe(true);
    expect(rows.at(-1)?.item_name).toContain('Service charge');
    expect(rows.reduce((sum, row) => sum + row.subtotal, 0)).toBe(3500);
  });
});
