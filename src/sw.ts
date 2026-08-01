/// <reference lib="webworker" />
// Custom service worker (replaces the auto-generated one) so we can add
// push notification + notification-click handling for new orders, while
// keeping the same offline-first precaching/runtime-caching behavior the
// app already had.

import { precacheAndRoute, cleanupOutdatedCaches, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.skipWaiting();
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'html', networkTimeoutSeconds: 2 })
);

registerRoute(
  ({ request }) => ['style', 'script', 'worker', 'image', 'font'].includes(request.destination),
  new StaleWhileRevalidate({ cacheName: 'assets' })
);

// SPA offline fallback — equivalent to the old workbox `navigateFallback:
// "/index.html"`, which injectManifest mode doesn't provide automatically.
// Without this, a direct/offline navigation to a client-side route (e.g.
// reopening the app on /inventory with no network) would fail instead of
// falling back to the shell.
setCatchHandler(async ({ event }) => {
  if (event.request.mode === 'navigate') {
    return (await matchPrecache('/index.html')) || Response.error();
  }
  return Response.error();
});

// ─── Push Notifications (Background OS Lockscreen & System Tray) ─────────
// Handles Web Push payloads sent by Edge Functions (send-order-push) even when
// the app or browser is completely closed — matching WhatsApp / Facebook behavior.
self.addEventListener('push', (event: PushEvent) => {
  let data: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'StoreFlow', body: event.data?.text() || 'New order notification received' };
  }

  const title = data.title || 'StoreFlow Order Alert 🛒';
  const options: NotificationOptions = {
    body: data.body || 'New order received!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'storeflow-order',
    renotify: true,
    requireInteraction: true, // keeps notification active in system tray like WhatsApp
    data: { url: data.url || '/?tab=orders' },
    vibrate: [300, 100, 300, 100, 300], // system alert vibration pattern
    actions: [
      { action: 'open', title: '🛒 View Order' }
    ]
  } as NotificationOptions;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/?tab=orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => 'focus' in c) as WindowClient | undefined;
      if (existing) {
        existing.navigate(url).catch(() => {});
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
