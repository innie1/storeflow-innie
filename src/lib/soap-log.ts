/**
 * Asking about soap, occasionally, where money is already on somebody's mind.
 *
 * Most shops buy detergent with cash out of the drawer and never record it, so
 * the cost of doing a piece is worked out from a fraction of what was really
 * spent - and every figure built on it comes out flattering. The shop is told
 * it is doing better than it is.
 *
 * Nobody is going to keep a soap ledger, so this asks instead: rarely, on the
 * expenses screen where the question already fits, and never while a customer
 * is being served. It can always be dismissed without answering; a prompt that
 * must be cleared is a prompt that gets cleared without reading.
 *
 * What it does with the answer is deliberately modest. It records the spend so
 * the cost per piece is honest, and it remembers which soap was named. It does
 * not decide which soap is better: one shop changing brand between two months
 * in which a dozen other things also changed is not evidence, and dressing it
 * up as a finding would be inventing knowledge.
 */

import type { StoreData } from '@/types/store';
import { addExpense } from '@/lib/store-data';

const ASKED_KEY = 'storeflow_soap_asked_';
const LOG_KEY = 'storeflow_soap_log_';

const DAY = 86400000;

/** Long enough that it is never nagging, short enough to stay current. */
export const ASK_EVERY_DAYS = 14;

/** Not on day one. A shop with nothing recorded has nothing to be asked about. */
export const MIN_DAYS_TRADING = 5;

export interface SoapEntry {
  id: string;
  /** What was spent, in the period asked about. */
  amount: number;
  /** How many they bought, when they said. */
  quantity?: number;
  /** The brand, as the shop says it. */
  brand?: string;
  at: string;
}

const key = (prefix: string, accessCode: string) => `${prefix}${String(accessCode || '').toUpperCase()}`;

export function soapLog(accessCode: string): SoapEntry[] {
  try {
    const raw = localStorage.getItem(key(LOG_KEY, accessCode));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function lastAskedAt(accessCode: string): number {
  try {
    return Number(localStorage.getItem(key(ASKED_KEY, accessCode))) || 0;
  } catch {
    return 0;
  }
}

/**
 * Marked whether or not they answered.
 *
 * Somebody who dismisses it has answered "not now", and asking again tomorrow
 * would be ignoring that.
 */
export function markAsked(accessCode: string, at: number = Date.now()): void {
  try { localStorage.setItem(key(ASKED_KEY, accessCode), String(at)); } catch { /* private mode */ }
}

/**
 * Whether now is a reasonable moment to ask.
 *
 * Never for a shop that has only just opened, never twice in a fortnight, and
 * never for a shop that already records its soap - if the expenses show
 * consumables being bought, the question has been answered by doing.
 */
export function shouldAskAboutSoap(store: StoreData, at: number = Date.now()): boolean {
  const accessCode = String(store.accessCode || '');
  if (!accessCode) return false;

  const opened = new Date(store.createdAt || '').getTime();
  if (Number.isFinite(opened) && at - opened < MIN_DAYS_TRADING * DAY) return false;

  if (at - lastAskedAt(accessCode) < ASK_EVERY_DAYS * DAY) return false;

  const recentlyRecorded = (store.expenses || []).some(expense => {
    if (expense.category !== 'Consumables') return false;
    const when = new Date(expense.date || '').getTime();
    return Number.isFinite(when) && at - when < ASK_EVERY_DAYS * DAY;
  });
  if (recentlyRecorded) return false;

  return true;
}

/**
 * File the answer as a real expense, so every figure that reads spending sees
 * it - break-even, the cost per piece, the month's profit. A soap log the rest
 * of the app could not see would be a diary, not a record.
 */
export function recordSoapAnswer(
  store: StoreData,
  answer: { amount: number; quantity?: number; brand?: string },
  at: Date = new Date(),
): StoreData {
  const accessCode = String(store.accessCode || '');
  const amount = Math.max(0, Number(answer.amount) || 0);
  const brand = String(answer.brand || '').trim();
  const quantity = Math.max(0, Number(answer.quantity) || 0);

  const entry: SoapEntry = {
    id: `soap_${Date.now().toString(36)}`,
    amount,
    quantity: quantity || undefined,
    brand: brand || undefined,
    at: at.toISOString(),
  };

  try {
    localStorage.setItem(key(LOG_KEY, accessCode), JSON.stringify([entry, ...soapLog(accessCode)].slice(0, 60)));
  } catch { /* private mode */ }
  markAsked(accessCode, at.getTime());

  if (amount <= 0) return store;

  const note = [brand, quantity ? `${quantity}` : '']
    .filter(Boolean)
    .join(' × ') || 'Soap';

  /*
   * Through addExpense, not by appending to the array.
   *
   * Appending by hand looked equivalent and was not: addExpense also takes the
   * money out of the cash balance. Soap bought out of the drawer that never
   * left the drawer on paper would have made the books drift by exactly the
   * amount this feature exists to capture.
   */
  return addExpense(store, {
    amount,
    category: 'Consumables',
    date: at.toISOString(),
    note,
  });
}

/**
 * What the shop has used, said back plainly.
 *
 * A list of what was bought and when - not a verdict. Which soap is better is
 * not knowable from this, and saying otherwise would be inventing knowledge
 * from one shop's month.
 */
export function soapHistorySentence(accessCode: string): string {
  const log = soapLog(accessCode).filter(entry => entry.brand);
  if (!log.length) return '';

  const seen: string[] = [];
  for (const entry of log) {
    const brand = String(entry.brand);
    if (!seen.includes(brand)) seen.push(brand);
  }

  if (seen.length === 1) return `You have been using ${seen[0]}.`;
  return `You have used ${seen.slice(0, 3).join(', ')}.`;
}
