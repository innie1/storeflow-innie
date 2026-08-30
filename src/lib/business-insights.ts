import type { Customer, StoreData } from '@/types/store';

const DAY = 86_400_000;

function amountInRange(store: StoreData, from: number, to: number): number {
  return (store.sales || []).reduce((sum, sale) => {
    const time = new Date(sale.date).getTime();
    return time >= from && time < to ? sum + Number(sale.total || 0) : sum;
  }, 0);
}

export function getEarningsPulse(store: StoreData, now = new Date()) {
  const end = now.getTime();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const today = amountInRange(store, todayStart, end + 1);
  const priorSeven = amountInRange(store, todayStart - 7 * DAY, todayStart);
  const dailyBaseline = priorSeven / 7;

  const day = now.getDay();
  const weekStart = todayStart - day * DAY;
  const thisWeek = amountInRange(store, weekStart, end + 1);
  const lastWeek = amountInRange(store, weekStart - 7 * DAY, weekStart);
  const dailyChange = dailyBaseline > 0 ? ((today - dailyBaseline) / dailyBaseline) * 100 : null;
  const weeklyChange = lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : null;

  const action = dailyChange === null
    ? 'Record sales consistently for seven days to unlock a useful comparison.'
    : dailyChange < -20
      ? 'Follow up with inactive regulars and check which usual products or services did not sell today.'
      : dailyChange > 20
        ? 'You are above your recent daily pace. Protect stock and service capacity for the items driving today.'
        : 'Earnings are close to your normal pace. Keep serving repeat customers and monitor today’s open orders.';

  return { today, dailyBaseline, dailyChange, thisWeek, lastWeek, weeklyChange, action };
}

function daysSince(value?: string): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / DAY)) : null;
}

export type CustomerActivitySignal = {
  customer: Customer;
  kind: 'frequent' | 'slowing' | 'inactive' | 'new';
  label: string;
  message: string;
};

export function getCustomerActivitySignals(store: StoreData): CustomerActivitySignal[] {
  return (store.customers || []).map(customer => {
    const inactiveDays = daysSince(customer.lastPurchaseDate);
    const frequent = customer.visitsCount >= 5 || customer.totalPurchases >= 10_000;
    if (inactiveDays === null) return {
      customer, kind: 'new', label: 'New / no purchase yet',
      message: `Hello ${customer.name}, thank you for connecting with ${store.storeName}. We are ready whenever you need us.`,
    };
    if (frequent && inactiveDays >= 14) return {
      customer, kind: inactiveDays >= 30 ? 'inactive' : 'slowing', label: inactiveDays >= 30 ? 'Regular now inactive' : 'Regular slowing down',
      message: `Hello ${customer.name}, we have missed serving you at ${store.storeName}. Is there anything you need us to prepare for you this week?`,
    };
    if (frequent) return {
      customer, kind: 'frequent', label: 'Frequent customer',
      message: `Hello ${customer.name}, thank you for being a regular customer of ${store.storeName}. We appreciate you and are ready for your next order.`,
    };
    return {
      customer, kind: inactiveDays >= 30 ? 'inactive' : 'new', label: inactiveDays >= 30 ? 'Inactive customer' : 'Growing customer',
      message: `Hello ${customer.name}, ${store.storeName} is ready to serve you again. Let us know what you need.`,
    };
  }).sort((a, b) => {
    const weight = { slowing: 0, inactive: 1, frequent: 2, new: 3 };
    return weight[a.kind] - weight[b.kind];
  });
}

export function getPromisedTime(order: any): string | null {
  const meta = order?.service_metadata && typeof order.service_metadata === 'object' ? order.service_metadata : {};
  const raw = meta.promised_for || order?.scheduled_for || order?.pickup_time;
  if (!raw && String(order?.business_type || '').toLowerCase() === 'laundry' && order?.created_at) {
    const created = new Date(order.created_at);
    if (Number.isFinite(created.getTime())) return new Date(created.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
