import { describe, expect, it } from 'vitest';
import { LAUNDRY_SETTLED_STAGES, LAUNDRY_WORKFLOW_STAGES, nextLaundryStage } from '@/lib/laundry-offline';
import { readSource } from './helpers/source';

/**
 * Moving a bundle through the shop.
 *
 * The chain is Received, Washing, Drying, Ironing, Folding, Ready, Collected —
 * five taps to get a bundle to the point a customer can collect it. A shop
 * that only washes and irons still had to walk through Drying and Folding, or
 * find the stage dropdown and work out that it jumps. Ready is the stage that
 * changes what anyone can do next, so it now has its own button, and the
 * dropdown says what it is instead of looking like a label.
 */

const workspace = readSource('src/components/laundry/LaundryWorkspace.tsx');

describe('the stages run in a sensible order', () => {
  it('starts at received and ends at collected', () => {
    expect(LAUNDRY_WORKFLOW_STAGES[0].id).toBe('received');
    expect(LAUNDRY_WORKFLOW_STAGES[LAUNDRY_WORKFLOW_STAGES.length - 1].id).toBe('collected');
  });

  it('advances one at a time and then stops', () => {
    let stage = LAUNDRY_WORKFLOW_STAGES[0].id;
    const walked = [stage];
    for (let guard = 0; guard < 20; guard++) {
      const next = nextLaundryStage(stage);
      if (!next) break;
      stage = next.id;
      walked.push(stage);
    }
    expect(walked).toEqual(LAUNDRY_WORKFLOW_STAGES.map(s => s.id));
    // Collected is the end of the road.
    expect(nextLaundryStage('collected')).toBeNull();
  });

  it('treats ready and collected as nothing-left-to-do', () => {
    expect(LAUNDRY_SETTLED_STAGES).toContain('ready');
    expect(LAUNDRY_SETTLED_STAGES).toContain('collected');
    for (const working of ['received', 'washing', 'drying', 'ironing', 'folding'] as const) {
      expect(LAUNDRY_SETTLED_STAGES).not.toContain(working);
    }
  });
});

describe('every bundle is visible under exactly one tab', () => {
  /** The same rule the workspace applies. */
  const matches = (filter: string, stage: string, overdue: boolean) => {
    if (filter === 'overdue') return overdue;
    if (filter === 'ready') return stage === 'ready';
    if (filter === 'active') return !LAUNDRY_SETTLED_STAGES.includes(stage as any);
    if (filter === 'collected') return stage === 'collected';
    return true;
  };

  it('never leaves a bundle out of active, ready and collected', () => {
    // A stage matching none of them would be invisible everywhere but All.
    for (const { id } of LAUNDRY_WORKFLOW_STAGES) {
      const hits = ['active', 'ready', 'collected'].filter(f => matches(f, id, false));
      expect(hits, id).toHaveLength(1);
    }
  });

  it('always shows it under All', () => {
    for (const { id } of LAUNDRY_WORKFLOW_STAGES) {
      expect(matches('all', id, false), id).toBe(true);
    }
  });
});

describe('an attendant can reach Ready in one tap', () => {
  it('offers the shortcut on a bundle still being worked on', () => {
    expect(workspace).toContain("changeStage(record, 'ready')");
    expect(workspace).toContain("!LAUNDRY_SETTLED_STAGES.includes(record.stage) && next?.id !== 'ready'");
  });

  it('does not offer it where it would do nothing', () => {
    // The same condition the component uses: hidden once the bundle is ready
    // or collected, and hidden when the ordinary next-stage button already
    // says Ready.
    const shows = (stage: string) => {
      const next = nextLaundryStage(stage as any);
      return !LAUNDRY_SETTLED_STAGES.includes(stage as any) && next?.id !== 'ready';
    };
    for (const stage of ['received', 'washing', 'drying', 'ironing']) {
      expect(shows(stage), stage).toBe(true);
    }
    // Folding's next stage is already Ready, so a second button would be noise.
    expect(shows('folding')).toBe(false);
    expect(shows('ready')).toBe(false);
    expect(shows('collected')).toBe(false);
  });

  it('keeps the step-by-step button for shops that track each stage', () => {
    expect(workspace).toContain('`Mark ${next.label}`');
  });
});

describe('the stage control reads as a control', () => {
  it('is labelled where the attendant can see it', () => {
    expect(workspace).not.toContain('className="sr-only" htmlFor={`stage-');
    expect(workspace).toContain('>Stage</label>');
  });

  it('still lists every stage, so a bundle can be corrected', () => {
    expect(workspace).toContain('LAUNDRY_WORKFLOW_STAGES.map(stage =>');
  });
});

describe('the busiest work is at the top', () => {
  it('puts overdue first and collected last', () => {
    const rank = workspace.slice(workspace.indexOf('function urgencyRank'), workspace.indexOf('export default function LaundryWorkspace'));
    expect(rank).toContain('if (record.overdue) return 0;');
    expect(rank).toContain("if (record.stage === 'collected') return 3;");
  });
});
