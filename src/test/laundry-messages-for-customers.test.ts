import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLaundryWhatsAppPayload, customerGreeting, dayAndTime, shopSignature } from '@/lib/laundry-whatsapp';
import { recordLaundryPayment } from '@/lib/laundry-money';

/*
 * What a customer is sent, and only that.
 *
 * The messages named the worker who took the clothes in ("Taken in by:
 * Destiny") and whoever received each payment. That is the shop's own record,
 * and it does not belong in a customer's chat.
 */

const NOW = new Date(2026, 10, 16, 10, 0).getTime();
const REF = 'ref-1';

const shop: any = {
  id: 's', storeName: 'Washlie Laundry', accessCode: 'MSG001', storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], pendingPayments: [],
  profile: { location: '4 Market Road, Chalisco', phone: '0809 999 8888' },
};

const order = (over: Record<string, unknown> = {}) => ({
  client_ref: REF, order_number: 'K7M2Q9', customer_name: 'Ada Obi', customer_phone: '08012345678',
  workflow_stage: 'received', status: 'Accepted', total: 5_600,
  created_at: new Date(NOW).toISOString(), updated_at: new Date(NOW).toISOString(),
  service_metadata: {
    tag_code: 'K7M2Q9', service_name: 'Full Service', garment_count: 3,
    garment_lines: [{ garmentType: 'Shirt', quantity: 2 }, { garmentType: 'Trouser', quantity: 1 }],
    recorded_by_name: 'Destiny', recorded_by_role: 'staff',
    promised_for: new Date(2026, 10, 18, 17, 0).toISOString(),
  },
  order_items: [],
  ...over,
});

/** ₦2,000 of the ₦5,600 paid at the counter, taken by a named worker. */
const partPaid = () => recordLaundryPayment(shop, {
  clientRef: REF, tagCode: 'K7M2Q9', customerName: 'Ada Obi', serviceId: 'wash-iron', serviceName: 'Full Service',
  total: 5_600, amountPaid: 2_000, at: new Date(NOW).toISOString(), takenBy: 'Amaka',
} as any);
const fullyPaid = () => recordLaundryPayment(shop, {
  clientRef: REF, tagCode: 'K7M2Q9', customerName: 'Ada Obi', serviceId: 'wash-iron', serviceName: 'Full Service',
  total: 5_600, amountPaid: 5_600, at: new Date(NOW).toISOString(), takenBy: 'Amaka',
} as any);

const STAGES = ['received', 'washing', 'ready', 'collected'] as const;
const message = (store: any, over: Record<string, unknown> = {}) => buildLaundryWhatsAppPayload(store, order(over))?.message || '';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());

describe('nothing about the shop\'s staff', () => {
  it('never names who took the clothes in or who received the money', () => {
    const store = partPaid();
    const all = [
      ...STAGES.map(stage => message(store, { workflow_stage: stage })),
      // Ready for more than a week: the reminder.
      message(store, { workflow_stage: 'ready', updated_at: new Date(NOW - 9 * 86400000).toISOString() }),
    ];
    for (const text of all) {
      expect(text).not.toMatch(/Destiny|Amaka/);
      expect(text).not.toMatch(/taken in by|received by/i);
    }
  });
});

describe('the money, said plainly', () => {
  it('gives the total, what was paid and what is left to pay', () => {
    const text = message(partPaid());
    expect(text).toContain('Total: ₦5,600\nPaid: ₦2,000\nTo pay on collection: ₦3,600');
  });

  it('says paid in full, and nothing about collection money', () => {
    const text = message(fullyPaid(), { workflow_stage: 'ready' });
    expect(text).toContain('Total: ₦5,600\nPaid in full');
    expect(text).not.toContain('To pay');
  });

  it('claims nothing about payment when the shop has no record of it', () => {
    const text = message(shop);
    expect(text).toContain('Total: ₦5,600');
    expect(text).not.toMatch(/Paid|To pay/);
  });

  it('calls it still to pay once the clothes have gone', () => {
    expect(message(partPaid(), { workflow_stage: 'collected' })).toContain('Still to pay: ₦3,600');
  });

  it('leaves the total out of a reminder, and keeps what is to be paid', () => {
    const text = message(partPaid(), { workflow_stage: 'ready', updated_at: new Date(NOW - 9 * 86400000).toISOString() });
    expect(text).toContain('still ready for collection');
    expect(text).toContain('To pay on collection: ₦3,600');
    expect(text).not.toContain('Total:');
  });
});

describe('laid out the same way every time', () => {
  it('opens with the greeting and ends with the shop', () => {
    for (const stage of STAGES) {
      const lines = message(shop, { workflow_stage: stage }).split('\n');
      expect(lines[0]).toBe('Hello Ada Obi,');
      expect(lines[1]).toBe('');
      expect(lines.slice(-3)).toEqual(['*Washlie Laundry*', '4 Market Road, Chalisco', 'Tel: 0809 999 8888']);
    }
  });

  it('puts the laundry code in bold, where it can be found again', () => {
    for (const stage of STAGES) expect(message(shop, { workflow_stage: stage })).toContain('*Laundry code: K7M2Q9*');
  });

  it('never leaves two blank lines together, or a blank line at the end', () => {
    for (const stage of STAGES) {
      const text = message(partPaid(), { workflow_stage: stage });
      expect(text).not.toContain('\n\n\n');
      expect(text.endsWith('\n')).toBe(false);
    }
  });

  it('says when it was promised for, while that is still ahead', () => {
    expect(message(shop)).toContain('Ready by: Wednesday 18 November, 5pm');
    // A promise already missed is not put in front of the customer again.
    const late = { ...order().service_metadata, promised_for: new Date(NOW - 86400000).toISOString() };
    expect(message(shop, { workflow_stage: 'washing', service_metadata: late })).not.toContain('Ready by');
  });

  it('lists the clothes on the receipt and when ready, and only counts them otherwise', () => {
    expect(message(shop)).toContain('*Items — 3 pieces*\n1. Shirt ×2\n2. Trouser');
    expect(message(shop, { workflow_stage: 'ready' })).toContain('1. Shirt ×2');
    const update = message(shop, { workflow_stage: 'washing' });
    expect(update).toContain('3 pieces');
    expect(update).not.toContain('1. Shirt');
  });
});

describe('the small parts', () => {
  it('greets by name, and plainly when there is none', () => {
    expect(customerGreeting('Ada Obi')).toBe('Hello Ada Obi,');
    expect(customerGreeting('Walk-in Customer')).toBe('Hello,');
    expect(customerGreeting('')).toBe('Hello,');
  });

  it('signs with whatever the shop has filled in', () => {
    expect(shopSignature({ storeName: 'Washlie', profile: undefined } as any)).toEqual(['*Washlie*']);
  });

  it('writes a time the same on every phone', () => {
    expect(dayAndTime(new Date(2026, 8, 5, 9, 30).getTime())).toBe('Saturday 5 September, 9:30am');
    expect(dayAndTime(new Date(2026, 10, 18, 12, 0).getTime())).toBe('Wednesday 18 November, 12pm');
  });
});

describe('how each one reads', () => {
  it('prints them, to be read as a customer would', () => {
    const store = partPaid();
    const shown = [
      ['Receipt', message(store)],
      ['Update', message(store, { workflow_stage: 'washing' })],
      ['Ready', message(store, { workflow_stage: 'ready' })],
      ['Reminder', message(store, { workflow_stage: 'ready', updated_at: new Date(NOW - 9 * 86400000).toISOString() })],
      ['Thank you', message(fullyPaid(), { workflow_stage: 'collected' })],
    ];
    // eslint-disable-next-line no-console
    console.log(shown.map(([name, text]) => `\n===== ${name} =====\n${text}`).join('\n'));
    expect(shown.every(([, text]) => text.length > 0)).toBe(true);
  });
});
