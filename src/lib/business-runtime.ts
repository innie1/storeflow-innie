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

/**
 * What every screen needs from the trade it is opened in.
 *
 * This was a partial list, and anything missing from it was allowed. So
 * laundry-records - a screen only a laundry has - was open to every trade, and
 * each new trade-only screen was open by default until somebody remembered to
 * restrict it. A screen reached by a link, or remembered from the last shop,
 * could then draw another trade's work in this one.
 *
 * The list is complete now, and TypeScript will not compile a new TabId that
 * is missing from it. A screen nobody has classified is closed, not open.
 *
 *   'always'   - the app itself: home, settings, messages, the owner's tools.
 *   'laundry'  - only a laundry.
 *   'games'    - only a games shop.
 *   'priced'   - anything that keeps a price list: stock shops, and service
 *                shops that price their work.
 *   [modules]  - allowed when the trade has one of these capabilities.
 */
type TabPolicy = BusinessModule[] | 'always' | 'laundry' | 'games' | 'priced';

export const TAB_POLICY: Record<TabId, TabPolicy> = {
  dashboard: 'always',
  manager: 'always',
  settings: 'always',
  'communication-center': 'always',
  'activity-log': 'always',
  goals: 'always',
  diary: 'always',
  documents: 'always',
  academy: 'always',
  achievements: 'always',
  'qr-hub': 'always',
  profile: 'always',
  more: 'always',

  inventory: 'priced',
  sales: ['sales'],
  orders: ['orders'],
  customers: ['customers'],
  suppliers: ['suppliers'],
  marketplace: ['inventory'],
  wishlist: ['inventory'],
  staff: ['staff'],
  expenses: ['finance'],
  pending: ['finance'],
  roi: ['finance'],
  finance: ['finance'],
  history: ['reports'],
  reports: ['reports'],
  'cash-drawer': ['sales'],

  'laundry-records': 'laundry',
  'games-dashboard': 'games',
  'games-history': 'games',
  'games-analytics': 'games',
  'games-settings': 'games',
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
  const policy = TAB_POLICY[tabId];
  // A screen nobody has classified belongs to nobody.
  if (!policy) return false;
  if (policy === 'always') return true;

  if (policy === 'laundry' || policy === 'games') return resolveBusinessType(store) === policy;

  if (policy === 'priced') {
    const template = getBusinessTemplate(store);
    return template.modules.includes('inventory') || isServiceFirstBusiness(store);
  }

  const modules = getBusinessTemplate(store).modules;
  return policy.some(module => modules.includes(module));
}

/**
 * Whether this shop serves customers over a till.
 *
 * A laundry, a barber and a tailor take money at a counter but never open a
 * cash drawer, float it or tally a shift against it. The 'sales' module is
 * what separates the two, and several screens were each keeping their own list
 * of trade names to decide the same thing.
 */
export function runsATill(store?: Partial<StoreData> | null): boolean {
  return hasBusinessModule(store, 'sales');
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
