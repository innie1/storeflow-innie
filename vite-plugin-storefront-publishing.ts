import type { Plugin } from 'vite';

const MARKETPLACE_SETTINGS = '/src/components/MarketplaceSettings.tsx';
const LAUNDRY_PRICING = '/src/components/laundry/LaundryPricingSetup.tsx';

export function patchMarketplaceSettings(source: string): string {
  let code = source;
  const existingImport = "import { prepareStoreForMarketplacePublish } from '@/lib/marketplace-publish';";
  const newImport = "import { prepareStoreForMarketplacePublish, publishStorefrontToCloud } from '@/lib/marketplace-publish';";
  if (code.includes(existingImport)) code = code.replace(existingImport, newImport);
  else if (!code.includes('publishStorefrontToCloud')) {
    throw new Error('[storefront-publishing] Marketplace publisher import anchor missing');
  }

  const saveFunction = '  const handleSaveToCloud = async () => {';
  const saveIndex = code.indexOf(saveFunction);
  if (saveIndex < 0) throw new Error('[storefront-publishing] handleSaveToCloud missing');
  const tryAnchor = '    try {';
  const tryIndex = code.indexOf(tryAnchor, saveIndex);
  if (tryIndex < 0) throw new Error('[storefront-publishing] handleSaveToCloud try block missing');
  if (!code.slice(saveIndex, saveIndex + 1800).includes('STOREFLOW_OWNER_STOREFRONT_PUBLISH')) {
    const insertion = `\n      // STOREFLOW_OWNER_STOREFRONT_PUBLISH\n      // Works for both Supabase members and the original StoreFlow owner session.\n      const ownerPublishedStore = await publishStorefrontToCloud(store, form);\n      saveStore(ownerPublishedStore, { skipCloudSync: true });\n      onUpdate(ownerPublishedStore);\n      showToast('Customer storefront updated', 'success');\n      return;\n`;
    code = code.slice(0, tryIndex + tryAnchor.length) + insertion + code.slice(tryIndex + tryAnchor.length);
  }

  const changeIndex = code.indexOf('  const handleChange = (key: keyof typeof settings, val: any) => {');
  if (changeIndex < 0) throw new Error('[storefront-publishing] handleChange missing');
  const nextFunction = code.indexOf('\n  const ', changeIndex + 20);
  const changeEnd = nextFunction > changeIndex ? nextFunction : Math.min(code.length, changeIndex + 5000);
  const changeBlock = code.slice(changeIndex, changeEnd);
  if (!changeBlock.includes('STOREFLOW_AUTO_STOREFRONT_PUBLISH')) {
    const updateAnchor = '    onUpdate(updatedStore);';
    const localIndex = changeBlock.lastIndexOf(updateAnchor);
    if (localIndex < 0) throw new Error('[storefront-publishing] Marketplace onUpdate anchor missing');
    const absolute = changeIndex + localIndex + updateAnchor.length;
    const insertion = `\n    // STOREFLOW_AUTO_STOREFRONT_PUBLISH\n    void publishStorefrontToCloud(updatedStore, updated).catch(error =>\n      console.warn('[StoreFlow Marketplace] Background storefront publish failed:', error)\n    );`;
    code = code.slice(0, absolute) + insertion + code.slice(absolute);
  }
  return code;
}

export function patchLaundryPricing(source: string): string {
  let code = source;
  const pricingImport = "import { getStoredServicePricing, type ServicePricing } from '@/lib/service-pricing';";
  const publishImport = "import { publishStorefrontToCloud } from '@/lib/marketplace-publish';";
  if (!code.includes(publishImport)) {
    if (!code.includes(pricingImport)) throw new Error('[storefront-publishing] Laundry import anchor missing');
    code = code.replace(pricingImport, `${pricingImport}\n${publishImport}`);
  }

  const persistAnchor = /    saveStore\(published\);\r?\n    onUpdate\(published\);/;
  if (persistAnchor.test(code) && !code.includes('STOREFLOW_LAUNDRY_PRICE_PUBLISH')) {
    code = code.replace(persistAnchor, `    saveStore(published);\n    onUpdate(published);\n    // STOREFLOW_LAUNDRY_PRICE_PUBLISH\n    void publishStorefrontToCloud(published).catch(error =>\n      console.warn('[StoreFlow Laundry] Price-list publish failed:', error)\n    );`);
  }

  const effectAnchor = /    const seeded = seedLaundryGarmentPrices\(store\);\r?\n    const published = publishLaundryPricingToTemplate\(seeded\);/;
  if (effectAnchor.test(code) && !code.includes('STOREFLOW_LAUNDRY_OPEN_PUBLISH')) {
    code = code.replace(effectAnchor, match => `${match}\n    // STOREFLOW_LAUNDRY_OPEN_PUBLISH: opening Price List repairs older local-only stores.\n    void publishStorefrontToCloud(published).catch(error =>\n      console.warn('[StoreFlow Laundry] Initial storefront publish failed:', error)\n    );`);
  }
  return code;
}

export default function storefrontPublishingPlugin(): Plugin {
  return {
    name: 'storeflow-storefront-publishing',
    enforce: 'pre',
    transform(code, id) {
      const normalized = id.split('?')[0].replace(/\\/g, '/');
      if (normalized.endsWith(MARKETPLACE_SETTINGS)) return { code: patchMarketplaceSettings(code), map: null };
      if (normalized.endsWith(LAUNDRY_PRICING)) return { code: patchLaundryPricing(code), map: null };
      return null;
    },
  };
}
