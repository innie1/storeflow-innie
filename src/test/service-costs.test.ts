import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import {
  DEFAULT_SOAP_PER_PIECE,
  ironsClothes,
  powerSteps,
  serviceCosting,
  serviceCostSentence,
  washesClothes,
} from '@/lib/cost-estimator';
import { pricingAdvice } from '@/lib/pricing-advisor';
import { averageJobByMonth, averageJobChange, busyTimes, nearestBusySlot } from '@/lib/manager-intel';
import { readSource } from '@/test/helpers/source';

/*
 * A shop was told its ironing left ₦45 of every ₦300. The ₦255 "cost" was one
 * figure shared by every service: soap that ironing never touches, and light
 * for a washing machine the shirt never went in. Each cost now goes only to
 * the work that uses it.
 */

const CODE = 'SVCOST';
const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

const bundle = (ref: string, serviceId: string, serviceName: string, pieces: number, total: number, at = daysAgo(2)) => ({
  clientRef: ref, accessCode: CODE, tagCode: ref.toUpperCase(), customerName: 'Ada', customerPhone: '0801',
  serviceId, serviceName, garments: [{ garmentType: 'Shirt', quantity: pieces }], pieceCount: pieces, total,
  createdAt: at, workflowStage: 'collected', syncStatus: 'synced',
});

const shop = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-C', storeName: 'Shine', accessCode: CODE, storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], pendingPayments: [],
  // One light bill in the last 30 days: ₦45,000.
  expenses: [{ id: 'e1', amount: 45_000, category: 'Utilities', note: 'Light bill', date: daysAgo(5) }],
  createdAt: daysAgo(200),
  ...over,
} as unknown as StoreData);

const seed = (bundles: ReturnType<typeof bundle>[]) =>
  localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify(bundles));

beforeEach(() => localStorage.clear());

describe('which work a service is', () => {
  it('reads washing and ironing from what the shop calls it', () => {
    const is = (serviceId: string, serviceName: string) => {
      const service = { serviceId, serviceName };
      return [washesClothes(service), ironsClothes(service), powerSteps(service)];
    };
    expect(is('wash-iron', 'Full Service')).toEqual([true, true, 2]);
    expect(is('iron-only', 'Ironing')).toEqual([false, true, 1]);
    expect(is('wash-only', 'Wash Only')).toEqual([true, false, 1]);
    // Renamed services are read by the name, not the id they started with.
    expect(is('wash-only', 'Wash Only & iron')).toEqual([true, true, 2]);
    expect(is('custom-1', 'Iron only')).toEqual([false, true, 1]);
    // Something the shop named itself gets the full treatment, never the cheap one.
    expect(is('custom-2', 'Duvet')).toEqual([true, true, 2]);
  });
});

describe('what each service costs to do', () => {
  // 100 full-service pieces and 100 ironed: 200 pieces, 300 pieces of powered work.
  const mixed = () => seed([
    bundle('a', 'wash-iron', 'Full Service', 100, 100 * 700),
    bundle('b', 'iron-only', 'Ironing', 100, 100 * 300),
  ]);

  it('charges ironing for light and no soap', () => {
    mixed();
    const store = shop();
    const ironing = serviceCosting(store).services.find(service => service.key === 'iron-only')!;
    // ₦45,000 over 300 pieces of work is ₦150 for each; ironing is one.
    expect(ironing.parts.map(part => part.label)).toEqual(['light']);
    expect(ironing.perPiece).toBe(150);
    expect(serviceCostSentence(store, ironing)).toBe('Light ₦150 for ironing. No detergent: nothing is washed.');
  });

  it('charges a full service for soap and for twice the light', () => {
    mixed();
    const store = shop();
    const full = serviceCosting(store).services.find(service => service.key === 'wash-iron')!;
    expect(full.perPiece).toBe(300 + DEFAULT_SOAP_PER_PIECE);
    expect(serviceCostSentence(store, full)).toBe('Light ₦300 for washing and ironing, detergent ₦30 (starting figure).');
  });

  it('adds back up to the one total the month is worked out from', () => {
    mixed();
    const { estimate, services } = serviceCosting(shop());
    const total = services.reduce((sum, service) => sum + (service.perPiece || 0) * service.pieces, 0);
    expect(Math.round(total)).toBe(Math.round(estimate.spend));
    // And the old single figure is still the average of the two.
    expect(estimate.perPiece).toBe((45_000 + 100 * DEFAULT_SOAP_PER_PIECE) / 200);
  });

  it('puts piece-work pay on the service of the bundle it was done on', () => {
    mixed();
    const store = shop({
      pieceWork: [{
        id: 'pw1', workerId: 'w', workerName: 'Tunde', clientRef: 'b', tagCode: 'B', customerName: 'Ada',
        task: 'ironing', garmentType: 'Shirt', quantity: 100, rate: 20, amount: 2_000, at: daysAgo(1), approved: true,
      }],
    } as any);
    const { services } = serviceCosting(store);
    const ironing = services.find(service => service.key === 'iron-only')!;
    const full = services.find(service => service.key === 'wash-iron')!;
    expect(ironing.parts.find(part => part.label === 'piece-work pay')?.perPiece).toBe(20);
    expect(full.parts.some(part => part.label === 'piece-work pay')).toBe(false);
  });

  it('says nothing about cost while there is too little work to divide by', () => {
    seed([bundle('a', 'iron-only', 'Ironing', 4, 1_200)]);
    const [ironing] = serviceCosting(shop()).services;
    expect(ironing.perPiece).toBeNull();
    expect(ironing.parts).toEqual([]);
  });
});

describe('the price advice uses the service\'s own cost', () => {
  const service = (id: string, name: string, price: number) => ({ id, name, sellingPrice: price, costPrice: 0, quantity: 0, isService: true });

  it('no longer calls ironing thin on the strength of soap it never used', () => {
    seed([
      bundle('a', 'wash-iron', 'Full Service', 100, 100 * 700, daysAgo(0)),
      bundle('b', 'iron-only', 'Ironing', 100, 100 * 300, daysAgo(0)),
    ]);
    const state = pricingAdvice(shop({
      products: [service('wash-iron', 'Full Service', 700), service('iron-only', 'Ironing', 300)] as any,
    }));
    const ironing = state.advice.find(item => item.name === 'Ironing')!;
    // ₦150 of light on a ₦300 price: half of it is the shop's, not ₦45.
    expect(ironing.unitCost).toBe(150);
    expect(ironing.margin).toBe(150);
    expect(ironing.kind).toBe('healthy');
    expect(ironing.costLine).toContain('No detergent');

    const full = state.advice.find(item => item.name === 'Full Service')!;
    expect(full.unitCost).toBe(330);
    expect(full.costLine).toContain('washing and ironing');
  });

  it('will not judge ironing on soap alone', () => {
    // Soap measured, no light bill: nothing is known about what ironing costs.
    seed([
      bundle('old', 'wash-iron', 'Full Service', 100, 70_000, daysAgo(20)),
      bundle('a', 'wash-iron', 'Full Service', 20, 14_000, daysAgo(0)),
      bundle('b', 'iron-only', 'Ironing', 20, 6_000, daysAgo(0)),
    ]);
    const state = pricingAdvice(shop({
      products: [service('iron-only', 'Ironing', 300)] as any,
      expenses: [
        { id: 'c1', amount: 5_000, category: 'Consumables', note: 'Detergent', date: daysAgo(25) },
        { id: 'c2', amount: 5_000, category: 'Consumables', note: 'Detergent', date: daysAgo(10) },
      ] as any,
    }));
    expect(state.advice[0].unitCost).toBeNull();
    expect(state.advice[0].kind).toBe('learning');
  });
});

describe('the average job, month by month', () => {
  const now = new Date(2026, 10, 16, 12).getTime(); // 16 November 2026
  const at = (month: number, day: number) => new Date(2026, month, day, 10).toISOString();

  it('is what the jobs were charged, over how many there were', () => {
    const months = averageJobByMonth([
      { at: at(9, 3), value: 4_000, pieces: 8 },
      { at: at(9, 20), value: 6_000, pieces: 12 },
      { at: at(10, 2), value: 9_000, pieces: 10 },
    ], 6, now);
    expect(months.map(month => month.label)).toEqual(['Oct', 'Nov']);
    expect(months[0]).toMatchObject({ jobs: 2, value: 10_000, average: 5_000, perPiece: 500, current: false });
    expect(months[1]).toMatchObject({ jobs: 1, average: 9_000, perPiece: 900, current: true });
  });

  it('leaves out the months before the shop had any jobs', () => {
    const months = averageJobByMonth([{ at: at(10, 2), value: 9_000 }], 6, now);
    expect(months).toHaveLength(1);
    expect(averageJobByMonth([], 6, now)).toEqual([]);
  });

  it('keeps a quiet month in the middle, with no average rather than a zero', () => {
    const months = averageJobByMonth([{ at: at(8, 5), value: 3_000 }, { at: at(10, 2), value: 9_000 }], 6, now);
    expect(months.map(month => month.average)).toEqual([3_000, null, 9_000]);
    // This month is measured against the last month that had jobs.
    const change = averageJobChange(months)!;
    expect(change.against.label).toBe('Sep');
    expect(change.difference).toBe(6_000);
    expect(change.share).toBe(2);
  });

  it('names the year for a month in another one', () => {
    const january = new Date(2027, 0, 10, 12).getTime();
    const months = averageJobByMonth([{ at: at(10, 2), value: 9_000 }], 6, january);
    expect(months[0].label).toBe('Nov 2026');
  });

  it('has nothing to compare while there is only one month', () => {
    expect(averageJobChange(averageJobByMonth([{ at: at(10, 2), value: 9_000 }], 6, now))).toBeNull();
  });
});

describe('the busy-times chart', () => {
  const noon = new Date(2026, 10, 16, 20).getTime();
  const at = (hour: number, minute = 0) => new Date(2026, 10, 16, hour, minute).toISOString();
  const slots = busyTimes([
    { at: at(8), paid: 14_000, unpaid: 4_500 },
    { at: at(11), paid: 0, unpaid: 4_500 },
  ], 'today', 30, noon).slots;

  it('gives a tap to the nearest bar, not to the empty slot it landed on', () => {
    // 48 slots: 8:00 is slot 16, 11:00 is slot 22.
    expect(nearestBusySlot(slots, 16.5 / 48)?.label).toBe('8:00 AM');
    // Between bars, and two slots off: still the 8 o'clock bar.
    expect(nearestBusySlot(slots, 18.4 / 48)?.label).toBe('8:00 AM');
    expect(nearestBusySlot(slots, 20.9 / 48)?.label).toBe('11:00 AM');
    // Off either end of the chart.
    expect(nearestBusySlot(slots, -0.2)?.label).toBe('8:00 AM');
    expect(nearestBusySlot(slots, 1.4)?.label).toBe('11:00 AM');
  });

  it('has nothing to pick on an empty chart', () => {
    expect(nearestBusySlot(busyTimes([], 'today', 30, noon).slots, 0.5)).toBeNull();
  });

  it('draws a two-colour bar as one shape, and takes taps on the whole chart', () => {
    const source = readSource('src/components/manager/MostActivePeriodsCard.tsx');
    // The seam: two boxes with a pixel of space between them.
    expect(source).not.toContain('mt-px');
    expect(source).toContain('onClick={pickNearest}');
    // What a bar holds is written under the chart, not in a pop-up over it.
    expect(source).not.toContain('createPortal');
  });
});

describe('the hours the chart draws', () => {
  const evening = new Date(2026, 10, 16, 20).getTime();
  const at = (hour: number, minute = 0) => new Date(2026, 10, 16, hour, minute).toISOString();

  it('is the busy part of the day, not midnight to midnight', async () => {
    const { busyWindow, hourLabel, MIN_HOURS_SHOWN } = await import('@/lib/manager-intel');
    const day = busyTimes([{ at: at(8), paid: 1_000, unpaid: 0 }, { at: at(11, 30), paid: 0, unpaid: 500 }], 'today', 30, evening).slots;
    const shown = busyWindow(day, 30);
    // An hour either side of 8:00-12:00 is six hours; widened to the least it draws.
    expect(shown).toHaveLength(MIN_HOURS_SHOWN * 2);
    expect(shown.some(slot => slot.label === '8:00 AM')).toBe(true);
    expect(shown.some(slot => slot.label === '11:30 AM')).toBe(true);
    // Whole hours, so the labels fall on the hour.
    expect(shown[0].minute % 60).toBe(0);
    expect(shown.map(slot => hourLabel(slot, shown.length, 30)).filter(Boolean)).toHaveLength(MIN_HOURS_SHOWN);
  });

  it('never cuts off a bar at either end of the day', async () => {
    const { busyWindow } = await import('@/lib/manager-intel');
    const day = busyTimes([{ at: at(0, 10), paid: 1_000, unpaid: 0 }, { at: at(19, 40), paid: 500, unpaid: 0 }], 'today', 30, evening).slots;
    const shown = busyWindow(day, 30);
    expect(shown[0].label).toBe('12:00 AM');
    expect(shown.filter(slot => slot.paid + slot.unpaid > 0)).toHaveLength(2);
  });
});
