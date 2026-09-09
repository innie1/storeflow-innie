import { beforeEach, describe, expect, it } from 'vitest';
import type { StaffMember, StoreData } from '@/types/store';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import {
  ANY_GARMENT,
  approvedLabourBetween,
  approvePieceWork,
  openJobsForTask,
  pendingClaims,
  pieceRate,
  recordPieceWork,
  remainingForTask,
  removePieceWork,
  setPieceRate,
  workerEarnings,
} from '@/lib/piece-work';

/**
 * Paying for pieces actually done, on jobs that actually exist.
 *
 * A laundry's ironing is very often done by somebody who comes in when there
 * is work, irons forty shirts and goes home. The rule that shapes all of this
 * is that they cannot invent the forty: they pick a real customer's job and
 * the items on it that still need doing, and only up to how many are there.
 */

const NOW = new Date('2026-09-09T12:00:00').getTime();
const DAY = 86400000;

const worker = {
  id: 'w1',
  name: 'Tunde',
  pin: '0000',
  role: 'attendant',
  payType: 'per_piece',
  pieceRates: [
    { task: 'ironing', garmentType: ANY_GARMENT, rate: 50 },
    { task: 'ironing', garmentType: 'Native Wear', rate: 100 },
  ],
  permissions: { sales: true, inventory: false, reports: false, settings: false },
} as StaffMember;

function shopWithJob(garments: { garmentType: string; quantity: number }[] = [{ garmentType: 'Shirt', quantity: 2 }, { garmentType: 'Trouser', quantity: 1 }]) {
  localStorage.setItem(laundryLocalStorageKey('SHOP1'), JSON.stringify([{
    clientRef: 'r1', accessCode: 'SHOP1', tagCode: 'LT-104', customerName: 'Musa',
    garments, workflowStage: 'washing', createdAt: new Date(NOW).toISOString(),
  }]));
  return { accessCode: 'SHOP1', pieceWork: [], expenses: [], staffMembers: [worker] } as unknown as StoreData;
}

const job = () => ({ clientRef: 'r1', tagCode: 'LT-104', customerName: 'Musa', garments: [
  { garmentType: 'Shirt', quantity: 2 }, { garmentType: 'Trouser', quantity: 1 },
] });

describe('what a worker earns for one piece', () => {
  it('uses the rate set for that exact item', () => {
    expect(pieceRate(worker, 'ironing', 'Native Wear')).toBe(100);
  });

  it('falls back to the catch-all rate', () => {
    // So a shop can say "ironing, anything, fifty" without listing every
    // garment it owns.
    expect(pieceRate(worker, 'ironing', 'Shirt')).toBe(50);
  });

  it('is nothing for a task with no rate at all', () => {
    expect(pieceRate(worker, 'washing', 'Shirt')).toBe(0);
  });

  it('treats a rate of zero as removing it, not as free work', () => {
    const rates = setPieceRate(worker.pieceRates, { task: 'ironing', garmentType: 'Native Wear', rate: 0 });
    expect(rates.some(r => r.garmentType === 'Native Wear')).toBe(false);
  });

  it('replaces a rate rather than stacking a second one', () => {
    const rates = setPieceRate(worker.pieceRates, { task: 'ironing', garmentType: 'Native Wear', rate: 120 });
    expect(rates.filter(r => r.garmentType === 'Native Wear')).toHaveLength(1);
    expect(pieceRate({ pieceRates: rates }, 'ironing', 'Native Wear')).toBe(120);
  });
});

describe('a worker cannot invent work', () => {
  beforeEach(() => localStorage.clear());

  it('is offered only what is on the job', () => {
    const store = shopWithJob();
    const items = remainingForTask(store, job(), 'ironing');
    expect(items.map(i => `${i.garmentType}:${i.remaining}`)).toEqual(['Shirt:2', 'Trouser:1']);
  });

  it('cannot claim more shirts than the customer brought', () => {
    /*
     * The whole point. Forty shirts nobody dropped off cannot be turned into
     * forty times fifty naira.
     */
    const store = shopWithJob();
    const after = recordPieceWork(store, {
      worker, record: job(), task: 'ironing',
      items: [{ garmentType: 'Shirt', quantity: 40 }],
    });
    expect(after.pieceWork).toHaveLength(1);
    expect(after.pieceWork![0].quantity).toBe(2);
    expect(after.pieceWork![0].amount).toBe(100);
  });

  it('cannot claim the same shirt twice', () => {
    let store = shopWithJob();
    store = recordPieceWork(store, { worker, record: job(), task: 'ironing', items: [{ garmentType: 'Shirt', quantity: 2 }] });
    expect(remainingForTask(store, job(), 'ironing').find(i => i.garmentType === 'Shirt')).toBeUndefined();

    store = recordPieceWork(store, { worker, record: job(), task: 'ironing', items: [{ garmentType: 'Shirt', quantity: 1 }] });
    // Nothing left to claim, so nothing was added.
    expect(store.pieceWork).toHaveLength(1);
  });

  it('keeps the tasks apart, since ironing a shirt is not washing it', () => {
    let store = shopWithJob();
    store = recordPieceWork(store, { worker, record: job(), task: 'ironing', items: [{ garmentType: 'Shirt', quantity: 2 }] });
    expect(remainingForTask(store, job(), 'washing').find(i => i.garmentType === 'Shirt')?.remaining).toBe(2);
  });

  it('drops a claim of nothing rather than saving an empty one', () => {
    const store = shopWithJob();
    const after = recordPieceWork(store, { worker, record: job(), task: 'ironing', items: [{ garmentType: 'Shirt', quantity: 0 }] });
    expect(after.pieceWork).toHaveLength(0);
  });

  it('offers no jobs once the bundle has gone home', () => {
    // There is nothing left to iron on clothes that have been collected.
    localStorage.setItem(laundryLocalStorageKey('SHOP1'), JSON.stringify([{
      clientRef: 'r1', accessCode: 'SHOP1', tagCode: 'LT-104', customerName: 'Musa',
      garments: [{ garmentType: 'Shirt', quantity: 2 }], workflowStage: 'collected',
    }]));
    const store = { accessCode: 'SHOP1', pieceWork: [] } as unknown as StoreData;
    expect(openJobsForTask(store, 'ironing')).toHaveLength(0);
  });
});

describe('claimed is not the same as owed', () => {
  beforeEach(() => localStorage.clear());

  it('a fresh claim is waiting, not owed', () => {
    let store = shopWithJob();
    store = recordPieceWork(store, { worker, record: job(), task: 'ironing', items: [{ garmentType: 'Shirt', quantity: 2 }] });

    const earnings = workerEarnings(store, 'w1', NOW);
    expect(earnings.awaitingApproval).toBe(100);
    expect(earnings.balance).toBe(0);
    expect(pendingClaims(store)).toHaveLength(1);
  });

  it('approving it is what makes it owed', () => {
    let store = shopWithJob();
    store = recordPieceWork(store, { worker, record: job(), task: 'ironing', items: [{ garmentType: 'Shirt', quantity: 2 }] });
    store = approvePieceWork(store, [store.pieceWork![0].id]);

    const earnings = workerEarnings(store, 'w1', NOW);
    expect(earnings.awaitingApproval).toBe(0);
    expect(earnings.balance).toBe(100);
    expect(earnings.piecesToday).toBe(2);
  });

  it('a mistaken claim can be taken back, and the pieces return to the job', () => {
    /*
     * Removed rather than marked wrong: a bad claim left on the record would
     * make those shirts permanently un-ironable by anybody.
     */
    let store = shopWithJob();
    store = recordPieceWork(store, { worker, record: job(), task: 'ironing', items: [{ garmentType: 'Shirt', quantity: 2 }] });
    store = removePieceWork(store, store.pieceWork![0].id);
    expect(remainingForTask(store, job(), 'ironing').find(i => i.garmentType === 'Shirt')?.remaining).toBe(2);
  });
});

describe('what the shop owes', () => {
  const withWork = (entries: Record<string, unknown>[]) =>
    ({ pieceWork: entries, workerPayments: [] }) as unknown as StoreData;

  it('adds up today and the week separately', () => {
    const store = withWork([
      { workerId: 'w1', quantity: 2, amount: 100, at: new Date(NOW).toISOString(), approved: true, task: 'ironing' },
      { workerId: 'w1', quantity: 3, amount: 150, at: new Date(NOW - 3 * DAY).toISOString(), approved: true, task: 'ironing' },
      { workerId: 'w1', quantity: 9, amount: 450, at: new Date(NOW - 30 * DAY).toISOString(), approved: true, task: 'ironing' },
    ]);
    const earnings = workerEarnings(store, 'w1', NOW);
    expect(earnings.earnedToday).toBe(100);
    expect(earnings.earnedThisWeek).toBe(250);
    expect(earnings.approvedTotal).toBe(700);
  });

  it('splits today by what the day was spent doing', () => {
    const store = withWork([
      { workerId: 'w1', quantity: 2, amount: 100, at: new Date(NOW).toISOString(), approved: true, task: 'ironing' },
      { workerId: 'w1', quantity: 4, amount: 80, at: new Date(NOW).toISOString(), approved: true, task: 'washing' },
    ]);
    const earnings = workerEarnings(store, 'w1', NOW);
    expect(earnings.todayByTask.map(t => t.task)).toEqual(['ironing', 'washing']);
    expect(earnings.todayByTask[0].pieces).toBe(2);
  });

  it('takes payments off the balance', () => {
    const store = {
      pieceWork: [{ workerId: 'w1', quantity: 2, amount: 500, at: new Date(NOW).toISOString(), approved: true, task: 'ironing' }],
      workerPayments: [{ workerId: 'w1', amount: 200, at: new Date(NOW).toISOString() }],
    } as unknown as StoreData;
    const earnings = workerEarnings(store, 'w1', NOW);
    expect(earnings.paid).toBe(200);
    expect(earnings.balance).toBe(300);
  });

  it('never says the worker owes the shop', () => {
    // An overpayment is something to settle at the counter, not a negative
    // number on somebody's earnings screen.
    const store = {
      pieceWork: [{ workerId: 'w1', quantity: 1, amount: 100, at: new Date(NOW).toISOString(), approved: true, task: 'ironing' }],
      workerPayments: [{ workerId: 'w1', amount: 500, at: new Date(NOW).toISOString() }],
    } as unknown as StoreData;
    expect(workerEarnings(store, 'w1', NOW).balance).toBe(0);
  });

  it('keeps one worker out of another worker sums', () => {
    const store = withWork([
      { workerId: 'w1', quantity: 1, amount: 100, at: new Date(NOW).toISOString(), approved: true, task: 'ironing' },
      { workerId: 'w2', quantity: 9, amount: 900, at: new Date(NOW).toISOString(), approved: true, task: 'ironing' },
    ]);
    expect(workerEarnings(store, 'w1', NOW).approvedTotal).toBe(100);
  });
});

describe('what the work costs the shop', () => {
  it('counts approved labour, because that is when it became owed', () => {
    /*
     * Reading payments instead would tell a shop that ironing costs nothing
     * all month and everything on payday, and it would price the work wrong
     * on both days.
     */
    const store = {
      pieceWork: [
        { amount: 300, at: new Date(NOW).toISOString(), approved: true },
        { amount: 999, at: new Date(NOW).toISOString(), approved: false },
      ],
    } as unknown as StoreData;
    expect(approvedLabourBetween(store, NOW - DAY, NOW + DAY)).toBe(300);
  });

  it('leaves out work from outside the window', () => {
    const store = {
      pieceWork: [{ amount: 300, at: new Date(NOW - 60 * DAY).toISOString(), approved: true }],
    } as unknown as StoreData;
    expect(approvedLabourBetween(store, NOW - DAY, NOW + DAY)).toBe(0);
  });
});

describe('the labour reaches the figures that price the work', () => {
  /*
   * Relative to the real clock, not the fixed NOW the rest of this file uses.
   * estimateUnitCost reads Date.now() itself, so a fixture dated at noon is in
   * the future on any morning and falls outside its own window.
   */
  const NOW_ISO = new Date(Date.now() - 3600_000).toISOString();

  const shop = (over: Record<string, unknown>) => {
    localStorage.setItem(laundryLocalStorageKey('SHOP1'), JSON.stringify([{
      clientRef: 'r1', accessCode: 'SHOP1', tagCode: 'LT-1', customerName: 'Musa',
      garments: [{ garmentType: 'Shirt', quantity: 20 }], pieceCount: 20,
      createdAt: NOW_ISO, workflowStage: 'washing',
    }]));
    return {
      accessCode: 'SHOP1', storeType: 'laundry', businessType: 'laundry',
      expenses: [], pieceWork: [], staffMembers: [], products: [], sales: [],
      ...over,
    } as unknown as StoreData;
  };

  it('counts approved work in what a piece costs', async () => {
    /*
     * The point of the whole feature. If the ironing does not reach the cost
     * per piece, the pricing advisor is recommending prices against a cost
     * that leaves out the largest thing the shop pays for by the piece.
     */
    const { estimateUnitCost } = await import('@/lib/cost-estimator');
    const withLabour = shop({
      pieceWork: [{ amount: 400, at: NOW_ISO, approved: true, quantity: 8 }],
    });
    const estimate = estimateUnitCost(withLabour);
    expect(estimate.spend).toBe(400);
    expect(estimate.breakdown.some(line => line.category === 'Piece work')).toBe(true);
  });

  it('leaves unapproved claims out of the cost', async () => {
    const { estimateUnitCost } = await import('@/lib/cost-estimator');
    const claimed = shop({ pieceWork: [{ amount: 400, at: NOW_ISO, approved: false, quantity: 8 }] });
    expect(estimateUnitCost(claimed).spend).toBe(0);
  });

  it('does not charge the shop twice when the worker is paid', async () => {
    /*
     * The payment is a real expense, because the cash really left. But the
     * cost was recognised when the work was approved, and counting both would
     * make every shirt look like it cost double to iron.
     */
    const { estimateUnitCost } = await import('@/lib/cost-estimator');
    const both = shop({
      pieceWork: [{ amount: 400, at: NOW_ISO, approved: true, quantity: 8 }],
      expenses: [{ amount: 400, category: 'Piece work', date: NOW_ISO }],
    });
    expect(estimateUnitCost(both).spend).toBe(400);
  });

  it('is a variable cost, so it never lands beside the rent', async () => {
    /*
     * A salary is owed whether or not a shirt is ironed; piece work is not.
     * Treating it as fixed would make the break-even target lurch on payday
     * and sit too low every other day of the month.
     */
    const { isVariableCost } = await import('@/lib/cost-estimator');
    const laundry = shop({});
    expect(isVariableCost(laundry, { category: 'Piece work' })).toBe(true);
    expect(isVariableCost(laundry, { category: 'Salaries' })).toBe(false);
  });

  it("so the month's fixed costs ignore it", async () => {
    const { monthlyFixedCosts } = await import('@/lib/service-breakeven');
    const paid = shop({ expenses: [{ amount: 400, category: 'Piece work', date: NOW_ISO }] });
    const window = {
      start: Date.now() - 30 * DAY, end: Date.now() + DAY,
      daysInMonth: 30, dayOfMonth: 9,
    };
    expect(monthlyFixedCosts(paid, window)).toBe(0);
  });
});
