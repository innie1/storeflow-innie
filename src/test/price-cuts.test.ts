import { describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import type { LocalLaundryRecord } from '@/lib/laundry-offline';
import { noticePriceCuts } from '@/lib/price-cuts';
import { visibleNotifications } from '@/lib/notification-gate';
import { orderToLaundryRecord } from '@/lib/shop-laundry';
import { readSource } from './helpers/source';

/**
 * A bundle charged under the price list is told to the owner, once - from
 * bundles the owner's phone already has.
 */

const now = new Date('2026-10-14T12:00:00Z');
const shop = (): StoreData => ({ accessCode: 'ABC123', storeName: 'Washlie', flowNotifications: [] } as unknown as StoreData);
const bundle = (extra: Partial<LocalLaundryRecord>): LocalLaundryRecord => ({
  clientRef: 'r1', tagCode: 'PJNBNC', customerName: 'Ada', total: 1500, listPrice: 2000,
  recordedByName: 'Marta', recordedByRole: 'attendant', createdAt: '2026-10-14T09:00:00Z',
  ...extra,
} as LocalLaundryRecord);

describe('a bundle charged under the price list', () => {
  it('tells the owner who, which bundle and by how much', () => {
    const next = noticePriceCuts(shop(), [bundle({})], now)!;
    expect(next.flowNotifications?.[0]).toMatchObject({
      id: 'price-cut-r1',
      title: 'Marta charged under the price list',
      text: 'PJNBNC · Ada: ₦1,500 instead of ₦2,000',
    });
    expect(next.priceCutsNoticed).toEqual(['r1']);
  });

  it('tells once, however often the bundles are read', () => {
    const once = noticePriceCuts(shop(), [bundle({})], now)!;
    expect(noticePriceCuts(once, [bundle({})], now)).toBeNull();
  });

  it('leaves out full price, the owner\'s own changes, and old bundles', () => {
    expect(noticePriceCuts(shop(), [
      bundle({ clientRef: 'a', listPrice: undefined }),
      bundle({ clientRef: 'b', total: 2000 }),
      bundle({ clientRef: 'c', recordedByRole: 'owner' }),
      bundle({ clientRef: 'd', createdAt: '2026-09-01T00:00:00Z' }),
      bundle({ clientRef: 'e', recordedByName: undefined, recordedByRole: undefined }),
    ], now)).toBeNull();
  });

  it('is shown to those who see the money, not to workers', () => {
    const notices = noticePriceCuts(shop(), [bundle({})], now)!.flowNotifications || [];
    expect(visibleNotifications(notices, { role: 'owner' })).toHaveLength(1);
    expect(visibleNotifications(notices, { role: 'attendant' })).toHaveLength(0);
  });

  it('keeps only the newest two hundred it has told', () => {
    const many = { ...shop(), priceCutsNoticed: Array.from({ length: 205 }, (_, i) => `x${i}`) } as StoreData;
    expect(noticePriceCuts(many, [bundle({})], now)!.priceCutsNoticed).toHaveLength(200);
  });
});

describe('the list price travels with the bundle', () => {
  it('is read back from the cloud copy', () => {
    const record = orderToLaundryRecord({ id: 'o1', client_ref: 'r1', total: 1500, service_metadata: { list_price: 2000, recorded_by_name: 'Marta' } }, 'ABC123');
    expect(record).toMatchObject({ listPrice: 2000, recordedByName: 'Marta' });
  });

  it('is sent with the bundle, and the cloud keeps it only when it is more than was charged', () => {
    expect(readSource('src/lib/laundry-offline.ts')).toContain('...(record.listPrice ? { list_price: record.listPrice } : {})');
    const sql = readSource('supabase/migrations/20261014130000_keep_list_price.sql');
    expect(sql).toContain("(v_details->>'list_price')::numeric > p_total");
  });
});
