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
