import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('laundry customer price-list connection', () => {
  it('opens the garment price editor from the merchant Price List tab', () => {
    const index = fs.readFileSync('src/pages/Index.tsx', 'utf8');
    expect(index).toContain("import LaundryPricingSetup from '@/components/laundry/LaundryPricingSetup'");
    expect(index).toContain("label: 'Price List'");
    expect(index).toContain('<LaundryPricingSetup store={store} onUpdate={setStore} currentUser={currentUser} />');
  });

  it('keeps the store-specific garment and service editor behind that tab', () => {
    const setup = fs.readFileSync('src/components/laundry/LaundryPricingSetup.tsx', 'utf8');
    expect(setup).toContain('Add your first laundry service');
    expect(setup).toContain('config.garmentTypes.map');
    expect(setup).toContain('publishLaundryPricingToTemplate(next)');
  });
});
