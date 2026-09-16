/**
 * The notification switches, kept per shop.
 *
 * There was one set of these for the whole phone, stored under the literal key
 * 'global'. A merchant running two shops from one handset had one master
 * switch, one Order notifications switch, one set of quiet hours: turning off
 * order alerts for the quiet second shop turned them off for the busy one they
 * live on, and muting a shop they were not working in muted the one they were.
 *
 * Every switch now belongs to a shop. They are keyed by the shop's identity
 * alone and not by its trade - unlike a half-finished cart, which means
 * nothing in another trade and so is scoped by both (see lib/screen-memory).
 * These are settled preferences: a shop that turns off debt reminders and is
 * later changed from a provision store to a laundry still does not want debt
 * reminders.
 *
 * The service worker is untouched by this. It reads one record, 'global', and
 * that record is now kept as a mirror of whichever shop is open - which is the
 * shop whose pushes this device receives, since opening a shop re-points the
 * device's push subscription to it.
 */

import type { StoreData } from '@/types/store';

export interface FlowNotificationPreferences {
  enabled: boolean;
  orders: boolean;
  flowCheckins: boolean;
  businessInsights: boolean;
  debtReminders: boolean;
  sounds: boolean;
  criticalAlerts: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
}

export const DEFAULT_FLOW_NOTIFICATION_PREFERENCES: FlowNotificationPreferences = {
  enabled: true,
  orders: true,
  flowCheckins: true,
  businessInsights: true,
  debtReminders: true,
  sounds: true,
  criticalAlerts: true,
  quietHoursEnabled: true,
  quietStart: '22:00',
  quietEnd: '07:00',
};

const DB_NAME = 'storeflow-notifications';
const STORE_NAME = 'preferences';
/** What the service worker reads: the open shop's switches, mirrored. */
const DELIVERY_KEY = 'global';
const LOCAL_PREFIX = 'storeflow_notification_preferences_v2_';
/** The single shared record every shop used to answer to. */
const LEGACY_LOCAL_KEY = 'storeflow_notification_preferences_v1';

let shopKey: string | null = null;

/** The shop a set of switches belongs to, or null before one is open. */
function keyFor(store: Partial<StoreData> | null | undefined): string | null {
  if (!store) return null;
  return String(store.id || store.storeId || store.accessCode || '').trim() || null;
}

function recordKey(): string {
  return `shop:${shopKey}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open notification preferences'));
  });
}

function readLocalAt(key: string): FlowNotificationPreferences | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...DEFAULT_FLOW_NOTIFICATION_PREFERENCES, ...JSON.parse(raw) } : null;
  } catch { return null; }
}

/** What this shop has settled on, with the shared old record as its start. */
function readLocal(): FlowNotificationPreferences | null {
  if (!shopKey) return readLocalAt(LEGACY_LOCAL_KEY);
  return readLocalAt(LOCAL_PREFIX + shopKey) ?? readLocalAt(LEGACY_LOCAL_KEY);
}

function writeLocal(next: FlowNotificationPreferences): void {
  if (!shopKey) return;
  try { localStorage.setItem(LOCAL_PREFIX + shopKey, JSON.stringify(next)); } catch { /* private mode */ }
}

/**
 * What the switches say right now, without waiting.
 *
 * Flow's check-ins are decided while somebody is looking at a screen, so they
 * cannot wait on IndexedDB; they read this mirror. It answers for the shop
 * that is open, which is the whole point of the change.
 */
export function readFlowNotificationPreferencesSync(): FlowNotificationPreferences {
  return readLocal() ?? DEFAULT_FLOW_NOTIFICATION_PREFERENCES;
}

/** Hand the open shop's switches to the worker that shows the pushes. */
async function mirrorToDelivery(next: FlowNotificationPreferences): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(next, DELIVERY_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* no IndexedDB: the worker falls back to its own defaults */ }
  try {
    const registration = await navigator.serviceWorker?.ready;
    registration?.active?.postMessage({ type: 'SET_NOTIFICATION_PREFERENCES', preferences: next });
  } catch { /* no worker here */ }
}

/**
 * Whose switches these are, from now on.
 *
 * Called once where the shop is decided, the same way Flow's memory is bound,
 * so no screen has to remember to ask. A shop opened for the first time since
 * this change starts from whatever the phone had set before, so nobody loses a
 * switch they had already turned off - and from then on it is its own.
 */
export function setNotificationPreferencesShop(store: Partial<StoreData> | null | undefined): void {
  shopKey = keyFor(store);
  if (!shopKey) return;

  const own = readLocalAt(LOCAL_PREFIX + shopKey);
  if (!own) {
    const inherited = readLocalAt(LEGACY_LOCAL_KEY);
    if (inherited) writeLocal(inherited);
  }
  // The worker shows pushes for the shop that is open, so it is told which
  // switches to honour now that a different shop is.
  void mirrorToDelivery(readFlowNotificationPreferencesSync());
}

export async function getFlowNotificationPreferences(): Promise<FlowNotificationPreferences> {
  const local = readLocal();
  if (!shopKey) return local || DEFAULT_FLOW_NOTIFICATION_PREFERENCES;

  try {
    const db = await openDb();
    return await new Promise(resolve => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(recordKey());
      request.onsuccess = () => {
        const next = { ...DEFAULT_FLOW_NOTIFICATION_PREFERENCES, ...(request.result || local || {}) };
        writeLocal(next);
        resolve(next);
      };
      request.onerror = () => resolve(local || DEFAULT_FLOW_NOTIFICATION_PREFERENCES);
    });
  } catch {
    return local || DEFAULT_FLOW_NOTIFICATION_PREFERENCES;
  }
}

export async function saveFlowNotificationPreferences(patch: Partial<FlowNotificationPreferences>): Promise<FlowNotificationPreferences> {
  const next = { ...(await getFlowNotificationPreferences()), ...patch };
  // With no shop open there is nobody to save them for. The screen these come
  // from lives inside a shop, so this is a guard rather than a path.
  if (!shopKey) return next;

  writeLocal(next);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(next, recordKey());
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* localStorage still has it */ }
  await mirrorToDelivery(next);
  return next;
}

export function isTimeInQuietHours(now: Date, start: string, end: string): boolean {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const current = now.getHours() * 60 + now.getMinutes();
  const from = sh * 60 + sm;
  const to = eh * 60 + em;
  if (from === to) return true;
  if (from < to) return current >= from && current < to;
  return current >= from || current < to;
}
