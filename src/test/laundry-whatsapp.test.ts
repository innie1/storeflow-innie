import { describe, expect, it, vi } from 'vitest';
import { buildLaundryWhatsAppPayload, normalizeWhatsAppPhone } from '@/lib/laundry-whatsapp';

const store: any = {
  storeName: 'Washlie Laundry',
  accessCode: 'ABC123',
  storeType: 'laundry',
  profile: {
    storeType: 'laundry',
    location: "Chalisco, by God's Own Specialist Hospital",
    phone: '08099998888',
    email: '',
  },
};

function order(overrides: any = {}) {
  return {
    order_number: 'K7M2Q9',
    customer_name: 'Ada Obi',
    customer_phone: '08012345678',
    workflow_stage: 'received',
    status: 'Accepted',
    total: 5600,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    service_metadata: {
      source: 'walk_in_laundry',
      tag_code: 'K7M2Q9',
      service_name: 'Full Service',
      garment_count: 3,
      garment_summary: '2 Shirt, 1 Trouser',
    },
    order_items: [],
    ...overrides,
  };
}

describe('laundry WhatsApp messages', () => {
  it('normalizes a Nigerian local phone number for WhatsApp click-to-chat', () => {
    expect(normalizeWhatsAppPhone('0801 234 5678')).toBe('2348012345678');
    expect(normalizeWhatsAppPhone('+234 801 234 5678')).toBe('2348012345678');
  });

  it('builds a received receipt message with tag, clothes and shop details', () => {
    const payload = buildLaundryWhatsAppPayload(store, order());
    expect(payload?.kind).toBe('received');
    expect(payload?.phone).toBe('2348012345678');
    expect(payload?.message).toContain('K7M2Q9');
    expect(payload?.message).toContain('2 Shirt, 1 Trouser');
    expect(payload?.message).toContain('3)');
    expect(payload?.message).toContain('Washlie Laundry');
    expect(payload?.message).toContain("Chalisco, by God's Own Specialist Hospital");
    expect(payload?.message).toContain('08099998888');
    expect(payload?.url).toContain('https://wa.me/2348012345678?text=');
  });

  it('changes the prepared WhatsApp copy for processing and ready jobs', () => {
    const processing = buildLaundryWhatsAppPayload(store, order({ workflow_stage: 'washing' }));
    const ready = buildLaundryWhatsAppPayload(store, order({ workflow_stage: 'ready' }));
    expect(processing?.kind).toBe('processing');
    expect(processing?.message.toLowerCase()).toContain('currently being processed');
    expect(ready?.kind).toBe('ready');
    expect(ready?.message.toLowerCase()).toContain('ready for pickup');
  });

  it('turns an old ready job into a collection reminder after a week', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
    const payload = buildLaundryWhatsAppPayload(store, order({
      workflow_stage: 'ready',
      updated_at: '2026-08-18T12:00:00Z',
    }));
    expect(payload?.kind).toBe('reminder');
    expect(payload?.message.toLowerCase()).toContain('still ready for collection');
    vi.useRealTimers();
  });

  it('does not make a WhatsApp action when the customer phone is missing', () => {
    expect(buildLaundryWhatsAppPayload(store, order({ customer_phone: '' }))).toBeNull();
  });
});
