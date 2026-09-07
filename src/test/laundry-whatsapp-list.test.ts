import { describe, expect, it } from 'vitest';
import { buildLaundryWhatsAppPayload } from '@/lib/laundry-whatsapp';

/**
 * The receipt a laundry customer actually receives.
 *
 * The items were one run-on line — "Items (6): 1 Shirt, 1 Trouser, 1 T-shirt,
 * 1 Nicker / Shorts, 1 Gown / Dress, 1 Skirt" — which wrapped over four lines
 * on a phone and had to be read word by word to count. WhatsApp offers no
 * columns or tables to lay it out with, so the fix is a numbered list running
 * down the message.
 */

const store = { storeName: 'Washlie' } as any;

function order(garments: { garmentType: string; quantity: number }[]) {
  return {
    customer_name: 'Innocent warabebe',
    customer_phone: '08031234567',
    order_number: '74H695',
    status: 'received',
    total: 3000,
    created_at: new Date().toISOString(),
    service_metadata: {
      tag_code: '74H695',
      service_name: 'Full service',
      garment_count: garments.reduce((sum, g) => sum + g.quantity, 0),
      garment_lines: garments,
    },
  } as any;
}

const SIX = [
  { garmentType: 'Shirt', quantity: 1 },
  { garmentType: 'Trouser', quantity: 1 },
  { garmentType: 'T-shirt', quantity: 1 },
  { garmentType: 'Nicker / Shorts', quantity: 1 },
  { garmentType: 'Gown / Dress', quantity: 1 },
  { garmentType: 'Skirt', quantity: 1 },
];

describe('the item list', () => {
  it('numbers each garment on its own line', () => {
    const message = buildLaundryWhatsAppPayload(store, order(SIX))?.message || '';
    expect(message).toContain('1. Shirt');
    expect(message).toContain('2. Trouser');
    expect(message).toContain('6. Skirt');
  });

  it('no longer runs them together on one line', () => {
    const message = buildLaundryWhatsAppPayload(store, order(SIX))?.message || '';
    expect(message).not.toContain('1 Shirt, 1 Trouser');
    expect(message).not.toContain('Items (6):');
  });

  it('heads the list with the count, without the bracket', () => {
    const message = buildLaundryWhatsAppPayload(store, order(SIX))?.message || '';
    expect(message).toContain('Items — 6 pieces');
  });

  it('leaves the quantity off when there is only one', () => {
    // "1 ×" on every line of a six-line list is noise.
    const message = buildLaundryWhatsAppPayload(store, order(SIX))?.message || '';
    expect(message).not.toContain('×1');
  });

  it('shows the quantity when there is more than one', () => {
    const message = buildLaundryWhatsAppPayload(store, order([
      { garmentType: 'Shirt', quantity: 3 },
      { garmentType: 'Towel', quantity: 1 },
    ]))?.message || '';
    expect(message).toContain('1. Shirt ×3');
    expect(message).toContain('2. Towel');
  });

  it('says one piece in the singular', () => {
    const message = buildLaundryWhatsAppPayload(store, order([
      { garmentType: 'Shirt', quantity: 1 },
    ]))?.message || '';
    expect(message).toContain('Items — 1 piece');
    expect(message).not.toContain('1 pieces');
  });

  it('keeps the code, the service and the total', () => {
    const message = buildLaundryWhatsAppPayload(store, order(SIX))?.message || '';
    expect(message).toContain('Laundry code: 74H695');
    expect(message).toContain('Service: Full service');
    expect(message).toContain('3,000');
  });

  it('still builds something when the garments are unknown', () => {
    const bare = { ...order([]), service_metadata: { tag_code: 'X1', service_name: 'Wash' } } as any;
    const message = buildLaundryWhatsAppPayload(store, bare)?.message || '';
    expect(message).toContain('Laundry code: X1');
  });
});

describe('what the customer sees', () => {
  it('reads as a list, top to bottom', () => {
    const message = buildLaundryWhatsAppPayload(store, order(SIX))?.message || '';
    // eslint-disable-next-line no-console
    console.log('\n----- message -----\n' + message + '\n-------------------');
    const numbered = message.split('\n').filter(line => /^\d+\. /.test(line));
    expect(numbered).toHaveLength(6);
  });
});
