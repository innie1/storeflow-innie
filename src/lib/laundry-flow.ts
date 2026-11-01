import type { StoreData } from '@/types/store';
import { dayKey } from '@/lib/day-records';

/**
 * The flow of a laundry: clothes coming in, and money coming in.
 *
 * Every analysis screen in the app was built for a till, where a sale and the
 * customer's visit are one moment, so they counted money and nothing else. A
 * laundry's work arrives days before its money. A shop could take in six
 * bundles worth ₦21,700, be paid ₦4,000 for one of them, and read as one sale
 * on one day. This puts the two side by side, and follows what was brought in:
 * how much of it has been paid for, by how many of the people who brought it.
 *
 * Two different questions, kept apart on purpose:
 *   - money received in a stretch is everything paid in it, including a debt
 *     from last month. That is the line on the graph.
 *   - paid on what came in looks only at the bundles brought in during the
 *     stretch, however late they were paid. That is the percentages.
 */

export type FlowRange = '7d' | '30d' | 'all';

export interface FlowBundle {
  clientRef: string;
  createdAt: string;
  total: number;
  pieceCount?: number;
  workflowStage?: string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
}

export interface FlowPoint {
  key: string;
  label: string;
  /** What the clothes brought in are priced at, paid or not. */
  broughtIn: number;
  /** Money received, for this work or any other. */
  moneyIn: number;
  bundles: number;
  pieces: number;
}

export interface LaundryFlow {
  range: FlowRange;
  /** One point a day, or a week once a stretch is too long to read by day. */
  unit: 'day' | 'week';
  points: FlowPoint[];
  bundles: number;
  pieces: number;
  broughtIn: number;
  moneyIn: number;
  /** Paid so far on the bundles brought in during this stretch. */
  paidOnThese: number;
  owedOnThese: number;
  /** Of what these bundles are priced at, how much is paid, 0-100. */
  paidShare: number;
  paidInFull: number;
  partPaid: number;
  nothingPaid: number;
  /** How many different people brought clothes, and how many of them have paid anything. */
  customersBrought: number;
  customersPaid: number;
  customersPaidShare: number;
  collected: number;
  collectedShare: number;
  /** The weekday clothes come in most, when one really stands out. */
  busiestWeekday: { name: string; bundles: number } | null;
  story: string[];
}

const DAY_MS = 86400000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** A whole number of calendar days on, which is not always 24 hours each. */
function addDays(start: number, days: number): number {
  const date = new Date(start);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

function timeOf(value: unknown): number {
  const at = new Date(String(value || '')).getTime();
  return Number.isFinite(at) ? at : 0;
}

function shortDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function customerOf(bundle: FlowBundle): string {
  return String(bundle.customerId || bundle.customerPhone || bundle.customerName || bundle.clientRef).trim().toLowerCase();
}

/** A day is only "busiest" if it is well ahead of an even spread over the week. */
function busiestWeekday(bundles: FlowBundle[]): LaundryFlow['busiestWeekday'] {
  const counts = new Array<number>(7).fill(0);
  for (const bundle of bundles) counts[new Date(timeOf(bundle.createdAt)).getDay()] += 1;
  const most = Math.max(...counts);
  if (most < Math.max(3, (bundles.length / 7) * 1.6)) return null;
  return { name: WEEKDAYS[counts.indexOf(most)], bundles: most };
}

function tellStory(flow: Omit<LaundryFlow, 'story'>): string[] {
  const when = flow.range === '7d' ? 'In the last 7 days' : flow.range === '30d' ? 'In the last 30 days' : 'So far';
  if (flow.bundles === 0) {
    return flow.moneyIn > 0
      ? [`${when}, no clothes came in, and ${naira(flow.moneyIn)} was received for earlier work.`]
      : [`${when}, no clothes came in and no money was received.`];
  }
  const story = [
    `${when}, ${plural(flow.bundles, 'bundle')} (${plural(flow.pieces, 'piece')}) worth ${naira(flow.broughtIn)} came in.`,
    flow.paidOnThese > 0
      ? `${naira(flow.paidOnThese)} of that has been paid (${flow.paidShare}%), and ${naira(flow.owedOnThese)} is still owed.`
      : `None of that has been paid yet, so ${naira(flow.owedOnThese)} is still owed.`,
    `${flow.customersPaid} of the ${plural(flow.customersBrought, 'customer')} who brought clothes ${flow.customersPaid === 1 ? 'has' : 'have'} paid something.`,
  ];
  if (flow.busiestWeekday) story.push(`Clothes come in most on ${flow.busiestWeekday.name}: ${plural(flow.busiestWeekday.bundles, 'bundle')}.`);
  return story;
}

export function laundryFlow(
  store: Pick<StoreData, 'sales' | 'pendingPayments'>,
  bundles: FlowBundle[],
  range: FlowRange,
  now: number = Date.now(),
): LaundryFlow {
  const today = startOfDay(now);
  const sales = (store.sales || []).filter(sale => timeOf(sale?.date) > 0);
  const dated = (bundles || []).filter(bundle => timeOf(bundle?.createdAt) > 0);
  const earliest = Math.min(today, ...dated.map(bundle => startOfDay(timeOf(bundle.createdAt))), ...sales.map(sale => startOfDay(timeOf(sale.date))));
  // Never before the shop's first record: those days are not quiet days, they
  // are days nobody was recording, and drawn as zero they flatten everything.
  const wanted = range === '7d' ? addDays(today, -6) : range === '30d' ? addDays(today, -29) : earliest;
  const from = Math.max(wanted, earliest);
  const until = addDays(today, 1);

  const spanDays = Math.round((today - from) / DAY_MS) + 1;
  const unit: LaundryFlow['unit'] = spanDays > 92 ? 'week' : 'day';
  const step = unit === 'week' ? 7 : 1;

  // Every day in the stretch, so a day with nothing on it reads as nothing on
  // the line instead of being skipped over.
  const points: FlowPoint[] = [];
  const starts: number[] = [];
  for (let start = from; start < until; start = addDays(start, step)) {
    starts.push(start);
    points.push({ key: dayKey(start), label: shortDate(start), broughtIn: 0, moneyIn: 0, bundles: 0, pieces: 0 });
  }
  const pointAt = (at: number): FlowPoint | undefined => {
    for (let index = starts.length - 1; index >= 0; index -= 1) if (at >= starts[index]) return points[index];
    return undefined;
  };

  let moneyIn = 0;
  for (const sale of sales) {
    const at = timeOf(sale.date);
    if (at < from || at >= until) continue;
    const amount = Number(sale.total) || 0;
    moneyIn += amount;
    const point = pointAt(at);
    if (point) point.moneyIn += amount;
  }

  const debts = new Map((store.pendingPayments || []).map(entry => [entry.id, entry]));
  const inRange = dated.filter(bundle => {
    const at = timeOf(bundle.createdAt);
    return at >= from && at < until;
  });

  let pieces = 0, broughtIn = 0, paidOnThese = 0, paidInFull = 0, partPaid = 0, nothingPaid = 0, collected = 0;
  const brought = new Set<string>();
  const paying = new Set<string>();
  for (const bundle of inRange) {
    const total = Math.max(0, Number(bundle.total) || 0);
    const count = Number(bundle.pieceCount) || 0;
    // No record of a debt means no record of any money: never assumed paid.
    const paid = Math.min(total, Math.max(0, Number(debts.get(`laundry-${bundle.clientRef}`)?.paid) || 0));
    pieces += count;
    broughtIn += total;
    paidOnThese += paid;
    if (paid <= 0) nothingPaid += 1;
    else if (paid >= total) paidInFull += 1;
    else partPaid += 1;
    if (bundle.workflowStage === 'collected') collected += 1;
    brought.add(customerOf(bundle));
    if (paid > 0) paying.add(customerOf(bundle));
    const point = pointAt(timeOf(bundle.createdAt));
    if (point) {
      point.broughtIn += total;
      point.bundles += 1;
      point.pieces += count;
    }
  }

  const flow: Omit<LaundryFlow, 'story'> = {
    range,
    unit,
    points,
    bundles: inRange.length,
    pieces,
    broughtIn,
    moneyIn,
    paidOnThese,
    owedOnThese: Math.max(0, broughtIn - paidOnThese),
    paidShare: percent(paidOnThese, broughtIn),
    paidInFull,
    partPaid,
    nothingPaid,
    customersBrought: brought.size,
    customersPaid: paying.size,
    customersPaidShare: percent(paying.size, brought.size),
    collected,
    collectedShare: percent(collected, inRange.length),
    busiestWeekday: busiestWeekday(inRange),
  };
  return { ...flow, story: tellStory(flow) };
}

export interface LaundryPace {
  /** How many days the estimate rests on. */
  daysKnown: number;
  /** Too little history to say anything honest yet. */
  enough: boolean;
  bundlesPerWeek: number;
  broughtInPerWeek: number;
  moneyPerWeek: number;
  /** What would be left unpaid each week if this carried on. */
  gapPerWeek: number;
}

/** Below this, one busy day decides the whole estimate. */
export const PACE_MIN_DAYS = 14;
const PACE_WINDOW_DAYS = 28;

/**
 * If the next week goes like the last few: clothes and money, side by side.
 *
 * A plain average on purpose. A trend line through a few weeks of a small shop
 * is a guess dressed as a sum.
 */
export function laundryPace(store: Pick<StoreData, 'sales'>, bundles: FlowBundle[], now: number = Date.now()): LaundryPace {
  const today = startOfDay(now);
  const until = addDays(today, 1);
  const times = (bundles || []).map(bundle => timeOf(bundle?.createdAt)).filter(at => at > 0);
  const moneyTimes = (store.sales || []).map(sale => timeOf(sale?.date)).filter(at => at > 0);
  const first = Math.min(today, ...times, ...moneyTimes);
  const daysKnown = Math.round((today - startOfDay(first)) / DAY_MS) + 1;
  const window = Math.min(daysKnown, PACE_WINDOW_DAYS);
  const from = addDays(today, -(window - 1));
  const inWindow = (at: number) => at >= from && at < until;

  const recent = (bundles || []).filter(bundle => inWindow(timeOf(bundle?.createdAt)));
  const brought = recent.reduce((sum, bundle) => sum + Math.max(0, Number(bundle.total) || 0), 0);
  const money = (store.sales || []).reduce((sum, sale) => (inWindow(timeOf(sale?.date)) ? sum + (Number(sale.total) || 0) : sum), 0);
  const perWeek = (value: number) => (value / window) * 7;
  return {
    daysKnown,
    enough: daysKnown >= PACE_MIN_DAYS,
    bundlesPerWeek: Math.round(perWeek(recent.length) * 10) / 10,
    broughtInPerWeek: Math.round(perWeek(brought)),
    moneyPerWeek: Math.round(perWeek(money)),
    gapPerWeek: Math.max(0, Math.round(perWeek(brought - money))),
  };
}
