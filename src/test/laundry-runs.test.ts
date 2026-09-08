import { beforeEach, describe, expect, it } from 'vitest';
import {
  byPromised,
  mapsLink,
  nextRunStatus,
  runActionLabel,
  runMessage,
  splitRuns,
  totalWithDelivery,
  type RunStop,
} from '@/lib/laundry-runs';
import { createLocalLaundryRecord, setLocalLaundryRunStatus, getLocalLaundryRecords } from '@/lib/laundry-offline';
import type { StoreData } from '@/types/store';

const stop = (over: Partial<RunStop> = {}): RunStop => ({
  clientRef: 'r1',
  tagCode: 'ABC123',
  customerName: 'Ada',
  customerPhone: '08012345678',
  address: '15 Oba Akran Ave',
  kind: 'delivery',
  balance: 0,
  ...over,
});

const base = {
  accessCode: 'run001',
  customerName: 'Ada Obi',
  customerPhone: '08012345678',
  serviceId: 'svc',
  serviceName: 'Full Service',
  pricing: 'per_piece' as const,
  billingQuantity: 1,
  total: 5000,
  garments: [{ garmentType: 'Shirt', quantity: 1, unitPrice: 5000, subtotal: 5000 }],
};

describe('the run is not the wash', () => {
  beforeEach(() => localStorage.clear());

  /**
   * The two journeys are separate on purpose. A bundle can be finished ironing
   * and out on a bike at the same time; if delivery were extra workflow stages
   * a bundle that left the shop would stop counting as ready, and the ready
   * total is what the counter trusts.
   */
  it('moving a bundle onto the road does not change its wash stage', () => {
    const record = createLocalLaundryRecord({ ...base, fulfillment: 'delivery' });
    setLocalLaundryRunStatus('run001', record.clientRef, 'out_for_delivery');

    const saved = getLocalLaundryRecords('run001')[0];
    expect(saved.runStatus).toBe('out_for_delivery');
    expect(saved.workflowStage).toBe('received');
  });

  it('opens a collection as outstanding, but not a delivery', () => {
    expect(createLocalLaundryRecord({ ...base, fulfillment: 'pickup' }).runStatus).toBe('awaiting_pickup');
    // A delivery is not a run until the washing is finished — listing it
    // earlier would send a rider out for a bundle still in the machine.
    expect(createLocalLaundryRecord({ ...base, fulfillment: 'delivery' }).runStatus).toBeUndefined();
  });
});

describe('moving a stop along', () => {
  it('ends a pickup once it is collected', () => {
    expect(nextRunStatus('pickup', undefined)).toBe('picked_up');
    // Otherwise it would sit on the day's list for ever.
    expect(nextRunStatus('pickup', 'picked_up')).toBeNull();
  });

  it('takes a delivery out and then finishes it', () => {
    expect(nextRunStatus('delivery', undefined)).toBe('out_for_delivery');
    expect(nextRunStatus('delivery', 'out_for_delivery')).toBe('delivered');
    expect(nextRunStatus('delivery', 'delivered')).toBeNull();
  });

  it('offers no action once the stop is done', () => {
    expect(runActionLabel('delivery', 'delivered')).toBeNull();
    expect(runActionLabel('pickup', 'picked_up')).toBeNull();
  });

  it('drops finished stops off the day list', () => {
    const runs = splitRuns([
      stop({ clientRef: 'a', kind: 'pickup' }),
      stop({ clientRef: 'b', kind: 'pickup', runStatus: 'picked_up' }),
      stop({ clientRef: 'c', kind: 'delivery' }),
      stop({ clientRef: 'd', kind: 'delivery', runStatus: 'delivered' }),
    ]);
    expect(runs.pickups.map(s => s.clientRef)).toEqual(['a']);
    expect(runs.deliveries.map(s => s.clientRef)).toEqual(['c']);
  });

  it('orders the run by what was promised soonest', () => {
    const ordered = byPromised([
      stop({ clientRef: 'late', promisedFor: '2026-09-08T17:00:00' }),
      stop({ clientRef: 'none' }),
      stop({ clientRef: 'early', promisedFor: '2026-09-08T09:00:00' }),
    ]);
    expect(ordered.map(s => s.clientRef)).toEqual(['early', 'late', 'none']);
  });
});

describe('what it costs and what is said', () => {
  /**
   * The fee has to travel with the bundle's total, through the same payment
   * path as the washing. Kept on the side it would never reach the balance,
   * the takings or the receipt — money earned that the books never saw.
   */
  it('adds the delivery fee to what the customer owes', () => {
    expect(totalWithDelivery(5000, 500)).toBe(5500);
    expect(totalWithDelivery(5000, 0)).toBe(5000);
    expect(totalWithDelivery(5000, -50)).toBe(5000);
  });

  it('tells a customer on the way what they still owe', () => {
    const message = runMessage({ storeName: 'Washlie' } as StoreData, stop({ balance: 1500 }), 'out_for_delivery');
    expect(message).toContain('1,500');
    expect(message).toContain('on the way');
  });

  it('does not mention money when nothing is owed', () => {
    const message = runMessage({ storeName: 'Washlie' } as StoreData, stop({ balance: 0 }), 'out_for_delivery');
    expect(message).not.toContain('Balance');
  });

  /**
   * A plain directions URL, not a maps API: no key, no billing, no quota,
   * however many times a rider taps it.
   */
  it('builds a map link with no API key in it', () => {
    const link = mapsLink('15 Oba Akran Ave', 'opposite the filling station');
    expect(link).toContain('google.com/maps/dir/');
    expect(link).toContain('opposite%20the%20filling%20station');
    expect(link).not.toMatch(/key=|token=|apikey/i);
  });

  it('has no link when there is no address to go to', () => {
    expect(mapsLink('', '')).toBe('');
  });
});
