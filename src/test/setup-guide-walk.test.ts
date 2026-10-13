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
const intake = code('src/components/laundry/LaundryWalkInIntakeV3.tsx');

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
    expect(workspace).toContain("if (requested === 'records' && shopLaundryRecords(store.accessCode).length === 0) return 'record';");
  });
});

describe('the checklist itself', () => {
  it('asks a laundry for a service, its prices, then a practice bundle', () => {
    const ids = guideSteps(laundry).map(step => step.id);
    expect(ids).toEqual(['add-service', 'set-price', 'first-job']);
  });

  it('finishes only once a bundle has actually been taken in', () => {
    const last = guideSteps(laundry).at(-1)!;
    expect(last.done(laundry)).toBe(false);
    expect(last.target).toBe('record-job');
  });

  it('lights the one-at-a-time price button for the prices item', () => {
    expect(guideSteps(laundry)[1].target).toBe('set-prices');
    expect(code('src/components/laundry/LaundryPricingSetup.tsx')).toContain('data-guide="set-prices"');
  });
});

describe('lighting what the button sent the merchant to', () => {
  const glow = code('src/lib/guide-glow.ts');
  const checklist = code('src/components/SetupChecklist.tsx');

  it('lights the copy that is on screen, not the hidden one', () => {
    expect(glow).toContain('box.width > 0 && box.height > 0');
  });

  it('brings it into view and lights it briefly, then lets go', () => {
    expect(glow).toContain("scrollIntoView({ block: 'center'");
    expect(glow).toContain('classList.remove(SPOTLIGHT_CLASS)');
  });

  it('gives up quietly when there is nothing to light - nothing dims, nothing blocks', () => {
    expect(glow).toContain('giveUpAfterMs');
    expect(glow + checklist).not.toMatch(/boxShadow: '0 0 0 9999px/);
  });

  it('moves nobody anywhere unless they tap', () => {
    // The only navigation is inside the row button's handler.
    const handler = checklist.slice(checklist.indexOf('const go = '), checklist.indexOf('return (', checklist.indexOf('const go = ')));
    expect(handler).toContain('onNavigate(step.tab)');
    expect(checklist.split('onNavigate(').length - 1).toBe(1);
  });
});

describe('a gaming centre gets its own checklist', () => {
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

  it('sends it only to screens a gaming centre actually has', () => {
    for (const step of guideSteps(games)) {
      expect(['games-settings', 'games-dashboard']).toContain(step.tab);
      expect([undefined, 'start-session']).toContain(step.target);
    }
  });

  it('finishes when a session has been played, not when stock is added', () => {
    const last = guideSteps(games).at(-1)!;
    expect(last.done(games)).toBe(false);
    expect(last.done({ ...games, gameSessions: [{ id: 'x' }] } as any)).toBe(true);
  });
});
