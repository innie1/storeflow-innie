import type { StoreData } from '@/types/store';

/**
 * Add a line to the shop's activity log.
 *
 * Its own module so code outside store-data can write to the log without
 * importing store-data, which imports almost everything.
 */
export function recordActivityLog(store: StoreData, user?: string, role?: string, action?: string): StoreData {
  if (!user || !action) return store;
  const newLog = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    user,
    role: role || 'owner',
    action,
    timestamp: new Date().toISOString(),
  };
  return {
    ...store,
    activityLogs: [newLog, ...(store.activityLogs || [])].slice(0, 1000),
  };
}
