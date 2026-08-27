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
        { garmentType: 'Shirt', quantity: 2, unitPrice: 1200, subtotal: 2400 },
        { garmentType: 'Trouser', quantity: 1, unitPrice: 3200, subtotal: 3200 },
      ],
    });

    expect(record.tagCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(record.syncStatus).toBe('pending');
    expect(record.pieceCount).toBe(3);
    expect(record.customerPhone).toBe('08012345678');
    expect(record.garments[0].unitPrice).toBe(1200);
    expect(getLocalLaundryRecords('ABC123')).toHaveLength(1);
    expect(localStorage.getItem(laundryLocalStorageKey('abc123'))).toContain(record.tagCode);
  });

  it('refuses to create a laundry record without both customer name and phone', () => {
    const base = {
      accessCode: 'SHOP1',
      serviceId: 'iron',
      serviceName: 'Ironing',
      pricing: 'fixed',
      billingQuantity: 1,
      total: 1500,
      garments: [{ garmentType: 'Shirt', quantity: 1 }],
    };

    expect(() => createLocalLaundryRecord({ ...base, customerName: '', customerPhone: '08012345678' })).toThrow(/name/i);
    expect(() => createLocalLaundryRecord({ ...base, customerName: 'Timi', customerPhone: '' })).toThrow(/phone/i);
  });

  it('shows a local-only record as not synced', () => {
    const record = createLocalLaundryRecord({
      accessCode: 'SHOP1',
      customerName: 'Timi',
      customerPhone: '08055550101',
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
    expect(order.customer_phone).toBe('08055550101');
  });

  it('marks a matching cloud record as synced and does not duplicate it', () => {
    const record = createLocalLaundryRecord({
      accessCode: 'SHOP2',
      customerName: 'Faith',
      customerPhone: '08055550102',
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
        customer_phone: '08055550102',
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
