import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  guideIsShowing,
  guideLog,
  guideStepOnScreen,
  recordGuideEvent,
  resetGuideActivity,
  setGuideStepOnScreen,
  stepsShown,
  wasStepShown,
} from '@/lib/guide-activity';
import { readSource } from './helpers/source';

/**
 * The rehearsal that ate a real order.
 *
 * Reported from a real shop: the guide never displayed, the merchant opened
 * Intake, counted a customer's clothes into it, pressed save - and the app
 * told him afterwards that it had been practice and nothing was recorded. He
 * had to take the whole bundle in again, with the customer standing there.
 *
 * The cause was inference. The intake ran as a rehearsal whenever the guide's
 * *next step* happened to be "record your first job" - read off the shop's
 * data, with no reference to whether the guide was anywhere on screen. A shop
 * with prices set and no jobs yet was permanently in that state.
 *
 * The rule now, and it is worth saying plainly because it is the whole point:
 * if the guide is not on screen, the record is real and it is saved. Not
 * displayed, dismissed, skipped, never seen - all the same answer. The app may
 * fail to teach somebody. It may not eat their work.
 */

const workspace = readSource('src/components/laundry/LaundryWorkspace.tsx');
const guide = readSource('src/components/SetupGuide.tsx');
const intake = readSource('src/components/laundry/LaundryWalkInIntakeV2.tsx');

describe('nothing rehearses unless the guide says so', () => {
  beforeEach(() => resetGuideActivity());
  afterEach(() => resetGuideActivity());

  it('is not showing anything to begin with', () => {
    expect(guideStepOnScreen()).toBeNull();
    expect(guideIsShowing('first-job')).toBe(false);
  });

  it('is showing only what the guide put on screen', () => {
    setGuideStepOnScreen('first-job');
    expect(guideIsShowing('first-job')).toBe(true);
    expect(guideIsShowing('add-service')).toBe(false);
  });

  it('stops showing when the guide goes away', () => {
    // The exact moment that matters: guide gone, so the next thing the
    // merchant records is real.
    setGuideStepOnScreen('first-job');
    setGuideStepOnScreen(null);
    expect(guideIsShowing('first-job')).toBe(false);
  });
});

describe('the workspace asks the guide rather than the data', () => {
  it('no longer works out practice from which step is next', () => {
    /*
     * `practice={nextStep(store, 'laundry-records')?.id === 'first-job'}` is
     * the line that lost the order. It is data, not screen.
     */
    expect(workspace).not.toContain("nextStep(store, 'laundry-records')?.id === 'first-job'");
  });

  it('takes it from what the guide is displaying', () => {
    expect(workspace).toContain("practice={guideStep === 'first-job'}");
    expect(workspace).toContain('GUIDE_STEP_SIGNAL');
  });

  it('and the guide is the only thing that sets it', () => {
    expect(guide).toContain('setGuideStepOnScreen(step?.id ?? null)');
    // Cleared on unmount, so a guide that disappears cannot leave the app
    // rehearsing behind it.
    expect(guide).toContain('return () => setGuideStepOnScreen(null)');
  });
});

describe('a rehearsal is visible before it costs anything', () => {
  it('says so at the top of the form, not on the receipt afterwards', () => {
    // Finding out after saving is the worst possible moment: the clothes are
    // counted and the customer is waiting.
    const form = intake.slice(intake.indexOf('flex-1 overflow-y-auto p-4 space-y-4'));
    expect(form).toContain('Practice run — nothing will be saved');
  });

  it('can be left without losing what has been typed', () => {
    expect(intake).toContain('This is a real customer — record it');
    expect(intake).toContain('setRehearsing(false)');
  });

  it('says which run it is on the button that does it', () => {
    expect(intake).toContain("const saveLabel = practice ? 'Try it (nothing saved)' : 'Record Laundry';");
  });
});

describe('what the guide actually showed this shop', () => {
  beforeEach(() => localStorage.clear());

  it('remembers nothing before the guide has run', () => {
    expect(guideLog('SHOP1')).toEqual([]);
    expect(wasStepShown('SHOP1', 'first-job')).toBe(false);
  });

  it('remembers a step that was put in front of somebody', () => {
    recordGuideEvent('SHOP1', 'first-job', 'shown');
    expect(wasStepShown('SHOP1', 'first-job')).toBe(true);
    expect(stepsShown('SHOP1')).toEqual(['first-job']);
  });

  it('records a step once however many times it renders', () => {
    recordGuideEvent('SHOP1', 'first-job', 'shown');
    recordGuideEvent('SHOP1', 'first-job', 'shown');
    recordGuideEvent('SHOP1', 'first-job', 'shown');
    expect(guideLog('SHOP1')).toHaveLength(1);
  });

  it('keeps shown and done apart', () => {
    // "Was this shop ever taught?" is a different question from "did the shop
    // end up with prices", and the walk was answering the second while
    // claiming the first.
    recordGuideEvent('SHOP1', 'first-job', 'shown');
    recordGuideEvent('SHOP1', 'first-job', 'done');
    expect(guideLog('SHOP1')).toHaveLength(2);
    expect(stepsShown('SHOP1')).toEqual(['first-job']);
  });

  it('is kept per shop', () => {
    recordGuideEvent('SHOP1', 'first-job', 'shown');
    expect(wasStepShown('SHOP2', 'first-job')).toBe(false);
  });
});
