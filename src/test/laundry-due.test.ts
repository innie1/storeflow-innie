import { describe, expect, it } from 'vitest';
import { describeDue } from '@/lib/laundry-due';
import { readSource } from './helpers/source';

/**
 * What the card says about time.
 *
 * It showed one of two things: the literal toLocaleString of the promised
 * moment — "9/8/2026, 7:04:00 AM", a lot to read on a phone mid-shift — or,
 * once that moment had passed, the single word "Overdue".
 *
 * "Overdue" was the real problem. On a busy morning every late bundle wore the
 * same badge, so an attendant could not tell one that missed its slot by an
 * hour from one that had been sitting since Tuesday. The list is sorted worst
 * first, but only someone who already trusts the order can use that.
 */

const NOW = new Date('2026-09-07T09:00:00').getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('a late bundle says how late', () => {
  it('counts minutes in the first hour', () => {
    expect(describeDue(NOW - 20 * MIN, NOW)).toEqual({ text: '20m late', tone: 'late' });
  });

  it('counts hours within the day', () => {
    expect(describeDue(NOW - 5 * HOUR, NOW)?.text).toBe('5h late');
  });

  it('counts days after that, and gets the plural right', () => {
    expect(describeDue(NOW - 26 * HOUR, NOW)?.text).toBe('1 day late');
    expect(describeDue(NOW - 3 * DAY, NOW)?.text).toBe('3 days late');
  });

  it('never says "0m late" for something a moment overdue', () => {
    expect(describeDue(NOW - 1000, NOW)?.text).toBe('1m late');
  });

  it('marks all of them as needing attention', () => {
    for (const ago of [MIN, HOUR, DAY, 10 * DAY]) {
      expect(describeDue(NOW - ago, NOW)?.tone, String(ago)).toBe('late');
    }
  });
});

describe('a bundle still in hand says when it is wanted', () => {
  it('counts down within the hour', () => {
    expect(describeDue(NOW + 40 * MIN, NOW)).toEqual({ text: 'Due in 40m', tone: 'soon' });
  });

  it('gives the clock time for later today', () => {
    expect(describeDue(new Date('2026-09-07T17:30:00').getTime(), NOW)).toEqual({
      text: 'Due 5:30pm', tone: 'soon',
    });
  });

  it('says tomorrow rather than a date', () => {
    expect(describeDue(new Date('2026-09-08T07:00:00').getTime(), NOW)).toEqual({
      text: 'Due tomorrow 7am', tone: 'later',
    });
  });

  it('names the day within the week', () => {
    const text = describeDue(new Date('2026-09-10T08:00:00').getTime(), NOW)?.text || '';
    expect(text).toMatch(/^Due \w{3} 8am$/);
  });

  it('falls back to a date further out', () => {
    const text = describeDue(new Date('2026-10-01T08:00:00').getTime(), NOW)?.text || '';
    // Day and month, in whichever order the device's locale puts them.
    expect(text).toMatch(/^Due /);
    expect(text.includes('1')).toBe(true);
    expect(text).toMatch(/[A-Za-z]{3}/);
    // No clock time this far out — the day is what matters.
    expect(text).not.toMatch(/am|pm/);
  });

  it('drops the minutes when a time lands on the hour', () => {
    expect(describeDue(new Date('2026-09-07T17:00:00').getTime(), NOW)?.text).toBe('Due 5pm');
  });

  it('reads noon and midnight as twelve, not zero', () => {
    expect(describeDue(new Date('2026-09-08T12:00:00').getTime(), NOW)?.text).toBe('Due tomorrow 12pm');
    expect(describeDue(new Date('2026-09-08T00:30:00').getTime(), NOW)?.text).toBe('Due tomorrow 12:30am');
  });
});

describe('nothing promised, nothing said', () => {
  it('returns no label at all', () => {
    expect(describeDue(null, NOW)).toBeNull();
    expect(describeDue(Number.NaN, NOW)).toBeNull();
  });
});

describe('a finished bundle is not called late', () => {
  it('stops the clock at the promised time once it settles', () => {
    // A bundle on the Ready shelf past its time is done and waiting for
    // someone to come for it, so it should not shout in red.
    const workspace = readSource('src/components/laundry/LaundryWorkspace.tsx');
    expect(workspace).toContain('LAUNDRY_SETTLED_STAGES.includes(stage)');
    expect(workspace).toContain('Math.min(Date.now(), promisedAt)');
  });

  it('and the overdue flag already agreed', () => {
    const workspace = readSource('src/components/laundry/LaundryWorkspace.tsx');
    expect(workspace).toContain("promisedAt < Date.now() && !LAUNDRY_SETTLED_STAGES.includes(stage)");
  });
});

describe('the card no longer prints a raw timestamp', () => {
  it('uses the label instead', () => {
    const workspace = readSource('src/components/laundry/LaundryWorkspace.tsx');
    expect(workspace).not.toContain('new Date(record.promisedAt).toLocaleString()');
    expect(workspace).toContain('{record.due.text}');
  });

  it('colours by urgency rather than by a boolean', () => {
    const workspace = readSource('src/components/laundry/LaundryWorkspace.tsx');
    expect(workspace).toContain("record.due.tone === 'late'");
    expect(workspace).toContain("record.due.tone === 'soon'");
  });
});
