import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import type { StoreData } from '@/types/store';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { dayKey, describeDay, getDayHistory, measureDay, recordDays } from '@/lib/day-records';
import BusinessAnalytics from '@/components/analytics/BusinessAnalytics';
import { readSource } from './helpers/source';

/**
 * The laundry's day, recorded by date.
 *
 * There was an evening card, "How today went", that appeared once a day and
 * went away when marked done. Asked for from the shop: it should not appear;
 * the day should record itself by its date. The days are read in Analysis.
 */

const DAY = 86400000;
const NOW = new Date('2026-09-14T19:00:00').getTime();
const at = (daysAgo: number, hour = 12) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

/**
 * The Analysis screen reads the real clock, so its fixtures are dated from
 * today rather than from the fixed moment the lib tests use. A test dated to
 * the day it was written is a test that fails on Wednesday.
 */
const realAt = (daysAgo: number, hour = 1) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const bundle = (clientRef: string, createdAt: string, pieceCount: number, total = 1000) => ({
  clientRef, accessCode: 'DAY001', tagCode: clientRef.toUpperCase(), customerName: 'Musa', customerPhone: '',
  garments: [{ garmentType: 'Shirt', quantity: pieceCount }], serviceId: 's1', serviceName: 'Wash',
  pricing: 'per_item', billingQuantity: pieceCount, total, pieceCount, garmentSummary: `${pieceCount} Shirt`,
  workflowStage: 'received', createdAt, syncStatus: 'pending',
});

const sale = (amount: number, date: string, clientRef = 'x') => ({
  id: `s-${clientRef}-${date}`, productId: 's1', productName: 'Wash', quantity: 1, unitPrice: amount, total: amount,
  profit: amount, date, pendingPaymentId: `laundry-${clientRef}`, channel: 'in_store',
});

function laundry(over: Partial<StoreData> = {}): StoreData {
  return {
    storeName: 'Wash', accessCode: 'DAY001', storeType: 'laundry', businessType: 'laundry',
    products: [], expenses: [], customers: [], sales: [], pendingPayments: [],
    createdAt: new Date(0).toISOString(), ...over,
  } as unknown as StoreData;
}

const keep = (...records: Record<string, unknown>[]) =>
  localStorage.setItem(laundryLocalStorageKey('DAY001'), JSON.stringify(records));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('what a day records', () => {
  it("counts that day's bundles and pieces, and leaves other days alone", () => {
    const records = [bundle('a', at(0, 9), 6), bundle('b', at(0, 15), 4), bundle('c', at(1), 99)];
    const day = measureDay(laundry(), records, new Date(at(0, 0)).getTime(), NOW);
    expect(day.bundlesIn).toBe(2);
    // Pieces, not drop-offs: a shirt is one, a bundle of twenty is twenty.
    expect(day.piecesIn).toBe(10);
  });

  it('is money received, not the value of the work that came in', () => {
    const records = [bundle('a', at(0), 5, 5000)];
    const day = measureDay(laundry({ sales: [sale(3000, at(0), 'a')] as any }), records, new Date(at(0, 0)).getTime(), NOW);
    expect(day.received).toBe(3000);
    expect(day.workTakenIn).toBe(5000);
  });

  it("includes a debt from an older bundle settled that day, and not another day's money", () => {
    const store = laundry({ sales: [sale(2000, at(0), 'old'), sale(9999, at(1), 'old')] as any });
    expect(measureDay(store, [], new Date(at(0, 0)).getTime(), NOW).received).toBe(2000);
  });

  it("keeps what is still owed on that day's bundles", () => {
    const store = laundry({ pendingPayments: [{ id: 'laundry-a', balance: 700, total: 1000, paid: 300 }] as any });
    expect(measureDay(store, [bundle('a', at(0), 2)], new Date(at(0, 0)).getTime(), NOW).owedOnDay).toBe(700);
  });
});

describe('recording by date, with nothing to tap', () => {
  it("files today under today's date as soon as the shop has worked", () => {
    keep(bundle('a', at(0, 10), 3));
    const days = recordDays(laundry({ sales: [sale(500, at(0, 10), 'a')] as any }), NOW);
    expect(days.map(day => day.key)).toEqual([dayKey(NOW)]);
    expect(getDayHistory('DAY001')[0]).toMatchObject({ bundlesIn: 1, piecesIn: 3, received: 500, final: false });
  });

  it('keeps today up to date as the day goes on', () => {
    keep(bundle('a', at(0, 10), 3));
    recordDays(laundry({ sales: [sale(500, at(0, 10), 'a')] as any }), NOW);
    keep(bundle('a', at(0, 10), 3), bundle('b', at(0, 17), 2));
    recordDays(laundry({ sales: [sale(500, at(0, 10), 'a'), sale(800, at(0, 17), 'b')] as any }), NOW);
    expect(getDayHistory('DAY001')).toHaveLength(1);
    expect(getDayHistory('DAY001')[0]).toMatchObject({ bundlesIn: 2, piecesIn: 5, received: 1300 });
  });

  it('fills in a day the shop worked but the app never recorded, from the dates', () => {
    keep(bundle('a', at(3), 4));
    const days = recordDays(laundry({ sales: [sale(1200, at(3), 'a')] as any }), NOW);
    const missed = days.find(day => day.key === dayKey(new Date(at(3)).getTime()));
    expect(missed).toMatchObject({ bundlesIn: 1, piecesIn: 4, received: 1200, final: true });
  });

  it('settles yesterday and keeps what was owed as last seen on the day', () => {
    keep(bundle('a', at(0, 10), 2));
    const owing = laundry({ pendingPayments: [{ id: 'laundry-a', balance: 500, total: 1000, paid: 500 }] as any, sales: [sale(500, at(0, 10), 'a')] as any });
    recordDays(owing, NOW);

    // The next morning the balance is paid. That is the next day's news.
    const paidNextMorning = laundry({
      pendingPayments: [{ id: 'laundry-a', balance: 0, total: 1000, paid: 1000 }] as any,
      sales: [sale(500, at(0, 10), 'a'), sale(500, at(-1, 9), 'a')] as any,
    });
    const days = recordDays(paidNextMorning, NOW + DAY);
    const yesterday = days.find(day => day.key === dayKey(NOW));
    expect(yesterday).toMatchObject({ received: 500, owedOnDay: 500, final: true });
  });

  it('never rewrites a settled day', () => {
    keep(bundle('a', at(2), 2));
    recordDays(laundry({ sales: [sale(400, at(2), 'a')] as any }), NOW);
    const before = getDayHistory('DAY001').find(day => day.final);
    // As if the phone had lost how far it had got, so the day is walked again.
    localStorage.removeItem('storeflow_day_history_checked_DAY001');
    recordDays(laundry({ sales: [sale(400, at(2), 'a'), sale(9999, at(2), 'late')] as any }), NOW);
    expect(getDayHistory('DAY001').find(day => day.key === before?.key)).toEqual(before);
  });

  it('keeps nothing for a day nothing happened', () => {
    expect(recordDays(laundry(), NOW)).toEqual([]);
  });

  it('keeps each shop to itself', () => {
    keep(bundle('a', at(0), 1));
    recordDays(laundry(), NOW);
    expect(getDayHistory('OTHER1')).toEqual([]);
  });
});

describe('nothing appears', () => {
  it('has no evening card on either home screen, and the card itself is gone', () => {
    for (const path of ['src/components/simple/BusinessSimpleHome.tsx', 'src/components/dashboards/BusinessOwnerDashboard.tsx']) {
      expect(readSource(path)).not.toContain('<DayClose');
    }
    expect(existsSync('src/components/laundry/DayClose.tsx')).toBe(false);
  });

  it('records the day for the whole app, whichever screen is open', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain("if (store && businessType === 'laundry') recordDays(store);");
  });
});

describe('reading the days back in Analysis', () => {
  it('lists each recorded day by its date', () => {
    keep(bundle('a', realAt(0), 3), bundle('b', realAt(2), 5));
    const store = laundry({ sales: [sale(1500, realAt(0), 'a'), sale(2500, realAt(2), 'b')] as any });
    render(<BusinessAnalytics store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Day by day' }));
    expect(screen.getByText(`${describeDay(dayKey(Date.now()))} · so far`, { exact: false })).toBeTruthy();
    expect(screen.getAllByText(/received/).length).toBeGreaterThan(0);
  });

  it('goes to a chosen date', () => {
    keep(bundle('b', realAt(2), 5));
    const store = laundry({ sales: [sale(2500, realAt(2), 'b')] as any });
    render(<BusinessAnalytics store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Day by day' }));
    fireEvent.change(screen.getByLabelText('Go to a date'), { target: { value: '2001-01-01' } });
    expect(screen.getByText(/Nothing was recorded on/)).toBeTruthy();
  });

  it('is only offered to a laundry', () => {
    render(<BusinessAnalytics store={{ ...laundry(), storeType: 'provision', businessType: 'provision' } as StoreData} />);
    expect(screen.queryByRole('button', { name: 'Day by day' })).toBeNull();
  });
});
