import type { StoreData } from '@/types/store';
import { getServicePricingLabel, getStoredServicePricing } from '@/lib/service-pricing';

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
  const serviceStore = SERVICE_STORE_TYPES.has(String(store.storeType || '').toLowerCase()) || modes.includes('services');

  const activeServices = (store.products || [])
    .filter(product => product.isService === true && product.discontinued !== true)
    .map(product => {
      const pricing = getStoredServicePricing(product);
      const pricingInfo = getServicePricingLabel(pricing);
      return {
        id: String(product.id),
        name: product.name,
        description: product.description || '',
        price: Number(product.sellingPrice || 0),
        sellingPrice: Number(product.sellingPrice || 0),
        pricing,
        unit: (product as any).unit || undefined,
        unitLabel: pricingInfo.unitLabel,
        turnaround: product.turnaround || '',
        garmentPrices: (product as any).garmentPrices,
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
        }
      : template,
  } as StoreData;
}
