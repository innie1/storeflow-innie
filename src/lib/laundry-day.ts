/**
 * The four things a laundry needs to know before it opens.
 *
 * The home screen used to lead with today's takings and a lifetime customer
 * count. Neither tells anybody what to do: takings are the result of yesterday
 * and the customer count is a number that only goes up. Somebody opening the
 * app at seven in the morning wants the work - what is promised today, what is
 * already late, what is finished and waiting to be collected, and how much is
 * owed.
 *
 * These are the four things a paper book physically cannot answer. A book of
 * tickets cannot be sorted by date, so "what is late" means reading every
 * ticket; and money owed simply disappears into it. This is the case for the
 * app in one card, which is why it belongs at the top of the first screen.
 *
 * Every count here is read off the same decorated record the workspace uses,
 * so tapping through to the list can never disagree with the number that sent
 * you there.
 */

import type { DecoratedRecord } from '@/lib/laundry-records';
import { daysBetween, readySince } from '@/lib/uncollected';

export interface DayBoard {
  /** Promised for today and not finished. */
  dueToday: number;
  /** Promised before today and still not finished. */
  late: number;
  /** Washed, folded, and waiting for someone to come for it. */
  ready: number;
  /** Days the longest-waiting ready bundle has sat on the shelf. */
  longestReadyDays: number;
  /** Money owed: balances on bundles already handed back. */
  owed: number;
  /** How many handed-back bundles that money is spread across. */
  owedCount: number;
  /** Bundles still in the shop - not yet handed back. */
  waitingCount: number;
  /** What those bundles are priced at, paid or not. */
  waitingValue: number;
  /** How much of that is not paid yet: to be paid on collection, not owed. */
  waitingUnpaid: number;
  /** How many bundles still in the shop carry a balance. */
  waitingUnpaidCount: number;
  /** Nothing to show. A shop with no records should not see four zeros. */
  empty: boolean;
}

const DAY = 86400000;

/** Midnight this morning, in the reader's own timezone. */
function startOfToday(now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function laundryDayBoard(records: DecoratedRecord[], now: number = Date.now()): DayBoard {
  const dayStart = startOfToday(now);
  const dayEnd = dayStart + DAY;

  let dueToday = 0;
  let late = 0;
  let ready = 0;
  let longestReadyDays = 0;
  let owed = 0;
  let owedCount = 0;
  let waitingCount = 0;
  let waitingValue = 0;
  let waitingUnpaid = 0;
  let waitingUnpaidCount = 0;

  for (const record of records) {
    /*
     * `overdue` comes from the record itself rather than being recomputed,
     * because it carries a rule worth keeping: a bundle sitting on the Ready
     * shelf past its promised time is not late. It is finished, and waiting
     * for the customer. Counting it as late would have the board shouting
     * about work that is already done.
     */
    if (record.overdue) late += 1;
    else if (record.promisedAt !== null && record.promisedAt >= dayStart && record.promisedAt < dayEnd && record.stage !== 'collected' && record.stage !== 'ready') {
      dueToday += 1;
    }

    if (record.stage === 'ready') {
      ready += 1;
      const since = readySince({ steps: record.steps, stageUpdatedAt: record.order?.updated_at, createdAt: record.createdAt });
      if (since > 0) longestReadyDays = Math.max(longestReadyDays, daysBetween(since, now));
    }

    /*
     * Still in the shop: everything not yet handed back. Its price is work
     * done or under way, and its unpaid part is money not realised yet - the
     * same rule as waitingToCollect, read here off the decorated record so it
     * includes bundles taken on another phone.
     */
    if (record.stage !== 'collected') {
      waitingCount += 1;
      waitingValue += Number(record.total) || 0;
      waitingUnpaid += Math.max(0, Number(record.balance) || 0);
      if (record.balance > 0) waitingUnpaidCount += 1;
    }

    /*
     * Owed is a handed-over bundle with a balance: the customer has the
     * clothes and the shop does not have the money. A balance on a bundle
     * still in the shop was counted here too, so somebody whose clothes were
     * in the wash read as a debtor; that is counted above, as what is to be
     * paid on collection.
     */
    if (record.stage === 'collected' && record.balance > 0) {
      owed += record.balance;
      owedCount += 1;
    }
  }

  return {
    dueToday,
    late,
    ready,
    longestReadyDays,
    owed: Math.round(owed),
    owedCount,
    waitingCount,
    waitingValue: Math.round(waitingValue),
    waitingUnpaid: Math.round(waitingUnpaid),
    waitingUnpaidCount,
    empty: records.length === 0,
  };
}

/**
 * What the board says out loud, for the shops that would rather be told.
 *
 * Ordered by what would ruin the day first: late work, then money owed, then
 * what is waiting to go out.
 */
export function dayBoardSentence(board: DayBoard): string {
  if (board.empty) return 'Nothing recorded yet.';

  const parts: string[] = [];
  if (board.late > 0) parts.push(`${board.late} ${board.late === 1 ? 'bundle is' : 'bundles are'} late`);
  if (board.dueToday > 0) parts.push(`${board.dueToday} due today`);
  if (board.ready > 0) parts.push(`${board.ready} ready to collect`);
  if (board.owed > 0) parts.push(`₦${board.owed.toLocaleString()} owed`);

  if (!parts.length) return 'Nothing due, nothing late, nothing owed.';
  return `${parts.join(' · ')}.`;
}
