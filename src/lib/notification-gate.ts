/**
 * The switches on the Notifications screen, honoured.
 *
 * There are eight of them - Insights, Recommendations, Alerts, Weekly Recaps,
 * Monthly Reports, Savings Reminders, Customer Request Alerts, Low Stock
 * Alerts - and every one of them moved, saved, and changed nothing. A merchant
 * who turned off low-stock alerts kept getting low-stock alerts, which teaches
 * them that the settings screen is decoration and that the app does not listen.
 *
 * The gate is here rather than at each of the five places that raise a
 * notification, because five gates is five chances to forget one. Every
 * notification names what kind it is, this decides whether the shop asked for
 * that kind, and anything unclassified goes through - failing towards showing
 * somebody something is safer than silently swallowing it.
 */

import type { FlowNotification, ManagerSettings, StoreData } from '@/types/store';

export type NotificationCategory =
  | 'insight'
  | 'recommendation'
  | 'alert'
  | 'weeklyRecap'
  | 'monthlyReport'
  | 'savings'
  | 'customerRequest'
  | 'lowStock';

/** Which switch governs which kind. */
const SWITCH: Record<NotificationCategory, keyof ManagerSettings> = {
  insight: 'notifyInsights',
  recommendation: 'notifyRecommendations',
  alert: 'notifyAlerts',
  weeklyRecap: 'notifyWeeklyRecap',
  monthlyReport: 'notifyMonthlyReports',
  savings: 'notifySavingsReminders',
  customerRequest: 'notifyCustomerRequests',
  lowStock: 'notifyLowStock',
};

/**
 * Whether the shop wants this kind of notification.
 *
 * Absent means yes. Every one of these defaults on, and a shop that has never
 * opened the Notifications screen should hear about a bundle going late.
 */
export function wantsNotification(
  store: Pick<StoreData, 'managerSettings'> | null | undefined,
  category?: NotificationCategory,
): boolean {
  if (!category) return true;
  const settings = store?.managerSettings;
  if (!settings) return true;
  return settings[SWITCH[category]] !== false;
}

/**
 * Keep only the notifications this shop asked for.
 *
 * Used at every point where new ones are about to join the list, so a switch
 * that is off stops them arriving rather than hiding them afterwards - a
 * notification that exists but is not shown still buzzes a phone.
 */
export function allowedNotifications<T extends FlowNotification>(
  store: Pick<StoreData, 'managerSettings'> | null | undefined,
  notifications: T[],
): T[] {
  return notifications.filter(notification => wantsNotification(store, notification.category));
}
