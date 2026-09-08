import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';
import { guideSteps, hasPractised, markPractised } from '@/lib/setup-guide';
import type { StoreData } from '@/types/store';

/**
 * The walk teaches the intake screen by having the merchant fill it in, and
 * that used to create a real bundle: a job in the records, a customer in the
 * book, money in the day's takings. Somebody learning the app at home was left
 * with an invented customer and takings that never happened.
 *
 * The service they set up is real - that is setup they would otherwise have to
 * do twice. The bundle is only a rehearsal.
 */

const intake = readSource('src/components/laundry/LaundryWalkInIntakeV2.tsx');

const laundry = (over: Partial<StoreData> = {}) => ({
  id: 's', storeId: 'SF-L', storeName: 'Shine', accessCode: 'PRAC01',
  storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], createdAt: new Date(0).toISOString(),
  ...over,
} as unknown as StoreData);

describe('the rehearsal writes nothing', () => {
  it('leaves before anything is created, booked or synced', () => {
    const branch = intake.slice(intake.indexOf('if (practice) {'), intake.indexOf('const localRecord = createLocalLaundryRecord'));
    for (const write of ['createLocalLaundryRecord', 'recordLaundryPayment', 'addCustomer', 'syncLaundryRecord', 'checkNewMilestone', 'onUpdate']) {
      expect(branch, `${write} must not run in a rehearsal`).not.toContain(write);
    }
  });

  it('returns rather than falling through into the real save', () => {
    const branch = intake.slice(intake.indexOf('if (practice) {'), intake.indexOf('const localRecord = createLocalLaundryRecord'));
    expect(branch).toContain('return;');
  });

  /**
   * A bundle that silently vanished would be worse than the problem this
   * solves: somebody who was actually serving a customer has to be told.
   */
  it('says so on the receipt, and offers to do it for real', () => {
    expect(intake).toContain('Nothing was saved');
    expect(intake).toContain('Record it for real');
  });
});

describe('finishing the walk without a real job', () => {
  it('cannot be judged by what it left behind, so it is recorded', () => {
    const store = laundry();
    const lastStep = guideSteps(store).at(-1)!;
    expect(lastStep.done(store, 'laundry-records')).toBe(false);

    markPractised(store.accessCode);
    expect(lastStep.done(store, 'laundry-records')).toBe(true);
  });

  it('keeps each shop’s rehearsal to itself', () => {
    markPractised('ONESHOP');
    expect(hasPractised('ONESHOP')).toBe(true);
    expect(hasPractised('OTHERSHOP')).toBe(false);
  });

  /** A shop already trading does not need to be taught. */
  it('is not finished by a single job, which is when the walk is most needed', () => {
    const oneJob = laundry({ accessCode: 'TRADED', sales: [{ id: 's1', total: 3000, date: '2026-09-08T10:00:00.000Z' }] as any });
    expect(guideSteps(oneJob).at(-1)!.done(oneJob, 'laundry-records')).toBe(false);
  });

  it('is already finished for a shop trading across more than one day', () => {
    const trading = laundry({
      accessCode: 'TRADED',
      sales: [
        { id: 's1', total: 3000, date: '2026-09-07T10:00:00.000Z' },
        { id: 's2', total: 2000, date: '2026-09-08T10:00:00.000Z' },
      ] as any,
    });
    expect(guideSteps(trading).at(-1)!.done(trading, 'laundry-records')).toBe(true);
  });
});

describe('finishing on a rehearsal still celebrates', () => {
  const guide = readSource('src/lib/setup-guide.ts');
  const index = readSource('src/pages/Index.tsx');
  const ready = readSource('src/components/ReadyForBusiness.tsx');

  /**
   * Found by walking it, not by reading it. The "ready for business" moment is
   * re-checked when the store changes, and a rehearsal deliberately changes
   * nothing - so the walk finished, the guide vanished, and no celebration
   * came. Which is the very thing it was reported missing for.
   */
  it('announces the rehearsal, since nothing else changes', () => {
    expect(guide).toContain('PRACTISED_SIGNAL');
    expect(index).toContain('window.addEventListener(PRACTISED_SIGNAL, check)');
  });

  /**
   * And the step before it. "Open Intake" completed on standing on the tab or
   * having traded; the celebration checks the walk with no tab in hand, so a
   * shop that had only rehearsed never finished that step either.
   */
  it('counts the rehearsal as having opened the intake', () => {
    const store = laundry({ accessCode: 'OPENED' });
    const openIntake = guideSteps(store).find(step => step.id === 'open-intake')!;
    expect(openIntake.done(store, '')).toBe(false);

    markPractised(store.accessCode);
    expect(openIntake.done(store, '')).toBe(true);
  });

  it('does not claim a job was recorded when none was', () => {
    expect(ready).toContain('you know how to take a bundle in');
    expect(index).toContain('practised={hasPractised(store.accessCode)');
  });
});
