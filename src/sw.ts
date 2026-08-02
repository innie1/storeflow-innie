/// <reference lib="webworker" />
// StoreFlow Merchant Service Worker
//
// Production-grade push notification handler with:
// - Foreground suppression (no system notification if app window is visible)
// - Auto-clear stale notifications via CLEAR_NOTIFICATIONS message
// - Badge count management
// - Tag-based deduplication (no renotify)
// - Priority-based requireInteraction

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

setCatchHandler(async ({ event }) => {
  if (event.request.mode === 'navigate') {
    return (await matchPrecache('/index.html')) || Response.error();
  }
  return Response.error();
});

// ─── Push Notifications ──────────────────────────────────────────────────

self.addEventListener('push', (event: PushEvent) => {
  let data: {
    title?: string;
    body?: string;
    tag?: string;
    url?: string;
    priority?: 'critical' | 'normal';
    notification_id?: string;
    orderId?: string;
    actions?: { action: string; title: string }[];
  } = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'StoreFlow', body: event.data?.text() || 'New notification received' };
  }

  const title = data.title || 'StoreFlow Alert ⚡';
  const tag = data.tag || data.notification_id || 'storeflow-alert';
  const url = data.url || '/?tab=orders';
  const priority = data.priority || 'normal';

  // Determine action button based on notification content
  let defaultActions = [{ action: 'open', title: '🛒 View Order' }];
  if (tag.includes('streak') || tag.includes('flow') || title.includes('Streak')) {
    defaultActions = [{ action: 'open', title: '🔥 Open StoreFlow' }];
  } else if (tag.includes('sales') || title.includes('Sales') || title.includes('Check-In')) {
    defaultActions = [{ action: 'open', title: '📈 View Dashboard' }];
  } else if (tag.includes('debt') || tag.includes('bill') || title.includes('Repayment')) {
    defaultActions = [{ action: 'open', title: '💰 View Pending' }];
  }

  const showNotification = () => {
    const options: NotificationOptions = {
      body: data.body || 'New alert received!',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: tag,
      renotify: false, // Don't re-display if same tag exists — dedup
      requireInteraction: priority === 'critical', // Only pin critical notifications
      data: { url, orderId: data.orderId || null },
      vibrate: priority === 'critical' ? [300, 100, 300, 100, 300] : [200, 100, 200],
      actions: data.actions || defaultActions,
    } as NotificationOptions;

    return self.registration.showNotification(title, options);
  };

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      // Check if any visible window exists
      const visibleClient = clients.find(
        (c) => (c as WindowClient).visibilityState === 'visible'
      ) as WindowClient | undefined;

      if (visibleClient) {
        // App is in foreground — send data to the app for in-app toast instead
        visibleClient.postMessage({
          type: 'STOREFLOW_PUSH_RECEIVED',
          title,
          body: data.body || '',
          url,
          orderId: data.orderId || null,
          tag,
          priority,
        });
        // Don't show system notification for foreground — app handles it
        return;
      }

      // App is in background or closed — show system notification
      await showNotification();

      // Update badge count
      const existingNotifications = await self.registration.getNotifications();
      const badgeCount = existingNotifications.length + 1;
      if ('setAppBadge' in navigator) {
        try { (navigator as any).setAppBadge(badgeCount); } catch {}
      }
    })
  );
});

// ─── Notification Click ──────────────────────────────────────────────────

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = event.notification.data?.url || '/?tab=orders';

  event.waitUntil(
    (async () => {
      // Clear badge
      if ('clearAppBadge' in navigator) {
        try { (navigator as any).clearAppBadge(); } catch {}
      }

      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clients.find((c) => 'focus' in c) as WindowClient | undefined;

      if (existing) {
        await existing.navigate(url).catch(() => {});
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })()
  );
});

// ─── Message Handler (clear notifications from app) ──────────────────────

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const msg = event.data;
  if (!msg) return;

  if (msg.type === 'CLEAR_NOTIFICATIONS') {
    event.waitUntil(
      (async () => {
        const notifications = await self.registration.getNotifications();
        const orderId = msg.orderId;

        for (const n of notifications) {
          if (orderId) {
            // Clear notifications for a specific order
            if (n.data?.orderId === orderId || n.tag?.includes(orderId)) {
              n.close();
            }
          } else {
            // Clear all StoreFlow notifications
            n.close();
          }
        }

        // Reset badge
        if ('clearAppBadge' in navigator) {
          try { (navigator as any).clearAppBadge(); } catch {}
        }
      })()
    );
  }
});
