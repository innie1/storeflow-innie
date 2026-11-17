/**
 * A laundry's week, or its month, against the one before.
 *
 * The Analysis page offered "7 days" and "30 days", which slid every morning,
 * so there was no "last week" to go back to and nothing to set this week
 * against. An owner thinks in weeks and months on the calendar: how did this
 * week go, was it better than last week, how is the month going.
 *
 * Three things are measured, each on its own, because each can move without
 * the others:
 *   - the clothes that came in, in pieces (and bundles),
 *   - what those clothes are priced at, paid or not - the work taken in,
 *   - the money received, for this work or older work.
 * A week with lots of clothes and little money is a different week from one
 * with little of either, and reading money alone hides which it was.
 *
 * A week still running is set against the same days of the week before, up
 * to the same time of day - Monday to Wednesday at noon against Monday to
 * Wednesday at noon - so Wednesday does not read as a collapse next to last
 * week's seven full days, and a Monday morning does not read as one next to
 * the whole of last Monday. Last week's full total is given beside it.
 */

import type { StoreData } from '@/types/store';
import { receivedBetween, receivedBySource, type MoneySources } from '@/lib/money-figures';
import { laundryBalance } from '@/lib/laundry-money';
import { receivedByMethod, type ReceivedByMethod } from '@/lib/payment-method';
import { dayKey } from '@/lib/day-records';

export type PeriodUnit = 'week' | 'month';

export interface PeriodBundle {
  clientRef: string;
  createdAt: string;
  total?: number;
  pieceCount?: number;
  workflowStage?: string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
}

export interface PeriodFigures {
  bundles: number;
  pieces: number;
  /** What the clothes brought in are priced at, paid or not. */
  workTakenIn: number;
  /** Money received in the stretch, for any work. */
  received: number;
}

export type Direction = 'up' | 'down' | 'same' | 'new' | 'none';

export interface Change {
  now: number;
  before: number;
  /** Percent up or down, or null when there was nothing before to compare with. */
  percent: number | null;
  direction: Direction;
}

export interface PeriodPart extends PeriodFigures {
  key: string;
  label: string;
  /** Not reached yet. */
  ahead: boolean;
}

export interface PeriodReport extends PeriodFigures {
  unit: PeriodUnit;
  start: number;
  /** Midnight after the last day. */
  end: number;
  label: string;
  /** "Mon 9 Nov – Sun 15 Nov", "1 Nov – 30 Nov". */
  dates: string;
  /** The period is still running. */
  current: boolean;
  /** Still owed on the clothes that came in during it. */
  owed: number;
  /** Paid so far on the clothes that came in during it, whenever it was paid. */
  paid: number;
  /** Of what those clothes are priced at, how much is paid, 0-100. */
  paidShare: number;
  /** The money received in it, by how old the clothes it paid for were. */
  sources: MoneySources;
  /** The same money, by how it was paid: cash, transfer, or not recorded. */
  methods: ReceivedByMethod;
  collected: number;
  customers: number;
  /** The days of a week, or the weeks of a month. */
  parts: PeriodPart[];
  /** The period before, whole. */
  previous: PeriodFigures & { label: string; dates: string };
  /** Set against the period before - to the same day, while this one runs. */
  compared: { pieces: Change; workTakenIn: Change; received: Change; bundles: Change };
  /** What the comparison was made against, said plainly. */
  comparedWith: string;
}

const pad = (value: number) => String(value).padStart(2, '0');

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function addDays(start: number, days: number): number {
  const date = new Date(start);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/** Midnight on the Monday of the week, or the 1st of the month. */
export function periodStart(unit: PeriodUnit, at: number): number {
  const date = new Date(startOfDay(at));
  if (unit === 'month') return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  // getDay() is 0 on Sunday, which ends the week that began six days before.
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date.getTime();
}

/** The start of the period `steps` on (or back, when negative). */
export function shiftPeriod(unit: PeriodUnit, start: number, steps: number): number {
  if (unit === 'week') return addDays(start, 7 * steps);
  const date = new Date(start);
  return new Date(date.getFullYear(), date.getMonth() + steps, 1).getTime();
}

export function periodKey(unit: PeriodUnit, start: number): string {
  const date = new Date(start);
  return unit === 'month' ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}` : dayKey(start);
}

function day(at: number, weekday: boolean): string {
  return new Date(at).toLocaleDateString('en-GB', { ...(weekday ? { weekday: 'short' } : {}), day: 'numeric', month: 'short' });
}

export function periodDates(unit: PeriodUnit, start: number): string {
  const last = addDays(shiftPeriod(unit, start, 1), -1);
  return `${day(start, unit === 'week')} – ${day(last, unit === 'week')}`;
}

export function periodLabel(unit: PeriodUnit, start: number, now: number = Date.now()): string {
  const current = periodStart(unit, now);
  if (start === current) return unit === 'week' ? 'This week' : 'This month';
  if (start === shiftPeriod(unit, current, -1)) return unit === 'week' ? 'Last week' : 'Last month';
  if (unit === 'month') return new Date(start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return `Week of ${day(start, false)}`;
}

function time(value: unknown): number {
  const at = new Date(String(value || '')).getTime();
  return Number.isFinite(at) ? at : 0;
}

function figures(store: StoreData, bundles: PeriodBundle[], from: number, to: number): PeriodFigures & { inside: PeriodBundle[] } {
  const inside = bundles.filter(bundle => {
    const at = time(bundle.createdAt);
    return at >= from && at < to;
  });
  return {
    inside,
    bundles: inside.length,
    pieces: inside.reduce((sum, bundle) => sum + (Number(bundle.pieceCount) || 0), 0),
    workTakenIn: Math.round(inside.reduce((sum, bundle) => sum + Math.max(0, Number(bundle.total) || 0), 0)),
    received: to > from ? Math.round(receivedBetween(store, from, to)) : 0,
  };
}

/** "Mon 9 Nov – Wed 11 Nov, 2:30pm", or "Mon 9 Nov, to 9am" when it is one day. */
function sameStretch(from: number, to: number, weekday: boolean): string {
  const at = new Date(to);
  const hours = at.getHours();
  const minutes = at.getMinutes();
  const clock = `${hours % 12 === 0 ? 12 : hours % 12}${minutes ? `:${pad(minutes)}` : ''}${hours < 12 ? 'am' : 'pm'}`;
  return startOfDay(from) === startOfDay(to)
    ? `${day(from, weekday)}, to ${clock}`
    : `${day(from, weekday)} – ${day(to, weekday)}, ${clock}`;
}

export function compare(now: number, before: number): Change {
  if (before <= 0) return { now, before, percent: null, direction: now > 0 ? 'new' : 'none' };
  const percent = Math.round(((now - before) / before) * 100);
  return { now, before, percent, direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'same' };
}

export function periodReport(
  store: StoreData,
  bundles: PeriodBundle[],
  unit: PeriodUnit,
  start: number,
  now: number = Date.now(),
): PeriodReport {
  const end = shiftPeriod(unit, start, 1);
  const current = now >= start && now < end;
  // Up to the end of today while it runs: nothing after today has happened.
  const reached = current ? addDays(startOfDay(now), 1) : end;
  const these = figures(store, bundles, start, end);

  const previousStart = shiftPeriod(unit, start, -1);
  const previous = figures(store, bundles, previousStart, start);

  /*
   * The same stretch of the period before, to this time of day. A week is
   * measured to the same weekday and hour; a month to the same date and hour,
   * or its last day when it is shorter. Measuring to the end of the day set a
   * Monday morning against the whole of last Monday.
   */
  let sameStretchEnd = start;
  if (current) {
    if (unit === 'week') sameStretchEnd = addDays(now, -7) + 1;
    else {
      const at = new Date(now);
      const lastOfPrevious = new Date(new Date(start).getFullYear(), new Date(start).getMonth(), 0).getDate();
      const before = new Date(previousStart);
      sameStretchEnd = new Date(
        before.getFullYear(), before.getMonth(), Math.min(at.getDate(), lastOfPrevious),
        at.getHours(), at.getMinutes(), at.getSeconds(), at.getMilliseconds(),
      ).getTime() + 1;
    }
  }
  const against = current ? figures(store, bundles, previousStart, sameStretchEnd) : previous;

  let owed = 0, paid = 0, collected = 0;
  const people = new Set<string>();
  for (const bundle of these.inside) {
    const total = Math.max(0, Number(bundle.total) || 0);
    const balance = Math.min(total, laundryBalance(store, bundle.clientRef));
    owed += balance;
    paid += total - balance;
    if (bundle.workflowStage === 'collected') collected += 1;
    people.add(String(bundle.customerId || bundle.customerPhone || bundle.customerName || bundle.clientRef).trim().toLowerCase());
  }

  // A week by its days; a month by its weeks, cut at the month's edges.
  const parts: PeriodPart[] = [];
  if (unit === 'week') {
    for (let index = 0; index < 7; index += 1) {
      const from = addDays(start, index);
      const part = figures(store, bundles, from, addDays(from, 1));
      parts.push({ key: dayKey(from), label: day(from, true), ahead: from >= reached, bundles: part.bundles, pieces: part.pieces, workTakenIn: part.workTakenIn, received: part.received });
    }
  } else {
    for (let from = start; from < end;) {
      const to = Math.min(end, shiftPeriod('week', periodStart('week', from), 1));
      const part = figures(store, bundles, from, to);
      parts.push({
        key: dayKey(from),
        label: `${day(from, false)} – ${day(addDays(to, -1), false)}`,
        ahead: from >= reached,
        bundles: part.bundles, pieces: part.pieces, workTakenIn: part.workTakenIn, received: part.received,
      });
      from = to;
    }
  }

  const before = unit === 'week' ? 'last week' : 'last month';
  const comparedWith = current
    ? unit === 'week'
      ? `the same days of ${before}, up to the same time (${sameStretch(previousStart, sameStretchEnd - 1, true)})`
      : `the same dates of ${before}, up to the same time (${sameStretch(previousStart, sameStretchEnd - 1, false)})`
    : `${periodLabel(unit, previousStart, now).replace(/^Last/, 'last')} (${periodDates(unit, previousStart)})`;

  return {
    unit,
    start,
    end,
    label: periodLabel(unit, start, now),
    dates: periodDates(unit, start),
    current,
    bundles: these.bundles,
    pieces: these.pieces,
    workTakenIn: these.workTakenIn,
    received: these.received,
    owed: Math.round(owed),
    paid: Math.round(paid),
    paidShare: these.workTakenIn > 0 ? Math.round((paid / these.workTakenIn) * 100) : 0,
    sources: receivedBySource(store, start, end, previousStart),
    methods: receivedByMethod(store, start, end),
    collected,
    customers: people.size,
    parts,
    previous: {
      label: periodLabel(unit, previousStart, now),
      dates: periodDates(unit, previousStart),
      bundles: previous.bundles, pieces: previous.pieces, workTakenIn: previous.workTakenIn, received: previous.received,
    },
    compared: {
      pieces: compare(these.pieces, against.pieces),
      bundles: compare(these.bundles, against.bundles),
      workTakenIn: compare(these.workTakenIn, against.workTakenIn),
      received: compare(these.received, against.received),
    },
    comparedWith,
  };
}

/**
 * Every week (or month) from the shop's first record to now, newest first,
 * so any of them can be picked.
 */
export function periodsSoFar(store: StoreData, bundles: PeriodBundle[], unit: PeriodUnit, now: number = Date.now()): number[] {
  const firsts = [
    ...bundles.map(bundle => time(bundle.createdAt)),
    ...(store.sales || []).map(sale => time(sale?.date)),
  ].filter(at => at > 0);
  const current = periodStart(unit, now);
  const first = firsts.length ? periodStart(unit, Math.min(...firsts)) : current;
  const starts: number[] = [];
  for (let start = current; start >= first && starts.length < 260; start = shiftPeriod(unit, start, -1)) starts.push(start);
  return starts;
}

/** "Up 12%", "Down 30%", "Same as before", said for one figure. */
export function describeChange(change: Change): string {
  switch (change.direction) {
    case 'up': return `Up ${change.percent}%`;
    case 'down': return `Down ${Math.abs(change.percent || 0)}%`;
    case 'same': return 'Same';
    case 'new': return 'Nothing before';
    default: return 'None either time';
  }
}

/** What came in, in one line. The figures under it say up or down. */
export function periodHeadline(report: PeriodReport): string {
  return periodSentence(report).split(' Against ')[0];
}

/** The period in a sentence or two, the way the owner would say it. */
export function periodSentence(report: PeriodReport): string {
  const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
  const when = report.current ? `${report.label} so far` : report.label;
  if (report.bundles === 0 && report.received === 0) return `${when}, no clothes came in and no money was received.`;
  const first = `${when}: ${report.pieces} ${report.pieces === 1 ? 'piece' : 'pieces'} in ${report.bundles} ${report.bundles === 1 ? 'bundle' : 'bundles'}, worth ${naira(report.workTakenIn)}, and ${naira(report.received)} received.`;
  const moves = (['pieces', 'workTakenIn', 'received'] as const)
    .map(name => ({ name, change: report.compared[name] }))
    .filter(item => item.change.direction === 'up' || item.change.direction === 'down');
  if (moves.length === 0) return first;
  const words = { pieces: 'clothes', workTakenIn: 'value of work', received: 'money received' };
  const said = moves.map(item => `${words[item.name]} ${item.change.direction} ${Math.abs(item.change.percent || 0)}%`).join(', ');
  return `${first} Against ${report.comparedWith}: ${said}.`;
}
