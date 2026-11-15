import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { receivedBetween, receivedBySource } from '@/lib/money-figures';
import { periodReport, periodStart, shiftPeriod, type PeriodBundle } from '@/lib/period-report';
import { shopLaundryRecords } from '@/lib/shop-laundry';

/*
 * Where a week's money came from.
 *
 * Money counts in the week it is paid. So a week's revenue is partly this
 * week's clothes and partly older ones being paid for, and this is the split.
 */

const CODE = 'SOURCE';
const DAY = 86400000;
// A fixed Wednesday, so the week and the one before are whole and known.
const NOW = new Date(2026, 10, 11, 15, 0, 0).getTime();
const THIS_WEEK = periodStart('week', NOW);
const LAST_WEEK = shiftPeriod('week', THIS_WEEK, -1);

const at = (weekStart: number, day: number, hour = 10) => new Date(weekStart + day * DAY + hour * 3600000).toISOString();

const bundle = (ref: string, createdAt: string, total: number) => ({
  clientRef: ref, accessCode: CODE, tagCode: ref.toUpperCase(), customerName: 'Ada', customerPhone: '0801',
  serviceId: 'svc', serviceName: 'Wash & Iron', garments: [{ garmentType: 'Shirt', quantity: 4 }], pieceCount: 4,
  total, createdAt, workflowStage: 'ready', syncStatus: 'synced',
});
const payment = (ref: string, date: string, total: number) => ({
  id: `s-${ref}-${date}`, date, total, profit: total, productId: 'x', productName: 'Laundry', quantity: 1, unitPrice: total,
  pendingPaymentId: `laundry-${ref}`,
});
const debt = (ref: string, createdAt: string, total: number, paid: number) => ({
  id: `laundry-${ref}`, customerName: 'Ada', items: [], total, paid, balance: total - paid, createdAt,
  status: paid >= total ? 'paid' : 'pending', events: [], saleIds: [],
});

const shop = (): StoreData => ({
  id: 's', storeId: 'SF-S', storeName: 'Shine', accessCode: CODE, storeType: 'laundry', businessType: 'laundry',
  products: [], customers: [], expenses: [],
  sales: [
    // This week's clothes, part paid this week.
    payment('new', at(THIS_WEEK, 1), 3_000),
    // Last week's clothes, paid for this week.
    payment('last', at(THIS_WEEK, 0), 5_000),
    // Clothes from a month ago, the balance finally paid this week.
    payment('old', at(THIS_WEEK, 2), 2_000),
    // A payment with no bundle behind it.
    { id: 'loose', date: at(THIS_WEEK, 1, 12), total: 500, profit: 500, productId: 'x', productName: 'Starch', quantity: 1, unitPrice: 500 },
    // Last week's own money, which is not this week's.
    payment('last', at(LAST_WEEK, 3), 1_000),
  ],
  pendingPayments: [
    debt('new', at(THIS_WEEK, 1), 8_000, 3_000),
    debt('last', at(LAST_WEEK, 3), 6_000, 6_000),
    debt('old', at(LAST_WEEK, -21), 4_000, 2_000),
  ],
  createdAt: new Date(NOW - 200 * DAY).toISOString(),
} as unknown as StoreData);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify([
    bundle('new', at(THIS_WEEK, 1), 8_000),
    bundle('last', at(LAST_WEEK, 3), 6_000),
    bundle('old', at(LAST_WEEK, -21), 4_000),
  ]));
});

describe('where the week\'s money came from', () => {
  it('splits it by when the clothes were brought in', () => {
    const sources = receivedBySource(shop(), THIS_WEEK, THIS_WEEK + 7 * DAY, LAST_WEEK);
    expect(sources).toEqual({ fromThese: 3_000, fromPrevious: 5_000, fromOlder: 2_000, other: 500, total: 10_500 });
  });

  it('always adds up to the money received, so no naira is counted twice or lost', () => {
    const store = shop();
    const sources = receivedBySource(store, THIS_WEEK, THIS_WEEK + 7 * DAY, LAST_WEEK);
    expect(sources.fromThese + sources.fromPrevious + sources.fromOlder + sources.other).toBe(sources.total);
    expect(sources.total).toBe(receivedBetween(store, THIS_WEEK, THIS_WEEK + 7 * DAY));
  });

  it('counts a payment in the week it was paid, not the week the clothes came', () => {
    // Last week took ₦1,000, all on its own clothes. The ₦5,000 paid later is this week's.
    const lastWeek = receivedBySource(shop(), LAST_WEEK, THIS_WEEK, shiftPeriod('week', LAST_WEEK, -1));
    expect(lastWeek).toMatchObject({ fromThese: 1_000, fromPrevious: 0, fromOlder: 0, total: 1_000 });
  });
});

describe('the week view', () => {
  const report = () => periodReport(shop(), shopLaundryRecords(CODE) as unknown as PeriodBundle[], 'week', THIS_WEEK, NOW);

  it('says what came in this week, what it is worth and what has been paid on it', () => {
    const week = report();
    expect(week.bundles).toBe(1);
    expect(week.workTakenIn).toBe(8_000);
    expect(week.paid).toBe(3_000);
    expect(week.owed).toBe(5_000);
    expect(week.paidShare).toBe(38);
  });

  it('carries the split of the money received beside it', () => {
    const week = report();
    expect(week.received).toBe(10_500);
    expect(week.sources).toMatchObject({ fromThese: 3_000, fromPrevious: 5_000, fromOlder: 2_000, other: 500 });
  });
});
