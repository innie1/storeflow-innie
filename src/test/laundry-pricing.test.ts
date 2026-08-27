import { describe, expect, it } from 'vitest';
import {
  calculateLaundryPriceLines,
  getLaundryGarmentPrice,
  publishLaundryPricingToTemplate,
  setLaundryGarmentPrice,
} from '@/lib/laundry-pricing';

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

  it('keeps old service price as a safe starting price until a garment is customized', () => {
    const store = makeStore();
    expect(getLaundryGarmentPrice(store, store.products[0], 'T-shirt')).toBe(500);
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
