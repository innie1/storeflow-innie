import { afterEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { createLocalLaundryRecord, laundryLocalStorageKey } from '@/lib/laundry-offline';
import { setShopCloudOrders, shopLaundryRecords } from '@/lib/shop-laundry';
import { monthHistory, monthReport } from '@/lib/service-month-report';
import { backfillAttribution } from '@/lib/attribution-backfill';
import { orderStatusSteps } from '@/lib/inventory-orders';
import { bundleTimeline, readStageSteps } from '@/lib/laundry-records';
import { readSource } from './helpers/source';

/**
 * The owner's rule (13 October 2026): a change must reach the records that
 * already exist - last month's sales, bundles from other phones, anything from
 * before the update - and never work only "from today".
 */

const CODE = 'OLD001';

const shop = (over: Record<string, unknown> = {}) => ({
  storeName: 'Washlie', accessCode: CODE, storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], expenses: [], customers: [], staffMembers: [], managerSettings: {},
  createdAt: new Date(0).toISOString(), ...over,
}) as unknown as StoreData;

/** A bundle as the cloud holds it - taken in on some other phone. */
const cloudBundle = (ref: string, created: string, pieces: number, total: number, extra: Record<string, unknown> = {}) => ({
  id: `o-${ref}`, client_ref: ref, order_number: `T-${ref}`, customer_name: 'Ada', total, created_at: created, updated_at: created,
  workflow_stage: 'received', business_type: 'laundry', order_kind: 'service',
  service_metadata: { source: 'walk_in_laundry', client_ref: ref, garment_count: pieces, service_name: 'Full Service' },
  order_items: [], ...extra,
});

afterEach(() => { localStorage.clear(); setShopCloudOrders(CODE, []); });

describe('every bundle the shop has counts, not just this phone’s', () => {
  it('includes bundles taken in on other phones', () => {
    const mine = createLocalLaundryRecord({ accessCode: CODE, customerName: 'Bisi', customerPhone: '', serviceId: 'p', serviceName: 'Full Service', total: 1000, garments: [{ garmentType: 'Shirt', quantity: 2 }] } as never);
    setShopCloudOrders(CODE, [cloudBundle('other-phone', '2026-10-02T10:00:00Z', 5, 2500)]);
    const all = shopLaundryRecords(CODE);
    expect(all.map(record => record.clientRef).sort()).toEqual(['other-phone', mine.clientRef].sort());
    expect(all.find(record => record.clientRef === 'other-phone')).toMatchObject({ pieceCount: 5, total: 2500, syncStatus: 'synced' });
  });

  it('never counts one bundle twice when both this phone and the cloud have it', () => {
    const mine = createLocalLaundryRecord({ accessCode: CODE, customerName: 'Bisi', customerPhone: '', serviceId: 'p', serviceName: 'Full Service', total: 1000, garments: [{ garmentType: 'Shirt', quantity: 2 }] } as never);
    setShopCloudOrders(CODE, [cloudBundle(mine.clientRef, mine.createdAt, 2, 1000)]);
    expect(shopLaundryRecords(CODE)).toHaveLength(1);
  });

  it('takes the later stage, unless this phone has a move still to send', () => {
    const mine = createLocalLaundryRecord({ accessCode: CODE, customerName: 'Bisi', customerPhone: '', serviceId: 'p', serviceName: 'Full Service', total: 1000, garments: [{ garmentType: 'Shirt', quantity: 2 }] } as never);
    const stored = JSON.parse(localStorage.getItem(laundryLocalStorageKey(CODE))!);
    stored[0] = { ...stored[0], syncStatus: 'synced', stageUpdatedAt: '2026-10-01T00:00:00Z' };
    localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify(stored));
    setShopCloudOrders(CODE, [cloudBundle(mine.clientRef, mine.createdAt, 2, 1000, { workflow_stage: 'ready', service_metadata: { source: 'walk_in_laundry', client_ref: mine.clientRef, stage_updated_at: '2026-10-05T00:00:00Z' } })]);
    expect(shopLaundryRecords(CODE)[0].workflowStage).toBe('ready');
  });

  it('feeds the month figures', () => {
    setShopCloudOrders(CODE, [cloudBundle('a', '2026-09-03T10:00:00Z', 4, 2000), cloudBundle('b', '2026-09-20T10:00:00Z', 6, 3000)]);
    const september = monthReport(shop(), new Date('2026-09-15T12:00:00Z'));
    expect(september).toMatchObject({ jobs: 2, pieces: 10, workTakenIn: 5000 });
  });

  it('is what every laundry figure reads', () => {
    for (const file of ['src/lib/service-breakeven.ts', 'src/lib/service-month-report.ts', 'src/lib/money-figures.ts', 'src/lib/day-records.ts', 'src/lib/manager-intel.ts', 'src/lib/flow-service-brain.ts', 'src/lib/pricing-advisor.ts', 'src/lib/cost-estimator.ts', 'src/components/analytics/BusinessAnalytics.tsx']) {
      const source = readSource(file);
      expect(source, file).toContain('shopLaundryRecords(');
      expect(source, file).not.toContain('getLocalLaundryRecords(');
    }
    expect(readSource('src/pages/Index.tsx')).toContain('setShopCloudOrders(store.accessCode, orders)');
  });
});

describe('past months are worked out again', () => {
  it('shows a month this phone never saw close, from the shop’s records', () => {
    setShopCloudOrders(CODE, [cloudBundle('a', '2026-08-03T10:00:00Z', 4, 2000)]);
    const history = monthHistory(shop(), new Date('2026-10-13T12:00:00Z'));
    expect(history.find(month => month.key === '2026-08')).toMatchObject({ jobs: 1, workTakenIn: 2000 });
  });

  it('uses today’s figures for a filed month, and the filed copy only when the records are gone', () => {
    localStorage.setItem(`storeflow_month_history_${CODE}`, JSON.stringify([{ key: '2026-08', label: 'August 2026', revenue: 1, workTakenIn: 1, owed: 0, pieces: 1, jobs: 1, averageJob: 1, fixedCosts: 0, variableCosts: 0, profit: 1, target: 0, breakEvenOn: null, summary: 'old' }]));
    setShopCloudOrders(CODE, [cloudBundle('a', '2026-08-03T10:00:00Z', 4, 2000)]);
    expect(monthHistory(shop(), new Date('2026-10-13T12:00:00Z')).find(m => m.key === '2026-08')?.workTakenIn).toBe(2000);
    setShopCloudOrders(CODE, []);
    expect(monthHistory(shop(), new Date('2026-10-13T12:00:00Z')).find(m => m.key === '2026-08')?.workTakenIn).toBe(2000);
  });
});

describe('names for records made before names were kept', () => {
  const logs = [
    { id: '1', user: 'Faith', role: 'cashier', action: 'Completed sale: Soap × 2 ctn (Total: ₦1,000)', timestamp: '2026-09-10T10:00:30Z' },
    { id: '2', user: 'Bisi', role: 'manager', action: 'Recorded expense: Transport - ₦500 (Delivery)', timestamp: '2026-09-11T09:00:00Z' },
    { id: '3', user: 'Owner', role: 'owner', action: 'Completed sale: Soap × 1 ctn (Total: ₦500)', timestamp: '2026-09-12T10:00:00Z' },
  ];

  it('reads who sold and who recorded back out of the activity history', () => {
    const store = shop({
      activityLogs: logs,
      sales: [
        { id: 's1', productName: 'Soap', date: '2026-09-10T10:00:00Z', total: 1000, quantity: 2, unitPrice: 500, profit: 0 },
        { id: 's2', productName: 'Soap', date: '2026-09-20T10:00:00Z', total: 500, quantity: 1, unitPrice: 500, profit: 0 },
      ],
      expenses: [{ id: 'e1', category: 'Transport', amount: 500, note: 'Delivery', date: '2026-09-11' }],
    });
    const next = backfillAttribution(store);
    expect(next.sales[0]).toMatchObject({ recordedByName: 'Faith', recordedByRole: 'cashier' });
    // Eight days from any history line: no confident match, so no name.
    expect(next.sales[1].recordedByName).toBeUndefined();
    expect(next.expenses[0].recordedBy).toMatchObject({ name: 'Bisi', role: 'manager' });
  });

  it('changes nothing when every record already has a name', () => {
    const store = shop({ activityLogs: logs, sales: [{ id: 's1', productName: 'Soap', date: '2026-09-10T10:00:00Z', recordedByName: 'Ada' }] });
    expect(backfillAttribution(store)).toBe(store);
  });

  it('runs whenever a shop is opened', () => {
    expect(readSource('src/lib/store-data.ts')).toContain('store = backfillAttribution(store);');
  });
});

describe('old orders and bundles show when they moved', () => {
  it('fills an online order’s run from the cloud’s status history', () => {
    const order = {
      status_history: [{ status: 'Accepted', at: '2026-09-01T09:00:00Z' }, { status: 'Ready', at: '2026-09-01T12:00:00Z' }],
      notes: JSON.stringify({ status_by: [{ status: 'Completed', at: '2026-10-13T09:00:00Z', by: 'Faith' }] }),
    };
    expect(orderStatusSteps(order).map(step => `${step.status}:${step.by || '-'}`)).toEqual(['Accepted:-', 'Ready:-', 'Completed:Faith']);
  });

  it('fills an old bundle’s timeline the same way', () => {
    const steps = readStageSteps(undefined, [
      { status: 'Accepted', at: '2026-09-01T09:00:00Z' },
      { status: 'Preparing', at: '2026-09-01T10:00:00Z' },
      { status: 'Ready', at: '2026-09-01T14:00:00Z' },
      { status: 'Completed', at: '2026-09-02T09:00:00Z' },
    ]);
    const timeline = bundleTimeline({ createdAt: Date.parse('2026-09-01T08:50:00Z'), recordedByName: undefined, steps });
    expect(timeline.map(step => step.label)).toEqual(['Taken in', 'In progress', 'Ready', 'Handed over']);
    expect(timeline.every(step => !step.by)).toBe(true);
  });
});
