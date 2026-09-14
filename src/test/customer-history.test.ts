import { beforeEach, describe, expect, it } from 'vitest';
import type { Customer, StoreData } from '@/types/store';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { customerHistory, impactLine } from '@/lib/customer-history';

/**
 * One customer's bundles, and what they mean to the shop.
 *
 * Asked for from the shop: tap a customer and see the list of their records,
 * and how they affect the shop. Which bundles are theirs follows the rule
 * debts already use, so a customer page and a debt can never disagree about
 * who somebody is.
 */

const NOW = new Date('2026-09-14T12:00:00').getTime();
const DAY = 86400000;
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const person = (id: string, name: string, phone = '', over: Partial<Customer> = {}): Customer => ({
  id, name, phone, totalPurchases: 0, outstandingDebt: 0, purchaseHistory: [], loyaltyPoints: 0, visitsCount: 0, ...over,
});

/** A bundle taken in on this phone. */
const kept = (clientRef: string, tagCode: string, customerName: string, customerPhone: string, over: Record<string, unknown> = {}) => ({
  clientRef, accessCode: 'CH001', tagCode, customerName, customerPhone,
  garments: [{ garmentType: 'Shirt', quantity: 2, unitPrice: 500, subtotal: 1000 }],
  serviceId: 's1', serviceName: 'Wash & Iron', pricing: 'per_item', billingQuantity: 2,
  total: 1000, pieceCount: 2, garmentSummary: '2 Shirt', workflowStage: 'washing',
  createdAt: iso(3), syncStatus: 'pending', ...over,
});

/** A bundle taken in on another phone, known here only from the cloud. */
const fromCloud = (clientRef: string, tagCode: string, customerName: string, customerPhone: string, over: Record<string, unknown> = {}) => ({
  id: `o-${clientRef}`, client_ref: clientRef, order_number: tagCode, customer_name: customerName, customer_phone: customerPhone,
  workflow_stage: 'ready', business_type: 'laundry', order_kind: 'service', total: 1500, created_at: iso(40),
  service_metadata: {
    source: 'walk_in_laundry', client_ref: clientRef, tag_code: tagCode, garment_count: 3, garment_summary: '3 Trouser',
    garment_lines: [{ garmentType: 'Trouser', quantity: 3 }],
  },
  order_items: [{ item_name: 'Trouser', quantity: 3, price: 500, subtotal: 1500, metadata: {} }],
  ...over,
});

const payment = (clientRef: string, amount: number, daysAgo: number) => ({
  id: `laundry-${clientRef}-${daysAgo}`, productId: 's1', productName: 'Wash & Iron', quantity: 1,
  unitPrice: amount, total: amount, profit: amount, date: iso(daysAgo),
  pendingPaymentId: `laundry-${clientRef}`, channel: 'in_store',
});

const owing = (clientRef: string, customerId: string, total: number, paid: number) => ({
  id: `laundry-${clientRef}`, customerId, customerName: '', customerPhone: '', items: [],
  total, paid, balance: total - paid, createdAt: iso(3), status: total - paid > 0 ? 'pending' : 'paid', events: [],
});

const musaWithNumber = person('c1', 'Musa Bello', '08011111111');
const musaWithout = person('c2', 'Musa Bello');
const ada = person('c3', 'Ada Obi', '08022222222');

function laundry(over: Partial<StoreData> = {}): StoreData {
  return {
    storeName: 'Wash', accessCode: 'CH001', storeType: 'laundry', products: [], expenses: [],
    customers: [musaWithNumber, musaWithout, ada], sales: [], pendingPayments: [],
    createdAt: new Date(0).toISOString(), ...over,
  } as unknown as StoreData;
}

function keep(...records: Record<string, unknown>[]) {
  localStorage.setItem(laundryLocalStorageKey('CH001'), JSON.stringify(records));
}

beforeEach(() => localStorage.clear());

describe('which bundles are a customer’s', () => {
  it('follows the customer a bundle was saved with, and no other', () => {
    keep(
      kept('r1', 'AAAAA1', 'Musa Bello', '', { customerId: 'c1' }),
      kept('r2', 'AAAAA2', 'Musa Bello', '', { customerId: 'c2' }),
    );
    const store = laundry();
    expect(customerHistory(store, musaWithNumber, [], NOW).bundles.map(b => b.tagCode)).toEqual(['AAAAA1']);
    expect(customerHistory(store, musaWithout, [], NOW).bundles.map(b => b.tagCode)).toEqual(['AAAAA2']);
  });

  it('finds a bundle from another phone by its number, written either way', () => {
    const history = customerHistory(laundry(), musaWithNumber, [fromCloud('o1', 'BBBBB1', 'Musa B.', '+2348011111111')], NOW);
    expect(history.bundles.map(b => b.tagCode)).toEqual(['BBBBB1']);
  });

  it('gives a name two customers share, with no number, to neither of them', () => {
    const orders = [fromCloud('o2', 'BBBBB2', 'Musa Bello', '')];
    expect(customerHistory(laundry(), musaWithNumber, orders, NOW).bundles).toHaveLength(0);
    expect(customerHistory(laundry(), musaWithout, orders, NOW).bundles).toHaveLength(0);
  });

  it('treats a different number as a different person, whatever the name', () => {
    const orders = [fromCloud('o3', 'BBBBB3', 'Ada Obi', '08099999999')];
    expect(customerHistory(laundry(), ada, orders, NOW).bundles).toHaveLength(0);
  });
});

describe('what a customer means to the shop', () => {
  it('adds up money received, what is owed, and what is still in the shop', () => {
    keep(kept('r1', 'AAAAA1', 'Musa Bello', '08011111111', { customerId: 'c1' }));
    const store = laundry({
      sales: [payment('r1', 400, 2), payment('o1', 1500, 40)] as any,
      pendingPayments: [owing('r1', 'c1', 1000, 400)] as any,
    });
    const history = customerHistory(store, musaWithNumber, [fromCloud('o1', 'BBBBB1', 'Musa Bello', '08011111111', { workflow_stage: 'collected' })], NOW);

    expect(history.broughtIn).toBe(1900);
    expect(history.owes).toBe(600);
    expect(history.dropOffs).toBe(2);
    expect(history.pieces).toBe(5);
    expect(history.waitingCount).toBe(1);
    expect(history.waitingUnpaid).toBe(600);
    // Newest first.
    expect(history.bundles.map(b => `${b.tagCode}:${b.stageLabel}:${b.paid}`)).toEqual(['AAAAA1:Washing:400', 'BBBBB1:Collected:1500']);
  });

  it('measures their share of the last 90 days, and their place among customers', () => {
    keep(
      kept('r1', 'AAAAA1', 'Musa Bello', '08011111111', { customerId: 'c1' }),
      kept('r3', 'AAAAA3', 'Ada Obi', '08022222222', { customerId: 'c3' }),
    );
    const store = laundry({
      sales: [
        payment('r1', 1900, 5),
        payment('r1', 200, 200), // older than the window
        payment('r3', 2000, 10),
        { id: 'walk-in', productId: 'x', productName: 'Starch', quantity: 1, unitPrice: 100, total: 100, profit: 100, date: iso(1) },
      ] as any,
    });
    const history = customerHistory(store, musaWithNumber, [], NOW);

    expect(history.broughtIn).toBe(2100);
    expect(history.share).toBeCloseTo(1900 / 4000);
    expect(history.rank).toBe(2);
    expect(impactLine(history)).toBe('48% of what you received in the last 90 days · your number 2 customer');
  });

  it('says nothing about impact until there is something to say', () => {
    expect(impactLine({ share: null, rank: null })).toBeNull();
    expect(impactLine({ share: 0.004, rank: 30 })).toBe('Under 1% of what you received in the last 90 days');
    expect(impactLine({ share: 0.6, rank: 1 })).toBe('60% of what you received in the last 90 days · your top customer');
  });

  it('counts what was bought, outside a laundry', () => {
    const buyer = person('p1', 'Kola', '08033333333', {
      totalPurchases: 5000,
      purchaseHistory: [{ date: iso(10), amount: 3000, items: 'Rice' }],
    });
    const shop = {
      storeName: 'Provisions', accessCode: 'CH002', storeType: 'provision', products: [], expenses: [],
      customers: [buyer], pendingPayments: [], createdAt: new Date(0).toISOString(),
      sales: [{ id: 's', productId: 'p', productName: 'Rice', quantity: 1, unitPrice: 6000, total: 6000, profit: 1000, date: iso(10) }],
    } as unknown as StoreData;
    const history = customerHistory(shop, buyer, [], NOW);

    expect(history.broughtIn).toBe(5000);
    expect(history.share).toBeCloseTo(0.5);
    expect(history.bundles).toHaveLength(0);
  });
});
