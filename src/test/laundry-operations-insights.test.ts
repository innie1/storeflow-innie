import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { getCustomerActivitySignals, getEarningsPulse, getPromisedTime } from '@/lib/business-insights';

describe('laundry operations and business insights', () => {
  it('keeps address optional while recording promised time and exact methods', () => {
    const intake = fs.readFileSync('src/components/laundry/LaundryWalkInIntakeV2.tsx', 'utf8');
    expect(intake).toContain('Address (optional but recommended)');
    expect(intake).toContain('promisedFor');
    expect(intake).toContain('washMethodId');
    expect(intake).toContain('dryMethodId');
    expect(intake).not.toMatch(/if \(!customerAddress/);
  });

  it('registers machines and counts assigned jobs without inventing equipment', () => {
    const equipment = fs.readFileSync('src/components/laundry/LaundryEquipmentPanel.tsx', 'utf8');
    expect(equipment).toContain('store.laundryEquipment || []');
    expect(equipment).toContain('meta.wash_method_id');
    expect(equipment).toContain('meta.dry_method_id');
    expect(equipment).toContain("manual:hand-wash");
    expect(equipment).toContain("manual:sun-dry");
  });

  it('compares current earnings with real prior periods', () => {
    const now = new Date('2026-08-30T12:00:00Z');
    const store: any = {
      sales: [
        { date: '2026-08-30T08:00:00Z', total: 2000 },
        { date: '2026-08-29T08:00:00Z', total: 700 },
        { date: '2026-08-28T08:00:00Z', total: 700 },
      ],
    };
    const pulse = getEarningsPulse(store, now);
    expect(pulse.today).toBe(2000);
    expect(pulse.dailyBaseline).toBe(200);
    expect(pulse.dailyChange).toBe(900);
  });

  it('creates an inactive-regular follow-up draft from customer behavior', () => {
    const old = new Date(Date.now() - 35 * 86_400_000).toISOString();
    const signals = getCustomerActivitySignals({
      storeName: 'Washlie', accessCode: 'AMZXWE', products: [], sales: [], createdAt: old,
      customers: [{ id: 'c1', name: 'Ada', phone: '0801', totalPurchases: 20000, outstandingDebt: 0, lastPurchaseDate: old, purchaseHistory: [], loyaltyPoints: 0, visitsCount: 8 }],
    });
    expect(signals[0].kind).toBe('inactive');
    expect(signals[0].message).toContain('Washlie');
  });

  it('keeps the dashboard safe for older or partially restored store shapes', () => {
    const legacyStore = {
      storeName: 'Older store', accessCode: 'OLD123', products: [], createdAt: '2025-01-01T00:00:00Z',
      sales: null, customers: { stale: true },
    } as any;
    expect(() => getEarningsPulse(legacyStore)).not.toThrow();
    expect(getEarningsPulse(legacyStore).today).toBe(0);
    expect(() => getCustomerActivitySignals(legacyStore)).not.toThrow();
    expect(getCustomerActivitySignals(legacyStore)).toEqual([]);
  });

  it('falls back to a 24-hour laundry promise when an older order has none', () => {
    expect(getPromisedTime({ business_type: 'laundry', created_at: '2026-08-30T10:00:00Z' })).toBe('2026-08-31T10:00:00.000Z');
  });

  it('persists structured operational details in the cloud migration', () => {
    const sql = fs.readFileSync('supabase/migrations/20260830110000_enrich_laundry_operations.sql', 'utf8');
    expect(sql).toContain("'customer_address'");
    expect(sql).toContain("'promised_for'");
    expect(sql).toContain("'wash_method_id'");
    expect(sql).toContain("'dry_method_id'");
  });
});
