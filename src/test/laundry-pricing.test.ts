import { describe, expect, it } from 'vitest';
import {
  calculateLaundryPriceLines,
  getLaundryGarmentPrice,
  publishLaundryPricingToTemplate,
  setLaundryGarmentPrice,
} from '@/lib/laundry-pricing';
import { defaultGarmentPrice } from '@/lib/laundry-intake';

function makeStore(): any {
  return {
    storeName: 'Washlie',
    accessCode: 'ABC123',
    storeType: 'laundry',
    products: [
      {
        id: 'svc-full',
        name: 'Full Service',
        costPrice: 0,
        sellingPrice: 500,
        quantity: 999999,
        category: 'Service',
        isService: true,
        servicePricing: 'per_piece',
      },
      {
        id: 'svc-iron',
        name: 'Iron Only',
        costPrice: 0,
        sellingPrice: 250,
        quantity: 999999,
        category: 'Service',
        isService: true,
        servicePricing: 'per_piece',
      },
    ],
    businessTemplate: { modes: ['services'], offerings: [] },
  };
}

describe('laundry garment pricing', () => {
  it('prices different garments independently under the same service', () => {
    let store = makeStore();
    store = setLaundryGarmentPrice(store, 'svc-full', 'Shirt', 600);
    store = setLaundryGarmentPrice(store, 'svc-full', 'Trouser', 900);

    const service = store.products[0];
    const result = calculateLaundryPriceLines(store, service, [
      { garmentType: 'Shirt', quantity: 2 },
      { garmentType: 'Trouser', quantity: 1 },
    ]);

    expect(result.lines).toEqual([
      { garmentType: 'Shirt', quantity: 2, unitPrice: 600, subtotal: 1200 },
      { garmentType: 'Trouser', quantity: 1, unitPrice: 900, subtotal: 900 },
    ]);
    expect(result.total).toBe(2100);
  });

  it('allows the same garment to have a different price for another service', () => {
    let store = makeStore();
    store = setLaundryGarmentPrice(store, 'svc-full', 'Shirt', 700);
    store = setLaundryGarmentPrice(store, 'svc-iron', 'Shirt', 300);

    expect(getLaundryGarmentPrice(store, store.products[0], 'Shirt')).toBe(700);
    expect(getLaundryGarmentPrice(store, store.products[1], 'Shirt')).toBe(300);
  });

  /**
   * An unpriced garment used to fall through to the service's own price, which
   * charged the same for a vest as for a king duvet. That is not a rounding
   * error - it is the shop losing money on every large item until somebody
   * notices. A garment the trade has a going rate for now starts at that rate.
   */
  it('starts a known garment at its usual going rate', () => {
    const store = makeStore();
    expect(getLaundryGarmentPrice(store, store.products[0], 'T-Shirt')).toBe(400);
    expect(getLaundryGarmentPrice(store, store.products[0], 'Large Duvet')).toBe(3000);
  });

  it('still falls back to the service price for something it has never heard of', () => {
    const store = makeStore();
    expect(getLaundryGarmentPrice(store, store.products[0], 'Ankara Headwrap')).toBe(500);
  });

  it('lets the shop overrule the going rate', () => {
    let store = makeStore();
    store = setLaundryGarmentPrice(store, 'svc-full', 'T-Shirt', 250);
    expect(getLaundryGarmentPrice(store, store.products[0], 'T-Shirt')).toBe(250);
  });

  it('publishes the garment price matrix for customer-facing service catalog consumers', () => {
    let store = makeStore();
    store = setLaundryGarmentPrice(store, 'svc-full', 'Shirt', 650);
    const published: any = publishLaundryPricingToTemplate(store);

    const full = published.businessTemplate.offerings.find((item: any) => item.id === 'svc-full');
    expect(full.garmentPrices.Shirt).toBe(650);
    expect(published.businessTemplate.laundryPricing.matrix['svc-full'].Shirt).toBe(650);
  });
});

describe('the going rate a laundry starts from', () => {
  /**
   * Sizes are separate where the work genuinely differs. One price for
   * "bedsheet" makes a shop lose on every king-sized one.
   */
  it('prices by size, not by category', () => {
    expect(defaultGarmentPrice('Single Bedsheet')).toBe(900);
    expect(defaultGarmentPrice('King Bedsheet')).toBe(1300);
    expect(defaultGarmentPrice('Small Duvet')).toBe(2500);
    expect(defaultGarmentPrice('Large Duvet')).toBe(3000);
  });

  it('covers the household washing, not just clothes', () => {
    for (const item of ['Blanket - Large', 'Pillowcase', 'Towel - Large / Bath', 'Wrapper']) {
      expect(defaultGarmentPrice(item), item).not.toBeNull();
    }
  });

  it('covers the native wear a Nigerian laundry is handed', () => {
    expect(defaultGarmentPrice('Agbada - 3 Piece')).toBe(2500);
    expect(defaultGarmentPrice('Senator - 2 Piece')).toBe(1100);
  });

  it('is not upset by how the shop capitalises it', () => {
    expect(defaultGarmentPrice('t-shirt')).toBe(400);
    expect(defaultGarmentPrice('  Jeans  ')).toBe(600);
  });

  it('says nothing for something it has never heard of', () => {
    expect(defaultGarmentPrice('Ankara Headwrap')).toBeNull();
  });
});
