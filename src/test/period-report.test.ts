import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import {
  compare,
  periodReport,
  periodsSoFar,
  periodSentence,
  periodStart,
  shiftPeriod,
  type PeriodBundle,
} from '@/lib/period-report';

/**
 * A week is Monday to Sunday and a month the 1st to the last day; each is set
 * against the one before on clothes, their value and the money, not money alone.
 */

// Friday 13 November 2026, mid-afternoon.
const NOW = new Date('2026-11-13T15:00:00').getTime();
const at = (text: string) => new Date(text).toISOString();

const bundle = (ref: string, when: string, pieces: number, total: number, stage = 'received'): PeriodBundle => ({
  clientRef: ref, createdAt: at(when), pieceCount: pieces, total, workflowStage: stage, customerName: ref,
});
const pay = (amount: number, when: string, ref?: string) => ({
  id: `s${Math.random()}`, total: amount, date: at(when), ...(ref ? { pendingPaymentId: `laundry-${ref}` } : {}),
});

const shop = (sales: unknown[], pending: unknown[] = []) => ({
  accessCode: 'WEEK01', sales, pendingPayments: pending,
} as unknown as StoreData);

beforeEach(() => localStorage.clear());

describe('weeks and months on the calendar', () => {
  it('a week starts on Monday, Sunday included in the week before it', () => {
    expect(new Date(periodStart('week', NOW)).toDateString()).toBe(new Date('2026-11-09T00:00:00').toDateString());
    const sunday = new Date('2026-11-15T20:00:00').getTime();
    expect(periodStart('week', sunday)).toBe(periodStart('week', NOW));
  });

  it('a month starts on the 1st, and steps back across a year', () => {
    const january = new Date('2027-01-10T12:00:00').getTime();
    expect(new Date(shiftPeriod('month', periodStart('month', january), -1)).getMonth()).toBe(11);
  });
});

describe('a week set against the one before', () => {
  const bundles = [
    // Last week: Monday to Sunday 2-8 November.
    bundle('a', '2026-11-02T10:00:00', 10, 5_000, 'collected'),
    bundle('b', '2026-11-04T10:00:00', 10, 5_000),
    bundle('c', '2026-11-07T10:00:00', 20, 10_000),
    // This week so far: Monday 9 to Friday 13.
    bundle('d', '2026-11-09T10:00:00', 15, 7_500),
    bundle('e', '2026-11-12T10:00:00', 15, 7_500),
  ];
  const store = shop(
    [pay(5_000, '2026-11-02T18:00:00', 'a'), pay(10_000, '2026-11-08T18:00:00', 'c'), pay(4_000, '2026-11-10T18:00:00', 'd')],
    [
      { id: 'laundry-d', status: 'pending', balance: 3_500, paid: 4_000 },
      { id: 'laundry-e', status: 'pending', balance: 7_500, paid: 0 },
    ],
  );

  it('counts clothes, their value and the money, each on its own', () => {
    const week = periodReport(store, bundles, 'week', periodStart('week', NOW), NOW);
    expect(week.label).toBe('This week');
    expect(week.current).toBe(true);
    expect(week.pieces).toBe(30);
    expect(week.bundles).toBe(2);
    expect(week.workTakenIn).toBe(15_000);
    expect(week.received).toBe(4_000);
    expect(week.owed).toBe(11_000);
    expect(week.paidShare).toBe(27);
  });

  it('while the week runs, compares the same days of last week', () => {
    const week = periodReport(store, bundles, 'week', periodStart('week', NOW), NOW);
    // Monday to Friday last week: bundles a and b, and ₦5,000 received.
    expect(week.compared.pieces).toMatchObject({ before: 20, percent: 50, direction: 'up' });
    expect(week.compared.received).toMatchObject({ before: 5_000, percent: -20, direction: 'down' });
    // Last week whole is given beside it.
    expect(week.previous).toMatchObject({ pieces: 40, received: 15_000, label: 'Last week' });
    expect(week.comparedWith).toContain('same days of last week');
    expect(periodSentence(week)).toContain('clothes up 50%');
    expect(periodSentence(week)).toContain('money received down 20%');
  });

  it('a finished week is set against the whole week before', () => {
    const last = periodReport(store, bundles, 'week', shiftPeriod('week', periodStart('week', NOW), -1), NOW);
    expect(last.label).toBe('Last week');
    expect(last.current).toBe(false);
    expect(last.pieces).toBe(40);
    expect(last.compared.pieces.direction).toBe('new');
    expect(last.parts.map(part => part.pieces)).toEqual([10, 0, 10, 0, 0, 20, 0]);
  });

  it('shows the days still to come as not yet reached', () => {
    const week = periodReport(store, bundles, 'week', periodStart('week', NOW), NOW);
    expect(week.parts.map(part => part.ahead)).toEqual([false, false, false, false, false, true, true]);
  });

  it('lists every week from the first record, newest first', () => {
    const weeks = periodsSoFar(store, bundles, 'week', NOW);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toBe(periodStart('week', NOW));
  });
});

describe('a month set against the one before', () => {
  it('compares the same dates of last month while the month runs', () => {
    const bundles = [
      bundle('o1', '2026-10-05T10:00:00', 10, 5_000),
      bundle('o2', '2026-10-25T10:00:00', 30, 15_000),
      bundle('n1', '2026-11-03T10:00:00', 12, 6_000),
    ];
    const month = periodReport(shop([]), bundles, 'month', periodStart('month', NOW), NOW);
    expect(month.label).toBe('This month');
    expect(month.dates).toBe('1 Nov – 30 Nov');
    // 1-13 October against 1-13 November.
    expect(month.compared.pieces).toMatchObject({ before: 10, percent: 20, direction: 'up' });
    expect(month.previous.pieces).toBe(40);
    // November by its weeks, cut at the month's edges.
    expect(month.parts[0].label).toBe('1 Nov – 1 Nov');
    expect(month.parts.at(-1)!.label).toBe('30 Nov – 30 Nov');
  });
});

describe('the change itself', () => {
  it('says up, down, same, or that there was nothing before', () => {
    expect(compare(12, 10)).toMatchObject({ percent: 20, direction: 'up' });
    expect(compare(5, 10)).toMatchObject({ percent: -50, direction: 'down' });
    expect(compare(10, 10).direction).toBe('same');
    expect(compare(10, 0)).toMatchObject({ percent: null, direction: 'new' });
    expect(compare(0, 0).direction).toBe('none');
  });
});
