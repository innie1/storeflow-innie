import type { FlowNotification, StoreData } from '@/types/store';
import type { DeviceRow } from '@/lib/staff-join';

/**
 * Turn new phone requests into notifications for the owner.
 *
 * A request lives in the cloud; the owner's phone only finds out by asking.
 * Each request becomes one notification, once - asking again finds the same
 * id already there and adds nothing. No category, so the notification gate
 * shows it only to people trusted with the shop, never to a worker.
 */

/**
 * How often the owner's phone asks, in the background. Opening the app and
 * coming back to it ask as well, which is when an owner is told in person
 * that somebody is waiting - so the background check can be slow. Each ask
 * is a request against the free plan.
 */
export const DEVICE_WATCH_MS = 10 * 60 * 1000;

/** While the owner is on the Staff page, looking at the requests. */
export const STAFF_PAGE_REFRESH_MS = 2 * 60 * 1000;

export const deviceNoticeId = (requestId: string) => `device-request-${requestId}`;

const roleLabel = (role?: string) => role ? role.charAt(0).toUpperCase() + role.slice(1) : '';

export function noticeNewDeviceRequests(store: StoreData, devices: DeviceRow[], now: Date = new Date()): StoreData | null {
  const known = new Set((store.flowNotifications || []).map(n => n.id));
  const fresh: FlowNotification[] = devices
    .filter(device => device.status === 'pending' && !known.has(deviceNoticeId(device.id)))
    .map(device => ({
      id: deviceNoticeId(device.id),
      icon: '📱',
      tone: 'warning',
      date: device.requested_at || now.toISOString(),
      read: false,
      title: 'New device requesting access',
      text: `${device.staff_name} wants to use the shop on their phone`,
      description: [device.staff_name, roleLabel(device.staff_role), device.device_label].filter(Boolean).join(' · '),
      actionLabel: 'Review',
      actionTab: 'staff',
    }));
  if (fresh.length === 0) return null;
  return { ...store, flowNotifications: [...fresh, ...(store.flowNotifications || [])] };
}

/** The shop as the cloud knows it: its Store ID, or the access code before it has one. */
export function storeRefOf(store: Pick<StoreData, 'storeId' | 'accessCode'>): string {
  return store.storeId || store.accessCode;
}
