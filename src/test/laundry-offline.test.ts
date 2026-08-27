import { beforeEach, describe, expect, it } from 'vitest';
import {
  createLocalLaundryRecord,
  getLocalLaundryRecords,
  laundryLocalStorageKey,
  localLaundryRecordToOrder,
  mergeLaundryRecords,
} from '@/lib/laundry-offline';

describe('local-first laundry records', () => {
  beforeEach(() => localStorage.clear());

  it('saves a complete laundry job locally before any cloud id exists', () => {
    const record = createLocalLaundryRecord({
      accessCode: 'abc123',
      customerName: 'Ada Obi',
      customerPhone: '08012345678',
      serviceId: 'svc-full',
      serviceName: 'Full Service',
      pricing: 'per_piece',
      billingQuantity: 1,
      total: 5600,
      notes: 'Stain on shirt',
      garments: [
        { garmentType: 'Shirt', quantity: 2 },
        { garmentType: 'Trouser', quantity: 1 },
      ],
    });

    expect(record.tagCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(record.syncStatus).toBe('pending');
    expect(record.pieceCount).toBe(3);
    expect(getLocalLaundryRecords('ABC123')).toHaveLength(1);
    expect(localStorage.getItem(laundryLocalStorageKey('abc123'))).toContain(record.tagCode);
  });

  it('shows a local-only record as not synced', () => {
    const record = createLocalLaundryRecord({
      accessCode: 'SHOP1',
      customerName: 'Timi',
      serviceId: 'iron',
      serviceName: 'Ironing',
      pricing: 'fixed',
      billingQuantity: 1,
      total: 1500,
      garments: [{ garmentType: 'Shirt', quantity: 1 }],
    });

    const order = localLaundryRecordToOrder(record);
    expect(order._laundrySyncStatus).toBe('pending');
    expect(order.order_number).toBe(record.tagCode);
  });

  it('marks a matching cloud record as synced and does not duplicate it', () => {
    const record = createLocalLaundryRecord({
      accessCode: 'SHOP2',
      customerName: 'Faith',
      serviceId: 'wash',
      serviceName: 'Wash Only',
      pricing: 'fixed',
      billingQuantity: 1,
      total: 2000,
      garments: [{ garmentType: 'Trouser', quantity: 2 }],
    });

    const merged = mergeLaundryRecords([
      {
        id: 'cloud-order',
        client_ref: record.clientRef,
        order_number: record.tagCode,
        customer_name: 'Faith',
        total: 2000,
        created_at: record.createdAt,
        service_metadata: { source: 'walk_in_laundry', client_ref: record.clientRef, tag_code: record.tagCode },
        order_items: [],
      },
      {
        id: 'online-order',
        order_number: 'ONLINE1',
        service_metadata: { source: 'customer_app' },
      },
    ], [record]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('cloud-order');
    expect(merged[0]._laundrySyncStatus).toBe('synced');
  });
});