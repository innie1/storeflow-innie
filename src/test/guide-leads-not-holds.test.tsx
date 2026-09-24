import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readSource } from './helpers/source';
import SetupGuide from '@/components/SetupGuide';
import MilestoneCelebration from '@/components/MilestoneCelebration';
import { celebrationShowing } from '@/lib/celebrations';
import { firstProductsPageShowing, nextStep, shouldRunGuide } from '@/lib/setup-guide';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';

/**
 * Found while recording the new-shop walkthrough videos, 23 September 2026.
 */

const laundry = (over: Record<string, unknown> = {}) => ({
  storeName: 'Mama Chi Laundry', accessCode: 'GUIDE1', storeType: 'laundry', category: 'retail',
  products: [{ id: 's1', name: 'Wash & Iron', isService: true, sellingPrice: 500, costPrice: 0, quantity: 0 }],
  sales: [], customers: [], ...over,
}) as any;

/** One real bundle on the first day: the guide's last step is up. */
function oneRealBundle(accessCode: string) {
  localStorage.setItem(laundryLocalStorageKey(accessCode), JSON.stringify([
    { clientRef: 'r1', accessCode, createdAt: new Date().toISOString() },
  ]));
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe('the setup guide leads; it does not hold anyone', () => {
  /*
   * With a step open, it sent the merchant back to that step's screen every
   * time they changed tab. A laundry that took a real customer at the last
   * step could not reach Home, Orders or the price list all day.
   */
  it('takes the merchant to a step once, when the step first appears', () => {
    const store = laundry();
    oneRealBundle('GUIDE1');
    expect(nextStep(store, 'dashboard')?.id).toBe('first-job');
    const navigate = vi.fn();

    const view = render(<SetupGuide store={store} tab="dashboard" onNavigate={navigate} />);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('laundry-records');

    // They go there, then leave for Home, then Orders.
    view.rerender(<SetupGuide store={store} tab="laundry-records" onNavigate={navigate} />);
    view.rerender(<SetupGuide store={store} tab="dashboard" onNavigate={navigate} />);
    view.rerender(<SetupGuide store={store} tab="orders" onNavigate={navigate} />);

    expect(navigate, 'the guide pulled the merchant back').toHaveBeenCalledTimes(1);
  });

  it('still leads each shop, not just the first one opened', () => {
    oneRealBundle('GUIDE1');
    oneRealBundle('GUIDE2');
    const navigate = vi.fn();
    const view = render(<SetupGuide store={laundry()} tab="dashboard" onNavigate={navigate} />);
    view.rerender(<SetupGuide store={laundry({ accessCode: 'GUIDE2' })} tab="dashboard" onNavigate={navigate} />);
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});

describe('a real bundle taken from the guide counts as walking through it', () => {
  it('marks the walk done when the guide opened the form and it was saved for real', () => {
    const intake = readSource('src/components/laundry/LaundryWalkInIntakeV3.tsx');
    const realSave = intake.slice(intake.indexOf('setCreated(localRecord);'), intake.indexOf('syncLaundryRecord(accessCode, localRecord.clientRef)'));
    expect(realSave).toContain('if (guidedPractice) markPractised(accessCode);');
  });

  it('still does not end the walk for an order taken before the guide showed anything', () => {
    // The 8 September rule: one job alone, outside the guide, is not the lesson.
    const store = laundry();
    oneRealBundle('GUIDE1');
    expect(nextStep(store, 'dashboard')?.id).toBe('first-job');
  });
});

describe('one celebration at a time', () => {
  const milestone = { id: 'first-sale', threshold: 1, tier: 'small', title: 'First Sale!', subtitle: "You're officially in business.", emoji: '🎉' } as any;

  it('says while a milestone card is up, and stops when it goes', () => {
    expect(celebrationShowing()).toBe(false);
    const view = render(<MilestoneCelebration milestone={milestone} onDismiss={() => {}} />);
    expect(celebrationShowing()).toBe(true);
    view.unmount();
    expect(celebrationShowing()).toBe(false);
  });

  it('keeps the ready-for-business card back while one is up', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain('const milestoneShowing = useCelebrationShowing();');
    expect(index).toContain('{showReady && !milestoneShowing && store && (');
  });
});

describe('the first-products page goes before the guide', () => {
  const simpleShop = (complete: boolean) => laundry({ uiMode: 'simple', simpleOnboarding: { complete }, products: [], storeType: 'barber' });

  it('keeps the guide off the home screen while that page is showing', () => {
    expect(firstProductsPageShowing(simpleShop(false), 'dashboard')).toBe(true);
    expect(shouldRunGuide(simpleShop(false), 'dashboard')).toBe(false);
  });

  it('lets it carry on once the page is finished or skipped', () => {
    expect(firstProductsPageShowing(simpleShop(true), 'dashboard')).toBe(false);
  });

  it('only on the home screen, where that page is', () => {
    expect(firstProductsPageShowing(simpleShop(false), 'inventory')).toBe(false);
  });
});
