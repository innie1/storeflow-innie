import type { StoreData } from '@/types/store';
import { getServicePricingLabel, getStoredServicePricing } from '@/lib/service-pricing';
import { supabase } from '@/integrations/supabase/client';

const SERVICE_STORE_TYPES = new Set([
  'laundry', 'barber', 'salon', 'tailoring', 'repair', 'printing',
  'cyber_cafe', 'car_wash', 'photography', 'cleaning', 'spa', 'games', 'gaming',
]);

/** Build the exact public catalog that belongs to this merchant store. */
export function prepareStoreForMarketplacePublish(
  store: StoreData,
  marketplaceSettings: Record<string, unknown>,
): StoreData {
  const template = ((store as any).businessTemplate || {}) as Record<string, any>;
  const modes = Array.isArray(template.modes) ? template.modes : [];
  const storeType = String(store.storeType || '').toLowerCase();
  const serviceStore = SERVICE_STORE_TYPES.has(storeType) || modes.includes('services');
  const laundryPricing = (store as any).laundryPricing || template.laundryPricing || {};
  const laundryMatrix = laundryPricing?.matrix || {};

  const activeServices = (store.products || [])
    .filter(product => product.isService === true && product.discontinued !== true)
    .map(product => {
      const pricing = getStoredServicePricing(product);
      const pricingInfo = getServicePricingLabel(pricing);
      const serviceId = String(product.id);
      return {
        id: serviceId,
        name: product.name,
        description: product.description || '',
        price: Number(product.sellingPrice || 0),
        sellingPrice: Number(product.sellingPrice || 0),
        pricing,
        unit: (product as any).unit || undefined,
        unitLabel: pricingInfo.unitLabel,
        turnaround: product.turnaround || '',
        garmentPrices: storeType === 'laundry'
          ? (laundryMatrix[serviceId] || (product as any).garmentPrices || {})
          : (product as any).garmentPrices,
        serviceWorkflow: (product as any).serviceWorkflow,
        enabled: true,
        active: true,
        discontinued: false,
      };
    });

  return {
    ...store,
    marketplaceSettings: { ...marketplaceSettings },
    businessTemplate: serviceStore
      ? {
          ...template,
          modes: Array.from(new Set([...modes, 'services'])),
          offerings: activeServices,
          ...(storeType === 'laundry' ? { laundryPricing } : {}),
        }
      : template,
  } as StoreData;
}

/**
 * Publish only customer-facing storefront fields.
 *
 * Cloud ownership is proved exclusively by the current Supabase Auth session.
 * The local StoreFlow owner password/PIN is deliberately never sent to Supabase
 * and is not a cloud credential.
 */
export async function publishStorefrontToCloud(
  store: StoreData,
  marketplaceSettings: Record<string, unknown> = ((store as any).marketplaceSettings || {}),
): Promise<StoreData> {
  const published = prepareStoreForMarketplacePublish(store, marketplaceSettings);
  const businessTemplate = (published as any).businessTemplate || {};
  const laundryPricing = (published as any).laundryPricing || businessTemplate.laundryPricing || {};
  const accessCode = String(store.accessCode || '').trim();

  if (!accessCode) throw new Error('This store has no access code, so its storefront cannot be published.');

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user?.id) {
    throw new Error('Sign in to your StoreFlow cloud account before publishing this storefront.');
  }

  const { error } = await (supabase as any).rpc('publish_storefront_authenticated', {
    p_access_code: accessCode,
    p_marketplace_settings: (published as any).marketplaceSettings || {},
    p_business_template: businessTemplate,
    p_laundry_pricing: laundryPricing,
    p_business_name: store.storeName || 'My Store',
    p_business_type: store.category || 'retail',
  });
  if (error) {
    if (/authoriz|permission|42501|owner/i.test(String(error.message || error.code || ''))) {
      throw new Error('This cloud account is not the owner of this store. Sign in with the owner account and try again.');
    }
    throw error;
  }
  return published;
}
