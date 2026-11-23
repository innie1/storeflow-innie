import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { createLocalLaundryRecord } from '@/lib/laundry-offline';
import { lastLaundryPayment, recordLaundryPayment, undoLaundryPayment } from '@/lib/laundry-money';
import { breakEven, monthlyFixedCosts } from '@/lib/service-breakeven';
import { receiptTradeLine } from '@/lib/business-runtime';
import { syncStoreData } from '@/lib/store-data';
import { readSource } from './helpers/source';

const CODE = 'UNDO01';

const store = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-U', storeName: 'Shine', accessCode: CODE,
  storeType: 'laundry', category: 'retail', products: [], sales: [], customers: [],
  expenses: [], recurringBills: [], pendingPayments: [], activityLogs: [], createdAt: new Date(0).toISOString(),
  ...over,
} as unknown as StoreData);

const pay = (s: StoreData, amountPaid: number, at: string, method: 'cash' | 'transfer' = 'cash') => recordLaundryPayment(s, {
  clientRef: 'b1', tagCode: 'LND-101', customerName: 'Ada', customerPhone: '08010000000',
  serviceId: 'svc', serviceName: 'Wash & Iron', total: 5_000, amountPaid, at, method,
});

describe('taking back a Paid tapped by mistake', () => {
  it('the last payment comes off the takings and back onto what is owed', () => {
    const deposit = pay(store(), 2_000, '2026-11-20T09:00:00.000Z');
    const paidUp = pay(deposit, 3_000, '2026-11-21T15:00:00.000Z', 'transfer');
    expect(paidUp.pendingPayments?.[0]).toMatchObject({ paid: 5_000, balance: 0, status: 'paid' });
    expect(lastLaundryPayment(paidUp, 'b1')).toMatchObject({ amount: 3_000, method: 'transfer' });

    const undone = undoLaundryPayment(paidUp, 'b1', { name: 'Owner', role: 'owner' });
    expect(undone.pendingPayments?.[0]).toMatchObject({ paid: 2_000, balance: 3_000, status: 'pending' });
    expect(undone.sales.map(sale => sale.total)).toEqual([2_000]);
    expect(undone.pendingPayments?.[0].events.map(event => event.amount)).toEqual([2_000]);
    // Nobody can make money vanish without it showing.
    expect(JSON.stringify(undone.activityLogs)).toContain('Undid a ₦3,000 payment on LND-101');
  });

  it('one at a time, newest first, and nothing once there is nothing paid', () => {
    const deposit = pay(store(), 2_000, '2026-11-20T09:00:00.000Z');
    const once = undoLaundryPayment(deposit, 'b1');
    expect(once.pendingPayments?.[0]).toMatchObject({ paid: 0, balance: 5_000, status: 'pending' });
    expect(once.sales).toEqual([]);
    expect(lastLaundryPayment(once, 'b1')).toBeNull();
    expect(undoLaundryPayment(once, 'b1')).toBe(once);
  });

  it('is on the order row and on the payment message, on the owner phone only', () => {
    const source = readSource('src/components/laundry/LaundryWorkspace.tsx');
    expect(source).toContain('data-undo-payment');
    expect(source).toContain("'Tap to undo'".slice(1, -1));
    expect(source).toContain('const canUndoPayment = !store.staffDevice');
  });
});

describe('the month target holds still', () => {
  beforeEach(() => localStorage.clear());

  const KEY = `storeflow_laundry_local_records_${CODE}`;
  const bundles = (count: number, at: string) => {
    for (let i = 0; i < count; i++) {
      createLocalLaundryRecord({
        accessCode: CODE, customerName: 'A', customerPhone: '08010000000',
        serviceId: 'svc', serviceName: 'Wash & Iron', pricing: 'per_piece', billingQuantity: 1, total: 2_500,
        garments: [{ garmentType: 'Shirt', quantity: 5, unitPrice: 500, subtotal: 2_500 }],
      });
    }
    // Dated when they were taken in.
    const records = JSON.parse(localStorage.getItem(KEY) || '[]');
    for (const record of records.slice(-count)) record.createdAt = at;
    localStorage.setItem(KEY, JSON.stringify(records));
  };
  const staff = [{ id: 'st1', name: 'Ada', role: 'staff', monthlySalary: 50_000 }];
  const NOV_15 = new Date(2026, 10, 15, 12);

  it('more bundles this month do not move it once there is a month behind it', () => {
    bundles(20, new Date(2026, 9, 20).toISOString());
    const s = store({ staffMembers: staff as any });
    const first = breakEven(s, NOV_15);
    expect(first.steady).toBe(true);
    expect(first.target).toBeGreaterThan(50_000);

    bundles(12, new Date(2026, 10, 10).toISOString());
    const later = breakEven(s, NOV_15);
    expect(later.target).toBe(first.target);
    expect(later.pieces).toBeGreaterThan(first.pieces);
  });

  it('goes by the calendar month: all of last month, not the 30 days before the 1st', async () => {
    const { previousMonthWindow, monthWindow, monthSpan, lastMonthName } = await import('@/lib/service-breakeven');
    const march = previousMonthWindow(monthWindow(new Date(2027, 3, 10)));
    expect(new Date(march.start)).toEqual(new Date(2027, 2, 1));
    expect(new Date(march.end)).toEqual(new Date(2027, 3, 1));
    expect(march.daysInMonth).toBe(31);
    expect(monthSpan(new Date(2027, 1, 9))).toBe('1-28 February');
    expect(monthSpan(NOV_15)).toBe('1-30 November');
    expect(lastMonthName(new Date(2027, 0, 5))).toBe('December');

    // Bundles on 1 October count towards November's margin; a 30-day window would have missed them.
    bundles(20, new Date(2026, 9, 1, 10).toISOString());
    expect(breakEven(store({ staffMembers: staff as any }), NOV_15).steady).toBe(true);
    // And bundles from September do not.
    localStorage.clear();
    bundles(20, new Date(2026, 8, 25).toISOString());
    expect(breakEven(store({ staffMembers: staff as any }), NOV_15).steady).toBe(false);
  });

  it("a year's rent paid in one go counts as one month of it", () => {
    const s = store({
      profile: { rent: { isRented: true, amount: 1_200_000, frequency: 'yearly' } } as any,
      expenses: [{ id: 'r', amount: 1_200_000, category: 'Rent', note: 'Shop rent for the year', date: new Date(2026, 10, 5).toISOString() }] as any,
    });
    expect(monthlyFixedCosts(s, { start: new Date(2026, 10, 1).getTime(), end: new Date(2026, 11, 1).getTime(), daysInMonth: 30, dayOfMonth: 15 })).toBe(100_000);
  });

  it("October's wage paid on the 1st does not make November's look paid, so paying it later moves nothing", () => {
    const november = { start: new Date(2026, 10, 1).getTime(), end: new Date(2026, 11, 1).getTime(), daysInMonth: 30, dayOfMonth: 15 };
    const october = { id: 'o', amount: 50_000, category: 'Salaries', note: 'Salary for Ada, October', date: new Date(2026, 10, 1, 9).toISOString(), paidTo: 'st1', payMonth: '2026-10' };
    const novemberPay = { id: 'n', amount: 50_000, category: 'Salaries', note: 'Salary for Ada, November', date: new Date(2026, 10, 30, 9).toISOString(), paidTo: 'st1', payMonth: '2026-11' };
    const before = monthlyFixedCosts(store({ staffMembers: staff as any, expenses: [october] as any }), november);
    const after = monthlyFixedCosts(store({ staffMembers: staff as any, expenses: [october, novemberPay] as any }), november);
    expect(before).toBe(50_000);
    expect(after).toBe(50_000);
  });
});

describe('the line under the shop name on a receipt', () => {
  it('says what the shop is, not the bucket it is sorted into', () => {
    // Loading a laundry wrote "retail" into its profile, and the receipt printed that.
    const loaded = syncStoreData(store());
    expect(loaded.profile?.storeType).toBe('retail');
    expect(receiptTradeLine(loaded)).toBe('Laundry');
    for (const file of ['src/components/SaleReceipt.tsx', 'src/components/OrderReceipt.tsx', 'src/components/Sales.tsx']) {
      expect(readSource(file)).not.toContain('profile.storeType');
      expect(readSource(file)).not.toContain('profile?.storeType');
    }
  });

  it('a laundry is not offered product QR codes or sent to a Stock tab it does not have', () => {
    expect(readSource('src/components/settings/views/BarcodeView.tsx')).toContain('{(keepsStock || store.products.length > 0) && <div');
  });
});

describe("cash or transfer on a worker's phone reaches the owner", () => {
  it('the worker phone sends how each payment was made', async () => {
    const { laundryPaymentsTakenHere } = await import('@/lib/laundry-money');
    const deposit = pay(store(), 2_000, '2026-11-20T09:00:00.000Z', 'cash');
    const rest = pay(deposit, 3_000, '2026-11-21T15:00:00.000Z', 'transfer');
    const sent = laundryPaymentsTakenHere(rest);
    expect(sent.map(p => [p.kind, p.amount, p.method])).toEqual([['intake', 2_000, 'cash'], ['payment', 3_000, 'transfer']]);
  });

  it('the owner phone books it under cash or transfer, not "not recorded"', async () => {
    const { addArrivedPayments } = await import('@/lib/staff-records');
    const base = { kind: 'payment' as const, clientRef: 'w1', at: '2026-11-21T15:00:00.000Z', staffName: 'Ada', total: 5_000, tagCode: 'LND-201', serviceName: 'Wash & Iron' };
    const { store: booked } = addArrivedPayments(store(), [
      { ...base, id: 'p1', amount: 2_000, method: 'cash' },
      { ...base, id: 'p2', amount: 1_000, method: 'pos', at: '2026-11-21T16:00:00.000Z' },
      { ...base, id: 'p3', amount: 500, at: '2026-11-21T17:00:00.000Z' },
    ]);
    expect(booked.sales.map(sale => [sale.total, sale.paymentMethod])).toEqual([[2_000, 'cash'], [1_000, 'transfer'], [500, undefined]]);
  });

  it('the cloud keeps the method and hands it back', () => {
    const sql = readSource('supabase/migrations/20261123100000_worker_payment_method.sql');
    expect(sql).toContain('add column if not exists method text');
    expect(sql).toContain("'method', p.method");
    expect(sql).toContain('staff_role, method)');
  });
});

describe('every buy of soap, light or anything used up, side by side', () => {
  beforeEach(() => localStorage.clear());

  it('each buy closes the one before; light bills get the same list as soap, marked more or less than usual', async () => {
    const { supplyHistories } = await import('@/lib/cost-estimator');
    const code = 'LOTS02';
    const records: unknown[] = [];
    const work = (pieces: number, at: Date) => records.push({
      clientRef: `r${records.length}`, accessCode: code, tagCode: `T${records.length}`, customerName: 'A',
      serviceId: 'svc', serviceName: 'Wash & Iron', garments: [{ garmentType: 'Shirt', quantity: pieces }],
      pieceCount: pieces, total: pieces * 500, createdAt: at.toISOString(), workflowStage: 'collected', syncStatus: 'synced',
    });
    // Light: 5 Oct to 20 Nov covers 800 pieces across both months; the next
    // two bills cover the same, and the one after goes twice as far.
    work(300, new Date(2026, 9, 10)); work(300, new Date(2026, 9, 28)); work(200, new Date(2026, 10, 10));
    work(800, new Date(2026, 10, 22)); work(800, new Date(2026, 10, 26)); work(1_600, new Date(2026, 10, 29));
    localStorage.setItem(`storeflow_laundry_local_records_${code}`, JSON.stringify(records));
    const bill = (id: string, at: Date) => ({ id, amount: 24_000, category: 'Utilities', note: 'Light bill', date: at.toISOString() });
    const s = store({ accessCode: code, expenses: [
      bill('l1', new Date(2026, 9, 5)), bill('l2', new Date(2026, 10, 20)), bill('l3', new Date(2026, 10, 24)),
      bill('l4', new Date(2026, 10, 27)), bill('l5', new Date(2026, 10, 30)),
    ] as any });

    const light = supplyHistories(s).find(supply => supply.key === 'electricity')!;
    expect(light).toMatchObject({ label: 'light bill', kind: 'bill' });
    expect(light.lots.map(lot => [lot.washed, lot.perPiece, lot.finished])).toEqual([
      [800, 30, true], [800, 30, true], [800, 30, true], [1_600, 15, true], [0, null, false],
    ]);
    expect(light.lots[3]).toMatchObject({ low: true, high: false });
    expect(light.lots[0]).toMatchObject({ low: false, high: false });
  });

  it('is on the target card for every supply, not soap alone', () => {
    const source = readSource('src/components/BreakEvenCard.tsx');
    expect(source).toContain('data-supply-history');
    expect(source).toContain('went further than usual');
    expect(source).toContain('used more than usual');
  });
});
