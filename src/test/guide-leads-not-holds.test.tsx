import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readSource } from './helpers/source';
import SetupChecklist from '@/components/SetupChecklist';
import { endPractice, guideStepOnScreen } from '@/lib/guide-activity';
import MilestoneCelebration from '@/components/MilestoneCelebration';
import { celebrationShowing } from '@/lib/celebrations';
import { firstProductsPageShowing, guideDismissed, nextStep, shouldRunGuide } from '@/lib/setup-guide';
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
afterEach(() => { cleanup(); localStorage.clear(); endPractice(); });

describe('the setup checklist leads; it does not hold anyone', () => {
  /*
   * The old walk sent the merchant to a step's screen by itself, and for a
   * while back to it every time they changed tab. The checklist moves nobody:
   * only a tap on a row's button goes anywhere.
   */
  it('shows what is left, and goes nowhere by itself', () => {
    const navigate = vi.fn();
    render(<SetupChecklist store={laundry({ products: [] })} onNavigate={navigate} />);
    const card = screen.getByRole('region', { name: 'Get your shop ready' });
    expect(within(card).getByText('0 of 3 done')).toBeTruthy();
    expect(within(card).getByText('Add your services')).toBeTruthy();
    expect(within(card).getByText('Set your prices')).toBeTruthy();
    expect(within(card).getByText('Try a practice bundle')).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ticks what is done and offers buttons only for what is not', () => {
    render(<SetupChecklist store={laundry()} onNavigate={() => {}} />);
    const card = screen.getByRole('region', { name: 'Get your shop ready' });
    expect(within(card).getByText('2 of 3 done')).toBeTruthy();
    expect(within(card).queryByRole('button', { name: 'Add service' })).toBeNull();
    expect(within(card).getByRole('button', { name: 'Try it' })).toBeTruthy();
  });

  it('"Try it" opens the intake as a practice run, on the tap and not before', () => {
    const navigate = vi.fn();
    render(<SetupChecklist store={laundry()} onNavigate={navigate} />);
    expect(guideStepOnScreen()).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try it' }));
    expect(navigate).toHaveBeenCalledWith('laundry-records');
    expect(guideStepOnScreen()).toBe('first-job');
    endPractice();
    expect(guideStepOnScreen()).toBeNull();
  });

  it('asks before hiding, then stays hidden for this shop', () => {
    render(<SetupChecklist store={laundry()} onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide the setup checklist' }));
    expect(screen.getByText('Hide the setup checklist?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(guideDismissed('GUIDE1')).toBe(true);
    expect(screen.queryByRole('region', { name: 'Get your shop ready' })).toBeNull();
  });

  it('is not there for a shop that is ready', () => {
    const ready = laundry({ sales: [
      { id: 'a', total: 1, date: '2026-09-07T10:00:00.000Z' },
      { id: 'b', total: 1, date: '2026-09-08T10:00:00.000Z' },
    ] });
    render(<SetupChecklist store={ready} onNavigate={() => {}} />);
    expect(screen.queryByRole('region', { name: 'Get your shop ready' })).toBeNull();
  });
});

describe('the practice run ends on its own', () => {
  const index = readSource('src/pages/Index.tsx');
  it('when the merchant leaves the intake, or the run is done', () => {
    expect(index).toContain("if (tab !== 'laundry-records') endPractice();");
    expect(index).toContain('window.addEventListener(PRACTISED_SIGNAL, endPractice)');
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
    expect(nextStep(store)?.id).toBe('first-job');
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
