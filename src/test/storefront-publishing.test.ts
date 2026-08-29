import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareStoreForMarketplacePublish } from '@/lib/marketplace-publish';
import { patchLaundryPricing, patchMarketplaceSettings } from '../../vite-plugin-storefront-publishing';

describe('customer storefront publishing', () => {
  it('publishes the exact laundry garment matrix instead of an empty product-level price map', () => {
    const store: any = {
      accessCode: 'AMZXWE',
      storeName: 'Washlie',
      storeType: 'laundry',
      products: [
        {
          id: 'wash-iron',
          name: 'Wash & Iron',
          sellingPrice: 1000,
          quantity: 999,
          isService: true,
          discontinued: false,
          servicePricing: 'per_piece',
        },
      ],
      laundryPricing: {
        garmentTypes: ['Shirt', 'Trouser'],
        matrix: {
          'wash-iron': { Shirt: 700, Trouser: 900 },
        },
      },
      businessTemplate: { type: 'laundry', modes: ['services'] },
    };

    const published: any = prepareStoreForMarketplacePublish(store, { marketplaceListingEnabled: true });
    expect(published.businessTemplate.offerings).toHaveLength(1);
    expect(published.businessTemplate.offerings[0].garmentPrices).toEqual({ Shirt: 700, Trouser: 900 });
    expect(published.businessTemplate.laundryPricing.matrix['wash-iron'].Shirt).toBe(700);
  });

  it('wires Marketplace settings to publish for original StoreFlow owner sessions too', () => {
    const source = fs.readFileSync('src/components/MarketplaceSettings.tsx', 'utf8');
    const transformed = patchMarketplaceSettings(source);
    expect(transformed).toContain('publishStorefrontToCloud');
    expect(transformed).toContain('STOREFLOW_OWNER_STOREFRONT_PUBLISH');
    expect(transformed).toContain('STOREFLOW_AUTO_STOREFRONT_PUBLISH');
  });

  it('publishes a laundry price list when it opens and whenever prices change', () => {
    const source = fs.readFileSync('src/components/laundry/LaundryPricingSetup.tsx', 'utf8');
    const transformed = patchLaundryPricing(source);
    expect(transformed).toContain('STOREFLOW_LAUNDRY_OPEN_PUBLISH');
    expect(transformed).toContain('STOREFLOW_LAUNDRY_PRICE_PUBLISH');
    expect(transformed).toContain('publishStorefrontToCloud(published)');
  });

  it('keeps owner publishing scoped and password/member authorized in the migration', () => {
    const migration = fs.readFileSync('supabase/migrations/20260829070000_publish_storefront_from_owner_session.sql', 'utf8');
    expect(migration).toContain('public.is_store_member(v_store.id)');
    expect(migration).toContain('v_store.owner_password = p_owner_password');
    expect(migration).toContain("jsonb_set(v_data, '{businessTemplate}'");
    expect(migration).toContain("jsonb_set(v_data, '{laundryPricing}'");
  });
});
