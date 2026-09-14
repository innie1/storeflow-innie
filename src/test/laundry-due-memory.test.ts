import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * The due date remembers what was picked.
 *
 * Reported from the counter: the due date selector would not stay where it was
 * put - it went to Custom. Two causes. The selected chip was worked out by
 * comparing the due time with the clock, within a minute, so any form that
 * took longer than that lost its selection. And each new bundle kept the
 * previous bundle's exact date and time, which matched no chip at all.
 */

const intake = readSource('src/components/laundry/LaundryWalkInIntakeV3.tsx');

describe('the due date remembers what was picked', () => {
  it('holds a tapped turnaround as a choice, not a time compared with the clock', () => {
    expect(intake).toContain('setDueHours(chip.hours)');
    expect(intake).toContain('const activeHours = dueHours ?? activePreset(');
  });

  it('starts the next bundle on the last turnaround, counted from now', () => {
    expect(intake).toContain('const lastDue = readLastDue(String(store.accessCode');
    expect(intake).toContain('setPromisedFor(promisedInHours(lastDue));');
    expect(intake).not.toContain("// Keep the merchant's selected due date until they manually change it.");
  });

  it('remembers it for each shop, not across every shop on the phone', () => {
    expect(intake).toContain("const LAST_DUE_KEY = 'storeflow_laundry_last_due_hours_';");
  });

  it('remembers a default that was simply accepted, and a custom date too', () => {
    expect(intake).toContain('rememberLastDue(accessCode, activeHours);');
    expect(intake).toContain('setDueHours(Math.round(hours));');
  });
});
