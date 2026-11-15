import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { splitOwed } from '@/lib/owed';
import { getPendingSummary } from '@/lib/store-data';
import { owedByCustomer } from '@/lib/flow-service-brain';
import { laundryDayBoard } from '@/lib/laundry-day';
import { generateAdvice } from '@/lib/manager-intel';

/*
 * A balance is a debt only when the clothes have been collected and not paid
 * for. A balance on clothes still in the shop is to be paid on collection:
 * the shop holds the clothes, and nothing is owed yet.
 */

const CODE = 'OWED01';
const now = new Date().toISOString();

const bundle = (ref: string, stage: string, total: number) => ({
  clientRef: ref, accessCode: CODE, tagCode: ref.toUpperCase(), customerName: ref === 'gone' ? 'Chidi' : 'Ada',
  customerPhone: ref === 'gone' ? '0802' : '0801', serviceId: 'svc', serviceName: 'Wash & Iron',
  garments: [{ garmentType: 'Shirt', quantity: 4 }], pieceCount: 4, total, createdAt: now, workflowStage: stage, syncStatus: 'synced',
});
const balance = (ref: string, total: number, paid: number, name: string, phone: string) => ({
  id: `laundry-${ref}`, customerName: name, customerPhone: phone, items: [], total, paid, balance: total - paid,
  createdAt: now, status: 'pending', events: [], saleIds: [],
});

const shop = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-O', storeName: 'Shine', accessCode: CODE, storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [],
  managerSettings: { enabled: true, businessAdvice: true },
  pendingPayments: [
    // Collected with ₦3,000 unpaid: a debt.
    balance('gone', 5_000, 2_000, 'Chidi', '0802'),
    // Still in the wash with ₦4,000 unpaid: not a debt.
    balance('washing', 4_000, 0, 'Ada', '0801'),
    // Ready on the shelf with ₦1,000 unpaid: still not a debt.
    balance('ready', 2_000, 1_000, 'Ada', '0801'),
  ],
  createdAt: new Date(Date.now() - 90 * 86400000).toISOString(),
  ...over,
} as unknown as StoreData);

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify([
    bundle('gone', 'collected', 5_000),
    bundle('washing', 'washing', 4_000),
    bundle('ready', 'ready', 2_000),
  ]));
});

describe('what counts as owed', () => {
  it('is only what was collected and not paid for', () => {
    const split = splitOwed(shop());
    expect(split.debts.map(p => p.id)).toEqual(['laundry-gone']);
    expect(split.debtTotal).toBe(3_000);
    expect(split.onCollection.map(p => p.id).sort()).toEqual(['laundry-ready', 'laundry-washing']);
    expect(split.onCollectionTotal).toBe(5_000);
  });

  it('is what every screen reads as money owed', () => {
    const summary = getPendingSummary(shop());
    expect(summary.totalOwed).toBe(3_000);
    expect(summary.customerCount).toBe(1);
    expect(summary.onCollection).toMatchObject({ total: 5_000, count: 2 });
  });

  it('does not call a customer a debtor while their clothes are still in the shop', () => {
    const store = shop();
    expect(owedByCustomer(store, { name: 'Ada', phone: '0801' })).toBe(0);
    expect(owedByCustomer(store, { name: 'Chidi', phone: '0802' })).toBe(3_000);
  });

  it('is not overdue because the promised day passed while the clothes sat on the shelf', () => {
    const past = new Date(Date.now() - 5 * 86400000).toISOString();
    const store = shop();
    store.pendingPayments = store.pendingPayments!.map(p => ({ ...p, dueDate: past }));
    expect(getPendingSummary(store).overdue.map(p => p.id)).toEqual(['laundry-gone']);
  });

  it('moves a balance to owed the moment the bundle is collected unpaid', () => {
    localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify([
      bundle('gone', 'collected', 5_000),
      bundle('washing', 'collected', 4_000),
      bundle('ready', 'ready', 2_000),
    ]));
    expect(getPendingSummary(shop()).totalOwed).toBe(7_000);
  });

  it('treats a balance that is not work held in the shop as owed from the start', () => {
    const creditSale = { id: 'credit-1', customerName: 'Bola', items: [], total: 900, paid: 0, balance: 900, createdAt: now, status: 'pending', events: [], saleIds: [] };
    expect(splitOwed(shop({ pendingPayments: [creditSale] as any })).debtTotal).toBe(900);
  });
});

describe('where it shows', () => {
  const record = (stage: string, bal: number) => ({ stage, balance: bal, total: 5_000, promisedAt: null, overdue: false }) as any;

  it('the Home board keeps owed and to-pay-on-collection apart', () => {
    const board = laundryDayBoard([record('collected', 3_000), record('washing', 4_000), record('ready', 1_000), record('collected', 0)]);
    expect(board.owed).toBe(3_000);
    expect(board.owedCount).toBe(1);
    expect(board.waitingUnpaid).toBe(5_000);
    expect(board.waitingUnpaidCount).toBe(2);
  });

  it('Flow chases only what is really owed', () => {
    const chase = generateAdvice(shop(), []).find(item => item.id === 'debt');
    expect(chase?.detail).toContain('₦3,000 owed by 1 customer');
  });

  it('Flow does not tell a shop to chase anyone when every balance is on clothes still in the shop', () => {
    const store = shop();
    store.pendingPayments = store.pendingPayments!.filter(p => p.id !== 'laundry-gone');
    expect(generateAdvice(store, []).some(item => item.id === 'debt')).toBe(false);
  });
});
