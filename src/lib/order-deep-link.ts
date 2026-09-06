import type { TabId } from '@/types/store';

/**
 * Deep links from order push notifications.
 *
 * The service worker opens `/?tab=orders&order_id=<id>&order_number=<num>` when
 * a merchant taps an order notification (see src/sw.ts). Nothing used to read
 * those parameters, so the tap only ever landed on the dashboard and the
 * merchant had to hunt for the order themselves.
 */
export interface OrderDeepLink {
  orderId: string;
  orderNumber?: string;
}

/**
 * What the merchant pressed on the notification itself.
 *
 * Notification buttons used to be decoration: every one was 'open', and the
 * handler ignored which had been pressed, so the app opened at a list and the
 * merchant had to find the thing again before they could act on it. The
 * service worker now passes the action through, and the typed text with it
 * where the browser offers a reply field.
 */
export interface NotificationAct {
  /** 'order-ready', 'reply', 'acknowledge', … */
  action: string;
  /** What was typed into the notification, when it was a reply. */
  reply?: string;
}

/** Actions the app will act on. Anything else is ignored rather than trusted. */
const KNOWN_ACTIONS = ['order-ready', 'reply', 'acknowledge'];

export function readNotificationAct(search: string): NotificationAct | null {
  const params = new URLSearchParams(search || '');
  const action = (params.get('notif_action') || '').trim();
  if (!KNOWN_ACTIONS.includes(action)) return null;

  // A reply is text the merchant typed on their own device, but it arrives
  // through a URL, so it is length-capped like any other untrusted input.
  const reply = (params.get('notif_reply') || '').trim().slice(0, 500);
  return reply ? { action, reply } : { action };
}

/** Tabs a notification is allowed to jump to, so a crafted URL can't drive the app anywhere. */
const LINKABLE_TABS: TabId[] = ['orders', 'dashboard', 'sales', 'inventory', 'customers'];

export function readOrderDeepLink(search: string): OrderDeepLink | null {
  const params = new URLSearchParams(search || '');
  const orderId = (params.get('order_id') || '').trim();
  if (!orderId) return null;

  const orderNumber = (params.get('order_number') || '').trim();
  return orderNumber ? { orderId, orderNumber } : { orderId };
}

export function readLinkedTab(search: string): TabId | null {
  const requested = (new URLSearchParams(search || '').get('tab') || '').trim().toLowerCase();
  if (!requested) return null;
  return (LINKABLE_TABS as string[]).includes(requested) ? (requested as TabId) : null;
}

/**
 * The address bar shouldn't keep pointing at one order after we've opened it --
 * a refresh would otherwise re-focus a stale order forever.
 */
export function stripOrderDeepLink(search: string): string {
  const params = new URLSearchParams(search || '');
  for (const key of ['tab', 'order_id', 'order_number', 'notif_action', 'notif_reply']) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}
