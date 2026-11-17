import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { daysToNow, receivedToNow } from '@/lib/fair-compare';
import { periodReport, periodStart } from '@/lib/period-report';
import { generateInsights, generateWeeklyRecap, averageJobByWeek, withAverageChanges, averageJobByMonth } from '@/lib/manager-intel';
import { likelyMethod, receivedByMethod } from '@/lib/payment-method';
import { recordLaundryPayment } from '@/lib/laundry-money';
import { whereMoneyGoes, whereMoneyGoesSentence } from '@/lib/where-money-goes';
import { readSource } from '@/test/helpers/source';

/*
 * A stretch still running is set against the same stretch before it, cut at
 * the same time of day. Monday at nine in the morning against the whole of
 * last Monday read as a collapse in a shop doing exactly as well as before.
 */

const CODE = 'FAIR01';
// Monday 16 November 2026, 9:00 in the morning.
const MONDAY_9AM = new Date(2026, 10, 16, 9, 0).getTime();
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).toISOString();

const sale = (id: string, date: string, total: number, over: Record<string, unknown> = {}) => ({
  id, productId: 'laundry', productName: 'Laundry', quantity: 1, unitPrice: total, total, profit: total, date, ...over,
});

const shop = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-F', storeName: 'Shine', accessCode: CODE, storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], pendingPayments: [],
  createdAt: new Date(2026, 0, 1).toISOString(),
  ...over,
} as unknown as StoreData);

const bundle = (ref: string, createdAt: string, total: number, pieces = 5) => ({
  clientRef: ref, accessCode: CODE, tagCode: ref.toUpperCase(), customerName: 'Ada', customerPhone: '0801',
  serviceId: 'wash-iron', serviceName: 'Full Service', garments: [{ garmentType: 'Shirt', quantity: pieces }],
  pieceCount: pieces, total, createdAt, workflowStage: 'collected', syncStatus: 'synced',
});

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(MONDAY_9AM); });
afterEach(() => vi.useRealTimers());

describe('the same stretch, cut at the same time', () => {
  it('measures the days before to this time of day', () => {
    const windows = daysToNow(7, MONDAY_9AM);
    expect(new Date(windows.from)).toEqual(new Date(2026, 10, 10, 0, 0));
    expect(windows.to).toBe(MONDAY_9AM);
    expect(new Date(windows.beforeFrom)).toEqual(new Date(2026, 10, 3, 0, 0));
    expect(new Date(windows.beforeTo)).toEqual(new Date(2026, 10, 9, 9, 0));
  });

  it('does not count the rest of that day against this morning', () => {
    const store = shop({
      sales: [
        // Last Monday: ₦2,000 before nine, ₦8,000 in the afternoon.
        sale('a', at(9, 8), 2_000), sale('b', at(9, 15), 8_000),
        // This Monday so far: ₦2,000 before nine.
        sale('c', at(16, 8), 2_000),
      ] as any,
    });
    const pair = receivedToNow(store, 7, MONDAY_9AM);
    expect(pair.now).toBe(2_000);
    // The afternoon has not happened yet today, so last Monday's is not held against today.
    expect(pair.before).toBe(2_000);
    expect(pair.percent).toBe(0);
  });
});

describe('this week against last week, on a Monday morning', () => {
  const seed = () => localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify([
    bundle('lm1', at(9, 8), 5_000), bundle('lm2', at(9, 14), 20_000), bundle('lt', at(10, 10), 10_000),
    bundle('tm1', at(16, 8, 30), 5_000),
  ]));

  it('sets this morning against last Monday morning, not the whole of last Monday', () => {
    seed();
    const store = shop({ sales: [sale('p1', at(9, 8), 5_000), sale('p2', at(9, 14), 20_000), sale('p3', at(16, 8, 30), 5_000)] as any });
    const bundles = JSON.parse(localStorage.getItem(laundryLocalStorageKey(CODE))!);
    const week = periodReport(store, bundles, 'week', periodStart('week', MONDAY_9AM), MONDAY_9AM);
    expect(week.current).toBe(true);
    // ₦5,000 of work by 9am both Mondays: level, where it used to read 80% down.
    expect(week.compared.workTakenIn).toMatchObject({ now: 5_000, before: 5_000, direction: 'same' });
    expect(week.compared.received).toMatchObject({ now: 5_000, before: 5_000, direction: 'same' });
    expect(week.comparedWith).toContain('same days of last week, up to the same time');
    expect(week.comparedWith).toContain('to 9am');
    // Last week's whole total is still given beside it.
    expect(week.previous.workTakenIn).toBe(35_000);
  });

  it('measures a finished week against the whole of the one before', () => {
    seed();
    const bundles = JSON.parse(localStorage.getItem(laundryLocalStorageKey(CODE))!);
    const lastWeek = periodReport(shop(), bundles, 'week', periodStart('week', new Date(2026, 10, 9).getTime()), MONDAY_9AM);
    expect(lastWeek.current).toBe(false);
    expect(lastWeek.comparedWith).not.toContain('same time');
  });

  it('measures a running month to the same date and hour of the month before', () => {
    const store = shop({ sales: [sale('o1', new Date(2026, 9, 16, 8).toISOString(), 4_000), sale('o2', new Date(2026, 9, 16, 15).toISOString(), 9_000), sale('n1', at(16, 8), 4_000)] as any });
    const month = periodReport(store, [], 'month', periodStart('month', MONDAY_9AM), MONDAY_9AM);
    expect(month.compared.received).toMatchObject({ now: 4_000, before: 4_000, direction: 'same' });
    expect(month.comparedWith).toContain('same dates of last month, up to the same time');
  });
});

describe('everywhere else a week is compared', () => {
  it('What Flow noticed no longer reports a fall that is only the time of day', () => {
    // ₦10,000 every afternoon for a fortnight. At 9am today's has not come yet.
    const sales = Array.from({ length: 14 }, (_, index) => sale(`d${index}`, at(15 - index, 15), 10_000));
    const insight = generateInsights(shop({ sales: sales as any })).find(item => item.id === 'rev');
    // Six afternoons against six afternoons: level, so nothing is said.
    expect(insight).toBeUndefined();
  });

  it('says what it measured against when it does speak', () => {
    const sales = [sale('a', at(12, 15), 30_000), sale('b', at(5, 15), 10_000)];
    const insight = generateInsights(shop({ sales: sales as any })).find(item => item.id === 'rev')!;
    expect(insight.text).toContain('on the same days of the week before');
    expect(insight.explain).toContain('up to the same time of day');
  });

  it('last week runs Monday to Sunday, as it does in Clothes and money', () => {
    const recap = generateWeeklyRecap(shop({ sales: [sale('a', at(9, 10), 5_000), sale('b', at(15, 10), 7_000), sale('c', at(8, 10), 99_000)] as any }), MONDAY_9AM)!;
    // Sunday the 8th belongs to the week before; Sunday the 15th to last week.
    expect(recap.weekLabel).toBe('9 Nov – 15 Nov');
    expect(recap.revenue).toBe(12_000);
  });

  it('spending is said against the 30 days before, which is what it is measured on', () => {
    expect(readSource('src/components/manager/AnalysisTab.tsx')).toContain('% on the 30 days before');
    expect(readSource('src/lib/manager-intel/insights.ts')).not.toContain('this month. Largest');
  });
});

describe('the average job, by week, with the change on every row', () => {
  const jobs = [
    { at: at(3, 10), value: 4_000, pieces: 8 }, { at: at(4, 10), value: 6_000, pieces: 10 },
    { at: at(10, 10), value: 9_000, pieces: 9 },
    { at: at(16, 8), value: 4_500, pieces: 9 },
  ];

  it('is Monday to Sunday, newest last, named the way an owner says it', () => {
    const weeks = averageJobByWeek(jobs, 8, MONDAY_9AM);
    expect(weeks.map(week => week.label)).toEqual(['2 Nov – 8 Nov', 'Last week', 'This week']);
    expect(weeks.map(week => week.average)).toEqual([5_000, 9_000, 4_500]);
    expect(weeks[2].current).toBe(true);
  });

  it('gives each row its move on the one before, as money and as a percentage', () => {
    const rows = withAverageChanges(averageJobByWeek(jobs, 8, MONDAY_9AM));
    expect(rows[0].change).toBeNull();
    expect(rows[1].change).toMatchObject({ difference: 4_000, percent: 80 });
    expect(rows[2].change).toMatchObject({ difference: -4_500, percent: -50, against: 'last week' });
  });

  it('skips a quiet stretch when looking for what to compare with', () => {
    const rows = withAverageChanges(averageJobByMonth([
      { at: new Date(2026, 8, 5).toISOString(), value: 3_000 },
      { at: at(2, 10), value: 6_000 },
    ], 6, MONDAY_9AM));
    expect(rows.map(row => row.change?.percent ?? null)).toEqual([null, null, 100]);
    expect(rows[2].change?.against).toBe('September');
  });

  it('opens from the Average job figure on the Analysis page', () => {
    const page = readSource('src/components/analytics/BusinessAnalytics.tsx');
    expect(page).toContain("label: 'Average job'");
    expect(page).toContain('onOpen: () => setShowAverage(true)');
    expect(page).toContain('<AverageJobCard store={store}');
    const card = readSource('src/components/manager/AverageJobCard.tsx');
    expect(card).toContain("option === 'week' ? 'Weeks' : 'Months'");
  });
});

describe('cash and transfer', () => {
  const payment = (method?: 'cash' | 'transfer', amountPaid = 3_000, total = 3_000) => ({
    clientRef: 'r1', tagCode: 'T1', customerName: 'Ada', customerPhone: '08011111111',
    serviceId: 'wash-iron', serviceName: 'Full Service', total, amountPaid, at: at(16, 8), ...(method ? { method } : {}),
  } as any);

  it('keeps how a laundry payment was made', () => {
    const paid = recordLaundryPayment(shop(), payment('transfer'));
    expect(paid.sales[0]).toMatchObject({ paymentMethod: 'transfer', paymentAllocation: { cash: 0, bank: 3_000 } });
    expect(paid.pendingPayments![0].events![0]).toMatchObject({ method: 'transfer' });
  });

  it('knows it was cash when change was given, whatever was picked', () => {
    // ₦5,000 handed over for a ₦3,000 bundle: ₦2,000 change. Nobody gives change on a transfer.
    const paid = recordLaundryPayment(shop(), payment('transfer', 5_000));
    expect(paid.sales[0]).toMatchObject({ total: 3_000, paymentMethod: 'cash' });
    const unsaid = recordLaundryPayment(shop(), payment(undefined, 5_000));
    expect(unsaid.sales[0].paymentMethod).toBe('cash');
  });

  it('does not call an old payment cash', () => {
    const store = shop({
      sales: [sale('old', at(10, 10), 4_000), sale('c', at(11, 10), 6_000, { paymentMethod: 'cash' }), sale('t', at(12, 10), 5_000, { paymentMethod: 'transfer' }), sale('p', at(12, 11), 1_000, { paymentMethod: 'pos' })] as any,
    });
    const split = receivedByMethod(store, new Date(2026, 10, 9).getTime(), MONDAY_9AM);
    expect(split).toEqual({ cash: 6_000, transfer: 6_000, notRecorded: 4_000, total: 16_000 });
  });

  it('lights the button the customer used last time, then the shop\'s habit', () => {
    const withAda = recordLaundryPayment(shop(), payment('transfer'));
    expect(likelyMethod(withAda, { phone: '0801 111 1111' })).toBe('transfer');
    // Somebody new: the shop's habit, which here is one transfer out of one.
    expect(likelyMethod(withAda, { phone: '08099999999' })).toBe('transfer');
    // Nothing known at all: cash.
    expect(likelyMethod(shop(), { phone: '08099999999' })).toBe('cash');
  });

  it('asks with the same tap that took the money: two buttons where there was one', () => {
    const records = readSource('src/components/laundry/LaundryWorkspace.tsx');
    expect(records).toContain("collectPayment(record, method)");
    expect(records).toContain("settleAndCollect(collectGuard, method)");
    expect(readSource('src/components/laundry/PeriodCompare.tsx')).toContain('How the {naira(methods.total)} was paid');
  });
});

describe('where a laundry\'s money goes', () => {
  const now = MONDAY_9AM;
  const store = () => shop({
    sales: [sale('a', at(2, 10), 60_000), sale('b', at(10, 10), 40_000)] as any,
    expenses: [
      { id: 'e1', amount: 6_000, category: 'Utilities', note: 'Light bill', date: at(5, 10) },
      { id: 'e2', amount: 9_000, category: 'Consumables', note: 'Detergent', date: at(3, 10) },
      { id: 'e3', amount: 4_000, category: 'Utilities', note: 'Diesel for generator', date: at(8, 10) },
      { id: 'e4', amount: 50_000, category: 'Restock', note: 'stock', date: at(8, 10) },
    ] as any,
    profile: { rent: { isRented: true, amount: 300_000 } } as any,
    staffMembers: [{ id: 'st', name: 'Ada', role: 'staff', monthlySalary: 20_000 }] as any,
  });

  it('names each thing the way the shop does, largest first', () => {
    const report = whereMoneyGoes(store(), 30, now);
    expect(report.rows.map(row => [row.label, row.amount])).toEqual([
      ['Rent', 25_000], ['Salaries', 20_000], ['Detergent', 9_000], ['Light', 6_000], ['Fuel', 4_000],
    ]);
  });

  it('sets it all against the money that came in over the same days', () => {
    const report = whereMoneyGoes(store(), 30, now);
    expect(report).toMatchObject({ received: 100_000, spent: 64_000, left: 36_000 });
    expect(report.rows.find(row => row.key === 'rent')!.per100).toBe(25);
    expect(whereMoneyGoesSentence(report)).toBe('Of every ₦100 that came in, ₦64 went on running the shop and ₦36 was left.');
  });

  it('counts a month of rent and salaries before they are recorded as paid, and says so', () => {
    const report = whereMoneyGoes(store(), 30, now);
    const rent = report.rows.find(row => row.key === 'rent')!;
    expect(rent).toMatchObject({ fixed: true, partlyDue: true });
    expect(rent.detail).toContain('whether or not clothes come in');
    expect(rent.detail).toContain('not yet recorded as paid');
  });

  it('does not count the same rent twice once it is recorded', () => {
    const paid = store();
    paid.expenses = [...(paid.expenses || []), { id: 'r', amount: 25_000, category: 'Rent', note: 'Shop rent', date: at(1, 10) }] as any;
    const rent = whereMoneyGoes(paid, 30, now).rows.find(row => row.key === 'rent')!;
    expect(rent.amount).toBe(25_000);
    expect(rent.partlyDue).toBe(false);
  });

  it('says so plainly when more went out than came in', () => {
    const lean = store();
    lean.sales = [sale('a', at(2, 10), 20_000)] as any;
    expect(whereMoneyGoesSentence(whereMoneyGoes(lean, 30, now))).toContain('More went out than came in');
  });

  it('replaces the stock-and-margin card for a shop that sells work', () => {
    const overview = readSource('src/components/manager/OverviewTab.tsx');
    expect(overview).toContain('{isService && <WhereMoneyGoesCard store={store} compact />}');
    // The card about products and stock is kept for shops that have them.
    expect(overview).toMatch(/\{!isService && \(\(\) => \{\s+const leaks = getProfitLeaks\(store\);/);
  });
});
