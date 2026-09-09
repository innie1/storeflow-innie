import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';
import {
  dismissGuide,
  guideDismissed,
  guideProgress,
  guideSteps,
  nextStep,
  restartGuide,
  celebrationShown,
  markCelebrationShown,
  shouldRunGuide,
} from '@/lib/setup-guide';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';

function seedRecords(accessCode: string, count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({ clientRef: `r${i}`, accessCode }));
  localStorage.setItem(laundryLocalStorageKey(accessCode), JSON.stringify(rows));
}

function seedRecordsAcrossDays(accessCode: string, createdAt: string[]) {
  const rows = createdAt.map((at, i) => ({ clientRef: `r${i}`, accessCode, createdAt: at }));
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

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

describe('a brand-new laundry', () => {
  it('is walked through five steps', () => {
    expect(guideSteps(laundry()).map(step => step.id)).toEqual([
      'open-price-list', 'add-service', 'set-price', 'open-intake', 'first-job',
    ]);
  });

  it('starts by pointing at the price list', () => {
    const step = nextStep(laundry(), 'dashboard');
    expect(step?.id).toBe('open-price-list');
    expect(step?.target).toBe('tab-inventory');
  });

  it('counts arriving on the price-list screen as doing the navigation step', () => {
    expect(nextStep(laundry(), 'inventory')?.id).toBe('add-service');
  });

  it('asks for a price once a service exists', () => {
    expect(nextStep(laundry({ products: [service(0)] }), 'inventory')?.id).toBe('set-price');
  });

  it('sends the merchant to Intake once prices are set', () => {
    expect(nextStep(laundry({ products: [service(500)] }), 'inventory')?.id).toBe('open-intake');
  });

  it('then points at the button that starts a job', () => {
    const step = nextStep(laundry({ products: [service(500)] }), 'laundry-records');
    expect(step?.id).toBe('first-job');
    expect(step?.target).toBe('record-job');
  });

  it('is not finished by one job on one day', () => {
    const store = laundry({ products: [service(500)] });
    seedRecords('TEST01', 1);
    expect(nextStep(store, 'dashboard')?.id).toBe('first-job');
    expect(shouldRunGuide(store)).toBe(true);
  });

  it('is finished once the shop has traded on more than one day', () => {
    const store = laundry({ products: [service(500)] });
    seedRecordsAcrossDays('TEST01', ['2026-09-07T10:00:00.000Z', '2026-09-08T10:00:00.000Z']);
    expect(nextStep(store, 'dashboard')).toBeNull();
    expect(shouldRunGuide(store)).toBe(false);
  });

  it('accepts a price set through the garment matrix', () => {
    const store = laundry({
      products: [service(0)],
      businessTemplate: { laundryPricing: { matrix: { s1: { Shirt: 500 } } } },
    });
    expect(nextStep(store, 'inventory')?.id).toBe('open-intake');
  });
});

describe('guide progress', () => {
  it('skips steps already satisfied and reports progress honestly', () => {
    const configured = laundry({ products: [service(800)] });
    expect(nextStep(configured, 'dashboard')?.id).toBe('open-intake');
    expect(guideProgress(laundry(), 'dashboard').done).toBe(0);
    expect(guideProgress(configured, 'dashboard').done).toBe(3);
    expect(guideProgress(configured, 'dashboard').index).toBe(3);
    expect(guideProgress(configured, 'dashboard').total).toBe(5);
  });
});

describe('a shop that sells goods gets a different walk', () => {
  const shop = (over: Record<string, unknown> = {}) => ({
    storeName: 'Corner Store', storeType: 'provision', category: 'retail',
    products: [], sales: [], ...over,
  }) as any;

  it('uses stock and sale steps, not laundry steps', () => {
    expect(guideSteps(shop()).map(step => step.id)).toEqual([
      'open-inventory', 'add-product', 'open-sales', 'first-sale',
    ]);
  });

  it('finishes on the first sale', () => {
    const store = shop({ products: [{ id: 'p1', name: 'Rice' }], sales: [{ id: 's', total: 100 }] });
    expect(nextStep(store, 'dashboard')).toBeNull();
  });
});

describe('onboarding state is strictly per store', () => {
  it('closing the walk on one shop leaves it running on another', () => {
    const shine = laundry({ accessCode: 'SHINE1' });
    const second = laundry({ accessCode: 'SECOND' });

    dismissGuide(shine.accessCode);

    expect(guideDismissed('SHINE1')).toBe(true);
    expect(guideDismissed('SECOND')).toBe(false);
    expect(shouldRunGuide(shine, 'dashboard')).toBe(false);
    expect(shouldRunGuide(second, 'dashboard')).toBe(true);
  });

  it('gives each shop its own ready-for-business moment', () => {
    markCelebrationShown('SHINE1');
    expect(celebrationShown('SHINE1')).toBe(true);
    expect(celebrationShown('SECOND')).toBe(false);
  });

  it('ignores the old global dismissed flag', () => {
    localStorage.setItem('storeflow_setup_guide_dismissed', '1');
    const newShop = laundry({ accessCode: 'NEWSTORE' });

    expect(guideDismissed('NEWSTORE')).toBe(false);
    expect(shouldRunGuide(newShop, 'dashboard')).toBe(true);
  });

  it('ignores the old global finished flag', () => {
    localStorage.setItem('storeflow_setup_guide_finished', '1');

    expect(celebrationShown('NEWSTORE')).toBe(false);
  });

  it('restarting one shop does not clear another shop state', () => {
    dismissGuide('SHINE1');
    dismissGuide('SECOND');
    markCelebrationShown('SHINE1');
    markCelebrationShown('SECOND');

    restartGuide('SHINE1');

    expect(guideDismissed('SHINE1')).toBe(false);
    expect(celebrationShown('SHINE1')).toBe(false);
    expect(guideDismissed('SECOND')).toBe(true);
    expect(celebrationShown('SECOND')).toBe(true);
  });

  it('does not run for a shop that has been trading more than a day', () => {
    const store = laundry({
      products: [service(500)],
      sales: [
        { id: 's', total: 3000, date: '2026-09-07T10:00:00.000Z' },
        { id: 's2', total: 1500, date: '2026-09-08T10:00:00.000Z' },
      ],
    });
    expect(shouldRunGuide(store, 'dashboard')).toBe(false);
  });

  it('still runs for a shop on its very first day of trading', () => {
    const store = laundry({
      products: [service(500)],
      sales: [{ id: 's', total: 3000, date: '2026-09-08T10:00:00.000Z' }],
    });
    expect(shouldRunGuide(store, 'dashboard')).toBe(true);
  });

  it('does not run without a store', () => {
    expect(shouldRunGuide(null)).toBe(false);
    expect(shouldRunGuide(undefined)).toBe(false);
  });
});

describe('switching to another shop starts its own walk', () => {
  const index = readSource('src/pages/Index.tsx');

  it('remounts the guide when the shop changes', () => {
    const mount = index.slice(index.indexOf('<SetupGuide'), index.indexOf('onNavigate={next =>'));
    expect(mount).toContain('key={store.accessCode}');
  });

  it('reads dismissal from an access-code-specific key', () => {
    const guide = readSource('src/lib/setup-guide.ts');
    expect(guide).toContain('shopKey(DISMISSED_PREFIX, accessCode)');
    expect(guide).not.toContain("localStorage.getItem('storeflow_setup_guide_dismissed')");
  });
});
