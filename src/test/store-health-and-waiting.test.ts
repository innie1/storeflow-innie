import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { createLocalLaundryRecord, setLocalLaundryStage } from '@/lib/laundry-offline';
import { recordLaundryPayment } from '@/lib/laundry-money';
import { healthScore, storeHealthFigures } from '@/lib/manager-intel';
import { waitingToCollect } from '@/lib/money-figures';
import { laundryDayBoard } from '@/lib/laundry-day';
import { responseFor, understand } from '@/lib/flow-operating-engine';
import { readSource } from './helpers/source';

/**
 * Store Health says one thing, wherever it is asked.
 *
 * The card worked its figures out for itself and Flow made up its own - a
 * score from a few stock counts, profit before any costs - so asking Flow "how
 * is my store" gave a different answer from the card on the same screen.
 */

const CODE = 'HEALTH1';
const DAY = 86_400_000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();

const laundry = (over: Partial<StoreData> = {}): StoreData => ({
  storeName: 'Shine', accessCode: CODE, storeType: 'laundry', businessType: 'laundry',
  products: [{ id: 'svc', name: 'Wash & Iron', category: 'Service', costPrice: 0, sellingPrice: 500, quantity: 999999, isService: true }],
  sales: [], customers: [], pendingPayments: [], expenses: [],
  createdAt: new Date(0).toISOString(),
  ...over,
} as unknown as StoreData);

const payment = (total: number, daysAgo: number) => ({
  id: `p${Math.random()}`, productId: 'svc', productName: 'Wash & Iron', quantity: 1,
  unitPrice: total, total, profit: total, date: at(daysAgo),
});

beforeEach(() => localStorage.clear());

describe('one set of Store Health figures', () => {
  const shop = () => laundry({
    sales: [payment(2_400, 1), payment(9_000, 10)] as any,
    expenses: [
      { id: 'e1', amount: 400, category: 'Rent', date: at(0) },
      { id: 'e2', amount: 5_000, category: 'Restock', date: at(0) },
    ] as any,
    pieceWork: [{ id: 'w1', approved: true, at: at(0), amount: 300 }] as any,
  });

  it('counts money received in the last seven days as revenue', () => {
    expect(storeHealthFigures(shop()).revenue).toBe(2_400);
  });

  it('takes running costs off profit, never stock bought', () => {
    const figures = storeHealthFigures(shop());
    expect(figures.expenses).toBe(700);
    expect(figures.profit).toBe(1_700);
  });

  it('is the same score the card and the breakdown show', () => {
    expect(storeHealthFigures(shop()).score).toBe(healthScore(shop()).overall);
  });
});

describe('Flow gives the same Store Health as the card', () => {
  it('for a laundry, which used to get no score at all', () => {
    const store = laundry({ sales: [payment(2_400, 1)] as any });
    const answer = responseFor(store, understand(store, 'how is my store'));
    expect(answer).toContain(`${healthScore(store).overall}/100`);
  });

  it('for a shop with stock, which used to get a made-up one', () => {
    const store = {
      storeName: 'Corner Shop', accessCode: 'RETAIL1', storeType: 'provision',
      products: [], sales: [payment(5_000, 1)], customers: [], pendingPayments: [], expenses: [],
      createdAt: new Date(0).toISOString(),
    } as unknown as StoreData;
    const answer = responseFor(store, understand(store, 'how is my store'));
    expect(answer).toContain(`${healthScore(store).overall}/100`);
    expect(answer).not.toContain('Your store is at about');
  });

  it('no longer invents a score from stock counts', () => {
    expect(readSource('src/lib/flow-operating-engine.ts')).not.toContain('72+(a.revenue7>0?8:-8)');
    expect(readSource('src/components/Manager.tsx')).toContain('storeHealthFigures(store)');
  });
});

/**
 * Money not realised yet: work still in the shop.
 */
describe('what is waiting to be collected', () => {
  const take = (store: StoreData, total: number, paid: number) => {
    const record = createLocalLaundryRecord({
      accessCode: CODE, customerName: 'Musa Bello', customerPhone: '08031234567',
      serviceId: 'svc', serviceName: 'Wash & Iron', pricing: 'per_piece', billingQuantity: 1, total,
      garments: [{ garmentType: 'Shirt', quantity: 1, unitPrice: total, subtotal: total }],
    });
    const next = recordLaundryPayment(store, {
      clientRef: record.clientRef, tagCode: record.tagCode, customerName: record.customerName,
      customerPhone: record.customerPhone, serviceId: 'svc', serviceName: 'Wash & Iron', total, amountPaid: paid,
    });
    return { store: next, record };
  };

  it('counts bundles not yet handed back, their price, and what is not paid on them', () => {
    let store = laundry();
    ({ store } = take(store, 1_000, 1_000));
    ({ store } = take(store, 2_000, 500));
    const collected = take(store, 3_000, 0);
    store = collected.store;
    setLocalLaundryStage(CODE, collected.record.clientRef, 'collected');

    expect(waitingToCollect(store)).toEqual({ count: 2, value: 3_000, unpaid: 1_500 });
  });

  it('agrees with the home screen board on the same bundles', () => {
    const board = laundryDayBoard([
      { stage: 'washing', total: 1_000, balance: 0, overdue: false, promisedAt: null },
      { stage: 'ready', total: 2_000, balance: 1_500, overdue: false, promisedAt: null },
      { stage: 'collected', total: 3_000, balance: 3_000, overdue: false, promisedAt: null },
    ] as any);
    expect(board.waitingCount).toBe(2);
    expect(board.waitingValue).toBe(3_000);
    expect(board.waitingUnpaid).toBe(1_500);
    // Owed still counts the bundle that left unpaid; waiting does not.
    expect(board.owed).toBe(4_500);
  });

  it('is shown on the home screen and on Analysis', () => {
    expect(readSource('src/components/laundry/LaundryDayBoard.tsx')).toContain('Waiting to be collected');
    expect(readSource('src/components/analytics/BusinessAnalytics.tsx')).toContain('waiting: waitingToCollect(store)');
  });
});
