import type { Product, StoreData } from '@/types/store';
import {
  DEFAULT_LAUNDRY_GARMENTS,
  sanitizeGarmentSelections,
  type LaundryGarmentSelection,
} from '@/lib/laundry-intake';
import { getStoredServicePricing } from '@/lib/service-pricing';

export interface LaundryPricingConfig {
  version: 1;
  garmentTypes: string[];
  matrix: Record<string, Record<string, number>>;
}

export interface LaundryPriceLine {
  garmentType: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = String(value || '').trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

export function getLaundryServices(store: StoreData): Product[] {
  return (store.products || []).filter(product => product.isService && !product.discontinued);
}

export function getLaundryPricingConfig(store: StoreData): LaundryPricingConfig {
  const raw = (store as any).laundryPricing || {};
  // Defaults are only a first-run starting point. Once a merchant has a
  // garmentTypes array it is authoritative, including renames and removals.
  const garmentTypes = uniqueNames(Array.isArray(raw.garmentTypes)
    ? raw.garmentTypes
    : DEFAULT_LAUNDRY_GARMENTS);
  const matrix = raw.matrix && typeof raw.matrix === 'object' ? raw.matrix : {};
  return { version: 1, garmentTypes, matrix };
}

export function getExplicitLaundryGarmentPrice(store: StoreData, serviceId: string, garmentType: string): number | null {
  const config = getLaundryPricingConfig(store);
  const raw = config.matrix[String(serviceId)]?.[garmentType];
  const price = Number(raw);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

/**
 * Existing stores previously had one service-level per-piece price. Until the
 * merchant customises a garment row, that old price remains the fallback so
 * upgrading does not suddenly make existing laundry prices zero.
 */
export function getLaundryGarmentPrice(store: StoreData, service: Product, garmentType: string): number {
  const explicit = getExplicitLaundryGarmentPrice(store, String(service.id), garmentType);
  if (explicit !== null) return explicit;
  return Math.max(0, Number(service.sellingPrice) || 0);
}

export function setLaundryGarmentPrice(store: StoreData, serviceId: string, garmentType: string, price: number): StoreData {
  const config = getLaundryPricingConfig(store);
  const cleanName = garmentType.trim();
  const cleanPrice = Math.max(0, Number(price) || 0);
  const garmentTypes = uniqueNames([...config.garmentTypes, cleanName]);
  return {
    ...(store as any),
    laundryPricing: {
      version: 1,
      garmentTypes,
      matrix: {
        ...config.matrix,
        [String(serviceId)]: {
          ...(config.matrix[String(serviceId)] || {}),
          [cleanName]: cleanPrice,
        },
      },
    },
  } as StoreData;
}

export function addLaundryGarmentType(store: StoreData, garmentType: string): StoreData {
  const config = getLaundryPricingConfig(store);
  const cleanName = garmentType.trim();
  if (!cleanName) return store;
  return {
    ...(store as any),
    laundryPricing: {
      ...config,
      garmentTypes: uniqueNames([...config.garmentTypes, cleanName]),
    },
  } as StoreData;
}

export function renameLaundryGarmentType(store: StoreData, oldName: string, newName: string): StoreData {
  const config = getLaundryPricingConfig(store);
  const cleanOld = oldName.trim();
  const cleanNew = newName.trim();
  if (!cleanOld || !cleanNew || cleanOld === cleanNew) return store;
  if (config.garmentTypes.some(name => name.toLowerCase() === cleanNew.toLowerCase() && name.toLowerCase() !== cleanOld.toLowerCase())) {
    return store;
  }

  const matrix = Object.fromEntries(Object.entries(config.matrix).map(([serviceId, prices]) => {
    const nextPrices = { ...prices };
    const previousPrice = nextPrices[cleanOld];
    delete nextPrices[cleanOld];
    if (previousPrice !== undefined) nextPrices[cleanNew] = previousPrice;
    return [serviceId, nextPrices];
  }));

  return {
    ...(store as any),
    laundryPricing: {
      version: 1,
      garmentTypes: config.garmentTypes.map(name => name === cleanOld ? cleanNew : name),
      matrix,
    },
  } as StoreData;
}

export function removeLaundryGarmentType(store: StoreData, garmentType: string): StoreData {
  const config = getLaundryPricingConfig(store);
  const cleanName = garmentType.trim();
  const matrix = Object.fromEntries(Object.entries(config.matrix).map(([serviceId, prices]) => {
    const nextPrices = { ...prices };
    delete nextPrices[cleanName];
    return [serviceId, nextPrices];
  }));

  return {
    ...(store as any),
    laundryPricing: {
      version: 1,
      garmentTypes: config.garmentTypes.filter(name => name !== cleanName),
      matrix,
    },
  } as StoreData;
}

export function seedLaundryGarmentPrices(store: StoreData): StoreData {
  const config = getLaundryPricingConfig(store);
  let changed = false;
  const matrix = { ...config.matrix };
  for (const service of getLaundryServices(store)) {
    const serviceId = String(service.id);
    const current = { ...(matrix[serviceId] || {}) };
    for (const garment of config.garmentTypes) {
      if (Number.isFinite(Number(current[garment]))) continue;
      current[garment] = Math.max(0, Number(service.sellingPrice) || 0);
      changed = true;
    }
    matrix[serviceId] = current;
  }
  if (!changed && (store as any).laundryPricing) return store;
  return {
    ...(store as any),
    laundryPricing: { version: 1, garmentTypes: config.garmentTypes, matrix },
  } as StoreData;
}

export function calculateLaundryPriceLines(
  store: StoreData,
  service: Product,
  selections: LaundryGarmentSelection[],
  billingQuantity = 1,
): { lines: LaundryPriceLine[]; total: number } {
  const clean = sanitizeGarmentSelections(selections);
  const pricing = getStoredServicePricing(service);

  if (pricing === 'per_piece') {
    const lines = clean.map(item => {
      const unitPrice = getLaundryGarmentPrice(store, service, item.garmentType);
      return {
        garmentType: item.garmentType,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
      };
    });
    return { lines, total: lines.reduce((sum, line) => sum + line.subtotal, 0) };
  }

  const base = Math.max(0, Number(service.sellingPrice) || 0);
  const total = pricing === 'per_kg' || pricing === 'per_load'
    ? base * Math.max(0, Number(billingQuantity) || 0)
    : base;
  return {
    lines: clean.map(item => ({ garmentType: item.garmentType, quantity: item.quantity, unitPrice: 0, subtotal: 0 })),
    total,
  };
}

export function attachLaundryPrices(
  store: StoreData,
  service: Product,
  selections: LaundryGarmentSelection[],
): LaundryGarmentSelection[] {
  return sanitizeGarmentSelections(selections).map(item => {
    const unitPrice = getLaundryGarmentPrice(store, service, item.garmentType);
    return { ...item, unitPrice, subtotal: unitPrice * item.quantity };
  });
}

export function publishLaundryPricingToTemplate(store: StoreData): StoreData {
  const config = getLaundryPricingConfig(store);
  const current = ((store as any).businessTemplate || {}) as any;
  const currentModes = Array.isArray(current.modes) ? current.modes : [];
  const offerings = getLaundryServices(store).map(service => {
    const prices = config.matrix[String(service.id)] || {};
    const configured = Object.values(prices).map(Number).filter(value => Number.isFinite(value) && value > 0);
    const fromPrice = configured.length ? Math.min(...configured) : Math.max(0, Number(service.sellingPrice) || 0);
    return {
      id: String(service.id),
      name: service.name,
      description: (service as any).description || '',
      price: fromPrice,
      sellingPrice: fromPrice,
      pricing: getStoredServicePricing(service),
      unit: service.unit || 'pcs',
      unitLabel: getStoredServicePricing(service) === 'per_piece' ? '/ item' : '',
      turnaround: service.turnaround || '',
      enabled: !service.discontinued,
      active: !service.discontinued,
      garmentPrices: prices,
    };
  });
  return {
    ...(store as any),
    businessTemplate: {
      ...current,
      modes: Array.from(new Set([...currentModes, 'services'])),
      offerings,
      laundryPricing: config,
    },
  } as StoreData;
}
