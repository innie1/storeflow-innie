/// <reference lib="webworker" />
// StoreFlow Merchant Service Worker
// Background-first Web Push handling: order alerts continue when the PWA is closed.
import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.skipWaiting();
self.addEventListener('activate', event => event.waitUntil(Promise.all([self.clients.claim(), caches.delete('html')])));
registerRoute(({ request }) => request.mode === 'navigate', new NetworkFirst({ cacheName: 'html', networkTimeoutSeconds: 2 }));
registerRoute(({ request }) => ['style','script','worker','image','font'].includes(request.destination), new StaleWhileRevalidate({ cacheName: 'assets' }));
setCatchHandler(async ({ event }) => event.request.mode === 'navigate' ? ((await matchPrecache('/index.html')) || Response.error()) : Response.error());

interface PushPayload { title?: string; body?: string; tag?: string; url?: string; priority?: 'critical'|'normal'; notification_id?: string; orderId?: string; orderNumber?: string; actions?: { action:string; title:string }[]; }
function buildActions(data: PushPayload) {
  if (data.actions?.length) return data.actions;
  const tag = (data.tag || '').toLowerCase(), title = (data.title || '').toLowerCase();
  if (tag.includes('order') || title.includes('order')) return [{ action:'open', title:'🛍️ View Order' }];
  if (tag.includes('streak') || title.includes('streak')) return [{ action:'open', title:'🔥 Open StoreFlow' }];
  if (tag.includes('sales') || title.includes('sales') || title.includes('check-in')) return [{ action:'open', title:'📈 View Sales' }];
  if (tag.includes('debt') || tag.includes('bill') || title.includes('repayment')) return [{ action:'open', title:'💰 View Pending' }];
  return [{ action:'open', title:'⚡ Open StoreFlow' }];
}
function notificationUrl(data: PushPayload) { return data.url || (data.orderId ? `/?tab=orders&order_id=${encodeURIComponent(data.orderId)}` : '/?tab=dashboard'); }

self.addEventListener('push', event => {
  let data: PushPayload = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title:'StoreFlow', body:event.data?.text() || 'New notification received' }; }
  const title = data.title || 'StoreFlow Alert ⚡';
  const tag = data.tag || data.notification_id || (data.orderId ? `order-${data.orderId}` : 'storeflow-alert');
  const url = notificationUrl(data), priority = data.priority || 'normal';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    const visible = clients.find(c => (c as WindowClient).visibilityState === 'visible') as WindowClient | undefined;
    if (visible) {
      visible.postMessage({ type:'STOREFLOW_PUSH_RECEIVED', title, body:data.body || '', url, orderId:data.orderId || null, orderNumber:data.orderNumber || null, tag, priority });
      return;
    }
    // This path executes inside the service worker. The StoreFlow page can be fully closed.
    await self.registration.showNotification(title, {
      body:data.body || 'New StoreFlow alert', icon:'/icons/icon-192.png', badge:'/icons/icon-192.png', tag,
      renotify:false, requireInteraction:priority === 'critical', timestamp:Date.now(),
      data:{ url, orderId:data.orderId || null, orderNumber:data.orderNumber || null, tag },
      vibrate:priority === 'critical' ? [300,100,300,100,300] : [180,80,180], actions:buildActions(data),
    } as NotificationOptions);
    try { const current = await self.registration.getNotifications(); if ('setAppBadge' in navigator) await (navigator as any).setAppBadge(current.length); } catch {}
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = data.url || (data.orderId ? `/?tab=orders&order_id=${encodeURIComponent(data.orderId)}` : '/?tab=dashboard');
  event.waitUntil((async () => {
    if ('clearAppBadge' in navigator) { try { await (navigator as any).clearAppBadge(); } catch {} }
    const clients = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    const existing = clients.find(c => 'focus' in c) as WindowClient | undefined;
    if (existing) { try { await existing.navigate(url); } catch {} return existing.focus(); }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener('message', event => {
  const msg = event.data; if (!msg) return;
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
