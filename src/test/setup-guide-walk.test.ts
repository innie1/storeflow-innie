import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';
import { guideSteps } from '@/lib/setup-guide';
import type { StoreData } from '@/types/store';

/**
 * The setup walk is the first thing a new shop ever does with this app, and
 * both faults below stopped it dead on its last step — the merchant sitting on
 * "Record your first customer" with nothing lit and nothing to press.
 */

/**
 * Comments stripped before counting: the note explaining this very fix quotes
 * the attribute, and a test that cannot tell code from prose about code will
 * fail on its own explanation.
 */
const code = (path: string) => readSource(path)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const workspace = code('src/components/laundry/LaundryWorkspace.tsx');
const intake = code('src/components/laundry/LaundryWalkInIntakeV2.tsx');

const laundry = {
  id: 's1', storeId: 'SF-G', storeName: 'Guide', accessCode: 'GUIDE1',
  storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], createdAt: new Date(0).toISOString(),
} as unknown as StoreData;

describe('the last step has something to point at', () => {
  /**
   * Two elements carried data-guide="record-job": the workspace's view toggle
   * and the button inside the intake that opens the sheet. The spotlight takes
   * the first visible match and the toggle is higher in the DOM, so the step
   * lit a tab the merchant was already standing on. Tapping it changed
   * nothing.
   */
  it('has exactly one element carrying the target', () => {
    const uses = (source: string) => (source.match(/data-guide="record-job"/g) || []).length;
    expect(uses(workspace) + uses(intake)).toBe(1);
  });

  it('puts it on the button that actually starts a bundle', () => {
    expect(intake).toContain('data-guide="record-job"');
  });

  /**
   * And the button only exists on the intake view, so a shop with nothing
   * recorded has to land there. It defaulted to the record list, which showed
   * a new laundry an empty table and left the step with no target at all.
   */
  it('opens a shop with no records on the intake, not an empty list', () => {
    expect(workspace).toContain("if (requested === 'records' && getLocalLaundryRecords(store.accessCode).length === 0) return 'record';");
  });
});

describe('the walk itself', () => {
  it('asks a laundry for prices, then a service, then a first bundle', () => {
    const ids = guideSteps(laundry).map(step => step.id);
    expect(ids).toEqual(['open-price-list', 'add-service', 'set-price', 'open-intake', 'first-job']);
  });

  it('finishes only once a bundle has actually been taken in', () => {
    const last = guideSteps(laundry).at(-1)!;
    expect(last.done(laundry, 'laundry-records')).toBe(false);
    // A walk-in with no deposit books no sale, so this cannot read store.sales
    // alone — records live in their own bucket, keyed by access code.
    expect(last.target).toBe('record-job');
  });
});

describe('pointing at something the merchant can actually reach', () => {
  const guide = code('src/components/SetupGuide.tsx');

  /**
   * The intake opens as a full-screen sheet over the workspace, and the button
   * this step points at stays in the document underneath it. A rectangle is
   * still measurable there, so the spotlight lit whatever the sheet happened
   * to be showing at those coordinates — on a phone, the Service field.
   */
  it('asks the document what is at the point, not just for a rectangle', () => {
    expect(guide).toContain('document.elementFromPoint');
  });

  it('does not treat a scrolled-away target as covered', () => {
    expect(guide).toContain('if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return true;');
  });

  /**
   * With no target the fallback dimmed the whole screen and floated the card
   * in the middle, which is how a step ended up lying across the form being
   * filled in.
   */
  it('stands down entirely when it has nothing to point at', () => {
    expect(guide).toContain('if (!hole) return null;');
  });
});

describe('a gaming centre gets its own walk', () => {
  const games = {
    id: 's2', storeId: 'SF-P', storeName: 'Play', accessCode: 'PLAY01',
    storeType: 'games', category: 'games',
    products: [], sales: [], games: [], createdAt: new Date(0).toISOString(),
  } as unknown as StoreData;

  /**
   * It used to be handed the retail walk — "Start with your stock. This is
   * where what you sell lives" — to a business that sells time on a console.
   * Its tabs are Home, History, Analytics and Games: no inventory, no sales,
   * so all four steps pointed at nothing at all.
   */
  it('does not send it looking for stock or a till', () => {
    const targets = guideSteps(games).map(step => step.target);
    expect(targets).not.toContain('tab-inventory');
    expect(targets).not.toContain('tab-sales');
  });

  it('points only at tabs a gaming centre actually has', () => {
    for (const step of guideSteps(games)) {
      expect(['tab-games-settings', 'start-session']).toContain(step.target);
    }
  });

  it('finishes when a session has been played, not when stock is added', () => {
    const last = guideSteps(games).at(-1)!;
    expect(last.done(games, 'games-dashboard')).toBe(false);
    expect(last.done({ ...games, gameSessions: [{ id: 'x' }] } as any, 'games-dashboard')).toBe(true);
  });
});
