/// <reference lib="webworker" />
// StoreFlow Merchant Service Worker
// Background-first Web Push handling: order alerts continue when the PWA is closed.
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;
cleanupOutdatedCaches();
const STOREFLOW_PRECACHE = self.__WB_MANIFEST;
precacheAndRoute(STOREFLOW_PRECACHE);
self.skipWaiting();
self.addEventListener('activate', event => event.waitUntil(Promise.all([self.clients.claim(), caches.delete('html')])));
registerRoute(({ request }) => request.mode === 'navigate', new NetworkFirst({ cacheName: 'html', networkTimeoutSeconds: 2 }));
registerRoute(({ request }) => ['style','script','worker','image','font'].includes(request.destination), new StaleWhileRevalidate({ cacheName: 'assets' }));
setCatchHandler(async ({ event }) => event.request.mode === 'navigate' ? ((await matchPrecache('/index.html')) || Response.error()) : Response.error());

interface PushPayload { title?: string; body?: string; tag?: string; url?: string; priority?: 'critical'|'normal'; notification_id?: string; orderId?: string; orderNumber?: string; actions?: { action:string; title:string }[]; type?: string; category?: string; }
interface NotificationPreferences { enabled:boolean; orders:boolean; flowCheckins:boolean; businessInsights:boolean; debtReminders:boolean; sounds:boolean; criticalAlerts:boolean; quietHoursEnabled:boolean; quietStart:string; quietEnd:string; }
const DEFAULT_PREFS: NotificationPreferences = { enabled:true, orders:true, flowCheckins:true, businessInsights:true, debtReminders:true, sounds:true, criticalAlerts:true, quietHoursEnabled:true, quietStart:'22:00', quietEnd:'07:00' };

function versionedAsset(path:string) {
  const normalized = path.replace(/^\//, '');
  const entries = STOREFLOW_PRECACHE as Array<{ url:string; revision?:string }>;
  const entry = entries.find(item => item.url.replace(/^\//, '') === normalized);
  return entry?.revision ? `${path}?v=${encodeURIComponent(entry.revision)}` : path;
}

/**
 * Buttons on the notification itself.
 *
 * Every notification used to carry one button, 'open', whatever it was about —
 * so the buttons were decoration and the merchant had to open the app and find
 * the thing before they could do anything about it.
 *
 * A reply action with `type: 'text'` puts a text field in the notification
 * shade; whatever is typed arrives as `event.reply` on notificationclick.
 * Browsers that do not support it drop the action rather than failing, so the
 * plain buttons beside it still work.
 */
function buildActions(data: PushPayload): NotificationAction[] {
  if (data.actions?.length) return data.actions as NotificationAction[];
  const category = categoryOf(data);

  if (category === 'order') {
    return [
      { action:'order-ready', title:'✅ Mark ready' },
      { action:'reply', type:'text', title:'💬 Message customer',
        placeholder:'Message to the customer…' } as NotificationAction,
    ];
  }
  if (category === 'debt') {
    return [
      { action:'reply', type:'text', title:'💬 Send reminder',
        placeholder:'Reminder to send…' } as NotificationAction,
      { action:'open', title:'💰 Open' },
    ];
  }
  // Savings and stock warnings are things to know, not things to answer. The
  // merchant should be able to end them from the shade in one tap.
  if (category === 'savings' || category === 'stock_loss') {
    return [
      { action:'acknowledge', title:'👍 I understand' },
      { action:'open', title:'Open' },
    ];
  }
  return [{ action:'open', title:'⚡ Open StoreFlow' }];
}
function notificationUrl(data: PushPayload) {
  if (data.url) return data.url;
  if (data.orderId) {
    const params = new URLSearchParams({ tab:'orders', order_id:data.orderId });
    if (data.orderNumber) params.set('order_number', data.orderNumber);
    return `/?${params.toString()}`;
  }
  return '/?tab=dashboard';
}
function categoryOf(data: PushPayload): 'order'|'flow'|'insight'|'debt'|'savings'|'stock_loss'|'other' {
  const raw = `${data.type || ''} ${data.category || ''} ${data.tag || ''} ${data.title || ''}`.toLowerCase();
  if (data.orderId || raw.includes('order')) return 'order';
  if (raw.includes('saving') || raw.includes('auto-saved')) return 'savings';
  if (raw.includes('shrink') || raw.includes('stock_loss') || raw.includes('stock loss') || raw.includes('missing')) return 'stock_loss';
  if (raw.includes('flow') || raw.includes('check-in') || raw.includes('checkin')) return 'flow';
  if (raw.includes('debt') || raw.includes('repayment') || raw.includes('pending')) return 'debt';
  if (raw.includes('insight') || raw.includes('stock') || raw.includes('sales') || raw.includes('recommend')) return 'insight';
  return 'other';
}
function quietNow(start:string,end:string) {
  const [sh,sm] = start.split(':').map(Number), [eh,em] = end.split(':').map(Number);
  const current = new Date().getHours()*60 + new Date().getMinutes(), from=sh*60+sm, to=eh*60+em;
  if (from === to) return true;
  return from < to ? current >= from && current < to : current >= from || current < to;
}
/**
 * The one place this database is opened.
 *
 * Version 2 adds `queued`, which holds notices the app worked out while it was
 * running so they can still be shown after it is closed. Both openers have to
 * agree on the version — a second one still asking for version 1 would throw
 * VersionError and take notification preferences down with it.
 */
const DB_NAME = 'storeflow-notifications';
const DB_VERSION = 2;
const STORES = ['preferences', 'queued'] as const;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readPreferences(): Promise<NotificationPreferences> {
  try {
    const db = await openDb();
    return await new Promise(resolve=>{
      const req=db.transaction('preferences','readonly').objectStore('preferences').get('global');
      req.onsuccess=()=>resolve({ ...DEFAULT_PREFS, ...(req.result || {}) } as NotificationPreferences);
      req.onerror=()=>resolve(DEFAULT_PREFS);
    });
  } catch { return DEFAULT_PREFS; }
}
function allowed(data:PushPayload,prefs:NotificationPreferences) {
  if (!prefs.enabled) return false;
  const category=categoryOf(data);
  if (category==='order' && !prefs.orders) return false;
  if (category==='flow' && !prefs.flowCheckins) return false;
  // Savings and shrinkage are business insights as far as the merchant's
  // switches are concerned — without this there would be no way to turn them
  // off short of revoking notifications for the whole app.
  if ((category==='insight' || category==='savings' || category==='stock_loss') && !prefs.businessInsights) return false;
  if (category==='debt' && !prefs.debtReminders) return false;
  const priority=data.priority || 'normal';
  if (prefs.quietHoursEnabled && quietNow(prefs.quietStart,prefs.quietEnd) && !(priority==='critical' && prefs.criticalAlerts)) return false;
  return true;
}

/** Tells every open window something happened, if any are open. */
async function postToClients(message: unknown) {
  const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
  for (const client of clients) {
    try { client.postMessage(message); } catch { /* window went away */ }
  }
}

/**
 * Notices the app queued for later, in the order they were added.
 *
 * Savings and shrinkage are both worked out entirely from data already on the
 * phone, so raising them does not actually need a server — only something
 * awake to do it. Web Push needs a backend because the VAPID private key
 * cannot ship in the app; periodic background sync does not, because the
 * browser wakes this worker directly. It is Chrome-and-Android only, only for
 * an installed app, and fires when the browser feels like it rather than on a
 * schedule, so it is a fallback rather than a promise — but it costs nothing
 * and works while the backend is unavailable.
 */
interface QueuedNotice {
  id: string;
  title: string;
  body: string;
  tag: string;
  category: string;
  url: string;
  queuedAt: number;
}

/** Queued notices older than this are stale news and are dropped unshown. */
const QUEUED_NOTICE_TTL_MS = 3 * 86400000;

async function readQueuedNotices(): Promise<QueuedNotice[]> {
  try {
    const db = await openDb();
    return await new Promise(resolve => {
      const req = db.transaction('queued', 'readonly').objectStore('queued').get('pending');
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

async function writeQueuedNotices(notices: QueuedNotice[]) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('queued', 'readwrite');
      tx.objectStore('queued').put(notices, 'pending');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* nothing queued is better than a broken worker */ }
}

/** Shows whatever is waiting, then empties the queue. */
async function drainQueuedNotices() {
  const queued = await readQueuedNotices();
  if (queued.length === 0) return;
  await writeQueuedNotices([]);

  const prefs = await readPreferences();
  const now = Date.now();
  const appIcon = versionedAsset('/icons/icon-192.png');

  for (const notice of queued) {
    if (now - notice.queuedAt > QUEUED_NOTICE_TTL_MS) continue;
    if (!allowed({ title: notice.title, tag: notice.tag, category: notice.category }, prefs)) continue;
    // Don't say it again if one about the same subject is already sitting there.
    const already = await self.registration.getNotifications({ tag: notice.tag });
    if (already.length > 0) continue;

    await self.registration.showNotification(notice.title, {
      body: notice.body,
      tag: notice.tag,
      icon: appIcon,
      badge: appIcon,
      silent: !prefs.sounds,
      data: { url: new URL(notice.url, self.location.origin).href, tag: notice.tag, category: notice.category },
      actions: buildActions({ title: notice.title, tag: notice.tag, category: notice.category }),
    } as NotificationOptions);
  }
}

// Chrome wakes an installed app's worker on its own schedule. This is the only
// route by which these notices reach a closed phone without a backend.
self.addEventListener('periodicsync', (event: any) => {
  if (event.tag !== 'storeflow-notices') return;
  event.waitUntil(drainQueuedNotices());
});

self.addEventListener('push', event => {
  let data: PushPayload = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title:'StoreFlow', body:event.data?.text() || 'New notification received' }; }
  const title = data.title || 'StoreFlow Alert ⚡';
  const tag = data.tag || data.notification_id || (data.orderId ? `order-${data.orderId}` : 'storeflow-alert');
  const url = notificationUrl(data), priority = data.priority || 'normal';
  event.waitUntil((async () => {
    const prefs=await readPreferences();
    if (!allowed(data,prefs)) return;
    const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    const visible = clients.find(c => (c as WindowClient).visibilityState === 'visible') as WindowClient | undefined;
    if (visible) {
      visible.postMessage({ type:'STOREFLOW_PUSH_RECEIVED', title, body:data.body || '', url, orderId:data.orderId || null, orderNumber:data.orderNumber || null, tag, priority });
      return;
    }
    const absoluteUrl = new URL(url, self.location.origin).href;
    const appIcon = versionedAsset('/icons/icon-192.png');
    await self.registration.showNotification(title, {
      body:data.body || 'New StoreFlow alert', icon:appIcon, badge:appIcon, tag,
      renotify:false, silent:!prefs.sounds, requireInteraction:priority === 'critical', timestamp:Date.now(),
      data:{ url:absoluteUrl, orderId:data.orderId || null, orderNumber:data.orderNumber || null, tag, category:categoryOf(data) },
      vibrate:prefs.sounds ? (priority === 'critical' ? [300,100,300,100,300] : [180,80,180]) : [], actions:buildActions(data),
    } as NotificationOptions);
    try { const current = await self.registration.getNotifications(); if ('setAppBadge' in navigator) await (navigator as any).setAppBadge(current.length); } catch {}
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action || '';
  // Whatever was typed into the notification's reply field, where the browser
  // supports one.
  const reply = (event as any).reply as string | undefined;

  // "I understand" is the whole point of the button: the merchant has seen it
  // and does not want the app opened over it.
  if (action === 'acknowledge') {
    event.waitUntil((async () => {
      await postToClients({ type:'STOREFLOW_NOTIFICATION_ACK', tag:data.tag || null, category:data.category || null });
      if ('clearAppBadge' in navigator) { try { await (navigator as any).clearAppBadge(); } catch {} }
    })());
    return;
  }
  // A pressed action carries its intent into the app, so the right screen
  // opens already doing the thing rather than dumping the merchant on a list.
  const actionParam = action && action !== 'open' ? `&notif_action=${encodeURIComponent(action)}` : '';
  const replyParam = reply ? `&notif_reply=${encodeURIComponent(reply)}` : '';
  const rawUrl = data.url || (data.orderId
    ? `/?tab=orders&order_id=${encodeURIComponent(data.orderId)}${data.orderNumber ? `&order_number=${encodeURIComponent(data.orderNumber)}` : ''}`
    : '/?tab=dashboard');
  const targetUrl = new URL(`${rawUrl}${rawUrl.includes('?') ? '' : '?'}${actionParam}${replyParam}`, self.location.origin).href;
  event.waitUntil((async () => {
    if ('clearAppBadge' in navigator) { try { await (navigator as any).clearAppBadge(); } catch {} }

    const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    const sameOrigin = clients.filter(c => {
      try { return new URL(c.url).origin === self.location.origin; } catch { return false; }
    }) as WindowClient[];

    const existing = sameOrigin[0];
    if (existing) {
      try {
        const navigated = await existing.navigate(targetUrl);
        const client = navigated || existing;
        await client.focus();
        return client;
      } catch {
        try { await existing.focus(); } catch {}
      }
    }

    try {
      const opened = await self.clients.openWindow(targetUrl);
      if (opened) {
        try { await opened.focus(); } catch {}
      }
      return opened;
    } catch (error) {
      console.warn('[StoreFlow Push] Failed to open notification target:', error);
      return null;
    }
  })());
});

self.addEventListener('message', event => {
  const msg = event.data; if (!msg) return;
  if (msg.type === 'SET_NOTIFICATION_PREFERENCES' && msg.preferences) {
    event.waitUntil((async()=>{
      try {
        const db=await openDb();
        await new Promise<void>((resolve,reject)=>{const tx=db.transaction('preferences','readwrite');tx.objectStore('preferences').put(msg.preferences,'global');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
      } catch {}
    })());
  }
  // The app worked something out while it was open and wants it shown later,
  // if it gets the chance.
  if (msg.type === 'QUEUE_NOTICE' && msg.notice) event.waitUntil((async () => {
    const queued = await readQueuedNotices();
    if (queued.some(n => n.id === msg.notice.id)) return;
    await writeQueuedNotices([...queued, { ...msg.notice, queuedAt: Date.now() }]);
  })());
  if (msg.type === 'DROP_QUEUED_NOTICE' && msg.id) event.waitUntil((async () => {
    const queued = await readQueuedNotices();
    await writeQueuedNotices(queued.filter(n => n.id !== msg.id));
  })());
  if (msg.type === 'CLEAR_NOTIFICATIONS') event.waitUntil((async () => {
    const notifications = await self.registration.getNotifications();
    for (const n of notifications) if (!msg.orderId || n.data?.orderId === msg.orderId || n.tag?.includes(msg.orderId)) n.close();
    if ('clearAppBadge' in navigator) { try { await (navigator as any).clearAppBadge(); } catch {} }
  })());
  if (msg.type === 'GET_PUSH_STATUS') event.waitUntil((async () => {
    const subscription = await self.registration.pushManager.getSubscription();
    (event.source as WindowClient | null)?.postMessage({ type:'STOREFLOW_PUSH_STATUS', subscribed:!!subscription, endpoint:subscription?.endpoint || null });
  })());
});
