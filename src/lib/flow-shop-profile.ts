import type { StoreData } from '@/types/store';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';

/**
 * What Flow has worked out about this particular shop.
 *
 * Flow's memory held conversation context - the last thing asked, the last
 * product mentioned, learned aliases - and nothing about how the shop itself
 * behaves. Every shop got the same generic advice, however long it had been
 * running and however much it had told the app.
 *
 * These patterns are *derived* from the shop's own records rather than stored.
 * Derived cannot drift from the truth, needs no migration, and is right the
 * moment a record changes. It also costs nothing: everything here is already
 * on the device.
 *
 * Every fact carries how much evidence is behind it, and anything thin is
 * withheld rather than dressed up. A shop with four jobs does not have a
 * busiest day, and saying otherwise is how an app teaches its owner not to
 * trust it.
 */

export interface ShopFact {
  /** The finding, in the shop's own terms. */
  text: string;
  /** How many records it rests on. */
  evidence: number;
}

export interface ShopProfile {
  /** Jobs the shop has ever recorded. */
  jobs: number;
  facts: ShopFact[];
  /** True once there is enough history for any of this to mean something. */
  confident: boolean;
}

/** Below this, a pattern is a coincidence. */
const MIN_EVIDENCE = 8;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** The one value that appears most, and how often. */
function commonest<T>(values: T[]): { value: T; count: number } | null {
  if (!values.length) return null;
  const tally = new Map<T, number>();
  for (const value of values) tally.set(value, (tally.get(value) || 0) + 1);
  const [value, count] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  return { value, count };
}

export function shopProfile(store: StoreData): ShopProfile {
  const accessCode = String((store as { accessCode?: string }).accessCode || '');
  let records: ReturnType<typeof getLocalLaundryRecords> = [];
  try {
    if (accessCode) records = getLocalLaundryRecords(accessCode);
  } catch {
    records = [];
  }

  const jobs = records.length;
  const facts: ShopFact[] = [];
  const confident = jobs >= MIN_EVIDENCE;

  if (!confident) {
    return { jobs, facts, confident };
  }

  // ── When the work arrives ────────────────────────────────────────────
  const days = records
    .map(record => new Date(record.createdAt).getDay())
    .filter(day => Number.isFinite(day));
  const busiestDay = commonest(days);
  // A day is only "busiest" if it is meaningfully ahead of an even spread.
  if (busiestDay && busiestDay.count >= Math.max(3, jobs / 7 * 1.6)) {
    facts.push({
      text: `${DAYS[busiestDay.value]} is your busiest day — ${busiestDay.count} of your ${jobs} jobs came in on one.`,
      evidence: jobs,
    });
  }

  // ── What a job is usually worth ──────────────────────────────────────
  const totals = records.map(record => Number(record.total) || 0).filter(total => total > 0);
  if (totals.length >= MIN_EVIDENCE) {
    facts.push({
      text: `A typical job here is ${money(median(totals))}.`,
      evidence: totals.length,
    });
  }

  // ── How long work actually takes ─────────────────────────────────────
  const turnarounds = records
    .filter(record => record.workflowStage === 'collected' && record.stageUpdatedAt)
    .map(record => {
      const inAt = new Date(record.createdAt).getTime();
      const outAt = new Date(record.stageUpdatedAt as string).getTime();
      return Number.isFinite(inAt) && Number.isFinite(outAt) ? (outAt - inAt) / 86_400_000 : NaN;
    })
    .filter(days => Number.isFinite(days) && days >= 0);
  if (turnarounds.length >= 5) {
    const typical = median(turnarounds);
    const said = typical < 1
      ? 'the same day'
      : `${Math.round(typical)} day${Math.round(typical) === 1 ? '' : 's'}`;
    facts.push({
      text: `You usually turn work around in ${said}.`,
      evidence: turnarounds.length,
    });
  }

  // ── Whether people come back ─────────────────────────────────────────
  const byCustomer = new Map<string, number>();
  for (const record of records) {
    const key = String(record.customerPhone || record.customerName || '').trim().toLowerCase();
    if (!key) continue;
    byCustomer.set(key, (byCustomer.get(key) || 0) + 1);
  }
  if (byCustomer.size >= 5) {
    const repeat = [...byCustomer.values()].filter(count => count > 1).length;
    const share = Math.round((repeat / byCustomer.size) * 100);
    facts.push({
      text: repeat > 0
        ? `${share}% of your customers come back — ${repeat} of ${byCustomer.size}.`
        : 'Nobody has come back a second time yet. That is the number worth moving.',
      evidence: byCustomer.size,
    });
  }

  // ── What people actually bring ───────────────────────────────────────
  const garments = records.flatMap(record => (record.garments || []).map(item => item.garmentType));
  const topGarment = commonest(garments);
  if (topGarment && garments.length >= 10) {
    facts.push({
      text: `${topGarment.value} is what you handle most.`,
      evidence: garments.length,
    });
  }

  // ── Whether promises are kept ────────────────────────────────────────
  const promised = records.filter(record => record.promisedFor);
  if (promised.length >= MIN_EVIDENCE) {
    const late = promised.filter(record => {
      const due = new Date(record.promisedFor as string).getTime();
      if (!Number.isFinite(due)) return false;
      const handedBack = record.workflowStage === 'collected' && record.stageUpdatedAt
        ? new Date(record.stageUpdatedAt).getTime()
        : Date.now();
      return handedBack > due;
    }).length;
    const share = Math.round((late / promised.length) * 100);
    facts.push({
      text: late === 0
        ? 'You have never missed a promised day. That is worth telling customers.'
        : `${share}% of your jobs went past the promised day — ${late} of ${promised.length}.`,
      evidence: promised.length,
    });
  }

  return { jobs, facts, confident };
}

/**
 * What Flow says when asked what it has learned.
 *
 * Honest about thin evidence rather than inventing a pattern: an app that
 * makes something up from four records teaches its owner not to believe the
 * next thing it says.
 */
export function shopProfileBrief(store: StoreData): string {
  const profile = shopProfile(store);

  if (!profile.confident) {
    const needed = MIN_EVIDENCE - profile.jobs;
    return profile.jobs === 0
      ? 'I have not seen any work yet, so I know nothing about how this shop runs. Record a few jobs and I will start noticing patterns.'
      : `I have only seen ${profile.jobs} job${profile.jobs === 1 ? '' : 's'} so far — not enough to call anything a pattern. About ${needed} more and I can tell you how this shop actually runs.`;
  }

  if (!profile.facts.length) {
    return `I have seen ${profile.jobs} jobs, but nothing stands out strongly enough to call a pattern yet.`;
  }

  return [
    `Here is what I have noticed about this shop, from ${profile.jobs} jobs:`,
    '',
    ...profile.facts.map(fact => `• ${fact.text}`),
  ].join('\n');
}
