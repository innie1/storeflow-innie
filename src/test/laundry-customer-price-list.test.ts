import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { getLaundryPricingConfig, removeLaundryGarmentType, renameLaundryGarmentType } from '@/lib/laundry-pricing';

describe('laundry customer price-list connection', () => {
  it('opens the garment price editor from the merchant Price List tab', () => {
    const index = fs.readFileSync('src/pages/Index.tsx', 'utf8');
    expect(index).toContain("import LaundryPricingSetup from '@/components/laundry/LaundryPricingSetup'");
    // The tab label is chosen per business type: laundry sees "Price List",
    // every other service business sees "Services".
    expect(index).toContain("businessType === 'laundry' ? 'Price List' : 'Services'");
    expect(index).toContain('<LaundryPricingSetup store={store} onUpdate={setStore} currentUser={currentUser} />');
  });

  it('keeps the store-specific garment and service editor behind that tab', () => {
    const setup = fs.readFileSync('src/components/laundry/LaundryPricingSetup.tsx', 'utf8');
    expect(setup).toContain('Add your first laundry service');
    expect(setup).toContain('config.garmentTypes.map');
    expect(setup).toContain('publishLaundryPricingToTemplate(next)');
    expect(setup).toContain('beginGarmentRename(garment)');
    expect(setup).toContain('removeGarment(garment)');
  });

  it('keeps merchant garment renames and removals authoritative', () => {
    const store = {
      products: [],
      laundryPricing: {
        version: 1,
        garmentTypes: ['Shirt', 'Gown / Dress'],
        matrix: {
          full: { Shirt: 500, 'Gown / Dress': 900 },
          iron: { Shirt: 250, 'Gown / Dress': 450 },
        },
      },
    } as any;

    const renamed = renameLaundryGarmentType(store, 'Gown / Dress', 'Evening Wear');
    expect(getLaundryPricingConfig(renamed).garmentTypes).toEqual(['Shirt', 'Evening Wear']);
    expect((renamed as any).laundryPricing.matrix.full['Evening Wear']).toBe(900);
    expect((renamed as any).laundryPricing.matrix.iron['Evening Wear']).toBe(450);

    const removed = removeLaundryGarmentType(renamed, 'Shirt');
    expect(getLaundryPricingConfig(removed).garmentTypes).toEqual(['Evening Wear']);
    expect((removed as any).laundryPricing.matrix.full.Shirt).toBeUndefined();
  });
});
