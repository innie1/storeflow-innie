import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dismissGuide,
  guideProgress,
  guideSteps,
  nextStep,
  restartGuide,
  celebrationShown,
  markCelebrationShown,
  shouldRunGuide,
} from '@/lib/setup-guide';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';

/**
 * The walk a brand-new shop is taken on.
 *
 * Setup used to end with a store that existed and did nothing: no prices, no
 * services, no first job, and everything needed to open hidden behind a tab
 * the owner had never seen.
 *
 * The guide follows the store rather than counting clicks, which is what these
 * tests pin: doing a step early, out of order, or on another day all have to
 * land the merchant in the right place.
 */

/**
 * Laundry records are not a field on the store - they live in their own
 * localStorage bucket, keyed by access code. Seeding a `laundryRecords`
 * property tested nothing the app reads.
 */
function seedRecords(accessCode: string, count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({ clientRef: `r${i}`, accessCode }));
  localStorage.setItem(laundryLocalStorageKey(accessCode), JSON.stringify(rows));
}

const laundry = (over: Record<string, unknown> = {}) => ({
  storeName: 'Shine Laundry',
  accessCode: 'TEST01',
  storeType: 'laundry',
  category: 'retail',
  products: [],
  sales: [],
  customers: [],
  ...over,
}) as any;

const service = (price = 0) => ({
  id: 's1', name: 'Wash & Iron', isService: true, sellingPrice: price, costPrice: 0, quantity: 0,
});

beforeEach(() => { restartGuide(); localStorage.clear(); });
afterEach(() => { restartGuide(); localStorage.clear(); });

describe('a brand-new laundry', () => {
  it('is walked through five steps', () => {
    // Opening a screen and doing the thing on it are separate steps. Aimed at
    // the tab, the last step spotlighted a tab the merchant was already
    // standing on, so tapping it changed nothing and the walk never finished.
    expect(guideSteps(laundry()).map(step => step.id)).toEqual([
      'open-price-list', 'add-service', 'set-price', 'open-intake', 'first-job',
    ]);
  });

  it('starts by pointing at the price list', () => {
    const step = nextStep(laundry(), 'dashboard');
    expect(step?.id).toBe('open-price-list');
    expect(step?.target).toBe('tab-inventory');
  });

  it('counts arriving on the screen as doing the step', () => {
    // No data changes when a merchant opens a tab, so without this the guide
    // kept pointing at a tab they were already standing on.
    expect(nextStep(laundry(), 'inventory')?.id).toBe('add-service');
  });

  it('asks for a service next, pointing at the button that adds one', () => {
    const step = nextStep(laundry(), 'inventory');
    expect(step?.id).toBe('add-service');
    expect(step?.target).toBe('add-service');
  });

  it('asks for a price once a service exists', () => {
    const store = laundry({ products: [service(0)] });
    expect(nextStep(store, 'inventory')?.id).toBe('set-price');
  });

  it('sends them to Intake once prices are set', () => {
    const store = laundry({ products: [service(500)] });
    expect(nextStep(store, 'inventory')?.id).toBe('open-intake');
  });

  it('then points at the button that starts a job, not at the tab', () => {
    const store = laundry({ products: [service(500)] });
    const step = nextStep(store, 'laundry-records');
    expect(step?.id).toBe('first-job');
    expect(step?.target).toBe('record-job');
  });

  it('is finished once a job has been recorded', () => {
    const store = laundry({ products: [service(500)] });
    seedRecords('TEST01', 1);
    expect(nextStep(store, 'dashboard')).toBeNull();
    expect(shouldRunGuide(store)).toBe(false);
  });

  it('accepts a price set through the garment matrix instead of a service', () => {
    const store = laundry({
      products: [service(0)],
      // Keyed by service id, which is how the app writes it.
      businessTemplate: { laundryPricing: { matrix: { s1: { Shirt: 500 } } } },
    });
    expect(nextStep(store, 'inventory')?.id).toBe('open-intake');
  });
});

describe('it keeps up with a merchant who works out of order', () => {
  it('skips ahead when someone adds a service before being asked', () => {
    const store = laundry({ products: [service(800)] });
    // Three steps satisfied at once; the guide lands on the fourth.
    expect(nextStep(store, 'dashboard')?.id).toBe('open-intake');
  });

  it('reports progress honestly', () => {
    expect(guideProgress(laundry(), 'dashboard').done).toBe(0);
    expect(guideProgress(laundry({ products: [service(800)] }), 'dashboard').done).toBe(3);
    expect(guideProgress(laundry(), 'dashboard').total).toBe(5);
    // The number shown is where they are, not how many boxes are ticked: a
    // later step being satisfied early used to inflate it.
    expect(guideProgress(laundry({ products: [service(800)] }), 'dashboard').index).toBe(3);
  });
});

describe('a shop that sells goods gets a different walk', () => {
  const shop = (over: Record<string, unknown> = {}) => ({
    storeName: 'Corner Store', storeType: 'provision', category: 'retail',
    products: [], sales: [], ...over,
  }) as any;

  it('is about stock and a sale, not services', () => {
    const ids = guideSteps(shop()).map(step => step.id);
    expect(ids).toEqual(['open-inventory', 'add-product', 'open-sales', 'first-sale']);
  });

  it('finishes on the first sale', () => {
    const store = shop({ products: [{ id: 'p1', name: 'Rice' }], sales: [{ id: 's', total: 100 }] });
    expect(nextStep(store, 'dashboard')).toBeNull();
  });
});

describe('it does not nag', () => {
  it('stays closed once the merchant closes it', () => {
    const store = laundry();
    expect(shouldRunGuide(store, 'dashboard')).toBe(true);
    dismissGuide(store.accessCode);
    expect(shouldRunGuide(store, 'dashboard')).toBe(false);
  });

  /**
   * Both flags used to be single global keys, so the first shop to finish or
   * dismiss switched the walk off for every shop on the device and spent the
   * "ready for business" moment on their behalf. A second laundry got no guide
   * and no celebration, having done nothing - which is exactly how it was
   * reported: the training finished and nothing happened.
   */
  it('closing the walk on one shop leaves it running on another', () => {
    const shine = laundry({ accessCode: 'SHINE1' });
    const second = laundry({ accessCode: 'SECOND' });

    dismissGuide(shine.accessCode);

    expect(shouldRunGuide(shine, 'dashboard')).toBe(false);
    expect(shouldRunGuide(second, 'dashboard')).toBe(true);
  });

  it('gives each shop its own ready-for-business moment', () => {
    markCelebrationShown('SHINE1');
    expect(celebrationShown('SHINE1')).toBe(true);
    expect(celebrationShown('SECOND')).toBe(false);
  });

  it('still honours the old global flag for a shop already trading', () => {
    // A merchant mid-setup when this changed must not be shown it all again.
    localStorage.setItem('storeflow_setup_guide_dismissed', '1');
    expect(shouldRunGuide(laundry({ accessCode: 'OLDONE' }), 'dashboard')).toBe(false);
  });

  it('does not run for a shop that is already trading', () => {
    const store = laundry({ products: [service(500)], sales: [{ id: 's', total: 3000 }] });
    expect(shouldRunGuide(store, 'dashboard')).toBe(false);
  });

  it('does not run without a store', () => {
    expect(shouldRunGuide(null)).toBe(false);
    expect(shouldRunGuide(undefined)).toBe(false);
  });
});
