import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '@/types/store';

vi.mock('qrcode', () => ({ default: { toDataURL: () => Promise.resolve('') } }));

import ClaimTicket from '@/components/laundry/ClaimTicket';
import { laundryPaymentLines, recordLaundryPayment } from '@/lib/laundry-money';
import { buildLaundryWhatsAppPayload } from '@/lib/laundry-whatsapp';
import { bundleTimeline } from '@/lib/laundry-records';
import { addArrivedPayments } from '@/lib/staff-records';
import { readSource } from './helpers/source';

/**
 * Destiny takes the clothes in. On the next shift Amaka hands them back and
 * takes the money. The receipt has to say both, and that they are different
 * people - or that nobody has taken any money yet. The cloud's half is
 * supabase/migrations/20261101110000_bundle_payment_names.sql.
 */

const REF = 'c9c9e890-c2e7-41ff-92d7-1da0e0ab0516';
const shop = { storeName: 'Washlie', accessCode: 'ABC123', profile: {}, pendingPayments: [], sales: [] } as unknown as StoreData;
const bundle = { clientRef: REF, tagCode: 'C6JYNQ', customerName: 'Ada', serviceId: 's1', serviceName: 'Full Service', total: 4000 };
const AT = '2026-10-31T18:58:00.000Z';

afterEach(cleanup);

describe('who received the money', () => {
  it('is kept on the payment and on the sale, apart from who took the clothes in', () => {
    const next = recordLaundryPayment(shop, { ...bundle, amountPaid: 4000, at: AT, laterPayment: true, takenBy: 'Amaka', takenByRole: 'attendant' });
    expect(laundryPaymentLines(next, REF)).toEqual([{ amount: 4000, at: AT, by: 'Amaka' }]);
    expect(next.sales?.[0]).toMatchObject({ recordedByName: 'Amaka', recordedByRole: 'attendant' });
  });

  it('comes across from a worker’s phone to the owner’s', () => {
    const { store } = addArrivedPayments(shop, [{ id: 'p1', kind: 'payment', clientRef: REF, amount: 4000, at: AT, total: 4000, tagCode: 'C6JYNQ', customerName: 'Ada', serviceName: 'Full Service', serviceId: 's1', staffName: 'Amaka', staffRole: 'attendant' } as any]);
    expect(laundryPaymentLines(store, REF)).toEqual([{ amount: 4000, at: AT, by: 'Amaka' }]);
    expect(store.sales?.[0]).toMatchObject({ recordedByName: 'Amaka' });
  });

  it('is told to a phone that did not take it, once, even when both copies hold it', () => {
    const order = { paid_by: [
      { amount: 1000, at: '2026-10-29T10:00:00+00:00', by: 'Owner' },
      { amount: 3000, at: '2026-10-31T18:58:00+00:00', by: 'Amaka' },
      { amount: 3000, at: AT },
    ] };
    expect(laundryPaymentLines(shop, REF, order)).toEqual([
      { amount: 1000, at: '2026-10-29T10:00:00.000Z', by: 'Owner' },
      { amount: 3000, at: AT, by: 'Amaka' },
    ]);
  });

  it('is read from the note on a payment saved before names had a place of their own', () => {
    const saved = { ...shop, pendingPayments: [{ id: `laundry-${REF}`, events: [{ date: AT, amount: 500, note: 'C6JYNQ payment (taken by Marta)' }] }] } as unknown as StoreData;
    expect(laundryPaymentLines(saved, REF)).toEqual([{ amount: 500, at: AT, by: 'Marta' }]);
  });

  it('is left blank when it was never kept, not guessed', () => {
    const saved = { ...shop, pendingPayments: [{ id: `laundry-${REF}`, events: [{ date: AT, amount: 500, note: 'C6JYNQ payment' }] }] } as unknown as StoreData;
    expect(laundryPaymentLines(saved, REF)).toEqual([{ amount: 500, at: AT }]);
  });

  it('is what the counter and intake both record', () => {
    expect(readSource('src/components/laundry/LaundryWorkspace.tsx')).toMatch(/laterPayment: true,\s+takenBy: currentUser\?\.name,/);
    expect(readSource('src/components/laundry/LaundryWalkInIntakeV3.tsx')).toMatch(/promisedFor,\s+takenBy: currentUser\?\.name,/);
  });
});

describe('the receipt', () => {
  const ticket = { tagCode: 'C6JYNQ', customerName: 'Ada', serviceName: 'Full Service', pieceCount: 3, garmentSummary: '', total: 4000, recordedByName: 'Destiny' };

  it('names both people', () => {
    render(<ClaimTicket store={shop} record={{ ...ticket, amountPaid: 4000, payments: [{ amount: 4000, at: AT, by: 'Amaka' }] }} onClose={() => {}} />);
    expect(screen.getByText('Taken in by')).toBeTruthy();
    expect(screen.getByText('Destiny')).toBeTruthy();
    expect(screen.getByTestId('payment-line').textContent).toContain('by Amaka');
    expect(screen.getByText('Paid in full')).toBeTruthy();
  });

  it('says so when nobody has taken any money', () => {
    render(<ClaimTicket store={shop} record={{ ...ticket, amountPaid: 0, payments: [] }} onClose={() => {}} />);
    expect(screen.getByText('No money received yet')).toBeTruthy();
    expect(screen.getByText('To pay on collection')).toBeTruthy();
  });

  it('does not invent a name it was never given', () => {
    render(<ClaimTicket store={shop} record={{ ...ticket, amountPaid: 4000, payments: [{ amount: 4000, at: AT }] }} onClose={() => {}} />);
    expect(screen.getByText('Name not recorded')).toBeTruthy();
  });

  it('finds the payment itself right after intake', () => {
    const paid = recordLaundryPayment(shop, { ...bundle, amountPaid: 1000, at: AT, takenBy: 'Destiny' });
    render(<ClaimTicket store={paid} record={{ ...ticket, clientRef: REF, amountPaid: 1000 }} onClose={() => {}} />);
    expect(screen.getByTestId('payment-line').textContent).toContain('by Destiny');
  });
});

describe('the WhatsApp message', () => {
  it('names both people', () => {
    const paid = recordLaundryPayment(shop, { ...bundle, amountPaid: 4000, at: AT, laterPayment: true, takenBy: 'Amaka' });
    const order = { client_ref: REF, customer_phone: '08020000000', customer_name: 'Ada', total: 4000, workflow_stage: 'ready', status: 'Ready', service_metadata: { recorded_by_name: 'Destiny', tag_code: 'C6JYNQ' } };
    const message = buildLaundryWhatsAppPayload(paid, order)?.message || '';
    expect(message).toContain('Taken in by: Destiny');
    expect(message).toMatch(/4,000 received by Amaka/);
  });
});

describe('the record’s timeline', () => {
  it('puts the money in the order it happened', () => {
    const timeline = bundleTimeline({
      createdAt: Date.parse('2026-10-26T10:00:00Z'),
      recordedByName: 'Destiny',
      steps: [{ stage: 'collected', at: '2026-10-31T19:00:00.000Z', by: 'Amaka' }] as any,
      payments: [{ amount: 4000, at: AT, by: 'Amaka' }],
    });
    expect(timeline.map(step => [step.label, step.by])).toEqual([
      ['Taken in', 'Destiny'], ['Received ₦4,000', 'Amaka'], ['Handed over', 'Amaka'],
    ]);
  });
});
