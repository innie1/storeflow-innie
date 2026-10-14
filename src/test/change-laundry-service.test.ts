import { describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import type { LocalLaundryRecord } from '@/lib/laundry-offline';
import { readServiceChanges } from '@/lib/laundry-offline';
import { recordLaundryPayment, repriceLaundryDebt } from '@/lib/laundry-money';
import { noticeServiceChanges, quoteServiceChange } from '@/lib/laundry-service-change';
import { setLaundryGarmentPrice } from '@/lib/laundry-pricing';
import { visibleNotifications } from '@/lib/notification-gate';
import { readSource } from './helpers/source';

/**
 * Clothes tagged "Full service" that only came for ironing: moved to the
 * right service, priced again, with the reason - and the owner told.
 */

const full = { id: 'full', name: 'Full service', isService: true, sellingPrice: 500, servicePricing: 'per_piece', unit: 'pcs' };
const iron = { id: 'iron', name: 'Iron', isService: true, sellingPrice: 300, servicePricing: 'per_piece', unit: 'pcs' };
const shop = (): StoreData => ({ accessCode: 'ABC123', storeName: 'Washlie', products: [full, iron], pendingPayments: [], sales: [], flowNotifications: [] } as unknown as StoreData);

const bundle = {
  id: 'o1', client_ref: 'r1', total: 2500,
  service_metadata: { service_id: 'full', service_name: 'Full service', pricing: 'per_piece', billing_quantity: 1,
    garment_lines: ['Shirt', 'Trouser', 'T-shirt', 'Native Wear', 'Towel'].map(garment_type => ({ garment_type, quantity: 1, unit_price: 500, subtotal: 500 })) },
};

describe('the new price', () => {
  it('comes from the price list, as intake prices it', () => {
    const priced = ['Shirt', 'Trouser', 'T-shirt', 'Native Wear', 'Towel'].reduce((store, garment) => setLaundryGarmentPrice(store, 'iron', garment, 300), shop());
    const quote = quoteServiceChange(priced, bundle, iron as any);
    expect(quote.total).toBe(1500);
    expect(quote.garments[0]).toMatchObject({ garmentType: 'Shirt', quantity: 1, unitPrice: 300, subtotal: 300 });
  });
});

describe('what the customer owes', () => {
  const paid = (amount: number) => recordLaundryPayment(shop(), {
    clientRef: 'r1', tagCode: 'XYM2J9', customerName: 'Ada', serviceId: 'full', serviceName: 'Full service', total: 2500, amountPaid: amount,
  } as any);

  it('follows the new price, keeping what was paid', () => {
    const owed = repriceLaundryDebt(paid(1000), 'r1', 1500, 'Iron').pendingPayments![0];
    expect(owed).toMatchObject({ total: 1500, paid: 1000, balance: 500, status: 'pending' });
    expect(owed.items![0].productName).toBe('Iron · XYM2J9');
  });

  it('is nothing when more was paid than the new price', () => {
    expect(repriceLaundryDebt(paid(2500), 'r1', 1500).pendingPayments![0]).toMatchObject({ total: 1500, paid: 2500, balance: 0, status: 'paid' });
  });
});

describe("on the owner's phone", () => {
  const change = { at: '2026-10-14T10:00:00Z', from: 'Full service', to: 'Iron', from_total: 2500, to_total: 1500, reason: 'Tagged wrong at intake', by: 'Marta', role: 'attendant' };
  const record = (changes = [change]): LocalLaundryRecord => ({
    clientRef: 'r1', tagCode: 'XYM2J9', customerName: 'Ada', total: 1500, serviceChanges: readServiceChanges(changes),
  } as LocalLaundryRecord);
  const now = new Date('2026-10-14T12:00:00Z');
  const owing = () => recordLaundryPayment(shop(), { clientRef: 'r1', tagCode: 'XYM2J9', customerName: 'Ada', serviceId: 'full', serviceName: 'Full service', total: 2500, amountPaid: 0 } as any);

  it('tells the owner who changed what, and why, and corrects what is owed', () => {
    const next = noticeServiceChanges(owing(), [record()], now)!;
    expect(next.flowNotifications?.[0]).toMatchObject({
      title: "Marta changed a bundle's service",
      text: 'XYM2J9 · Ada: Full service → Iron · ₦2,500 → ₦1,500',
      tone: 'warning',
    });
    expect(next.flowNotifications?.[0].description).toContain('Why: Tagged wrong at intake');
    expect(next.pendingPayments?.[0]).toMatchObject({ total: 1500, balance: 1500 });
  });

  it('tells once', () => {
    const once = noticeServiceChanges(owing(), [record()], now)!;
    expect(noticeServiceChanges(once, [record()], now)).toBeNull();
  });

  it('does not tell the owner about their own change, but still corrects what is owed', () => {
    const next = noticeServiceChanges(owing(), [record([{ ...change, by: 'Owner', role: 'owner' }])], now)!;
    expect(next.flowNotifications).toHaveLength(0);
    expect(next.pendingPayments?.[0].total).toBe(1500);
  });

  it('is not shown to workers', () => {
    const notices = noticeServiceChanges(owing(), [record()], now)!.flowNotifications || [];
    expect(visibleNotifications(notices, { role: 'attendant' })).toHaveLength(0);
  });
});

describe('the cloud', () => {
  const sql = readSource('supabase/migrations/20261014140000_change_laundry_service.sql');

  it('needs a reason, and refuses a bundle already collected', () => {
    expect(sql).toContain("if v_reason = '' then raise exception 'Say why the service is changing'");
    expect(sql).toContain("if v_order.workflow_stage = 'collected' then raise exception");
  });

  it("names the signed-in worker, not what the phone says", () => {
    expect(sql).toContain("p_billing_quantity, p_total, p_garments, p_reason, v.o_worker->>'name', v.o_worker->>'role')");
  });

  it('keeps only the last ten changes on a bundle', () => {
    expect(sql).toContain('order by n desc limit 10');
  });
});
