/**
 * The evening count, which is the habit the app has to take over.
 *
 * A laundry closes by going through the book: how many bundles came in, what
 * was taken, who has not paid, what is promised tomorrow. It happens every
 * night whether or not anybody has installed anything, and it is the single
 * moment where paper is doing real work rather than just being written on.
 *
 * So this is the ritual, answered before it is asked. Not a report - a report
 * is something you go and fetch, and nobody fetches one at nine at night after
 * standing over a machine all day. Four numbers and one line about tomorrow,
 * on the screen that is already open.
 *
 * It appears in the evening and can be marked done, because a close that keeps
 * asking to be closed is a nag, and the shop that dismisses it tonight will
 * dismiss it unread tomorrow.
 */

import type { StoreData } from '@/types/store';
import type { DecoratedRecord } from '@/lib/laundry-records';
import { revenueInRange, startOfToday } from '@/lib/revenue-window';

const DAY = 86400000;

/**
 * When the shop starts thinking about closing.
 *
 * Five in the afternoon, not midnight: a Nigerian laundry closes somewhere
 * between six and eight, and a summary that only appears once the day is over
 * has missed the moment it exists for.
 */
export const CLOSE_FROM_HOUR = 17;

const DONE_KEY = 'storeflow_day_closed_';

export interface DayClose {
  /** Bundles taken in today. */
  bundlesIn: number;
  /** Pieces in those bundles - a shirt is one, a bundle of twenty is twenty. */
  piecesIn: number;
  /** Money actually collected today, including payments against older bundles. */
  taken: number;
  /** Still owed on the bundles taken in today. */
  owedFromToday: number;
  /** Still owed across everything, which is the figure that keeps growing. */
  owedTotal: number;
  /** Promised for tomorrow and not finished - what the morning looks like. */
  dueTomorrow: number;
  /** Finished and waiting to be collected, carried into tomorrow. */
  readyWaiting: number;
  /** Nothing happened today. Said rather than shown as four zeros. */
  quiet: boolean;
}

/** Which day a timestamp falls on, as a plain local-midnight number. */
function dayOf(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function laundryDayClose(
  store: StoreData,
  records: DecoratedRecord[],
  now: number = Date.now(),
): DayClose {
  const today = startOfToday(now);
  const tomorrow = today + DAY;
  const dayAfter = tomorrow + DAY;

  let bundlesIn = 0;
  let piecesIn = 0;
  let owedFromToday = 0;
  let owedTotal = 0;
  let dueTomorrow = 0;
  let readyWaiting = 0;

  for (const record of records) {
    const cameInToday = record.createdAt > 0 && dayOf(record.createdAt) === today;
    if (cameInToday) {
      bundlesIn += 1;
      piecesIn += Number(record.pieceCount) || 0;
      if (record.balance > 0) owedFromToday += record.balance;
    }

    if (record.balance > 0) owedTotal += record.balance;

    if (record.stage === 'ready') readyWaiting += 1;

    /*
     * Tomorrow's work excludes anything already finished. A bundle promised
     * for tomorrow that is washed and folded tonight is not work waiting in
     * the morning, and counting it would have the shop bracing for a day it
     * has already done.
     */
    if (
      record.promisedAt !== null
      && record.promisedAt >= tomorrow
      && record.promisedAt < dayAfter
      && record.stage !== 'ready'
      && record.stage !== 'collected'
    ) {
      dueTomorrow += 1;
    }
  }

  const taken = Math.round(revenueInRange(store, 'today', now));

  return {
    bundlesIn,
    piecesIn,
    taken,
    owedFromToday: Math.round(owedFromToday),
    owedTotal: Math.round(owedTotal),
    dueTomorrow,
    readyWaiting,
    quiet: bundlesIn === 0 && taken === 0,
  };
}

/** Whether the evening has come round. */
export function isClosingTime(now: number = Date.now()): boolean {
  return new Date(now).getHours() >= CLOSE_FROM_HOUR;
}

export function wasDayClosed(accessCode: string, now: number = Date.now()): boolean {
  try {
    return localStorage.getItem(DONE_KEY + String(accessCode).toUpperCase()) === String(startOfToday(now));
  } catch {
    return false;
  }
}

/** Marked against today, so tomorrow evening it asks again. */
export function markDayClosed(accessCode: string, now: number = Date.now()): void {
  try {
    localStorage.setItem(DONE_KEY + String(accessCode).toUpperCase(), String(startOfToday(now)));
  } catch { /* private mode */ }
}

/**
 * The day in one line.
 *
 * Written the way somebody would say it out loud, because the point is that it
 * can be read at a glance by somebody who is tired.
 */
export function dayCloseSentence(close: DayClose): string {
  if (close.quiet) return 'Nothing came in today.';

  const parts = [`${close.bundlesIn} ${close.bundlesIn === 1 ? 'bundle' : 'bundles'} in`];
  if (close.piecesIn > 0) parts[0] += ` (${close.piecesIn} ${close.piecesIn === 1 ? 'piece' : 'pieces'})`;
  parts.push(`₦${close.taken.toLocaleString()} taken`);
  if (close.owedTotal > 0) parts.push(`₦${close.owedTotal.toLocaleString()} still owed`);

  return `${parts.join(', ')}.`;
}

/** What the morning holds, or nothing if it holds nothing worth saying. */
export function tomorrowSentence(close: DayClose): string {
  const bits: string[] = [];
  if (close.dueTomorrow > 0) bits.push(`${close.dueTomorrow} due tomorrow`);
  if (close.readyWaiting > 0) bits.push(`${close.readyWaiting} waiting to be collected`);
  if (!bits.length) return '';
  return `${bits.join(', ')}.`;
}
