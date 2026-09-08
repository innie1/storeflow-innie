import { describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { toSpeakable } from '@/lib/flow-voice';
import { looksLikeBareCustomerName, draftFromCustomerName } from '@/lib/flow-order-draft';
import { customerRoundup, serviceSnapshot, owedByCustomer } from '@/lib/flow-service-brain';

const laundry = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's1',
  storeId: 'SF-W',
  storeName: 'Washlie',
  accessCode: 'WASH01',
  storeType: 'laundry',
  businessType: 'laundry',
  products: [{ id: 'p1', name: 'Full service', isService: true, sellingPrice: 1500, costPrice: 0, quantity: 0 }],
  customers: [{ id: 'c1', name: 'John', phone: '08011112222' }],
  sales: [],
  pendingPayments: [],
  createdAt: new Date(0).toISOString(),
  ...over,
} as any);

const debt = (over = {}) => ({
  id: 'laundry-abc',
  customerName: 'John',
  customerPhone: '08011112222',
  items: [],
  total: 3000,
  paid: 1500,
  balance: 1500,
  createdAt: new Date().toISOString(),
  status: 'pending' as const,
  events: [],
  saleIds: [],
  ...over,
});

describe('what Flow says out loud', () => {
  /**
   * The engine announces emoji by name, so a status line was read as "white
   * heavy check mark nothing is past its promised day". That, plus dropping
   * the currency entirely, is most of what made Flow sound like a machine.
   */
  it('drops emoji rather than having them announced', () => {
    const spoken = toSpeakable('✅ Nothing is past its promised day.\n💳 ₦1,500 still owed.');
    expect(spoken).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}]/u);
  });

  it('says the currency instead of swallowing it', () => {
    expect(toSpeakable('You took ₦12,500 today.')).toContain('12,500 naira');
    expect(toSpeakable('You took ₦12,500 today.')).not.toContain('₦');
  });

  it('reads bold as words and bullets as sentences, not symbols', () => {
    const spoken = toSpeakable('**Washlie** — 4 orders\n• Shirt\n• Trouser');
    expect(spoken).not.toContain('*');
    expect(spoken).not.toContain('•');
    expect(spoken).toContain('Washlie');
  });

  it('leaves ordinary sentences alone', () => {
    expect(toSpeakable('Nothing is overdue today.')).toBe('Nothing is overdue today.');
  });
});

describe('a name is an answer, not a mistake', () => {
  /**
   * Flow opens by asking for the customer's name. Typing one used to fall
   * through to "Not sure what you meant" — being asked a question and then
   * told the answer is wrong.
   */
  it('treats a bare name as the start of an order', () => {
    expect(looksLikeBareCustomerName(laundry(), 'John')).toBe(true);
    expect(looksLikeBareCustomerName(laundry(), 'Mary Okafor')).toBe(true);
  });

  it('recognises a name it already knows', () => {
    const draft = draftFromCustomerName(laundry(), 'John');
    expect(draft.customerMatched).toBe(true);
    expect(draft.customerPhone).toBe('08011112222');
  });

  it('does not mistake a greeting or a request for a customer', () => {
    for (const word of ['hi', 'help', 'today', 'my customers', 'best sellers']) {
      expect(looksLikeBareCustomerName(laundry(), word)).toBe(false);
    }
  });

  it('does not mistake something the shop sells for a person', () => {
    expect(looksLikeBareCustomerName(laundry(), 'Full service')).toBe(false);
  });
});

describe('one answer about who owes what', () => {
  /**
   * The shop summary read pendingPayments and said ₦1,500 was owed; the
   * customer answer read customer.outstandingDebt, which the laundry flow
   * never writes, and said nobody owed anything. Both on the same screen.
   */
  it('finds a laundry balance that never touched outstandingDebt', () => {
    const store = laundry({ pendingPayments: [debt()] });
    expect(owedByCustomer(store, store.customers![0])).toBe(1500);
    expect(customerRoundup(store)).toContain('1,500');
    expect(customerRoundup(store)).not.toContain('Nobody owes you');
  });

  it('still says the book is clear when it really is', () => {
    expect(customerRoundup(laundry())).toContain('Nobody owes you');
  });

  it('counts the people who owe, not everyone on the book', () => {
    const store = laundry({
      customers: [
        { id: 'c1', name: 'John', phone: '08011112222' },
        { id: 'c2', name: 'Ada', phone: '08033334444' },
        { id: 'c3', name: 'Bola', phone: '08055556666' },
      ] as any,
      pendingPayments: [debt()],
    });
    expect(serviceSnapshot(store).owedBy).toBe(1);
  });
});
