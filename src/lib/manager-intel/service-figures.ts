/**
 * Four questions a laundry's money figures cannot answer on their own:
 *
 *  - Is the work ready when it was promised, and how long does it take?
 *  - Are customers new, or the same people coming back?
 *  - Which day of the week brings the most work?
 *  - Who are the customers the shop depends on?
 *
 * Each is worked out from the bundles themselves - when they came in, when
 * they were moved to Ready, when they were collected, what they were promised
 * for and whose they were - so nothing new has to be recorded.
 *
 * Every comparison is like for like. Speed and the on-time rate are rates, so
 * the last 30 days are set against the 30 before. A count, such as customers
 * this week, is only ever set against the same days of last week up to the
 * same time, never against a whole week.
 */

import type { StoreData } from '@/types/store';

const DAY = 86400000;
const HOUR = 3600000;
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface ServiceBundle {
  clientRef: string;
  createdAt: string | number;
  total?: number;
  pieceCount?: number;
  promisedFor?: string;
  workflowStage?: string;
  stageUpdatedAt?: string;
  stageHistory?: { stage: string; at: string }[];
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
}

const timeOf = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const at = new Date(String(value || '')).getTime();
  return Number.isFinite(at) ? at : 0;
};

function lastStep(bundle: ServiceBundle, stage: string): number {
  const moves = (bundle.stageHistory || []).filter(step => step?.stage === stage).map(step => timeOf(step.at)).filter(at => at > 0);
  if (moves.length) return Math.max(...moves);
  // A bundle from before moves were kept: its last change, if it is at that stage now.
  return bundle.workflowStage === stage ? timeOf(bundle.stageUpdatedAt) : 0;
}

/** When the bundle was finished: moved to Ready, or straight to Collected. */
export function finishedAt(bundle: ServiceBundle): number {
  const ready = lastStep(bundle, 'ready');
  if (ready) return ready;
  return lastStep(bundle, 'collected');
}

export function collectedAt(bundle: ServiceBundle): number {
  return lastStep(bundle, 'collected');
}

/** One person, however their bundles were written down. */
export function customerOf(bundle: ServiceBundle): string {
  const phone = String(bundle.customerPhone || '').replace(/\D/g, '').slice(-10);
  return String(bundle.customerId || phone || String(bundle.customerName || '').trim().toLowerCase() || bundle.clientRef);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** "18 hours", "2 days", "2½ days". */
export function hoursInWords(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return 'under an hour';
  if (hours < 36) return `${Math.round(hours)} ${Math.round(hours) === 1 ? 'hour' : 'hours'}`;
  const halves = Math.round((hours / 24) * 2) / 2;
  const whole = Math.floor(halves);
  return `${whole}${halves - whole ? '½' : ''} days`;
}

// ─── On time, and how long the work takes ─────────────────────────────────────

export interface SpeedWindow {
  /** Bundles finished in the window. */
  finished: number;
  /** Of those, how many had a promised time. */
  promised: number;
  onTime: number;
  late: number;
  /** Of every promised bundle finished, how many were ready on time. Null with none promised. */
  onTimeShare: number | null;
  /** How late the late ones were, middle value, in hours. */
  lateBy: number | null;
  /** Drop-off to Ready, middle value, in hours. */
  hoursToReady: number | null;
  /** Ready to collected, middle value, in hours, for the ones collected. */
  hoursOnShelf: number | null;
}

export interface ServiceSpeed {
  days: number;
  now: SpeedWindow;
  /** The same number of days just before. */
  before: SpeedWindow;
  /** Promised, past the time and still not ready - late right now. */
  lateNow: { clientRef: string; customerName: string; hoursLate: number }[];
}

function speedWindow(bundles: ServiceBundle[], from: number, to: number): SpeedWindow {
  let promised = 0, onTime = 0;
  const toReady: number[] = [];
  const onShelf: number[] = [];
  const lateBy: number[] = [];
  let finished = 0;
  for (const bundle of bundles) {
    const done = finishedAt(bundle);
    if (!done || done < from || done >= to) continue;
    const created = timeOf(bundle.createdAt);
    finished += 1;
    if (created && done >= created) toReady.push((done - created) / HOUR);
    const collected = collectedAt(bundle);
    const ready = lastStep(bundle, 'ready');
    if (ready && collected && collected >= ready) onShelf.push((collected - ready) / HOUR);
    const due = timeOf(bundle.promisedFor);
    if (due) {
      promised += 1;
      if (done <= due) onTime += 1;
      else lateBy.push((done - due) / HOUR);
    }
  }
  return {
    finished,
    promised,
    onTime,
    late: promised - onTime,
    onTimeShare: percent(onTime, promised),
    lateBy: median(lateBy),
    hoursToReady: median(toReady),
    hoursOnShelf: median(onShelf),
  };
}

export function serviceSpeed(bundles: ServiceBundle[], days: number = 30, now: number = Date.now()): ServiceSpeed {
  const from = now - days * DAY;
  const lateNow = bundles
    .filter(bundle => {
      const due = timeOf(bundle.promisedFor);
      return due && due < now && !finishedAt(bundle) && bundle.workflowStage !== 'collected';
    })
    .map(bundle => ({
      clientRef: bundle.clientRef,
      customerName: String(bundle.customerName || 'A customer'),
      hoursLate: (now - timeOf(bundle.promisedFor)) / HOUR,
    }))
    .sort((a, b) => b.hoursLate - a.hoursLate);
  return {
    days,
    now: speedWindow(bundles, from, now + 1),
    before: speedWindow(bundles, from - days * DAY, from),
    lateNow,
  };
}

// ─── New and returning customers, week by week ────────────────────────────────

export interface CustomerWeek {
  key: string;
  label: string;
  /** First bundle ever with the shop came in this week. */
  newCustomers: number;
  /** Had brought clothes before this week. */
  returning: number;
  customers: number;
  current: boolean;
}

export interface CustomerWeeks {
  weeks: CustomerWeek[];
  /**
   * This week so far against the same days of last week, up to the same time:
   * the only fair way to read a week that is not over.
   */
  soFar: { newCustomers: number; returning: number };
  sameDaysLastWeek: { newCustomers: number; returning: number };
  /** Of everyone who has ever brought clothes, how many came more than once. */
  cameBackShare: number | null;
  everyone: number;
}

function mondayOf(at: number): Date {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date;
}

export function customerWeeks(bundles: ServiceBundle[], weeks: number = 8, now: number = Date.now()): CustomerWeeks {
  const dated = bundles.filter(bundle => timeOf(bundle.createdAt) > 0 && timeOf(bundle.createdAt) <= now);
  const firstSeen = new Map<string, number>();
  const visits = new Map<string, number>();
  for (const bundle of dated) {
    const who = customerOf(bundle);
    const at = timeOf(bundle.createdAt);
    firstSeen.set(who, Math.min(firstSeen.get(who) ?? at, at));
    visits.set(who, (visits.get(who) || 0) + 1);
  }

  const count = (from: number, to: number) => {
    const seen = new Set<string>();
    let fresh = 0, back = 0;
    for (const bundle of dated) {
      const at = timeOf(bundle.createdAt);
      if (at < from || at >= to) continue;
      const who = customerOf(bundle);
      if (seen.has(who)) continue;
      seen.add(who);
      if ((firstSeen.get(who) ?? at) >= from) fresh += 1;
      else back += 1;
    }
    return { newCustomers: fresh, returning: back };
  };

  const thisMonday = mondayOf(now);
  const rows: CustomerWeek[] = [];
  for (let back = weeks - 1; back >= 0; back -= 1) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - back * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const sunday = new Date(end);
    sunday.setDate(sunday.getDate() - 1);
    const { newCustomers, returning } = count(start.getTime(), end.getTime());
    rows.push({
      key: `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`,
      label: back === 0 ? 'This week' : back === 1 ? 'Last week' : `${start.getDate()} ${SHORT_MONTHS[start.getMonth()]} – ${sunday.getDate()} ${SHORT_MONTHS[sunday.getMonth()]}`,
      newCustomers,
      returning,
      customers: newCustomers + returning,
      current: back === 0,
    });
  }
  const firstWithAny = rows.findIndex(row => row.customers > 0);

  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const sameMoment = new Date(now);
  sameMoment.setDate(sameMoment.getDate() - 7);

  const everyone = visits.size;
  const cameBack = [...visits.values()].filter(times => times > 1).length;
  return {
    weeks: firstWithAny < 0 ? [] : rows.slice(firstWithAny),
    soFar: count(thisMonday.getTime(), now + 1),
    sameDaysLastWeek: count(lastMonday.getTime(), sameMoment.getTime() + 1),
    cameBackShare: percent(cameBack, everyone),
    everyone,
  };
}

// ─── The busiest day of the week ──────────────────────────────────────────────

export interface WeekdayRow {
  /** "Monday". */
  name: string;
  /** How many of this weekday the shop has been open over the stretch. */
  days: number;
  bundles: number;
  value: number;
  /** Bundles on an average one of these days. */
  averageBundles: number;
  /** Work taken in on an average one of these days. */
  averageValue: number;
}

export interface BusiestDays {
  /** Monday first. */
  rows: WeekdayRow[];
  /** Index into rows of the busiest, by average work taken in. Null when there is too little to say. */
  busiest: number | null;
  quietest: number | null;
  weeks: number;
}

/**
 * Each weekday's average, not its total: in a stretch that started on a
 * Thursday there is one more Thursday than Monday, and a total would make
 * Thursday look busier for that alone. Only whole days count - today is left
 * out until it is over - and nothing from before the shop's first bundle.
 */
export function busiestDays(bundles: ServiceBundle[], weeks: number = 8, now: number = Date.now()): BusiestDays {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dated = bundles.filter(bundle => timeOf(bundle.createdAt) > 0);
  const first = dated.length ? Math.min(...dated.map(bundle => timeOf(bundle.createdAt))) : today.getTime();
  const firstDay = new Date(first);
  firstDay.setHours(0, 0, 0, 0);
  const wanted = new Date(today);
  wanted.setDate(wanted.getDate() - weeks * 7);
  const start = new Date(Math.max(wanted.getTime(), firstDay.getTime()));

  const rows: WeekdayRow[] = WEEKDAYS.map(name => ({ name, days: 0, bundles: 0, value: 0, averageBundles: 0, averageValue: 0 }));
  const slot = (at: number) => (new Date(at).getDay() + 6) % 7;
  for (const day = new Date(start); day < today; day.setDate(day.getDate() + 1)) rows[slot(day.getTime())].days += 1;
  for (const bundle of dated) {
    const at = timeOf(bundle.createdAt);
    if (at < start.getTime() || at >= today.getTime()) continue;
    const row = rows[slot(at)];
    row.bundles += 1;
    row.value += Math.max(0, Number(bundle.total) || 0);
  }
  for (const row of rows) {
    row.averageBundles = row.days ? row.bundles / row.days : 0;
    row.averageValue = row.days ? row.value / row.days : 0;
  }
  const counted = rows.reduce((sum, row) => sum + row.bundles, 0);
  const open = rows.filter(row => row.days > 0 && row.bundles > 0);
  const enough = counted >= 10 && rows.every(row => row.days >= 1);
  const pick = (better: (a: WeekdayRow, b: WeekdayRow) => boolean) => {
    if (!enough || !open.length) return null;
    let best = open[0];
    for (const row of open) if (better(row, best)) best = row;
    return rows.indexOf(best);
  };
  return {
    rows,
    busiest: pick((a, b) => a.averageValue > b.averageValue),
    quietest: pick((a, b) => a.averageValue < b.averageValue),
    weeks,
  };
}

// ─── The customers the shop depends on ────────────────────────────────────────

export interface TopCustomer {
  key: string;
  name: string;
  phone: string;
  visits: number;
  /** What their bundles over the stretch were priced at. */
  value: number;
  /** Paid on those bundles so far. */
  paid: number;
  owed: number;
  lastAt: number;
  /** Of all the work taken in over the stretch, their part. 0-100. */
  share: number;
}

export interface TopCustomers {
  days: number;
  list: TopCustomer[];
  /** Of all the work taken in over the stretch, how much came from the list. */
  topShare: number | null;
  everyone: number;
  total: number;
}

export function topCustomers(
  store: Pick<StoreData, 'pendingPayments'>,
  bundles: ServiceBundle[],
  days: number = 90,
  count: number = 5,
  now: number = Date.now(),
): TopCustomers {
  const from = now - days * DAY;
  const debts = new Map((store.pendingPayments || []).map(entry => [entry.id, entry]));
  const people = new Map<string, TopCustomer>();
  let total = 0;
  for (const bundle of bundles) {
    const at = timeOf(bundle.createdAt);
    if (!at || at < from || at > now) continue;
    const value = Math.max(0, Number(bundle.total) || 0);
    const paid = Math.min(value, Math.max(0, Number(debts.get(`laundry-${bundle.clientRef}`)?.paid) || 0));
    const key = customerOf(bundle);
    const row = people.get(key) || {
      key, name: String(bundle.customerName || 'A customer').trim() || 'A customer', phone: String(bundle.customerPhone || ''),
      visits: 0, value: 0, paid: 0, owed: 0, lastAt: 0, share: 0,
    };
    row.visits += 1;
    row.value += value;
    row.paid += paid;
    row.owed += value - paid;
    if (at > row.lastAt) {
      row.lastAt = at;
      if (bundle.customerName) row.name = String(bundle.customerName).trim();
    }
    people.set(key, row);
    total += value;
  }
  const list = [...people.values()]
    .sort((a, b) => b.value - a.value || b.visits - a.visits)
    .slice(0, count)
    .map(row => ({ ...row, share: total > 0 ? Math.round((row.value / total) * 100) : 0 }));
  const listed = list.reduce((sum, row) => sum + row.value, 0);
  return { days, list, topShare: percent(listed, total), everyone: people.size, total };
}

/** "2 days ago", "today", "3 weeks ago". */
export function agoInWords(at: number, now: number = Date.now()): string {
  const days = Math.floor((now - at) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
