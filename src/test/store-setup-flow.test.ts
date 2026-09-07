import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * The first thing the app ever asks anyone to do.
 *
 * Creating a store was one page carrying the shop name, a grid of nineteen
 * business types and six logo concepts, with the Create button below all of
 * it. Every decision arrived at once and the button that finishes the job was
 * off the bottom of the screen, so the opening move was to scroll past a wall
 * of choices.
 *
 * And the progress bar measured three steps, because all of that counted as
 * one — so it sat still through the longest part of the flow and then jumped.
 */

const access = readSource('src/components/StoreAccess.tsx');

describe('the two front-door buttons are untouched', () => {
  it('still offers both, in the same words', () => {
    expect(access).toContain('Create New Store');
    expect(access).toContain('Access Existing Store');
  });
});

describe('one decision per screen', () => {
  it('splits the first page into three questions', () => {
    expect(access).toContain("useState<'name' | 'type' | 'logo'>('name')");
    expect(access).toContain("{createStep === 'name' && (");
    expect(access).toContain("{createStep === 'type' && (");
    expect(access).toContain("{createStep === 'logo' && (");
  });

  it('will not move on without a name', () => {
    expect(access).toContain('disabled={!storeName.trim()}');
  });

  it('takes Enter as Continue, so a phone keyboard finishes the job', () => {
    expect(access).toContain("if (e.key === 'Enter' && storeName.trim()) setCreateStep('type')");
  });

  it('advances on the tap that answers the question', () => {
    // A separate Continue after every choice is what makes a short flow feel
    // long.
    const typeStep = access.slice(access.indexOf("{createStep === 'type' && ("), access.indexOf("{createStep === 'logo' && ("));
    expect(typeStep).toContain("setCreateStep('logo')");
  });

  it('lets a merchant go back a question at a time', () => {
    expect(access).toContain("onClick={() => setCreateStep('name')}");
    expect(access).toContain("onClick={() => setCreateStep('type')}");
  });

  it('asks about the shop by name once it knows it', () => {
    expect(access).toContain('What kind of business is {storeName.trim()');
    expect(access).toContain('Pick a look for {storeName.trim()');
  });
});

describe('the bar says where you are', () => {
  it('counts the whole journey, not three coarse stages', () => {
    expect(access).toContain('CreateFlowProgress step={createStep');
    expect(access).toContain('of={5}');
    expect(access).toContain('<CreateFlowProgress step={4} of={5} />');
    expect(access).toContain('<CreateFlowProgress step={5} of={5} />');
  });

  it('says the number as well as drawing the bar', () => {
    // A bar alone says there is more, not how much more.
    const fn = access.slice(access.indexOf('function CreateFlowProgress'), access.indexOf('function CreateFlowProgress') + 1200);
    expect(fn).toContain('Step {step} of {of}');
    expect(fn).toContain('{pct}%');
  });

  it('works out the percentage from the step, not a hardcoded list', () => {
    const fn = access.slice(access.indexOf('function CreateFlowProgress'), access.indexOf('function CreateFlowProgress') + 1200);
    expect(fn).toContain('Math.round((step / of) * 100)');
    expect(fn).not.toContain('step === 1 ? 33');
  });
});

describe('the progress maths', () => {
  const pct = (step: number, of: number) => Math.round((step / of) * 100);

  it('runs from a fifth to full across five steps', () => {
    expect(pct(1, 5)).toBe(20);
    expect(pct(3, 5)).toBe(60);
    expect(pct(5, 5)).toBe(100);
  });

  it('never claims to be finished early', () => {
    for (let step = 1; step < 5; step++) expect(pct(step, 5)).toBeLessThan(100);
  });
});
