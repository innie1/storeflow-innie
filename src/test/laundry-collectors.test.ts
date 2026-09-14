import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import {
  cleanCollectors,
  createLocalLaundryRecord,
  getLocalLaundryRecord,
  mergeLaundryRecords,
  getLocalLaundryRecords,
  setLocalLaundryCollectedBy,
  setLocalLaundryCollectors,
} from '@/lib/laundry-offline';
import { decorateRecord } from '@/lib/laundry-records';
import { readSource } from './helpers/source';

/**
 * Someone else collecting a customer's clothes.
 *
 * Asked for from the shop: a customer may send somebody to pick up their
 * items, so a bundle can name more than one person - kept small, so it is not
 * in the way of every bundle. The names stay on the shop phone.
 */

const store = { accessCode: 'COL001', pendingPayments: [], sales: [] } as unknown as StoreData;

function takeIn(collectors?: { name: string; phone?: string }[]) {
  return createLocalLaundryRecord({
    accessCode: 'COL001', customerName: 'Musa Bello', customerPhone: '08011111111', collectors,
    serviceId: 's1', serviceName: 'Wash & Iron', pricing: 'per_item', billingQuantity: 1, total: 500,
    garments: [{ garmentType: 'Shirt', quantity: 1, unitPrice: 500 }] as any,
  });
}

beforeEach(() => localStorage.clear());

describe('the people who may collect', () => {
  it('are kept tidy: names only, each once, with a phone where given', () => {
    expect(cleanCollectors([
      { name: ' Tunde ', phone: ' 0803 ' }, { name: '' }, { name: 'tunde' }, { name: 'Ada' },
    ])).toEqual([{ name: 'Tunde', phone: '0803' }, { name: 'Ada' }]);
    expect(cleanCollectors([{ name: '  ' }])).toBeUndefined();
  });

  it('are saved with the bundle at intake', () => {
    const record = takeIn([{ name: 'Tunde', phone: '08033333333' }]);
    expect(getLocalLaundryRecord('COL001', record.clientRef)?.collectors).toEqual([{ name: 'Tunde', phone: '08033333333' }]);
  });

  it('can be added or changed afterwards, and who collected is kept', () => {
    const record = takeIn();
    setLocalLaundryCollectors('COL001', record.clientRef, [{ name: 'Ada' }, { name: 'Kola' }]);
    setLocalLaundryCollectedBy('COL001', record.clientRef, 'Kola');
    const saved = getLocalLaundryRecord('COL001', record.clientRef);
    expect(saved?.collectors?.map(person => person.name)).toEqual(['Ada', 'Kola']);
    expect(saved?.collectedBy).toBe('Kola');

    // The customer coming themselves leaves nobody else named.
    setLocalLaundryCollectedBy('COL001', record.clientRef, '');
    expect(getLocalLaundryRecord('COL001', record.clientRef)?.collectedBy).toBeUndefined();
  });

  it('show on the Records list, before and after the bundle syncs', () => {
    const record = takeIn([{ name: 'Tunde' }]);
    const local = getLocalLaundryRecords('COL001');

    const before = mergeLaundryRecords([], local).map(order => decorateRecord(order, store));
    expect(before[0].collectors?.map(person => person.name)).toEqual(['Tunde']);

    // Synced: the cloud row comes back without them, and the local copy says so.
    const synced = local.map(entry => ({ ...entry, syncStatus: 'synced' as const }));
    const cloudRow = {
      id: 'o1', client_ref: record.clientRef, order_number: record.tagCode, customer_name: 'Musa Bello',
      workflow_stage: 'received', service_metadata: { source: 'walk_in_laundry', client_ref: record.clientRef, tag_code: record.tagCode },
      notes: JSON.stringify({ source: 'walk_in_laundry', client_ref: record.clientRef }),
      order_items: [{ item_name: 'Shirt', quantity: 1, metadata: {} }],
    };
    const after = mergeLaundryRecords([cloudRow], synced).map(order => decorateRecord(order, store));
    expect(after).toHaveLength(1);
    expect(after[0].collectors?.map(person => person.name)).toEqual(['Tunde']);
  });

  it('never leave the phone', () => {
    // What a bundle sends to the cloud is spelled out field by field; nothing
    // about who may collect is in it.
    const offline = readSource('src/lib/laundry-offline.ts');
    const sync = offline.slice(offline.indexOf('export async function syncLaundryRecord'), offline.indexOf('export async function updateLaundryOrderStage'));
    expect(sync.length).toBeGreaterThan(0);
    expect(sync).not.toContain('collector');
    expect(sync).not.toContain('collected_by');
  });
});

describe('at the counter', () => {
  const intake = readSource('src/components/laundry/LaundryWalkInIntakeV3.tsx');
  const workspace = readSource('src/components/laundry/LaundryWorkspace.tsx');

  it('is a quiet link at intake, cleared for the next bundle', () => {
    expect(intake).toContain('+ Someone else may collect');
    expect(intake).toContain('        collectors,');
    const reset = intake.slice(intake.indexOf('const reset = () => {'), intake.indexOf('const openIntake = () => {'));
    expect(reset).toContain('setCollectors([]);');
  });

  it('asks who is collecting before a bundle with other names is marked Collected', () => {
    expect(workspace).toContain("if (stage === 'collected' && (record.collectors || []).length > 0 && handedTo.current?.key !== record.key) {");
    expect(workspace).toContain('Who is collecting?');
    expect(workspace).toContain("setLocalLaundryCollectedBy(String(store.accessCode || ''), record.clientRef, person.isCustomer ? '' : person.name);");
  });

  it('asks again next time, even when a hand-over was cancelled at the money check', () => {
    expect(workspace).toContain("if (stage === 'collected') handedTo.current = null;");
    expect(workspace.split('onClick={() => { setCollectGuard(null); handedTo.current = null; }}').length - 1).toBe(2);
  });

  it('can add them to a bundle already in the shop', () => {
    expect(workspace).toContain('+ Someone else may collect');
    expect(workspace).toContain('setLocalLaundryCollectors(');
  });
});
