import type { StoreData } from '@/types/store';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';
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

/**
 * Whether anything the shop still offers has a price on it.
 *
 * The garment matrix is keyed by service id and keeps rows for services that
 * have since been deleted, so counting its keys reported prices for a shop
 * with no services at all — and the walk skipped a step it had not done.
 */
const hasPrices = (store: StoreData) => {
  const live = services(store);
  if (live.some(service => Number(service.sellingPrice || 0) > 0)) return true;
  const matrix = store.businessTemplate?.laundryPricing?.matrix || {};
  return live.some(service => {
    const row = matrix[service.id];
    return !!row && Object.values(row).some(price => Number(price || 0) > 0);
  });
};

/**
 * Whether the shop has taken in any work at all.
 *
 * Laundry intake does not write to `store.laundryRecords` — there is no such
 * field. Records live in their own localStorage bucket, keyed by access code,
 * and a walk-in with no deposit books no sale either. Reading the store alone
 * meant this never became true for a laundry, so the walk sat on its last step
 * forever however many bundles were recorded.
 */
const hasJob = (store: StoreData) => {
  if ((store.sales || []).length > 0) return true;
  const accessCode = String(store.accessCode || '');
  return accessCode ? getLocalLaundryRecords(accessCode).length > 0 : false;
};

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
      id: 'open-intake',
      target: isLaundry ? 'tab-laundry-records' : 'tab-orders',
      title: isLaundry ? 'Open Intake' : 'Open Orders',
      body: isLaundry
        ? 'This is where clothes go when someone brings them in. Tap here.'
        : 'This is where work you take in is logged. Tap here.',
      done: (store, tab) => tab === (isLaundry ? 'laundry-records' : 'orders') || hasJob(store),
    },
    {
      // Pointed at the button that starts a job, not at the tab. Aimed at the
      // tab, this step went on spotlighting a tab the merchant was already
      // standing on: tapping it changed nothing, and the walk could not be
      // finished.
      id: 'first-job',
      target: 'record-job',
      tab: isLaundry ? 'laundry-records' : 'orders',
      title: isLaundry ? 'Record your first customer' : 'Record your first job',
      body: isLaundry
        ? 'Try it once with a real bundle and you have opened for business.'
        : 'Log the first piece of work you take in. That is the shop open.',
      done: hasJob,
    },
  ];
}

/**
 * The walk for a gaming centre.
 *
 * It used to get the retail walk, which opens "Start with your stock. This is
 * where what you sell lives" - to a business that sells time on a PlayStation.
 * Worse, a gaming centre's tabs are Home, History, Analytics and Games: it has
 * no inventory tab and no sales tab, so all four steps pointed at things that
 * do not exist. Every one of them dimmed the screen and lit nothing.
 *
 * Its own walk is short because most of it is already done: the template seeds
 * the games, so the only thing a new centre has genuinely not done is put a
 * player on a machine.
 */
function gamesSteps(): GuideStep[] {
  const priced = (store: StoreData) => (store.games || []).some(game => Number((game as any).price || 0) > 0);
  const played = (store: StoreData) => ((store as any).gameSessions || []).length > 0;

  return [
    {
      id: 'games-priced',
      target: 'tab-games-settings',
      title: 'Check what each game costs',
      body: 'Your machines are listed already. Set what a player pays and the app totals every session.',
      done: (store, tab) => tab === 'games-settings' || priced(store),
    },
    {
      id: 'first-session',
      target: 'start-session',
      tab: 'games-dashboard',
      title: 'Start your first session',
      body: 'Tap Play on any machine when someone sits down. That is the floor open.',
      done: played,
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
      id: 'open-sales',
      target: 'tab-sales',
      title: 'Open the till',
      body: 'This is where you ring up a sale. Tap here.',
      done: (store, tab) => tab === 'sales' || (store.sales || []).length > 0,
    },
    {
      id: 'first-sale',
      target: 'record-job',
      tab: 'sales',
      title: 'Make your first sale',
      body: 'Ring up one sale and the shop is open.',
      done: store => (store.sales || []).length > 0,
    },
  ];
}

export function guideSteps(store: StoreData): GuideStep[] {
  // Checked before the service test: a gaming centre lists 'products' among
  // its modes, so it fell through to the retail walk despite selling sessions.
  if (String(store.storeType || store.category || '').toLowerCase() === 'games') return gamesSteps();
  return isServiceFirstBusiness(store) ? serviceSteps(store) : productSteps();
}

/** The first step not yet done, or null when the shop is ready to trade. */
export function nextStep(store: StoreData, tab = ''): GuideStep | null {
  return guideSteps(store).find(step => !step.done(store, tab)) || null;
}

/**
 * Where the merchant is in the walk.
 *
 * `index` is the position of the step they are actually on, not a count of
 * everything ticked off. Counting told someone adding their first service that
 * they were on "Step 3 of 5", because a later step happened to be satisfied
 * already.
 */
export function guideProgress(store: StoreData, tab = ''): { done: number; total: number; index: number } {
  const steps = guideSteps(store);
  const current = steps.findIndex(step => !step.done(store, tab));
  return {
    done: steps.filter(step => step.done(store, tab)).length,
    total: steps.length,
    index: current === -1 ? steps.length : current,
  };
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
