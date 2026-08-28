import { beforeEach, describe, expect, it } from 'vitest';
import {
  createLocalLaundryRecord,
  getLocalLaundryRecords,
  laundryLocalStorageKey,
  localLaundryRecordToOrder,
  mergeLaundryRecords,
  setLocalLaundryStage,
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
    expect(record.workflowStage).toBe('received');
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

  it('changes laundry status locally first and exposes it to receipt/WhatsApp consumers', () => {
    const record = createLocalLaundryRecord({
      accessCode: 'SHOP1',
      customerName: 'Timi',
      customerPhone: '08055550101',
      serviceId: 'iron',
      serviceName: 'Ironing',
      pricing: 'per_piece',
      billingQuantity: 1,
      total: 1200,
      garments: [{ garmentType: 'Shirt', quantity: 2, unitPrice: 600, subtotal: 1200 }],
    });

    const updated = setLocalLaundryStage('SHOP1', record.clientRef, 'ready');
    expect(updated?.workflowStage).toBe('ready');
    expect(updated?.syncStatus).toBe('pending');

    const order = localLaundryRecordToOrder(updated!);
    expect(order.workflow_stage).toBe('ready');
    expect(order.status).toBe('Ready');
    expect(order.updated_at).toBe(updated?.stageUpdatedAt);
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

  it('keeps a newer unsynced local stage above a stale cloud copy', () => {
    const record = createLocalLaundryRecord({
      accessCode: 'SHOP3',
      customerName: 'John',
      customerPhone: '08055550103',
      serviceId: 'full',
      serviceName: 'Full Service',
      pricing: 'per_piece',
      billingQuantity: 1,
      total: 900,
      garments: [{ garmentType: 'Trouser', quantity: 1, unitPrice: 900, subtotal: 900 }],
    });
    const updated = setLocalLaundryStage('SHOP3', record.clientRef, 'ready')!;

    const merged = mergeLaundryRecords([
      {
        id: 'cloud-stale',
        client_ref: record.clientRef,
        order_number: record.tagCode,
        customer_name: 'John',
        customer_phone: '08055550103',
        status: 'Accepted',
        workflow_stage: 'received',
        total: 900,
        created_at: record.createdAt,
        service_metadata: { source: 'walk_in_laundry', client_ref: record.clientRef, tag_code: record.tagCode },
        order_items: [],
      },
    ], [updated]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('cloud-stale');
    expect(merged[0].workflow_stage).toBe('ready');
    expect(merged[0].status).toBe('Ready');
    expect(merged[0]._laundrySyncStatus).toBe('pending');
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
    ], [{ ...record, syncStatus: 'synced' }]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('cloud-order');
    expect(merged[0]._laundrySyncStatus).toBe('synced');
  });
});
