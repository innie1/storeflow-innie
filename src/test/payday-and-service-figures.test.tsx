import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { StoreData } from '@/types/store';
import {
  answerPayday,
  payDayInWords,
  payDayOf,
  paydayIn,
  paydaysDue,
  recordSalaryPaid,
} from '@/lib/payday';
import { busiestDays, customerWeeks, serviceSpeed, topCustomers } from '@/lib/manager-intel';
import PaydayPrompt from '@/components/staff/PaydayPrompt';
import { readSource } from './helpers/source';

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();

function shop(extra: Partial<StoreData> = {}): StoreData {
  return {
    accessCode: 'PAYDAY',
    storeName: 'Clean Co',
    cashBalance: 100_000,
    bankBalance: 100_000,
    expenses: [],
    sales: [],
    staffMembers: [
      { id: 'ada', name: 'Ada Obi', pin: '1111', role: 'attendant', monthlySalary: 40_000, payDay: 25, permissions: { sales: true, inventory: false, reports: false, settings: false } },
    ],
    ...extra,
  } as unknown as StoreData;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('payday comes from the staff settings', () => {
  it('reads the day, with the last day of the month when none is set', () => {
    expect(payDayOf({ payDay: 25 })).toBe(25);
    expect(payDayOf({})).toBe(31);
    // The 31st in February is its last day.
    expect(new Date(paydayIn({}, 2026, 1)).getDate()).toBe(28);
    expect(payDayInWords({ payDay: 1 })).toBe('the 1st of every month');
    expect(payDayInWords({})).toBe('the last day of every month');
  });

  it('asks on the day and not before', () => {
    expect(paydaysDue(shop(), at(2026, 11, 24))).toHaveLength(0);
    const due = paydaysDue(shop(), at(2026, 11, 25));
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ name: 'Ada Obi', amount: 40_000, month: '2026-11', monthName: 'November', daysSince: 0 });
  });

  it('a tap on Paid records the salary against the person and month, and stops asking', () => {
    const store = shop();
    const [due] = paydaysDue(store, at(2026, 11, 26));
    const paid = recordSalaryPaid(store, due, { paidFrom: 'bank', now: at(2026, 11, 26) });
    const expense = paid.expenses.find(item => item.category === 'Salaries')!;
    expect(expense).toMatchObject({ amount: 40_000, paidTo: 'ada', payMonth: '2026-11', paidFrom: 'bank' });
    expect(expense.note).toBe('Salary for Ada Obi, November');
    expect(paid.bankBalance).toBe(60_000);
    expect(paydaysDue(paid, at(2026, 11, 27))).toHaveLength(0);
  });

  it('a different amount is recorded as typed', () => {
    const store = shop();
    const [due] = paydaysDue(store, at(2026, 11, 25));
    const paid = recordSalaryPaid(store, due, { amount: 35_000, now: at(2026, 11, 25) });
    expect(paid.expenses.find(item => item.category === 'Salaries')?.amount).toBe(35_000);
    expect(paid.cashBalance).toBe(65_000);
  });

  it('a salary already written down by hand counts, so nothing is recorded twice', () => {
    const store = shop({ expenses: [{ id: 'e1', amount: 40_000, category: 'Salaries', date: new Date(at(2026, 11, 24)).toISOString(), note: "Ada's salary" }] as any });
    expect(paydaysDue(store, at(2026, 11, 25))).toHaveLength(0);
  });

  it('Not yet asks again tomorrow; not being paid stops asking for that month', () => {
    const store = shop();
    const [due] = paydaysDue(store, at(2026, 11, 25));
    answerPayday('PAYDAY', due.key, 'later', at(2026, 11, 25));
    expect(paydaysDue(store, at(2026, 11, 25, 18))).toHaveLength(0);
    expect(paydaysDue(store, at(2026, 11, 26, 9))).toHaveLength(1);
    answerPayday('PAYDAY', due.key, 'skip', at(2026, 11, 26));
    expect(paydaysDue(store, at(2026, 11, 28))).toHaveLength(0);
  });

  it("last month's payday is still asked about a few days into the new month, then let go", () => {
    const store = shop({ staffMembers: [{ ...shop().staffMembers![0], payDay: undefined }] as any });
    expect(paydaysDue(store, at(2026, 12, 2))[0]).toMatchObject({ month: '2026-11', daysSince: 2 });
    expect(paydaysDue(store, at(2026, 12, 20))).toHaveLength(0);
  });

  it('never asks about a payday from before the person joined, nor about the owner or piece workers', () => {
    const joined = shop({ staffMembers: [{ ...shop().staffMembers![0], addedAt: new Date(at(2026, 11, 28)).toISOString() }] as any });
    expect(paydaysDue(joined, at(2026, 11, 29))).toHaveLength(0);
    const others = shop({
      staffMembers: [
        { id: 'o', name: 'Owner', pin: '1', role: 'owner', monthlySalary: 90_000, permissions: {} },
        { id: 'p', name: 'Tunde', pin: '2', role: 'attendant', payType: 'per_piece', monthlySalary: 30_000, permissions: {} },
      ] as any,
    });
    expect(paydaysDue(others, at(2026, 11, 30))).toHaveLength(0);
  });
});

describe('the payday question on screen', () => {
  it('Paid in cash records it with one tap', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(at(2026, 11, 25));
    const onUpdate = vi.fn();
    render(<PaydayPrompt store={shop()} onUpdate={onUpdate} />);
    expect(screen.getByText('Did you pay Ada Obi for November?')).toBeTruthy();
    expect(screen.getByText('₦40,000')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Paid in cash/ }));
    const saved = onUpdate.mock.calls[0][0] as StoreData;
    expect(saved.expenses.find(item => item.category === 'Salaries')).toMatchObject({ amount: 40_000, paidFrom: 'cash', paidTo: 'ada' });
  });

  it('is shown to the owner only, and the payday is set in the staff form', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toMatch(/currentUser\?\.role === 'owner' && !store\.staffDevice[^\n]*\n\s*<PaydayPrompt/);
    const staff = readSource('src/components/StaffManagement.tsx');
    expect(staff).toContain('data-payday-field');
    expect(staff).toContain('addedAt: new Date().toISOString()');
  });
});

// ─── The new figures ──────────────────────────────────────────────────────────

const iso = (ms: number) => new Date(ms).toISOString();
const HOUR = 3600000;

describe('ready on time and how long the work takes', () => {
  const now = at(2026, 11, 17, 12);
  const bundle = (ref: string, createdAt: number, readyAt: number | null, promised: number | null, extra: object = {}) => ({
    clientRef: ref,
    createdAt: iso(createdAt),
    promisedFor: promised ? iso(promised) : undefined,
    workflowStage: readyAt ? 'ready' : 'washing',
    stageHistory: readyAt ? [{ stage: 'ready', at: iso(readyAt) }] : [],
    customerName: ref,
    ...extra,
  });

  it('counts the promised ones that were ready in time, with the middle times', () => {
    const start = now - 5 * 24 * HOUR;
    const speed = serviceSpeed([
      bundle('a', start, start + 20 * HOUR, start + 24 * HOUR),
      bundle('b', start, start + 30 * HOUR, start + 24 * HOUR),
      bundle('c', start, start + 10 * HOUR, start + 24 * HOUR),
      bundle('d', start, start + 40 * HOUR, null),
    ], 30, now);
    expect(speed.now).toMatchObject({ finished: 4, promised: 3, onTime: 2, late: 1, onTimeShare: 67 });
    expect(speed.now.lateBy).toBe(6);
    expect(speed.now.hoursToReady).toBe(25);
  });

  it('names the bundles past their time and still not ready', () => {
    const speed = serviceSpeed([bundle('late', now - 50 * HOUR, null, now - 2 * HOUR)], 30, now);
    expect(speed.lateNow).toHaveLength(1);
    expect(Math.round(speed.lateNow[0].hoursLate)).toBe(2);
  });
});

describe('new and returning customers', () => {
  // Tuesday 17 November 2026, midday.
  const now = at(2026, 11, 17, 12);
  const b = (ref: string, who: string, when: number) => ({ clientRef: ref, createdAt: iso(when), customerPhone: who });

  it('a first-ever bundle is new; anyone seen before is returning', () => {
    const data = customerWeeks([
      b('1', '0801', at(2026, 11, 3)),
      b('2', '0801', at(2026, 11, 16)),
      b('3', '0802', at(2026, 11, 16)),
    ], 8, now);
    const thisWeek = data.weeks[data.weeks.length - 1];
    expect(thisWeek).toMatchObject({ label: 'This week', newCustomers: 1, returning: 1, current: true });
    expect(data.cameBackShare).toBe(50);
  });

  it('this week so far is set against the same days of last week, cut at the same time', () => {
    const data = customerWeeks([
      b('1', '0801', at(2026, 11, 9)),
      b('2', '0802', at(2026, 11, 10, 9)),
      // Later on last Tuesday than it is now: not part of the same days.
      b('3', '0803', at(2026, 11, 10, 18)),
      b('4', '0804', at(2026, 11, 13)),
      b('5', '0805', at(2026, 11, 16)),
    ], 8, now);
    expect(data.soFar).toEqual({ newCustomers: 1, returning: 0 });
    expect(data.sameDaysLastWeek).toEqual({ newCustomers: 2, returning: 0 });
  });
});

describe('the busiest day of the week', () => {
  it('compares an average day, not a total, and leaves today out', () => {
    const now = at(2026, 11, 17, 12);
    const bundles: { clientRef: string; createdAt: string; total: number }[] = [];
    // Two weeks of a Saturday with four bundles and every other day with one.
    for (let back = 1; back <= 14; back += 1) {
      const day = new Date(now);
      day.setDate(day.getDate() - back);
      const saturday = day.getDay() === 6;
      for (let i = 0; i < (saturday ? 4 : 1); i += 1) bundles.push({ clientRef: `${back}-${i}`, createdAt: iso(day.getTime()), total: 2_000 });
    }
    bundles.push({ clientRef: 'today', createdAt: iso(now), total: 50_000 });
    const data = busiestDays(bundles, 8, now);
    expect(data.rows[data.busiest!].name).toBe('Saturday');
    expect(data.rows[5].averageBundles).toBe(4);
    expect(data.rows[5].averageValue).toBe(8_000);
    // Today's ₦50,000 is not in Tuesday yet.
    expect(data.rows[1].averageValue).toBe(2_000);
  });

  it('says nothing with too little to go on', () => {
    expect(busiestDays([{ clientRef: '1', createdAt: iso(Date.now() - 86400000) }]).busiest).toBeNull();
  });
});

describe('top customers', () => {
  it('ranks by the work brought, with what is still to be paid and their share', () => {
    const now = Date.now();
    const b = (ref: string, phone: string, name: string, total: number) => ({ clientRef: ref, createdAt: iso(now - 86400000), customerPhone: phone, customerName: name, total });
    const data = topCustomers(
      { pendingPayments: [{ id: 'laundry-2', paid: 1_000 }] as any },
      [b('1', '0801', 'Ada', 6_000), b('2', '0801', 'Ada', 4_000), b('3', '0802', 'Musa', 5_000), b('4', '0803', 'Bola', 5_000)],
      90, 2, now,
    );
    expect(data.list.map(row => row.name)).toEqual(['Ada', 'Musa']);
    expect(data.list[0]).toMatchObject({ visits: 2, value: 10_000, paid: 1_000, owed: 9_000, share: 50 });
    expect(data.topShare).toBe(75);
    expect(data.everyone).toBe(3);
  });
});
