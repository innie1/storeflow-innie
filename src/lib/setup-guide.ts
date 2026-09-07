import type { StoreData } from '@/types/store';
import { getBusinessTemplate, isServiceFirstBusiness } from '@/lib/business-runtime';

/**
 * The walk a brand-new shop is taken on.
 *
 * Setup ends with a store that exists and does nothing: no prices, no
 * services, no first job. Everything needed to actually open is behind a tab
 * the owner has never seen, and nothing says which one. The guide dims the app
 * and points at one thing at a time until the shop is ready to trade.
 *
 * Steps are data. Each knows what it is asking for, where to point, and — the
 * important part — how to tell on its own whether it is done, so the guide
 * follows the merchant rather than counting clicks.
 */

export interface GuideStep {
  id: string;
  /** The element to spotlight, matched on data-guide="…". */
  target: string;
  title: string;
  body: string;
  /** Which tab must be open for the target to exist. */
  tab?: string;
  /**
   * True once the merchant has done this.
   *
   * Takes the open tab as well as the store, because the first step of each
   * walk is "get to this screen" — which no amount of looking at the data can
   * tell you. Without it the guide kept pointing at a tab the merchant was
   * already standing on.
   */
  done: (store: StoreData, tab: string) => boolean;
}

const services = (store: StoreData) =>
  (store.products || []).filter(product => product.isService && !product.discontinued);

const hasPrices = (store: StoreData) => {
  const matrix = store.businessTemplate?.laundryPricing?.matrix;
  if (matrix && Object.keys(matrix).length > 0) return true;
  return services(store).some(service => Number(service.sellingPrice || 0) > 0);
};

const hasJob = (store: StoreData) =>
  (store.sales || []).length > 0
  || ((store as unknown as { laundryRecords?: unknown[] }).laundryRecords || []).length > 0;

/** The walk for a shop that sells work rather than goods. */
function serviceSteps(store: StoreData): GuideStep[] {
  const template = getBusinessTemplate(store);
  const noun = template.labels.offeringNoun.toLowerCase();
  const isLaundry = String(store.storeType || '').toLowerCase() === 'laundry';

  return [
    {
      id: 'open-price-list',
      target: 'tab-inventory',
      tab: undefined,
      title: isLaundry ? 'Start with your price list' : `Start with your ${noun}s`,
      body: isLaundry
        ? 'This is where you tell the app what you charge. Nothing else works until it knows your prices.'
        : `This is where your ${noun}s live. Tap here to open it.`,
      done: (store, tab) => tab === 'inventory' || services(store).length > 0 || hasPrices(store),
    },
    {
      id: 'add-service',
      target: 'add-service',
      tab: 'inventory',
      title: isLaundry ? 'Add your first service' : `Add your first ${noun}`,
      body: isLaundry
        ? 'Wash & Iron, Wash Only, Dry Cleaning — whatever you actually offer. You can add the rest later.'
        : `Give it a name and what you charge. One is enough to begin.`,
      done: store => services(store).length > 0,
    },
    {
      id: 'set-price',
      target: 'add-service',
      tab: 'inventory',
      title: 'Put a price on it',
      body: isLaundry
        ? 'Most Nigerian laundries charge per piece. Set what one shirt costs and the app works the rest out.'
        : 'Set what you charge, and the app totals every job for you.',
      done: hasPrices,
    },
    {
      id: 'first-job',
      target: 'tab-laundry-records',
      tab: undefined,
      title: isLaundry ? 'Record your first customer' : 'Record your first job',
      body: isLaundry
        ? 'When someone brings clothes in, this is where they go. Try it once and you have opened for business.'
        : 'Log the first piece of work you take in. That is the shop open.',
      done: hasJob,
    },
  ];
}

/** The walk for a shop that sells goods. */
function productSteps(): GuideStep[] {
  return [
    {
      id: 'open-inventory',
      target: 'tab-inventory',
      title: 'Start with your stock',
      body: 'This is where what you sell lives. Tap here to open it.',
      done: (store, tab) => tab === 'inventory' || (store.products || []).length > 0,
    },
    {
      id: 'add-product',
      target: 'add-service',
      tab: 'inventory',
      title: 'Add your first product',
      body: 'Name it, what it costs you, what you sell it for. One is enough to begin.',
      done: store => (store.products || []).length > 0,
    },
    {
      id: 'first-sale',
      target: 'tab-sales',
      title: 'Make your first sale',
      body: 'Ring up one sale and the shop is open.',
      done: store => (store.sales || []).length > 0,
    },
  ];
}

export function guideSteps(store: StoreData): GuideStep[] {
  return isServiceFirstBusiness(store) ? serviceSteps(store) : productSteps();
}

/** The first step not yet done, or null when the shop is ready to trade. */
export function nextStep(store: StoreData, tab = ''): GuideStep | null {
  return guideSteps(store).find(step => !step.done(store, tab)) || null;
}

export function guideProgress(store: StoreData, tab = ''): { done: number; total: number } {
  const steps = guideSteps(store);
  return { done: steps.filter(step => step.done(store, tab)).length, total: steps.length };
}

const DISMISSED_KEY = 'storeflow_setup_guide_dismissed';
const FINISHED_KEY = 'storeflow_setup_guide_finished';

export function guideDismissed(): boolean {
  try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
}

export function dismissGuide(): void {
  try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* private mode */ }
}

export function restartGuide(): void {
  try {
    localStorage.removeItem(DISMISSED_KEY);
    localStorage.removeItem(FINISHED_KEY);
  } catch { /* private mode */ }
}

/** Whether the "ready for business" moment has already been shown. */
export function celebrationShown(): boolean {
  try { return localStorage.getItem(FINISHED_KEY) === '1'; } catch { return false; }
}

export function markCelebrationShown(): void {
  try { localStorage.setItem(FINISHED_KEY, '1'); } catch { /* private mode */ }
}

/**
 * Whether the guide should be on screen at all.
 *
 * Only for a shop that has not started trading. Once there are prices and a
 * first job it goes away for good, and a merchant who closes it is not asked
 * twice.
 */
export function shouldRunGuide(store: StoreData | null | undefined, tab = ''): boolean {
  if (!store) return false;
  if (guideDismissed()) return false;
  return nextStep(store, tab) !== null;
}
