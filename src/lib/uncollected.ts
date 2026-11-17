/**
 * Clothes that are finished and still on the shelf.
 *
 * A ready bundle is work the shop has already done. If it was not paid for at
 * drop-off, its money arrives only when somebody comes for it - so a shelf of
 * uncollected clothes is the shop's own money, waiting on a customer who has
 * usually just forgotten. The Ready list showed these bundles, but in no
 * order and with nothing to say how long each had sat there or whether the
 * customer had been told.
 *
 * This is that list in the order worth acting on - longest waiting first -
 * with what is to be paid on each, and a note of when each customer was last
 * reminded so the same person is not messaged twice in a day and another
 * never.
 */

import type { StoreData } from '@/types/store';
import type { LaundryStageStep, LocalLaundryRecord } from '@/lib/laundry-offline';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { laundryBalance } from '@/lib/laundry-money';
import { customerGreeting, normalizeWhatsAppPhone, shopSignature } from '@/lib/laundry-whatsapp';
import { shopStorage } from '@/lib/shop-storage';

const DAY = 86400000;

/** Ready this long is no longer "will come tomorrow". */
export const LONG_WAIT_DAYS = 7;

/** Reminded this recently, the customer has been told; asking again is nagging. */
export const REMIND_AGAIN_DAYS = 3;

export interface UncollectedBundle {
  clientRef: string;
  tagCode: string;
  customerName: string;
  customerPhone: string;
  pieceCount: number;
  total: number;
  /** Still to be paid on it. 0 when it was paid in full. */
  balance: number;
  shelfLocation?: string;
  /** When it went on the Ready shelf. */
  readySince: number;
  /** Whole days it has waited since. */
  daysWaiting: number;
  /** When this phone last sent a reminder for it, or null. */
  lastRemindedAt: number | null;
  reminders: number;
}

export interface Uncollected {
  /** Longest waiting first. */
  list: UncollectedBundle[];
  count: number;
  /** What those bundles are priced at. */
  value: number;
  /** What is still to be paid on them, and on how many. */
  toPay: number;
  toPayCount: number;
  /** How many have waited LONG_WAIT_DAYS or more. */
  longWaiting: number;
  /** Days the longest has waited. */
  longestDays: number;
}

/**
 * When a bundle became ready.
 *
 * The last time it was moved to Ready, because a bundle sent back to be
 * re-ironed and finished again has been waiting since the second time. A
 * bundle from before moves were kept has only the time its stage last changed.
 */
export function readySince(record: {
  steps?: Pick<LaundryStageStep, 'stage' | 'at'>[];
  stageUpdatedAt?: string;
  createdAt?: string | number;
}): number {
  const moves = (record.steps || [])
    .filter(step => step.stage === 'ready')
    .map(step => Date.parse(String(step.at)))
    .filter(Number.isFinite);
  if (moves.length) return Math.max(...moves);
  const updated = Date.parse(String(record.stageUpdatedAt || ''));
  if (Number.isFinite(updated)) return updated;
  const created = typeof record.createdAt === 'number' ? record.createdAt : Date.parse(String(record.createdAt || ''));
  return Number.isFinite(created) ? created : 0;
}

/** Whole days between two moments, never negative. */
export function daysBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / DAY));
}

/* ── Reminders already sent ─────────────────────────────────────────────── */

export interface ReminderNote { at: string; count: number }

const remindersKey = (accessCode: string) => `storeflow_collection_reminders_${String(accessCode || '').trim().toUpperCase()}`;

/**
 * Which bundles this phone has sent a reminder for, and when.
 *
 * Kept on the phone that sent it. A reminder is a WhatsApp message opened from
 * this phone, so this phone is the one that knows; it is a note for the person
 * holding it, not a record of the shop.
 */
export function collectionReminders(accessCode: string): Record<string, ReminderNote> {
  try {
    const parsed = JSON.parse(shopStorage.getItem(remindersKey(accessCode)) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Note that a reminder went out. Notes for bundles since collected are dropped. */
export function noteCollectionReminder(
  accessCode: string,
  clientRef: string,
  now: number = Date.now(),
  stillWaiting?: string[],
): Record<string, ReminderNote> {
  const notes = collectionReminders(accessCode);
  const next: Record<string, ReminderNote> = {};
  const keep = stillWaiting ? new Set([...stillWaiting, clientRef]) : null;
  for (const [ref, note] of Object.entries(notes)) {
    if (!keep || keep.has(ref)) next[ref] = note;
  }
  next[clientRef] = { at: new Date(now).toISOString(), count: (notes[clientRef]?.count || 0) + 1 };
  try { shopStorage.setItem(remindersKey(accessCode), JSON.stringify(next)); } catch { /* storage full or private mode: the reminder still went */ }
  return next;
}

/* ── The list ───────────────────────────────────────────────────────────── */

export function uncollectedBundles(
  store: Pick<StoreData, 'accessCode' | 'pendingPayments'>,
  now: number = Date.now(),
): Uncollected {
  const accessCode = String(store.accessCode || '');
  let records: LocalLaundryRecord[] = [];
  try { records = accessCode ? shopLaundryRecords(accessCode) : []; } catch { /* none readable */ }
  const notes = accessCode ? collectionReminders(accessCode) : {};

  const list: UncollectedBundle[] = records
    .filter(record => record.workflowStage === 'ready')
    /*
     * A bundle the shop is taking back to the customer is not waiting on the
     * customer. Telling them to come for it would be wrong, and it belongs on
     * the deliveries list instead.
     */
    .filter(record => record.fulfillment !== 'delivery')
    .map(record => {
      const since = readySince({ steps: record.stageHistory, stageUpdatedAt: record.stageUpdatedAt, createdAt: record.createdAt });
      const note = notes[record.clientRef];
      const reminded = note ? Date.parse(note.at) : NaN;
      return {
        clientRef: record.clientRef,
        tagCode: String(record.tagCode || '').toUpperCase(),
        customerName: String(record.customerName || 'Walk-in Customer'),
        customerPhone: String(record.customerPhone || ''),
        pieceCount: Number(record.pieceCount) || 0,
        total: Math.max(0, Number(record.total) || 0),
        balance: Math.max(0, laundryBalance(store as StoreData, record.clientRef)),
        shelfLocation: record.shelfLocation || undefined,
        readySince: since,
        daysWaiting: daysBetween(since, now),
        lastRemindedAt: Number.isFinite(reminded) ? reminded : null,
        reminders: note?.count || 0,
      };
    })
    // Longest waiting first; between two the same, the one with more to pay.
    .sort((a, b) => a.readySince - b.readySince || b.balance - a.balance);

  return {
    list,
    count: list.length,
    value: Math.round(list.reduce((sum, bundle) => sum + bundle.total, 0)),
    toPay: Math.round(list.reduce((sum, bundle) => sum + bundle.balance, 0)),
    toPayCount: list.filter(bundle => bundle.balance > 0).length,
    longWaiting: list.filter(bundle => bundle.daysWaiting >= LONG_WAIT_DAYS).length,
    longestDays: list.length ? list[0].daysWaiting : 0,
  };
}

/** "today", "since yesterday", "6 days". */
export function waitingInWords(days: number): string {
  if (days <= 0) return 'Ready today';
  if (days === 1) return 'Ready since yesterday';
  return `Ready ${days} days`;
}

/** "Reminded today", "Reminded 2 days ago". Empty when never reminded. */
export function remindedInWords(bundle: Pick<UncollectedBundle, 'lastRemindedAt' | 'reminders'>, now: number = Date.now()): string {
  if (bundle.lastRemindedAt === null) return '';
  const days = daysBetween(bundle.lastRemindedAt, now);
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return bundle.reminders > 1 ? `Reminded ${bundle.reminders} times, last ${when}` : `Reminded ${when}`;
}

/** Told recently enough that another message now would be nagging. */
export function remindedRecently(bundle: Pick<UncollectedBundle, 'lastRemindedAt'>, now: number = Date.now()): boolean {
  return bundle.lastRemindedAt !== null && now - bundle.lastRemindedAt < REMIND_AGAIN_DAYS * DAY;
}

/* ── The reminder itself ────────────────────────────────────────────────── */

/**
 * What the customer is sent.
 *
 * Short, because it is the second message they have had about this bundle and
 * the first one listed everything. It says the three things that get somebody
 * to come: it is ready, which bundle it is, and what to bring.
 */
export function collectionReminderMessage(
  store: Pick<StoreData, 'storeName' | 'profile'>,
  bundle: Pick<UncollectedBundle, 'customerName' | 'tagCode' | 'pieceCount' | 'balance' | 'readySince' | 'daysWaiting'>,
): string {
  const shop = String(store.storeName || 'our shop');
  const since = new Date(bundle.readySince).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const ready = bundle.daysWaiting >= 1 && bundle.readySince > 0
    ? `Your laundry at ${shop} has been ready since ${since}.`
    : `Your laundry at ${shop} is ready for collection.`;
  const pay = bundle.balance > 0
    ? `To pay on collection: ₦${Math.round(bundle.balance).toLocaleString()}`
    : 'Paid in full';
  const lines = [
    customerGreeting(bundle.customerName),
    '',
    ready,
    '',
    ...(bundle.tagCode ? [`*Laundry code: ${bundle.tagCode}*`] : []),
    ...(bundle.pieceCount > 0 ? [`${bundle.pieceCount} ${bundle.pieceCount === 1 ? 'piece' : 'pieces'}`] : []),
    pay,
    '',
    'Please come by when you can, or reply to tell us when to expect you.',
    '',
    ...shopSignature(store),
  ];
  return lines.join('\n');
}

/**
 * Where the reminder opens.
 *
 * Straight to the customer's chat when the shop has their number. Without one,
 * WhatsApp opens with the message written and asks who it goes to - so a
 * walk-in who gave no number can still be reminded through whoever dropped the
 * clothes off.
 */
export function collectionReminderLink(
  store: Pick<StoreData, 'storeName' | 'profile'>,
  bundle: Parameters<typeof collectionReminderMessage>[1] & Pick<UncollectedBundle, 'customerPhone'>,
): string {
  const text = encodeURIComponent(collectionReminderMessage(store, bundle));
  const phone = normalizeWhatsAppPhone(bundle.customerPhone);
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
