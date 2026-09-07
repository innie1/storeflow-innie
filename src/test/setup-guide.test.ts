import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  dismissGuide,
  guideProgress,
  guideSteps,
  nextStep,
  restartGuide,
  shouldRunGuide,
} from '@/lib/setup-guide';

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

const laundry = (over: Record<string, unknown> = {}) => ({
  storeName: 'Shine Laundry',
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

beforeEach(() => restartGuide());
afterEach(() => restartGuide());

describe('a brand-new laundry', () => {
  it('is walked through four steps', () => {
    expect(guideSteps(laundry())).toHaveLength(4);
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

  it('asks for the first customer once prices are set', () => {
    const store = laundry({ products: [service(500)] });
    expect(nextStep(store, 'inventory')?.id).toBe('first-job');
  });

  it('is finished once a job has been recorded', () => {
    const store = laundry({ products: [service(500)], laundryRecords: [{ id: 'r1' }] });
    expect(nextStep(store, 'dashboard')).toBeNull();
    expect(shouldRunGuide(store)).toBe(false);
  });

  it('accepts a price set through the garment matrix instead of a service', () => {
    const store = laundry({
      products: [service(0)],
      businessTemplate: { laundryPricing: { matrix: { Shirt: { 'Wash & Iron': 500 } } } },
    });
    expect(nextStep(store, 'inventory')?.id).toBe('first-job');
  });
});

describe('it keeps up with a merchant who works out of order', () => {
  it('skips ahead when someone adds a service before being asked', () => {
    const store = laundry({ products: [service(800)] });
    // Two steps satisfied at once; the guide lands on the third.
    expect(nextStep(store, 'dashboard')?.id).toBe('first-job');
  });

  it('reports progress honestly', () => {
    expect(guideProgress(laundry(), 'dashboard').done).toBe(0);
    expect(guideProgress(laundry({ products: [service(800)] }), 'dashboard').done).toBe(3);
    expect(guideProgress(laundry(), 'dashboard').total).toBe(4);
  });
});

describe('a shop that sells goods gets a different walk', () => {
  const shop = (over: Record<string, unknown> = {}) => ({
    storeName: 'Corner Store', storeType: 'provision', category: 'retail',
    products: [], sales: [], ...over,
  }) as any;

  it('is about stock and a sale, not services', () => {
    const ids = guideSteps(shop()).map(step => step.id);
    expect(ids).toEqual(['open-inventory', 'add-product', 'first-sale']);
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
    dismissGuide();
    expect(shouldRunGuide(store, 'dashboard')).toBe(false);
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
