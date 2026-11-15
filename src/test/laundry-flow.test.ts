import { describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { laundryFlow, type FlowBundle } from '@/lib/laundry-flow';
import { readSource } from './helpers/source';

/**
 * A laundry's clothes arrive days before its money. These figures are the
 * shop's real week: six bundles worth ₦21,700 in, ₦4,000 paid, on one of them.
 */

const NOW = new Date(2026, 10, 1, 12, 0, 0).getTime();
const at = (month: number, day: number, hour = 10) => new Date(2026, month, day, hour, 0, 0).toISOString();

const bundle = (ref: string, createdAt: string, total: number, extra: Partial<FlowBundle> = {}): FlowBundle => ({
  clientRef: ref, createdAt, total, pieceCount: 5, workflowStage: 'ready', customerName: `Customer ${ref}`, ...extra,
});

const bundles = [
  bundle('a', at(9, 26), 4000, { workflowStage: 'collected' }),
  bundle('b', at(9, 27), 4500),
  bundle('c', at(9, 27), 5000),
  bundle('d', at(9, 28), 4000),
  bundle('e', at(9, 29), 1200),
  bundle('f', at(9, 29), 3000),
];
const shop = {
  sales: [{ date: at(9, 31), total: 4000 }],
  pendingPayments: [
    { id: 'laundry-a', paid: 4000 }, { id: 'laundry-b', paid: 0 }, { id: 'laundry-c', paid: 0 },
    { id: 'laundry-d', paid: 0 }, { id: 'laundry-e', paid: 0 }, { id: 'laundry-f', paid: 0 },
  ],
} as unknown as StoreData;

describe('the shop as it really is', () => {
  const flow = laundryFlow(shop, bundles, '30d', NOW);

  it('counts the clothes, not only the money', () => {
    expect(flow).toMatchObject({ bundles: 6, pieces: 30, broughtIn: 21700, moneyIn: 4000, paidOnThese: 4000, owedOnThese: 17700, paidShare: 18 });
  });

  it('says how many bundles and how many people have paid', () => {
    expect(flow).toMatchObject({ paidInFull: 1, partPaid: 0, nothingPaid: 5, customersBrought: 6, customersPaid: 1, customersPaidShare: 17, collected: 1, collectedShare: 17 });
  });

  it('puts clothes and money on the day each happened, with the empty days between', () => {
    // From the first record, not 30 days of nothing before the shop began.
    expect(flow.points).toHaveLength(7);
    expect(flow.points[0].key).toBe('2026-10-26');
    const byLabel = (month: number, day: number) => flow.points.find(point => point.key === `2026-${String(month + 1).padStart(2, '0')}-${day}`)!;
    expect(byLabel(9, 27)).toMatchObject({ broughtIn: 9500, moneyIn: 0, bundles: 2 });
    expect(byLabel(9, 30)).toMatchObject({ broughtIn: 0, moneyIn: 0 });
    expect(byLabel(9, 31)).toMatchObject({ broughtIn: 0, moneyIn: 4000 });
  });

  it('tells it in words', () => {
    expect(flow.story[0]).toBe('In the last 30 days, 6 bundles (30 pieces) worth ₦21,700 came in.');
    expect(flow.story[1]).toBe('₦4,000 of that has been paid (18%), and ₦17,700 is not paid yet.');
    expect(flow.story[2]).toBe('1 of the 6 customers who brought clothes has paid something.');
  });
});

describe('the two questions stay apart', () => {
  it('money for last month’s work is money received, but not paid on this stretch’s clothes', () => {
    const old = bundle('old', at(5, 1), 9000);
    const paidNow = {
      sales: [{ date: at(9, 30), total: 9000 }],
      pendingPayments: [{ id: 'laundry-old', paid: 9000 }],
    } as unknown as StoreData;
    const flow = laundryFlow(paidNow, [old, bundle('new', at(9, 30), 1000)], '7d', NOW);
    expect(flow).toMatchObject({ moneyIn: 9000, broughtIn: 1000, paidOnThese: 0, bundles: 1 });
  });

  it('a late payment counts for the bundle it paid for, whenever it came', () => {
    const paid = { sales: [{ date: at(9, 31), total: 1000 }], pendingPayments: [{ id: 'laundry-x', paid: 1000 }] } as unknown as StoreData;
    expect(laundryFlow(paid, [bundle('x', at(9, 28), 2500)], '7d', NOW)).toMatchObject({ partPaid: 1, paidShare: 40, owedOnThese: 1500 });
  });
});

describe('what it will not assume', () => {
  it('reads a bundle with no record of money as not paid', () => {
    expect(laundryFlow({ sales: [], pendingPayments: [] } as unknown as StoreData, [bundle('x', at(9, 30), 500)], '7d', NOW)).toMatchObject({ nothingPaid: 1, paidShare: 0 });
  });

  it('counts a person once, however many bundles they brought', () => {
    const twice = [bundle('x', at(9, 29), 500, { customerPhone: '0802' }), bundle('y', at(9, 30), 500, { customerPhone: '0802' })];
    expect(laundryFlow({ sales: [] } as unknown as StoreData, twice, '7d', NOW).customersBrought).toBe(1);
  });

  it('never pays over the price', () => {
    const over = { pendingPayments: [{ id: 'laundry-x', paid: 900 }] } as unknown as StoreData;
    expect(laundryFlow(over, [bundle('x', at(9, 30), 500)], '7d', NOW)).toMatchObject({ paidOnThese: 500, owedOnThese: 0, paidShare: 100 });
  });

  it('does not call a weekday busiest on too little', () => {
    expect(laundryFlow(shop, bundles.slice(0, 2), '30d', NOW).busiestWeekday).toBeNull();
  });

  it('names a weekday when it really stands out', () => {
    const mondays = [at(9, 5), at(9, 12), at(9, 19), at(9, 26)].map((when, i) => bundle(`m${i}`, when, 100));
    expect(laundryFlow({ sales: [] } as unknown as StoreData, mondays, '30d', NOW).busiestWeekday).toEqual({ name: 'Monday', bundles: 4 });
  });

  it('copes with a quiet shop and with bad dates', () => {
    const flow = laundryFlow({ sales: [{ date: 'nonsense', total: 5 }] } as unknown as StoreData, [bundle('x', 'nonsense', 5)], '7d', NOW);
    expect(flow).toMatchObject({ bundles: 0, moneyIn: 0, paidShare: 0 });
    expect(flow.points).toHaveLength(1);
    expect(flow.story[0]).toContain('no clothes came in');
  });
});

describe('ranges', () => {
  it('goes back to the first record for All, by week once it is long', () => {
    const flow = laundryFlow(shop, [bundle('x', at(0, 5), 700)], 'all', NOW);
    expect(flow.unit).toBe('week');
    expect(flow.bundles).toBe(1);
    expect(flow.points.reduce((sum, point) => sum + point.broughtIn, 0)).toBe(700);
    expect(flow.points.reduce((sum, point) => sum + point.moneyIn, 0)).toBe(4000);
  });
});

describe('where it shows', () => {
  it('is on the Analysis page only, and the busy-times bars in Flow are the clothes, paid and not', () => {
    const manager = readSource('src/components/Manager.tsx');
    expect(manager).not.toContain('LaundryFlowCard');
    // One chart, two colours, instead of a Clothes in / Money in switch.
    expect(manager).not.toContain("'Clothes in'");
    expect(manager).toContain('debts.get(`laundry-${bundle.clientRef}`)?.paid');
    expect(readSource('src/components/analytics/BusinessAnalytics.tsx')).toContain('{isLaundry && <LaundryFlowCard store={store} range={range} />}');
    expect(readSource('src/lib/manager-intel.ts')).toContain("id: 'laundry-clothes-not-paid'");
  });
});
