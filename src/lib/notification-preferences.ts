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
const KEY = 'global';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open notification preferences'));
  });
}

export async function getFlowNotificationPreferences(): Promise<FlowNotificationPreferences> {
  try {
    const db = await openDb();
    return await new Promise(resolve => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY);
      request.onsuccess = () => resolve({ ...DEFAULT_FLOW_NOTIFICATION_PREFERENCES, ...(request.result || {}) });
      request.onerror = () => resolve(DEFAULT_FLOW_NOTIFICATION_PREFERENCES);
    });
  } catch {
    return DEFAULT_FLOW_NOTIFICATION_PREFERENCES;
  }
}

export async function saveFlowNotificationPreferences(patch: Partial<FlowNotificationPreferences>): Promise<FlowNotificationPreferences> {
  const next = { ...(await getFlowNotificationPreferences()), ...patch };
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(next, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}

  // Keep the active Service Worker in sync. It can read the same IndexedDB
  // even when the PWA is completely closed.
  try {
    const registration = await navigator.serviceWorker?.ready;
    registration?.active?.postMessage({ type: 'SET_NOTIFICATION_PREFERENCES', preferences: next });
  } catch {}
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
