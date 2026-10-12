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
  showGuideAgain,
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
  it('gets a three-item checklist', () => {
    expect(guideSteps(laundry()).map(step => step.id)).toEqual(['add-service', 'set-price', 'first-job']);
  });

  it('starts with adding a service, with a button that opens the price list', () => {
    const step = nextStep(laundry());
    expect(step?.id).toBe('add-service');
    expect(step?.action).toBe('Add service');
    expect(step?.tab).toBe('inventory');
    expect(step?.target).toBe('add-service');
  });

  it('never ticks an item for being on a screen - only for doing it', () => {
    // The old walk's "open the price list" step ticked itself while that
    // screen was open and un-ticked the moment the merchant left, so the walk
    // kept coming back for it. Items take the shop and nothing else.
    for (const step of guideSteps(laundry())) expect(step.done.length).toBe(1);
    expect(nextStep(laundry())?.id).toBe('add-service');
  });

  it('asks for a price once a service exists', () => {
    expect(nextStep(laundry({ products: [service(0)] }))?.id).toBe('set-price');
  });

  it('then offers a practice bundle, which opens the intake as practice', () => {
    const step = nextStep(laundry({ products: [service(500)] }));
    expect(step?.id).toBe('first-job');
    expect(step?.practice).toBe(true);
    expect(step?.tab).toBe('laundry-records');
    expect(step?.target).toBe('record-job');
  });

  it('is not finished by one job on one day', () => {
    const store = laundry({ products: [service(500)] });
    seedRecords('TEST01', 1);
    expect(nextStep(store)?.id).toBe('first-job');
    expect(shouldRunGuide(store)).toBe(true);
  });

  it('is finished once the shop has traded on more than one day', () => {
    const store = laundry({ products: [service(500)] });
    seedRecordsAcrossDays('TEST01', ['2026-09-07T10:00:00.000Z', '2026-09-08T10:00:00.000Z']);
    expect(nextStep(store)).toBeNull();
    expect(shouldRunGuide(store)).toBe(false);
  });

  it('accepts a price set through the garment matrix', () => {
    const store = laundry({
      products: [service(0)],
      businessTemplate: { laundryPricing: { matrix: { s1: { Shirt: 500 } } } },
    });
    expect(nextStep(store)?.id).toBe('first-job');
  });
});

describe('checklist progress', () => {
  it('ticks what is already done and reports progress honestly', () => {
    const configured = laundry({ products: [service(800)] });
    expect(nextStep(configured)?.id).toBe('first-job');
    expect(guideProgress(laundry()).done).toBe(0);
    expect(guideProgress(configured)).toEqual({ done: 2, total: 3, index: 2 });
  });
});

describe('a shop that sells goods has no walk', () => {
  /*
   * Its own first page - "What 5 products do you sell most?" - is its setup.
   * The walk that ran on top of it asked for the same thing, dimmed that page
   * while the merchant typed into it, and pointed "add your first product" at
   * a laundry button.
   */
  const shop = (over: Record<string, unknown> = {}) => ({
    storeName: 'Corner Store', storeType: 'provision', category: 'retail', accessCode: 'GOODS1',
    products: [], sales: [], ...over,
  }) as any;

  it('has no steps, from the very first minute', () => {
    expect(guideSteps(shop())).toEqual([]);
    expect(nextStep(shop())).toBeNull();
    expect(shouldRunGuide(shop(), 'dashboard')).toBe(false);
  });

  it('holds for other goods trades too, not only provisions', () => {
    for (const storeType of ['pharmacy', 'electronics', 'clothing']) {
      expect(guideSteps(shop({ storeType, category: 'retail' })), storeType).toEqual([]);
    }
  });

  it('leaves the laundry its checklist', () => {
    expect(guideSteps(laundry()).map(step => step.id)).toEqual(['add-service', 'set-price', 'first-job']);
  });
});

describe('onboarding state is strictly per store', () => {
  it('hiding the checklist on one shop leaves it showing on another', () => {
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

describe('switching to another shop shows its own checklist', () => {
  const index = readSource('src/pages/Index.tsx');

  it('remounts the checklist when the shop changes', () => {
    const mount = index.slice(index.indexOf('<SetupChecklist'), index.indexOf('onNavigate={next =>', index.indexOf('<SetupChecklist')));
    expect(mount).toContain('key={store.accessCode}');
  });

  it('reads dismissal from an access-code-specific key', () => {
    const guide = readSource('src/lib/setup-guide.ts');
    expect(guide).toContain('shopKey(DISMISSED_PREFIX, accessCode)');
    expect(guide).not.toContain("localStorage.getItem('storeflow_setup_guide_dismissed')");
  });
});

describe('brought back from Settings', () => {
  it('shows again with its progress kept', () => {
    const store = laundry({ products: [service(500)] });
    dismissGuide('TEST01');
    expect(shouldRunGuide(store)).toBe(false);
    showGuideAgain('TEST01');
    expect(shouldRunGuide(store)).toBe(true);
    expect(guideProgress(store).done).toBe(2);
  });
});
