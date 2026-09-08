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
      title: isLaundry ? 'Try taking a bundle in' : 'Record your first job',
      body: isLaundry
        ? 'Walk through it once. Nothing is saved — this is only to show you how.'
        : 'Log the first piece of work you take in. That is the shop open.',
      // Practised, or actually traded. Either finishes the walk, because a
      // shop that has already taken real work in does not need the rehearsal.
      done: store => hasJob(store) || hasPractised(store.accessCode),
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

/*
 * Both flags are per shop.
 *
 * They were single global keys, so the first store to finish setup switched
 * the walk off for every store on the device - and, worse, spent the "ready
 * for business" moment on behalf of all of them. Open a second laundry and it
 * got no guide and no celebration, having done nothing. Somebody trying the
 * app out with a few shops would see it once and never again, which is exactly
 * how it was reported: the training finished and nothing happened.
 *
 * Each shop earns its own.
 */
/*
 * The last step is a rehearsal, so it cannot be judged by what it leaves
 * behind.
 *
 * Recording a bundle during the walk used to create a real one: a real job in
 * the records, a real customer, real money in the day's takings. Somebody
 * sitting at home learning the app ended up with an invented customer in their
 * books and takings that never happened. The service they set up is real setup
 * and stays; the bundle is only practice.
 *
 * Which means completion has to be recorded rather than inferred - there is
 * nothing left over to look for.
 */
const PRACTISED_PREFIX = 'storeflow_setup_guide_practised_';
const DISMISSED_PREFIX = 'storeflow_setup_guide_dismissed_';
const FINISHED_PREFIX = 'storeflow_setup_guide_finished_';

/** The old global keys, still honoured for the shop that set them. */
const LEGACY_DISMISSED = 'storeflow_setup_guide_dismissed';
const LEGACY_FINISHED = 'storeflow_setup_guide_finished';

const shopKey = (prefix: string, accessCode?: string) =>
  `${prefix}${String(accessCode || '').toUpperCase()}`;

function readFlag(prefix: string, legacy: string, accessCode?: string): boolean {
  try {
    if (localStorage.getItem(shopKey(prefix, accessCode)) === '1') return true;
    /*
     * A merchant already trading when this changed must not be shown the walk
     * again, so the old global key still counts - but only until they finish
     * or dismiss on this shop, which writes the per-shop one.
     */
    return localStorage.getItem(legacy) === '1';
  } catch {
    return false;
  }
}

export function markPractised(accessCode?: string): void {
  try { localStorage.setItem(shopKey(PRACTISED_PREFIX, accessCode), '1'); } catch { /* private mode */ }
}

export function hasPractised(accessCode?: string): boolean {
  try { return localStorage.getItem(shopKey(PRACTISED_PREFIX, accessCode)) === '1'; } catch { return false; }
}

export function guideDismissed(accessCode?: string): boolean {
  return readFlag(DISMISSED_PREFIX, LEGACY_DISMISSED, accessCode);
}

export function dismissGuide(accessCode?: string): void {
  try { localStorage.setItem(shopKey(DISMISSED_PREFIX, accessCode), '1'); } catch { /* private mode */ }
}

export function restartGuide(accessCode?: string): void {
  try {
    localStorage.removeItem(shopKey(DISMISSED_PREFIX, accessCode));
    localStorage.removeItem(shopKey(FINISHED_PREFIX, accessCode));
    localStorage.removeItem(shopKey(PRACTISED_PREFIX, accessCode));
    // The global ones would otherwise keep the walk switched off for ever.
    localStorage.removeItem(LEGACY_DISMISSED);
    localStorage.removeItem(LEGACY_FINISHED);
  } catch { /* private mode */ }
}

/** Whether this shop's "ready for business" moment has already been shown. */
export function celebrationShown(accessCode?: string): boolean {
  return readFlag(FINISHED_PREFIX, LEGACY_FINISHED, accessCode);
}

export function markCelebrationShown(accessCode?: string): void {
  try { localStorage.setItem(shopKey(FINISHED_PREFIX, accessCode), '1'); } catch { /* private mode */ }
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
  if (guideDismissed(store.accessCode)) return false;
  return nextStep(store, tab) !== null;
}
