import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  rpcAheadOfTypes: (...args: unknown[]) => rpc(...args),
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

import { generatePlainTextReceipt } from '@/lib/print-engine';
import ClaimTicket from '@/components/laundry/ClaimTicket';
import { setCurrentActor } from '@/lib/current-actor';
import { createLocalLaundryRecord, getLocalLaundryRecord, setLocalLaundryStage, syncPendingLaundryRecords, updateLaundryOrderStage } from '@/lib/laundry-offline';
import { bundleTimeline, readStageSteps } from '@/lib/laundry-records';
import { orderServedBy, orderStatusSteps, withStatusStep } from '@/lib/inventory-orders';
import { receiveStock } from '@/lib/store-data';
import { readSource } from './helpers/source';

/**
 * The owner's rule: whoever took an order, attended to it or recorded an
 * expense is named on the list, on the receipt and in the history. The
 * cloud's half - each laundry step keeps who made it, and a worker's name
 * comes from their pass - was tested against the live database in the
 * migration's dry run.
 */

const CODE = 'WHO001';

beforeEach(() => { rpc.mockReset(); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); });
afterEach(() => { cleanup(); localStorage.clear(); setCurrentActor(null); vi.restoreAllMocks(); });

const receipt = (cashierName?: string) => ({
  storeName: 'Washlie', receiptNumber: 'r1', date: new Date().toISOString(), cashierName,
  items: [{ productName: 'Soap', quantity: 1, unitPrice: 500, total: 500 }],
  subtotal: 500, discount: 0, total: 500, paid: 500, balance: 0, paymentMethod: 'cash',
});

describe('receipts say who served', () => {
  it('prints "Served by" when the name is known, and nothing when it is not', () => {
    expect(generatePlainTextReceipt(receipt('Faith'))).toContain('Served by: Faith');
    expect(generatePlainTextReceipt(receipt())).not.toContain('Served by');
  });

  it('is given the name on every receipt the app prints', () => {
    expect(readSource('src/components/SaleReceipt.tsx')).toContain('cashierName: servedBy || undefined');
    expect(readSource('src/components/Sales.tsx')).toContain('cashierName: result.sales[0]?.recordedByName || undefined');
    expect(readSource('src/components/OrderReceipt.tsx')).toContain('cashierName: servedBy || undefined');
  });

  it('names who took a laundry bundle in on its ticket', () => {
    const store = { storeName: 'Washlie', accessCode: CODE } as unknown as StoreData;
    render(<ClaimTicket store={store} record={{ tagCode: 'T1', customerName: 'Ada', serviceName: 'Full Service', pieceCount: 2, garmentSummary: '', total: 1000, recordedByName: 'Faith' }} onClose={() => {}} />);
    expect(screen.getByText('Taken in by')).toBeTruthy();
    expect(screen.getByText('Faith')).toBeTruthy();
  });
});

describe('the history names who did each thing', () => {
  it('records who received stock', () => {
    setCurrentActor({ id: 's1', name: 'Bisi', role: 'inventory' });
    const store = {
      storeName: 'Shop', accessCode: CODE, products: [{ id: 'p1', name: 'Soap', quantity: 1, costPrice: 100, sellingPrice: 200 }],
      sales: [], expenses: [], restocks: [], cashBalance: 10000, managerSettings: {},
    } as unknown as StoreData;
    const next = receiveStock(store, [{ productId: 'p1', quantity: 2, costPrice: 100 }]);
    expect(next.restocks?.[0]).toMatchObject({ recordedByName: 'Bisi', recordedByRole: 'inventory' });
  });

  it('puts the name on expense and restock rows, as on sales', () => {
    const history = readSource('src/components/SalesHistory.tsx');
    expect(history).toContain('recordedByName: e.recordedBy?.name');
    expect(history).toContain('recordedByName: r.recordedByName');
    expect(history).toContain('recordedByName: batch[0].recordedByName');
  });
});

describe('a laundry bundle keeps who moved it, step by step', () => {
  function bundle() {
    setCurrentActor({ id: 's1', name: 'Faith', role: 'attendant' });
    return createLocalLaundryRecord({
      accessCode: CODE, customerName: 'Ada', customerPhone: '', serviceId: 'p1', serviceName: 'Full Service',
      total: 1500, garments: [{ garmentType: 'Shirt', quantity: 1 }], recordedByName: 'Faith', recordedByRole: 'attendant',
    } as never);
  }

  it('records each move with the person signed in, and not a repeat of the same stage', () => {
    const record = bundle();
    setCurrentActor({ id: 's2', name: 'Bisi', role: 'attendant' });
    setLocalLaundryStage(CODE, record.clientRef, 'washing');
    setLocalLaundryStage(CODE, record.clientRef, 'washing');
    setCurrentActor({ id: 'o', name: 'Owner', role: 'owner' });
    setLocalLaundryStage(CODE, record.clientRef, 'ready');
    const steps = getLocalLaundryRecord(CODE, record.clientRef)!.stageHistory!;
    expect(steps.map(s => `${s.stage}:${s.by}`)).toEqual(['washing:Bisi', 'ready:Owner']);
  });

  it('sends the name with the step from the shop’s phone', async () => {
    rpc.mockResolvedValue({ data: { order_id: 'o1' }, error: null });
    const record = bundle();
    setCurrentActor({ id: 's2', name: 'Bisi', role: 'attendant' });
    setLocalLaundryStage(CODE, record.clientRef, 'washing');
    await syncPendingLaundryRecords(CODE);
    const stage = rpc.mock.calls.find(call => call[0] === 'update_laundry_walkin_stage');
    expect(stage?.[1]).toMatchObject({ p_stage: 'washing', p_by_name: 'Bisi', p_by_role: 'attendant' });
  });

  it('never sends a name from a worker’s phone - the cloud reads it from the pass', async () => {
    localStorage.setItem('storeflow_staff_join', JSON.stringify({ requestId: 'r1', storeRef: 'SF-W', storeName: 'W', staffId: 's1', staffName: 'Faith', status: 'authorized' }));
    localStorage.setItem('storeflow_staff_session', JSON.stringify({ token: 't', expiresAt: new Date(Date.now() + 3600e3).toISOString(), lastOnlineAt: new Date().toISOString(), pinHash: 'x', worker: { id: 's1', name: 'Faith', role: 'attendant' }, storeRef: 'SF-W' }));
    rpc.mockResolvedValue({ data: { order_id: 'o1' }, error: null });
    setCurrentActor({ id: 's1', name: 'Mallory', role: 'attendant' });
    await updateLaundryOrderStage('STAFF-SF-W', { client_ref: 'elsewhere' }, 'ready');
    const stage = rpc.mock.calls.find(call => call[0] === 'staff_laundry_stage');
    expect(stage?.[1]).not.toHaveProperty('p_by_name');
  });

  it('reads the steps back as a timeline from taking it in to handing it over', () => {
    const steps = readStageSteps([
      { stage: 'ready', at: '2026-10-13T14:00:00Z', by: 'Bisi' },
      { stage: 'washing', at: '2026-10-13T10:00:00Z', by: 'Bisi' },
      { stage: 'collected', at: '2026-10-13T17:00:00Z', by: 'Faith' },
      { stage: 'nonsense', at: 'x' },
    ]);
    const timeline = bundleTimeline({ createdAt: Date.parse('2026-10-13T09:00:00Z'), recordedByName: 'Faith', steps });
    expect(timeline.map(step => `${step.label}:${step.by || ''}`)).toEqual(['Taken in:Faith', 'Washing:Bisi', 'Ready:Bisi', 'Handed over:Faith']);
  });

  it('shows the timeline on the bundle card', () => {
    expect(readSource('src/components/laundry/LaundryWorkspace.tsx')).toContain('bundleTimeline(record).map');
  });
});

describe('an online order keeps who moved it along', () => {
  it('adds who did each step, and names who served on the receipt', () => {
    let notes = withStatusStep({ inventoryReservation: [] }, 'Accepted', { name: 'Faith', role: 'cashier' });
    notes = withStatusStep(notes, 'Ready', { name: 'Bisi', role: 'attendant' });
    const order = { notes: JSON.stringify(notes) };
    expect(orderStatusSteps(order).map(s => `${s.status}:${s.by}`)).toEqual(['Accepted:Faith', 'Ready:Bisi']);
    expect(orderServedBy(order)).toBe('Bisi');
    notes = withStatusStep(notes, 'Completed', { name: 'Faith', role: 'cashier' });
    expect(orderServedBy({ notes: JSON.stringify(notes) })).toBe('Faith');
    expect(notes.inventoryReservation).toEqual([]);
  });

  it('is written in the same commit as the change, and shown on the order card', () => {
    expect(readSource('src/pages/Index.tsx')).toContain('notes: withStatusStep(prepared.notes, newStatus, currentUser)');
    expect(readSource('src/components/Orders.tsx')).toContain('orderStatusSteps(order).map');
  });
});
