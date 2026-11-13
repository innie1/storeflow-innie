import { StoreData } from '@/types/store';

// ─── Date helpers ─────────────────────────────────────────────────────────────
export function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

export function daysAgo(n: number) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; }

export function daysBetween(a: Date, b: Date) {
  return Math.max(1, Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000) + 1);
}

export function isStoreOnboarding(store: StoreData): boolean {
  if (!store.createdAt) return false;
  const createdTime = new Date(store.createdAt).getTime();
  if (isNaN(createdTime)) return false;
  const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
  return (Date.now() - createdTime) < threeDaysInMs;
}
