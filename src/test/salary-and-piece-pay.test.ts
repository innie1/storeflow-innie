import { describe, expect, it } from 'vitest';
import type { StaffMember, StoreData } from '@/types/store';
import {
  approvePieceWork, hasMonthlySalary, isPerPieceWorker, openJobsForTask, payWorker, piecesCoveredByPayments, recordPieceWork, remainingForTask, workerEarnings, workRecordFromOrder,
} from '@/lib/piece-work';
import { readSource } from './helpers/source';

/**
 * An attendant on a monthly wage who is also paid for every shirt she irons,
 * and a shop that must never pay twice for the same shirt.
 */

const marta: StaffMember = {
  id: 'm1', name: 'Marta', role: 'attendant', pin: '4821', payType: 'salary_piece', monthlySalary: 40000,
  pieceRates: [{ task: 'ironing', garmentType: '*', rate: 50 }],
  permissions: { sales: true, inventory: false, reports: false, settings: false },
} as StaffMember;

const shop = (): StoreData => ({ accessCode: 'ABC123', storeName: 'Washlie', staffMembers: [marta], pieceWork: [], workerPayments: [], expenses: [] } as unknown as StoreData);
const bundle = (ref: string, shirts: number) => ({ clientRef: ref, tagCode: ref.toUpperCase(), customerName: 'Ada', garments: [{ garmentType: 'Shirt', quantity: shirts }] });
const iron = (store: StoreData, ref: string, shirts: number, quantity: number) =>
  recordPieceWork(store, { worker: marta, record: bundle(ref, shirts), task: 'ironing', items: [{ garmentType: 'Shirt', quantity }] });
const approveAll = (store: StoreData) => approvePieceWork(store, (store.pieceWork || []).map(entry => entry.id));

describe('salary and piece work together', () => {
  it('is both a wage and paid by the piece', () => {
    expect(isPerPieceWorker(marta)).toBe(true);
    expect(hasMonthlySalary(marta)).toBe(true);
    expect(isPerPieceWorker({ payType: 'monthly' })).toBe(false);
    expect(hasMonthlySalary({ payType: 'per_piece' })).toBe(false);
    expect(hasMonthlySalary({ payType: undefined })).toBe(true);
  });

  it('records her ironing at her rate', () => {
    const store = iron(shop(), 'b1', 10, 10);
    expect(store.pieceWork?.[0]).toMatchObject({ workerId: 'm1', quantity: 10, rate: 50, amount: 500, approved: false });
  });
});

describe('never paying twice for the same shirt', () => {
  it('200 approved and 100 paid for reads as 100 still owed', () => {
    let store = iron(shop(), 'b1', 200, 200);
    store = approveAll(store);
    store = payWorker(store, marta, 5000); // 100 shirts at 50
    expect(workerEarnings(store, 'm1')).toMatchObject({ piecesApproved: 200, piecesPaid: 100, piecesOwed: 100, balance: 5000 });
  });

  it('keeps what was paid paid when more is approved later', () => {
    let store = approveAll(iron(shop(), 'b1', 200, 200));
    store = payWorker(store, marta, 5000);
    store = approveAll(iron(store, 'b2', 125, 125));
    // The 100 already paid stay paid; the new 125 are owed on top of the 100 left.
    expect(workerEarnings(store, 'm1')).toMatchObject({ piecesApproved: 325, piecesPaid: 100, piecesOwed: 225 });
  });

  it('cannot claim shirts on a bundle that were already claimed - by her or anybody', () => {
    let store = approveAll(iron(shop(), 'b1', 200, 200));
    store = payWorker(store, marta, 5000);
    // She says she ironed 125 on the same bundle: none of it is left to claim.
    const again = iron(store, 'b1', 200, 125);
    expect(again.pieceWork).toHaveLength(store.pieceWork!.length);
    expect(remainingForTask(store, bundle('b1', 200), 'ironing')).toEqual([]);
    // On a bundle with 25 left, a claim of 125 becomes 25.
    const partly = approveAll(iron(shop(), 'b3', 100, 75));
    const capped = iron(partly, 'b3', 100, 125);
    expect(capped.pieceWork?.[0]).toMatchObject({ quantity: 25 });
  });

  it('counts only whole pieces as paid when a payment covers part of a line', () => {
    expect(piecesCoveredByPayments([{ quantity: 10, amount: 500, at: '2026-10-01T00:00:00Z' }], 260)).toEqual({ piecesApproved: 10, piecesPaid: 5, piecesOwed: 5 });
    expect(piecesCoveredByPayments([], 1000)).toEqual({ piecesApproved: 0, piecesPaid: 0, piecesOwed: 0 });
  });

  it('pays the oldest approved work first', () => {
    const lines = [
      { quantity: 4, amount: 400, at: '2026-10-05T00:00:00Z' },
      { quantity: 10, amount: 500, at: '2026-10-01T00:00:00Z' },
    ];
    expect(piecesCoveredByPayments(lines, 500)).toMatchObject({ piecesPaid: 10, piecesOwed: 4 });
  });
});

describe('who checks the work', () => {
  it('names whoever approved it', () => {
    const store = iron(shop(), 'b1', 10, 10);
    const approved = approvePieceWork(store, [store.pieceWork![0].id], new Date(), 'Ada');
    expect(approved.pieceWork?.[0]).toMatchObject({ approved: true, approvedBy: 'Ada' });
  });

  it('a manager may approve, but not their own claims, and only the owner pays', () => {
    const staff = readSource('src/components/StaffManagement.tsx');
    expect(staff).toContain("canApprove={currentUser?.role === 'owner' || (currentUser?.role === 'manager' && currentUser?.id !== earningsFor.id)}");
    expect(staff).toContain("canPay={currentUser?.role === 'owner'}");
  });
});

describe('the cloud side', () => {
  const sql = readSource('supabase/migrations/20261014100000_piece_work_salary_and_cap.sql');

  it('takes claims from a worker on salary and pieces', () => {
    expect(sql).toContain("in ('per_piece', 'salary_piece')");
  });

  it('caps a claim at what is left on the bundle, by anybody', () => {
    expect(sql).toContain("o.client_ref = item->>'clientRef'");
    expect(sql).toContain('least(v_qty, greatest(0, floor(v_total - v_claimed))::int)');
  });
});

describe('a worker phone left open', () => {
  it('asks for the owner\'s changes when the worker comes back to the app, at most once a minute', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain("document.addEventListener('visibilitychange', onVisible)");
    expect(index).toContain('Date.now() - lastAsked < 60_000');
  });
});

describe('bundles that came from the cloud', () => {
  // Shaped as the cloud keeps them: `garment_type`, not `garmentType`.
  const cloudBundle = (stage: string) => ({
    client_ref: `ref-${stage}`, order_number: 'WSH-1', customer_name: 'Ada', workflow_stage: stage,
    service_metadata: { client_ref: `ref-${stage}`, tag_code: 'WSH-1', garment_lines: [{ garment_type: 'Shirt', quantity: 4, unit_price: 500, subtotal: 2000 }] },
  });

  it('are offered in Record work with their clothes', () => {
    const record = workRecordFromOrder(cloudBundle('ready'));
    expect(record?.garments).toEqual([{ garmentType: 'Shirt', quantity: 4 }]);
    const jobs = openJobsForTask(shop(), 'ironing', [record!]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].items).toEqual([{ garmentType: 'Shirt', total: 4, remaining: 4 }]);
  });

  it('leave out what was collected or turned away', () => {
    const records = ['collected', 'rejected', 'washing'].map(stage => workRecordFromOrder(cloudBundle(stage))!);
    expect(openJobsForTask(shop(), 'ironing', records).map(job => job.record.workflowStage)).toEqual(['washing']);
  });
});
