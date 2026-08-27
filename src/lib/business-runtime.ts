import type { StoreData, TabId } from '@/types/store';
import { BUSINESS_TEMPLATES, type BusinessModule, type BusinessTemplate } from '@/lib/business-templates';

export type CanonicalBusinessType = keyof typeof BUSINESS_TEMPLATES;

const CATEGORY_FALLBACKS: Record<string, CanonicalBusinessType> = {
  games: 'games',
  restaurant: 'restaurant',
  retail: 'provision',
  other: 'other',
};

const TAB_REQUIREMENTS: Partial<Record<TabId, BusinessModule[]>> = {
  orders: ['orders'],
  sales: ['sales'],
  customers: ['customers'],
  suppliers: ['suppliers'],
  marketplace: ['inventory'],
  wishlist: ['inventory'],
  staff: ['staff'],
  expenses: ['finance'],
  pending: ['finance'],
  'cash-drawer': ['finance'],
  roi: ['finance'],
  history: ['reports'],
};

export function resolveBusinessType(store?: Partial<StoreData> | null): CanonicalBusinessType {
  const requested = store?.storeType as string | undefined;
  if (requested && requested in BUSINESS_TEMPLATES) return requested as CanonicalBusinessType;
  const category = store?.category as string | undefined;
  if (category && CATEGORY_FALLBACKS[category]) return CATEGORY_FALLBACKS[category];
  return 'other';
}

export function getBusinessTemplate(store?: Partial<StoreData> | null): BusinessTemplate {
  return BUSINESS_TEMPLATES[resolveBusinessType(store)] || BUSINESS_TEMPLATES.other;
}

export function hasBusinessModule(store: Partial<StoreData> | null | undefined, module: BusinessModule): boolean {
  return getBusinessTemplate(store).modules.includes(module);
}

export function isServiceFirstBusiness(store?: Partial<StoreData> | null): boolean {
  const template = getBusinessTemplate(store);
  return template.modes.includes('services') && !template.modules.includes('inventory');
}

export function getPrimaryInventoryLabel(store?: Partial<StoreData> | null): string {
  return isServiceFirstBusiness(store) ? 'Services' : 'Inventory';
}

export function isBusinessTabAllowed(store: Partial<StoreData> | null | undefined, tabId: TabId): boolean {
  if (tabId === 'dashboard' || tabId === 'manager' || tabId === 'settings' || tabId === 'communication-center' || tabId === 'goals' || tabId === 'diary' || tabId === 'documents' || tabId === 'academy' || tabId === 'achievements' || tabId === 'qr-hub' || tabId === 'profile' || tabId === 'more') return true;

  const type = resolveBusinessType(store);
  if (tabId.startsWith('games-')) return type === 'games';

  if (tabId === 'inventory') {
    const template = getBusinessTemplate(store);
    return template.modules.includes('inventory') || isServiceFirstBusiness(store);
  }

  const required = TAB_REQUIREMENTS[tabId];
  if (!required) return true;
  const modules = getBusinessTemplate(store).modules;
  return required.some(module => modules.includes(module));
}

export function shouldRunRetailRestockEngine(store?: Partial<StoreData> | null): boolean {
  return hasBusinessModule(store, 'inventory') && hasBusinessModule(store, 'suppliers');
}

export function getOrderProgressText(store: Partial<StoreData> | null | undefined, status: string): string {
  const template = getBusinessTemplate(store);
  const name = store?.storeName || 'the business';
  const normalized = status.trim().toLowerCase();
  if (normalized === 'ready') return `your ${template.labels.orderNoun.toLowerCase()} from ${name} is ready! 🎉`;
  if (normalized === 'completed' || normalized === 'collected') return `your ${template.labels.orderNoun.toLowerCase()} from ${name} has been completed. ✅ Thank you for your patronage!`;
  if (normalized === 'preparing') {
    if (resolveBusinessType(store) === 'laundry') return `your laundry order from ${name} is being processed. 🧺`;
    if (template.modes.includes('services')) return `your ${template.labels.orderNoun.toLowerCase()} from ${name} is being worked on.`;
    return `your ${template.labels.orderNoun.toLowerCase()} from ${name} is being prepared.`;
  }
  if (normalized === 'accepted') return `your ${template.labels.orderNoun.toLowerCase()} from ${name} has been accepted and is being processed. 👍`;
  if (normalized === 'cancelled' || normalized === 'rejected') return `your ${template.labels.orderNoun.toLowerCase()} from ${name} was ${normalized}. We're sorry for the inconvenience.`;
  return `here's an update on your ${template.labels.orderNoun.toLowerCase()} from ${name}.`;
}
