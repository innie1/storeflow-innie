import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { prepareStoreForMarketplacePublish } from '@/lib/marketplace-publish';
import { readSource } from './helpers/source';

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
    const source = readSource('src/components/MarketplaceSettings.tsx');
    expect(source).toContain('publishStorefrontToCloud');
    expect(source).toContain('STOREFLOW_OWNER_STOREFRONT_PUBLISH');
    expect(source).toContain('STOREFLOW_AUTO_STOREFRONT_PUBLISH');
  });

  it('publishes a laundry price list when it opens and whenever prices change', () => {
    const source = readSource('src/components/laundry/LaundryPricingSetup.tsx');
    expect(source).toContain('STOREFLOW_LAUNDRY_OPEN_PUBLISH');
    expect(source).toContain('STOREFLOW_LAUNDRY_PRICE_PUBLISH');
    expect(source).toContain('publishStorefrontToCloud(published)');
  });

  it('keeps every garment edit and delete handler wired up', () => {
    const source = readSource('src/components/laundry/LaundryPricingSetup.tsx');
    expect(source).toContain('const beginGarmentRename = (garment: string) =>');
    expect(source).toContain('const saveGarmentName = () =>');
    expect(source).toContain('const removeGarment = (garment: string) =>');
    expect(source).toContain('onClick={() => beginGarmentRename(garment)}');
    expect(source).toContain('onClick={() => removeGarment(garment)}');
  });

  it('sends the business name the publish RPC needs to create a missing store row', () => {
    const source = readSource('src/lib/marketplace-publish.ts');
    expect(source).toContain('p_business_name');
    expect(source).toContain('p_business_type');
  });

  it('keeps owner publishing scoped and password/member authorized in the migration', () => {
    const migration = fs.readFileSync(
      'supabase/migrations/20260904000000_publish_storefront_from_owner_upsert.sql',
      'utf8',
    );
    expect(migration).toContain('public.is_store_member(v_store.id)');
    expect(migration).toContain('v_store.owner_password = p_owner_password');
    expect(migration).toContain("jsonb_set(v_data, '{businessTemplate}'");
    expect(migration).toContain("jsonb_set(v_data, '{laundryPricing}'");
  });

  it('creates the store row on a first publish instead of raising Store not found', () => {
    const migration = fs.readFileSync(
      'supabase/migrations/20260904000000_publish_storefront_from_owner_upsert.sql',
      'utf8',
    );
    expect(migration).toContain('insert into public.stores');
    expect(migration).toContain('on conflict (access_code) do nothing');
    // The authorization check must still guard the update path.
    expect(migration).toContain("raise exception 'Not authorized for this store'");
  });
});
