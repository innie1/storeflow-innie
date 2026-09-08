import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import type { DecoratedRecord } from '@/lib/laundry-records';
import {
  CLOSE_FROM_HOUR,
  dayCloseSentence,
  isClosingTime,
  laundryDayClose,
  markDayClosed,
  tomorrowSentence,
  wasDayClosed,
} from '@/lib/laundry-day-close';
import { readSource } from './helpers/source';

/**
 * The evening count.
 *
 * A laundry closes by going through the book: what came in, what was taken,
 * who has not paid, what is promised tomorrow. That happens every night
 * whether or not anybody has installed anything, and it is the one moment
 * where paper is doing real work rather than just being written on - so it is
 * the habit worth taking over, and these are the numbers it has to get right.
 */

const DAY = 86400000;
const EVENING = new Date('2026-09-08T19:00:00').getTime();
const MORNING = new Date('2026-09-08T08:00:00').getTime();

function record(overrides: Partial<DecoratedRecord>): DecoratedRecord {
  return {
    stage: 'received',
    createdAt: 0,
    promisedAt: null,
    overdue: false,
    balance: 0,
    pieceCount: 0,
    ...overrides,
  } as DecoratedRecord;
}

function shopWithSales(totals: { total: number; at: number }[]): StoreData {
  return { sales: totals.map(s => ({ total: s.total, date: new Date(s.at).toISOString() })) } as unknown as StoreData;
}

describe('what came in today', () => {
  it('counts today\'s bundles and leaves yesterday\'s alone', () => {
    const close = laundryDayClose(shopWithSales([]), [
      record({ createdAt: EVENING - 3600000, pieceCount: 6 }),
      record({ createdAt: EVENING - 2 * 3600000, pieceCount: 4 }),
      record({ createdAt: EVENING - DAY, pieceCount: 99 }),
    ], EVENING);
    expect(close.bundlesIn).toBe(2);
    expect(close.piecesIn).toBe(10);
  });

  it('counts pieces, not drop-offs', () => {
    // A single shirt is one piece; a bundle of twenty is twenty. Every costing
    // in the app divides by pieces, so the close has to agree.
    const close = laundryDayClose(shopWithSales([]), [
      record({ createdAt: EVENING, pieceCount: 1 }),
      record({ createdAt: EVENING, pieceCount: 20 }),
    ], EVENING);
    expect(close.bundlesIn).toBe(2);
    expect(close.piecesIn).toBe(21);
  });
});

describe('what was taken today', () => {
  it('is money collected, not the value of what came in', () => {
    /*
     * A bundle worth 5,000 taken in on credit is not 5,000 taken. The shop is
     * counting its drawer, and the drawer only has what was handed over.
     */
    const close = laundryDayClose(shopWithSales([{ total: 3000, at: EVENING }]), [
      record({ createdAt: EVENING, pieceCount: 5, balance: 5000 }),
    ], EVENING);
    expect(close.taken).toBe(3000);
  });

  it('includes a payment against an older bundle', () => {
    // Somebody settling last week's debt today put money in today's drawer.
    const close = laundryDayClose(shopWithSales([{ total: 2000, at: EVENING }]), [
      record({ createdAt: EVENING - 5 * DAY }),
    ], EVENING);
    expect(close.taken).toBe(2000);
  });

  it('leaves yesterday\'s takings out', () => {
    const close = laundryDayClose(shopWithSales([
      { total: 1000, at: EVENING },
      { total: 9999, at: EVENING - DAY },
    ]), [], EVENING);
    expect(close.taken).toBe(1000);
  });
});

describe('what is still owed', () => {
  it('separates today\'s debt from the whole pile', () => {
    const close = laundryDayClose(shopWithSales([]), [
      record({ createdAt: EVENING, balance: 1500 }),
      record({ createdAt: EVENING - 4 * DAY, balance: 2500 }),
    ], EVENING);
    expect(close.owedFromToday).toBe(1500);
    expect(close.owedTotal).toBe(4000);
  });

  it('still counts a bundle that has already been handed over', () => {
    // The clothes left, the balance stayed. This is what paper loses.
    const close = laundryDayClose(shopWithSales([]), [
      record({ createdAt: EVENING, stage: 'collected', balance: 800 }),
    ], EVENING);
    expect(close.owedTotal).toBe(800);
  });
});

describe('what the morning holds', () => {
  it('counts work promised for tomorrow', () => {
    const close = laundryDayClose(shopWithSales([]), [
      record({ promisedAt: EVENING + DAY, stage: 'washing' }),
      record({ promisedAt: EVENING + 3 * DAY, stage: 'washing' }),
    ], EVENING);
    expect(close.dueTomorrow).toBe(1);
  });

  it('does not brace the shop for work it has already finished', () => {
    const close = laundryDayClose(shopWithSales([]), [
      record({ promisedAt: EVENING + DAY, stage: 'ready' }),
      record({ promisedAt: EVENING + DAY, stage: 'collected' }),
    ], EVENING);
    expect(close.dueTomorrow).toBe(0);
  });

  it('carries what is waiting to be collected into the sentence', () => {
    const close = laundryDayClose(shopWithSales([]), [record({ stage: 'ready' })], EVENING);
    expect(close.readyWaiting).toBe(1);
    expect(tomorrowSentence(close)).toContain('waiting to be collected');
  });

  it('says nothing about tomorrow when there is nothing to say', () => {
    expect(tomorrowSentence(laundryDayClose(shopWithSales([]), [], EVENING))).toBe('');
  });
});

describe('when it appears', () => {
  it('waits for the evening, because a close at eight in the morning closes nothing', () => {
    expect(isClosingTime(MORNING)).toBe(false);
    expect(isClosingTime(EVENING)).toBe(true);
    expect(CLOSE_FROM_HOUR).toBeGreaterThanOrEqual(16);
  });

  it('says nothing at all on a day where nothing happened', () => {
    const close = laundryDayClose(shopWithSales([]), [], EVENING);
    expect(close.quiet).toBe(true);
    expect(dayCloseSentence(close)).toBe('Nothing came in today.');
  });

  it('is not quiet on a day that only took money', () => {
    // A shop that took nothing in but collected old debts still had a day.
    const close = laundryDayClose(shopWithSales([{ total: 500, at: EVENING }]), [], EVENING);
    expect(close.quiet).toBe(false);
  });
});

describe('marking it done', () => {
  beforeEach(() => localStorage.clear());

  it('stays gone for the rest of today once closed', () => {
    expect(wasDayClosed('SHOP1', EVENING)).toBe(false);
    markDayClosed('SHOP1', EVENING);
    expect(wasDayClosed('SHOP1', EVENING)).toBe(true);
  });

  it('comes back tomorrow evening', () => {
    // A close that stays closed forever is a feature used exactly once.
    markDayClosed('SHOP1', EVENING);
    expect(wasDayClosed('SHOP1', EVENING + DAY)).toBe(false);
  });

  it('is remembered per shop, not per device', () => {
    markDayClosed('SHOP1', EVENING);
    expect(wasDayClosed('SHOP2', EVENING)).toBe(false);
  });
});

describe('the day in one line', () => {
  it('reads the way somebody tired would say it', () => {
    const close = laundryDayClose(shopWithSales([{ total: 24000, at: EVENING }]), [
      record({ createdAt: EVENING, pieceCount: 12, balance: 6500 }),
    ], EVENING);
    const sentence = dayCloseSentence(close);
    expect(sentence).toContain('1 bundle in');
    expect(sentence).toContain('12 pieces');
    expect(sentence).toContain('24,000 taken');
    expect(sentence).toContain('6,500 still owed');
  });
});

describe('where it sits', () => {
  it('is on both home screens, under the day board', () => {
    for (const path of [
      'src/components/simple/BusinessSimpleHome.tsx',
      'src/components/dashboards/BusinessOwnerDashboard.tsx',
    ]) {
      const home = readSource(path);
      expect(home).toContain('<DayClose');
      expect(home.indexOf('<LaundryDayBoard')).toBeLessThan(home.indexOf('<DayClose'));
    }
  });

  it('is held back from anyone who cannot see money', () => {
    const card = readSource('src/components/laundry/DayClose.tsx');
    expect(card).toContain('!canSeeMoney || closed || !isClosingTime()');
  });
});
