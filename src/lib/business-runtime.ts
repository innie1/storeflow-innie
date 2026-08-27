import type { StoreData, TabId } from '@/types/store';
import { BUSINESS_TEMPLATES, type BusinessModule, type BusinessTemplate } from '@/lib/business-templates';

export type CanonicalBusinessType = keyof typeof BUSINESS_TEMPLATES;

const CATEGORY_FALLBACKS: Record<string, CanonicalBusinessType> = {
  games: 'games',
  restaurant: 'restaurant',
  retail: 'provision',
  other: 'other',
};

const TYPE_ALIASES: Record<string, CanonicalBusinessType> = {
  retail: 'provision',
  provision: 'provision',
  provisions: 'provision',
  supermarket: 'provision',
  mini_mart: 'provision',
  minimart: 'provision',
  grocery: 'provision',
  gaming: 'games',
  gaming_centre: 'games',
  gaming_center: 'games',
  dry_cleaning: 'laundry',
  drycleaning: 'laundry',
  chemist: 'pharmacy',
  beauty: 'salon',
  tailor: 'tailoring',
  cybercafe: 'cyber_cafe',
  carwash: 'car_wash',
  cleaning_service: 'cleaning',
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

function normalizeType(value?: string | null): CanonicalBusinessType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (normalized in BUSINESS_TEMPLATES) return normalized as CanonicalBusinessType;
  return TYPE_ALIASES[normalized] || null;
}

export function resolveBusinessType(store?: Partial<StoreData> | null): CanonicalBusinessType {
  // businessType is the cloud-backed canonical field. storeType remains a
  // compatibility mirror for existing local backups and older installations.
  const canonical = normalizeType((store as any)?.businessType as string | undefined);
  if (canonical) return canonical;

  const requested = normalizeType(store?.storeType as string | undefined);
  if (requested) return requested;

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
  if (normalized === 'preparing' || normalized === 'in progress' || normalized === 'in_service') {
    if (resolveBusinessType(store) === 'laundry') return `your laundry order from ${name} is being processed. 🧺`;
    if (template.modes.includes('services') || template.modes.includes('sessions') || template.modes.includes('appointments')) return `your ${template.labels.orderNoun.toLowerCase()} from ${name} is in progress.`;
    return `your ${template.labels.orderNoun.toLowerCase()} from ${name} is being prepared.`;
  }
  if (normalized === 'accepted') return `your ${template.labels.orderNoun.toLowerCase()} from ${name} has been accepted and is being processed. 👍`;
  if (normalized === 'cancelled' || normalized === 'rejected') return `your ${template.labels.orderNoun.toLowerCase()} from ${name} was ${normalized}. We're sorry for the inconvenience.`;
  return `here's an update on your ${template.labels.orderNoun.toLowerCase()} from ${name}.`;
}
