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

// ─── Push Notifications ─────────────────────────────────────────────────
// Payload shape sent by the send-order-push edge function:
// { title, body, tag, url }
self.addEventListener('push', (event: PushEvent) => {
  let data: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'StoreFlow', body: event.data?.text() || 'You have a new notification' };
  }

  const title = data.title || 'StoreFlow';
  const options: NotificationOptions = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag,
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
  } as NotificationOptions;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

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
