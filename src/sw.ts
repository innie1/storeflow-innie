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

function buildActions(data: PushPayload) {
  if (data.actions?.length) return data.actions;
  const tag = (data.tag || '').toLowerCase(), title = (data.title || '').toLowerCase();
  if (tag.includes('order') || title.includes('order')) return [{ action:'open', title:'🛍️ View Order' }];
  if (tag.includes('streak') || title.includes('streak')) return [{ action:'open', title:'🔥 Open StoreFlow' }];
  if (tag.includes('sales') || title.includes('sales') || title.includes('check-in')) return [{ action:'open', title:'📈 View Sales' }];
  if (tag.includes('debt') || tag.includes('bill') || title.includes('repayment')) return [{ action:'open', title:'💰 View Pending' }];
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
function categoryOf(data: PushPayload): 'order'|'flow'|'insight'|'debt'|'other' {
  const raw = `${data.type || ''} ${data.category || ''} ${data.tag || ''} ${data.title || ''}`.toLowerCase();
  if (data.orderId || raw.includes('order')) return 'order';
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
async function readPreferences(): Promise<NotificationPreferences> {
  try {
    const db = await new Promise<IDBDatabase>((resolve,reject)=>{
      const req = indexedDB.open('storeflow-notifications',1);
      req.onupgradeneeded = () => req.result.createObjectStore('preferences');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
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
  if (category==='insight' && !prefs.businessInsights) return false;
  if (category==='debt' && !prefs.debtReminders) return false;
  const priority=data.priority || 'normal';
  if (prefs.quietHoursEnabled && quietNow(prefs.quietStart,prefs.quietEnd) && !(priority==='critical' && prefs.criticalAlerts)) return false;
  return true;
}

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
  const rawUrl = data.url || (data.orderId
    ? `/?tab=orders&order_id=${encodeURIComponent(data.orderId)}${data.orderNumber ? `&order_number=${encodeURIComponent(data.orderNumber)}` : ''}`
    : '/?tab=dashboard');
  const targetUrl = new URL(rawUrl, self.location.origin).href;
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
        const db=await new Promise<IDBDatabase>((resolve,reject)=>{const req=indexedDB.open('storeflow-notifications',1);req.onupgradeneeded=()=>req.result.createObjectStore('preferences');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
        await new Promise<void>((resolve,reject)=>{const tx=db.transaction('preferences','readwrite');tx.objectStore('preferences').put(msg.preferences,'global');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
      } catch {}
    })());
  }
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
