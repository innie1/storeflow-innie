import { beforeEach, describe, expect, it } from 'vitest';
import { createLocalLaundryRecord, localLaundryRecordToOrder } from '@/lib/laundry-offline';
import { getLaundryRecordSearchText } from '@/lib/laundry-workspace';

/**
 * Losing a bundle is the most expensive mistake a laundry makes, and until now
 * the app could say everything about a job except which shelf it was on.
 *
 * The shelf has to survive the whole way — written at intake, kept on the
 * record, carried into the order shape the workspace reads, and searchable —
 * or it is decoration. Each step here is one place it used to fall out.
 */

const base = {
  accessCode: 'shelf1',
  customerName: 'Ada Obi',
  customerPhone: '08012345678',
  serviceId: 'svc-full',
  serviceName: 'Full Service',
  pricing: 'per_piece' as const,
  billingQuantity: 1,
  total: 5600,
  garments: [{ garmentType: 'Shirt', quantity: 2, unitPrice: 1200, subtotal: 2400 }],
};

describe('where the bundle is', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the shelf on the record and in the order the workspace reads', () => {
    const record = createLocalLaundryRecord({ ...base, shelfLocation: 'Rack B, 3rd shelf' });
    expect(record.shelfLocation).toBe('Rack B, 3rd shelf');

    const order = localLaundryRecordToOrder(record);
    expect(order.service_metadata.shelf_location).toBe('Rack B, 3rd shelf');
  });

  it('finds a bundle by the rack it is on', () => {
    const record = createLocalLaundryRecord({ ...base, shelfLocation: 'Rack B' });
    const text = getLaundryRecordSearchText(localLaundryRecordToOrder(record));
    expect(text).toContain('rack b');
  });

  it('leaves the shelf off entirely when nobody wrote one', () => {
    // A shop that does not use racks must not get an empty "Shelf:" label on
    // every row, so blank has to stay undefined rather than becoming ''.
    const record = createLocalLaundryRecord({ ...base, shelfLocation: '   ' });
    expect(record.shelfLocation).toBeUndefined();
  });
});
