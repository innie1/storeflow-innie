import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { StoreData } from '@/types/store';
import { reportTotals, reportWindow, workerReport, workerReportMessage } from '@/lib/worker-report';
import WorkerReportSheet from '@/components/staff/WorkerReportSheet';
import { readSource } from './helpers/source';

const at = (d: number, h = 10, m = 0) => new Date(2026, 10, d, h, m).toISOString();
// Wednesday 18 November 2026, 3pm.
const NOW = new Date(2026, 10, 18, 15).getTime();

const bundles = [
  { clientRef: 'b1', tagCode: 'lnd-201', customerName: 'Ada Obi', serviceName: 'Wash & iron', pieceCount: 8, total: 4_000, createdAt: at(16, 9, 12), recordedByName: 'Destiny',
    stageHistory: [{ stage: 'washing', at: at(16, 11), by: 'Destiny' }, { stage: 'ready', at: at(17, 16), by: 'Destiny' }, { stage: 'collected', at: at(18, 10), by: 'Owner' }] },
  { clientRef: 'b2', tagCode: 'lnd-202', customerName: 'Musa', serviceName: 'Iron only', pieceCount: 5, total: 1_500, createdAt: at(17, 14, 5), recordedByName: 'destiny ',
    stageHistory: [{ stage: 'ironing', at: at(17, 15), by: 'Destiny' }] },
  // Somebody else's, and one of hers from last week.
  { clientRef: 'b3', tagCode: 'lnd-203', customerName: 'Bola', serviceName: 'Wash & iron', pieceCount: 3, total: 1_200, createdAt: at(17), recordedByName: 'Grace', stageHistory: [] },
  { clientRef: 'b4', tagCode: 'lnd-150', customerName: 'Kemi', serviceName: 'Wash & iron', pieceCount: 6, total: 3_000, createdAt: at(12), recordedByName: 'Destiny', stageHistory: [] },
] as any[];

const store = {
  storeName: 'Clean Co',
  accessCode: 'RPT001',
  sales: [
    { id: 's1', date: at(16, 9, 12), total: 2_000, productName: 'Wash & iron · LND-201', pendingPaymentId: 'laundry-b1', paymentMethod: 'cash', recordedByName: 'Destiny' },
    { id: 's2', date: at(17, 16, 40), total: 1_500, productName: 'Iron only · LND-202', pendingPaymentId: 'laundry-b2', paymentMethod: 'transfer', recordedByName: 'Destiny' },
    { id: 's3', date: at(18, 9), total: 2_000, productName: 'Wash & iron · LND-201', pendingPaymentId: 'laundry-b1', recordedByName: 'Destiny' },
    { id: 's4', date: at(17), total: 1_200, productName: 'Wash & iron · LND-203', pendingPaymentId: 'laundry-b3', paymentMethod: 'cash', recordedByName: 'Grace' },
  ],
  pendingPayments: [],
  staffExpenseRequests: [
    { id: 'x1', amount: 1_200, category: 'Consumables', note: 'Hypo', date: at(17), paidFrom: 'cash', recordedBy: { staffId: 'd1', name: 'Destiny', role: 'attendant' }, recordedAt: at(17), status: 'approved', expenseId: 'e1' },
    { id: 'x2', amount: 500, category: 'Transport', note: 'Bike to customer', date: at(18), paidFrom: 'cash', recordedBy: { staffId: 'd1', name: 'Destiny', role: 'attendant' }, recordedAt: at(18), status: 'pending' },
  ],
  expenses: [
    // The book entry x1 became: not counted twice.
    { id: 'e1', amount: 1_200, category: 'Consumables', note: 'Hypo', date: at(17), recordedBy: { staffId: 'd1', name: 'Destiny', role: 'attendant' } },
  ],
  pieceWork: [
    { id: 'p1', workerId: 'd1', workerName: 'Destiny', clientRef: 'b1', tagCode: 'LND-201', customerName: 'Ada Obi', task: 'ironing', garmentType: 'Shirt', quantity: 8, rate: 100, amount: 800, at: at(17), approved: true },
    { id: 'p2', workerId: 'd1', workerName: 'Destiny', clientRef: 'b2', tagCode: 'LND-202', customerName: 'Musa', task: 'ironing', garmentType: 'Shirt', quantity: 5, rate: 100, amount: 500, at: at(18), approved: false },
  ],
} as unknown as StoreData;

const destiny = { id: 'd1', name: 'Destiny', role: 'attendant' };

describe('the stretch a report covers', () => {
  it('this week is Monday to now, last week Monday to Sunday, this month the 1st to now', () => {
    const week = reportWindow('this-week', NOW);
    expect(new Date(week.from).getDate()).toBe(16);
    expect(week.label).toBe('Mon 16 Nov – Wed 18 Nov');
    const last = reportWindow('last-week', NOW);
    expect(last.label).toBe('Mon 9 Nov – Sun 15 Nov');
    expect(new Date(reportWindow('this-month', NOW).from).getDate()).toBe(1);
  });

  it('picked dates run from the first morning to the end of the last day, either way round', () => {
    const picked = reportWindow('custom', NOW, { from: '2026-11-17', to: '2026-11-16' });
    expect(picked.label).toBe('Mon 16 Nov – Tue 17 Nov');
    expect(picked.to).toBe(new Date(2026, 10, 18).getTime());
    expect(reportWindow('custom', NOW, { from: '2026-11-17', to: '2026-11-17' }).label).toBe('Tue 17 Nov');
  });
});

describe('what goes in it', () => {
  const report = workerReport(store, bundles, destiny, reportWindow('this-week', NOW));

  it("only this person's work, only in the stretch", () => {
    expect(report.takenIn.map(b => b.tagCode)).toEqual(['LND-201', 'LND-202']);
    expect(report.takenInValue).toBe(5_500);
    expect(report.takenInPieces).toBe(13);
    // The hand-back was the owner's, not hers.
    expect(report.moveCounts).toEqual([
      { stage: 'washing', label: 'Started washing', count: 1 },
      { stage: 'ironing', label: 'Ironing', count: 1 },
      { stage: 'ready', label: 'Made ready', count: 1 },
    ]);
  });

  it('money taken, split into cash, transfer and not recorded', () => {
    expect(report.money).toEqual({ total: 5_500, cash: 2_000, transfer: 1_500, notRecorded: 2_000 });
    expect(report.payments[0]).toMatchObject({ tagCode: 'LND-201', customerName: 'Ada Obi', amount: 2_000, cash: 2_000 });
  });

  it('expenses once each, with what is waiting; piece work approved and waiting', () => {
    expect(report.expenses.map(e => [e.what, e.status])).toEqual([['Hypo', 'approved'], ['Bike to customer', 'waiting']]);
    expect(report.expensesTotal).toBe(1_700);
    expect(report.pieceWork).toEqual({ pieces: 13, approved: 800, waiting: 500, entries: 2 });
  });

  it('the summary and the full breakdown carry the same totals', () => {
    const summary = workerReportMessage(store, report, 'summary');
    const full = workerReportMessage(store, report, 'full');
    for (const total of reportTotals(report)) {
      const line = `*${total.heading}:* ${total.line}`;
      expect(summary).toContain(line);
      expect(full).toContain(line);
    }
    expect(summary).toContain('Cash ₦2,000 · Transfer ₦1,500 · Not recorded ₦2,000');
    expect(full).toContain('Cash ₦2,000 · Transfer ₦1,500 · Not recorded ₦2,000');
    // The summary has no lines; the full breakdown has every one, with its time.
    expect(summary).not.toContain('•');
    expect(full).toContain('• Mon 16 Nov, 9:12am · LND-201 · Ada Obi · 8 pieces · ₦4,000');
    expect(full).toContain('• Tue 17 Nov, 4:40pm · LND-202 · Musa · ₦1,500 · transfer');
    expect(full).toContain('• Wed 18 Nov, 9:00am · LND-201 · Ada Obi · ₦2,000 · not recorded');
    expect(full).toContain('• Wed 18 Nov · Bike to customer · ₦500 · waiting for approval');
    expect(full).not.toContain('Bola');
    expect(summary.startsWith('*Work summary: Destiny*\nClean Co · Mon 16 Nov – Wed 18 Nov')).toBe(true);
    expect(full.startsWith('*Work report: Destiny*')).toBe(true);
  });

  it('says so when there is nothing under the name', () => {
    const none = workerReport(store, bundles, { id: 'z', name: 'Nobody' }, reportWindow('this-week', NOW));
    expect(none.empty).toBe(true);
    expect(workerReportMessage(store, none, 'full')).toContain('Nothing recorded under my name in this time.');
  });
});

describe('on screen', () => {
  it('picks the time and summary or full, and shows the message that will be sent', () => {
    render(<WorkerReportSheet store={store} person={destiny} sendTo={{ label: 'Send to the shop' }} onClose={() => {}} />);
    const sheet = screen.getByRole('dialog');
    fireEvent.click(within(sheet).getByRole('button', { name: 'Pick dates' }));
    expect(sheet.querySelector('[data-report-dates]')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: /Full breakdown/ }));
    expect(sheet.querySelector('[data-report-message]')?.textContent).toContain('*Work report: Destiny*');
    fireEvent.click(within(sheet).getByRole('button', { name: /Summary/ }));
    expect(sheet.querySelector('[data-report-message]')?.textContent).toContain('*Work summary: Destiny*');
    expect(within(sheet).getByRole('button', { name: /Send to the shop/ })).toBeTruthy();
  });

  it('the worker has My report on her home screen, the owner a Report button on each staff row', () => {
    expect(readSource('src/pages/Index.tsx')).toContain('<MyReportButton store={store} currentUser={currentUser} />');
    const staff = readSource('src/components/StaffManagement.tsx');
    expect(staff).toContain('onClick={() => setReportFor(s)}');
    expect(staff).toContain('<WorkerReportSheet');
  });
});
