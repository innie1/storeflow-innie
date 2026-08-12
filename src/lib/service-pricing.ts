import type { StoreData, Product } from '@/types/store';

export type ServicePricing = 'fixed' | 'per_piece' | 'per_kg' | 'per_load' | 'per_page' | 'per_hour' | 'per_session' | 'appointment' | 'quote';

export interface ServicePricingOption {
  id: ServicePricing;
  label: string;
  unitLabel: string;
}

const SERVICE_BUSINESS_TYPES = new Set([
  'laundry','barber','salon','tailoring','repair','printing','cyber_cafe','car_wash','photography','cleaning','spa'
]);

export function getServiceBusinessType(store: StoreData): string {
  return String((store as any).businessType || store.storeType || (store as any).businessTemplate?.type || 'other').toLowerCase();
}

export function isServiceBusiness(store: StoreData): boolean {
  const type = getServiceBusinessType(store);
  return SERVICE_BUSINESS_TYPES.has(type) || Boolean((store as any).businessTemplate?.modes?.includes?.('services'));
}

export function getServicePricingOptions(store: StoreData): ServicePricingOption[] {
  const type = getServiceBusinessType(store);
  switch (type) {
    case 'laundry':
      return [
        { id: 'per_piece', label: 'Per piece', unitLabel: '/ piece' },
        { id: 'per_kg', label: 'Per KG', unitLabel: '/ kg' },
        { id: 'per_load', label: 'Per load', unitLabel: '/ load' },
        { id: 'fixed', label: 'Fixed price', unitLabel: '' },
      ];
    case 'printing':
      return [
        { id: 'per_page', label: 'Per page', unitLabel: '/ page' },
        { id: 'fixed', label: 'Fixed price', unitLabel: '' },
      ];
    case 'cyber_cafe':
      return [
        { id: 'per_hour', label: 'Per hour', unitLabel: '/ hour' },
        { id: 'per_page', label: 'Per page', unitLabel: '/ page' },
        { id: 'fixed', label: 'Fixed price', unitLabel: '' },
      ];
    case 'photography':
      return [
        { id: 'per_session', label: 'Per session', unitLabel: '/ session' },
        { id: 'appointment', label: 'Appointment', unitLabel: '' },
        { id: 'quote', label: 'Get a quote', unitLabel: '' },
      ];
    case 'tailoring':
    case 'repair':
      return [
        { id: 'fixed', label: 'Fixed price', unitLabel: '' },
        { id: 'quote', label: 'Get a quote', unitLabel: '' },
        { id: 'appointment', label: 'Appointment', unitLabel: '' },
      ];
    case 'barber':
    case 'salon':
    case 'spa':
      return [
        { id: 'fixed', label: 'Fixed price', unitLabel: '' },
        { id: 'appointment', label: 'Appointment', unitLabel: '' },
      ];
    case 'car_wash':
    case 'cleaning':
      return [
        { id: 'fixed', label: 'Package price', unitLabel: '' },
        { id: 'appointment', label: 'Appointment', unitLabel: '' },
        { id: 'quote', label: 'Get a quote', unitLabel: '' },
      ];
    default:
      return [{ id: 'fixed', label: 'Fixed price', unitLabel: '' }];
  }
}

export function getStoredServicePricing(service: Product): ServicePricing {
  const value = String((service as any).servicePricing || '').toLowerCase() as ServicePricing;
  if (value) return value;
  if (service.unit === 'pcs') return 'per_piece';
  if (service.unit === 'kg') return 'per_kg';
  if (service.unit === 'load') return 'per_load';
  return 'fixed';
}

export function serviceUnitForPricing(pricing: ServicePricing): Product['unit'] | undefined {
  switch (pricing) {
    case 'per_piece': return 'pcs';
    case 'per_kg': return 'kg';
    case 'per_load': return 'load';
    case 'per_page': return 'pcs';
    default: return undefined;
  }
}

export function serviceUnitLabel(pricing: ServicePricing): string {
  return getServicePricingLabel(pricing).unitLabel;
}

export function getServicePricingLabel(pricing: ServicePricing): ServicePricingOption {
  const labels: Record<ServicePricing, ServicePricingOption> = {
    fixed: { id: 'fixed', label: 'Fixed price', unitLabel: '' },
    per_piece: { id: 'per_piece', label: 'Per piece', unitLabel: '/ piece' },
    per_kg: { id: 'per_kg', label: 'Per KG', unitLabel: '/ kg' },
    per_load: { id: 'per_load', label: 'Per load', unitLabel: '/ load' },
    per_page: { id: 'per_page', label: 'Per page', unitLabel: '/ page' },
    per_hour: { id: 'per_hour', label: 'Per hour', unitLabel: '/ hour' },
    per_session: { id: 'per_session', label: 'Per session', unitLabel: '/ session' },
    appointment: { id: 'appointment', label: 'Appointment', unitLabel: '' },
    quote: { id: 'quote', label: 'Get a quote', unitLabel: '' },
  };
  return labels[pricing] || labels.fixed;
}
