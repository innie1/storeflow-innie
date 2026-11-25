import { describe, expect, it } from 'vitest';
import { addArrivedPayments, type ArrivedPayment } from '@/lib/staff-records';
import { recordLaundryPayment } from '@/lib/laundry-money';
import type { StoreData } from '@/types/store';

/*
 * Since 25 Nov the cloud writes a worker's money into the books itself
 * (supabase/migrations/20261125180000_cloud_books_worker_payments.sql) and
 * says so. The owner's phone takes the cloud's sale and Money Owed line;
 * it must never book the same money a second time.
 */

const shop = (): StoreData => ({
  storeName: 'Washlie', accessCode: 'TEST01', createdAt: '2026-10-01T00:00:00Z',
  products: [], sales: [], restocks: [], expenses: [], investments: [], pendingPayments: [],
} as unknown as StoreData);

const sent = (over: Partial<ArrivedPayment> = {}): ArrivedPayment => ({
  id: 'pay-1', kind: 'intake', clientRef: 'ref1', amount: 300, at: '2026-11-25T14:49:10.074+00:00',
  staffName: 'Destiny', staffRole: 'manager', method: 'cash', total: 500, tagCode: 'EXQ27C',
  customerName: 'Joy', serviceId: 'iron', serviceName: 'Ironing Only', ...over,
});

/** What the cloud booked: the phone's own booking, which the cloud copies field for field. */
function cloudBooks(store: StoreData, payment: ArrivedPayment): ArrivedPayment {
  const booked = addArrivedPayments(store, [payment]).store;
  return {
    ...payment, booked: true,
    sale: (booked.sales || []).find(sale => sale.id === `laundry-${payment.clientRef}-${payment.at}`) || null,
    owed: (booked.pendingPayments || []).find(entry => entry.id === `laundry-${payment.clientRef}`) || null,
  };
}

describe('money a worker took, already in the books in the cloud', () => {
  it("is taken as the cloud wrote it", () => {
    const told = cloudBooks(shop(), sent());
    const { store } = addArrivedPayments(shop(), [told]);
    expect(store.sales).toEqual([told.sale]);
    expect(store.pendingPayments).toEqual([told.owed]);
    expect(store.pendingPayments![0]).toMatchObject({ paid: 300, balance: 200 });
  });

  it('is not counted twice when this phone already has it from the cloud', () => {
    const told = cloudBooks(shop(), sent());
    // The sync already brought the cloud's sale and line onto this phone.
    const synced = { ...shop(), sales: [told.sale!], pendingPayments: [told.owed!] } as StoreData;
    const { store } = addArrivedPayments(synced, [told]);
    expect(store.sales).toHaveLength(1);
    expect(store.pendingPayments![0]).toMatchObject({ paid: 300, balance: 200 });
  });

  it("keeps this phone's link to the customer's card", () => {
    const told = cloudBooks(shop(), sent());
    const linked = { ...shop(), pendingPayments: [{ ...told.owed!, customerId: 'joy' }] } as StoreData;
    const { store } = addArrivedPayments(linked, [{ ...told, owed: { ...told.owed!, events: told.owed!.events } }]);
    expect(store.pendingPayments![0].customerId).toBe('joy');
  });

  it('books here, as before, when this phone took money on the same bundle that the cloud has not seen', () => {
    // The owner took ₦100 at the counter; the cloud's line knows nothing of it.
    const here = recordLaundryPayment(shop(), { clientRef: 'ref1', tagCode: 'EXQ27C', customerName: 'Joy', serviceId: 'iron', serviceName: 'Ironing Only', total: 500, amountPaid: 100, at: '2026-11-25T14:00:00.000Z' });
    const told = cloudBooks(shop(), sent());
    const { store } = addArrivedPayments(here, [told]);
    expect(store.pendingPayments![0]).toMatchObject({ paid: 400, balance: 100 });
    expect(store.sales).toHaveLength(2);
  });

  it('still books a payment the cloud did not, the way it always has', () => {
    const { store } = addArrivedPayments(shop(), [sent()]);
    expect(store.pendingPayments![0]).toMatchObject({ paid: 300, balance: 200 });
    expect(store.sales).toHaveLength(1);
  });
});
