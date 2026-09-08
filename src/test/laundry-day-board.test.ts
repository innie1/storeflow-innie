import { describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { laundryDayBoard, dayBoardSentence } from '@/lib/laundry-day';
import type { DecoratedRecord } from '@/lib/laundry-records';
import { revenueInRange } from '@/components/RevenueCard';
import { readSource } from './helpers/source';

/**
 * What the shop sees before it opens.
 *
 * The home screen used to lead with today's takings and a lifetime customer
 * count. At eight in the morning the first reads zero however good the month
 * has been, and the second only ever goes up, so neither is a reason to open
 * the app twice. What replaced them is the day's work - and those counts have
 * to be right, because the whole argument for the app over a paper book is
 * that the book cannot answer these questions at all.
 */

const DAY = 86400000;
const NOON = new Date('2026-09-08T12:00:00').getTime();

/** Only the fields the board reads; the rest of a record is not its business. */
function record(overrides: Partial<DecoratedRecord>): DecoratedRecord {
  return {
    stage: 'received',
    promisedAt: null,
    overdue: false,
    balance: 0,
    ...overrides,
  } as DecoratedRecord;
}

describe('the day board counts the work', () => {
  it('says nothing at all to a shop that has recorded nothing', () => {
    const board = laundryDayBoard([], NOON);
    expect(board.empty).toBe(true);
    expect(dayBoardSentence(board)).toBe('Nothing recorded yet.');
  });

  it('counts a bundle promised for today', () => {
    const board = laundryDayBoard([record({ promisedAt: NOON + 3600000 })], NOON);
    expect(board.dueToday).toBe(1);
    expect(board.late).toBe(0);
  });

  it('counts a bundle promised yesterday and still unfinished as late', () => {
    const board = laundryDayBoard([record({ promisedAt: NOON - DAY, overdue: true })], NOON);
    expect(board.late).toBe(1);
    expect(board.dueToday).toBe(0);
  });

  it('never counts one bundle as both late and due today', () => {
    // The two tiles sit side by side; a bundle appearing in both would make
    // the pair add up to more work than the shop actually has.
    const board = laundryDayBoard([record({ promisedAt: NOON - 3600000, overdue: true })], NOON);
    expect(board.late + board.dueToday).toBe(1);
  });

  it('does not call a finished bundle late just because it is still waiting', () => {
    /*
     * A bundle on the Ready shelf past its promised time is not late. It is
     * done, and waiting for the customer to come. This is the workspace's own
     * rule, carried on the record, and the board must not invent a second one.
     */
    const board = laundryDayBoard([record({ stage: 'ready', promisedAt: NOON - DAY, overdue: false })], NOON);
    expect(board.late).toBe(0);
    expect(board.ready).toBe(1);
  });

  it('counts what is ready to collect', () => {
    const board = laundryDayBoard([
      record({ stage: 'ready' }),
      record({ stage: 'ready' }),
      record({ stage: 'washing' }),
    ], NOON);
    expect(board.ready).toBe(2);
  });

  it('leaves a collected bundle out of the work', () => {
    const board = laundryDayBoard([record({ stage: 'collected', promisedAt: NOON })], NOON);
    expect(board.dueToday).toBe(0);
    expect(board.ready).toBe(0);
  });
});

describe('the day board counts the money owed', () => {
  it('adds up every balance and says how many bundles it is spread across', () => {
    const board = laundryDayBoard([
      record({ balance: 2000 }),
      record({ balance: 500 }),
      record({ balance: 0 }),
    ], NOON);
    expect(board.owed).toBe(2500);
    expect(board.owedCount).toBe(2);
  });

  it('still counts money owed on a bundle that has already been handed over', () => {
    // This is the case paper loses completely: the clothes went out, the
    // balance stayed, and the ticket is gone.
    const board = laundryDayBoard([record({ stage: 'collected', balance: 1500 })], NOON);
    expect(board.owed).toBe(1500);
  });
});

describe('what the board says out loud', () => {
  it('leads with what would ruin the day first', () => {
    const sentence = dayBoardSentence(laundryDayBoard([
      record({ stage: 'ready' }),
      record({ promisedAt: NOON - DAY, overdue: true }),
      record({ balance: 3000 }),
    ], NOON));
    expect(sentence.indexOf('late')).toBeLessThan(sentence.indexOf('ready'));
  });

  it('says so plainly when there is nothing to chase', () => {
    expect(dayBoardSentence(laundryDayBoard([record({ stage: 'collected' })], NOON)))
      .toBe('Nothing due, nothing late, nothing owed.');
  });
});

describe('revenue over the window being asked about', () => {
  /*
   * "Today's Revenue" on its own is the one window that is useless first thing
   * in the morning, which is when the app gets opened.
   */
  const store = {
    sales: [
      { total: 1000, date: new Date(NOON).toISOString() },
      { total: 2000, date: new Date(NOON - DAY).toISOString() },
      { total: 4000, date: new Date(NOON - 10 * DAY).toISOString() },
      { total: 8000, date: new Date(NOON - 90 * DAY).toISOString() },
    ],
  } as unknown as StoreData;

  it('today is today only', () => {
    expect(revenueInRange(store, 'today', NOON)).toBe(1000);
  });

  it('yesterday is yesterday only, not everything up to now', () => {
    expect(revenueInRange(store, 'yesterday', NOON)).toBe(2000);
  });

  it('fourteen days means fourteen days including today', () => {
    expect(revenueInRange(store, 'fortnight', NOON)).toBe(1000 + 2000 + 4000);
  });

  it('all time is all of it', () => {
    expect(revenueInRange(store, 'all', NOON)).toBe(15000);
  });

  it('ignores a sale with an unreadable date rather than counting it as zero-time', () => {
    const broken = { sales: [{ total: 500, date: 'not a date' }] } as unknown as StoreData;
    expect(revenueInRange(broken, 'all', NOON)).toBe(0);
  });
});

describe('the home screen leads with the work', () => {
  const home = readSource('src/components/simple/BusinessSimpleHome.tsx');

  it('no longer hard-codes a single day of takings', () => {
    expect(home).not.toContain("Today's Revenue");
    expect(home).toContain('RevenueCard');
  });

  it('puts the day board above the money', () => {
    expect(home.indexOf('LaundryDayBoard')).toBeLessThan(home.indexOf('<RevenueCard'));
  });
});
