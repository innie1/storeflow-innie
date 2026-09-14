import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { readSource } from './helpers/source';

/**
 * The Analysis page, reading the business it is actually looking at.
 *
 * It was wired to the online storefront and nothing else: QR scan events, and
 * orders placed through the customer app. A laundry taking work over a counter
 * saw seven of its eight cards read zero — no customers, no returning buyers,
 * no orders — while it had four bundles in from three people. Every walk-in
 * lives in its own record store, keyed by access code, which this page never
 * opened.
 *
 * The eighth card showed revenue only because it fell back to `sales`, which
 * is how the page looked plausible while being wrong.
 */

const analytics = readSource('src/components/analytics/BusinessAnalytics.tsx');

const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

function seedRecords() {
  const record = (ref: string, name: string, phone: string, total: number, stage: string, days: number) => ({
    clientRef: ref, accessCode: 'TEST01', tagCode: ref.toUpperCase(),
    customerName: name, customerPhone: phone,
    serviceId: 'sv1', serviceName: 'Wash & Iron', pricing: 'per_piece',
    billingQuantity: 1, total, notes: '', garments: [], pieceCount: 5,
    garmentSummary: '5 Shirt', createdAt: ago(days), workflowStage: stage, syncStatus: 'pending',
  });
  localStorage.setItem(laundryLocalStorageKey('TEST01'), JSON.stringify([
    record('a1', 'Chidi Okeke', '08031234567', 4000, 'collected', 2),
    record('a2', 'Chidi Okeke', '08031234567', 3000, 'collected', 9),
    record('a3', 'Ada Nwosu', '08039998888', 2500, 'ready', 1),
    record('a4', 'Musa Bello', '08033334444', 5000, 'washing', 0),
  ]));
}

beforeEach(() => { localStorage.clear(); seedRecords(); });
afterEach(() => localStorage.clear());

describe('it reads the counter, not only the storefront', () => {
  it('turns walk-in bundles into orders the page can count', () => {
    expect(analytics).toContain('function walkInOrders');
    expect(analytics).toContain('getLocalLaundryRecords(accessCode)');
  });

  it('counts a handed-back bundle as a completed order', () => {
    // 'collected' is already in the success list, so a bundle handed back
    // counts the way a delivered order does.
    expect(analytics).toContain("record.workflowStage === 'collected' ? 'collected'");
  });

  it('keys a walk-in customer by their customer id, so repeat visits join up', () => {
    // Without this every bundle would look like a new person and "came back
    // again" could never be anything but zero. By id first, because keying by
    // phone counted one customer with two numbers as two people.
    expect(analytics).toContain('customer_id: record.customerId || record.customerPhone || record.customerName');
  });

  it('merges both sources rather than replacing one with the other', () => {
    // A shop can take work at the counter, through the storefront, or both.
    expect(analytics).toContain('const orders = [...online, ...walkIns];');
  });
});

describe('the cards describe this trade', () => {
  it('asks about work, not about buyers', () => {
    expect(analytics).toContain("label: 'Jobs taken in'");
    expect(analytics).toContain("label: 'Handed back'");
    expect(analytics).toContain("label: 'Came back again'");
  });

  it('adds the two numbers a service shop actually chases', () => {
    expect(analytics).toContain("label: 'Still owed'");
    expect(analytics).toContain("label: 'Average job'");
  });

  it('hides storefront cards from a shop with no storefront activity', () => {
    // Eight cards of zero say only that the app is watching the wrong thing.
    expect(analytics).toContain('analytics.scans > 0 || !isService ? storefrontCards : []');
  });

  it('leaves a product shop with its original cards', () => {
    expect(analytics).toContain("label: 'Guest buyers'");
    // Revenue, because it is now every payment received, in the shop and online.
    expect(analytics).toContain("label: 'Revenue'");
    expect(analytics).toContain('isService ? serviceCards : retailCards');
  });
});

describe('what it says', () => {
  it('describes a service shop in its own words', () => {
    expect(analytics).toContain('Who brings you work, what you have handed back, and who comes again.');
  });

  it('counts money received, the same figure as the dashboard', () => {
    // It used to add up the price of bundles handed back, paid or not, and so
    // counted money that was also listed as still owed.
    expect(analytics).toContain('const revenue = receivedBetween(store, windowFrom, windowTo);');
    expect(analytics).not.toContain('revenue: revenue || salesRevenue');
    expect(analytics).toContain("label: 'Money received'");
    expect(analytics).toContain("label: 'Work taken in'");
  });

  it('counts the customer book over all time, like the dashboard', () => {
    expect(analytics).toContain("customers: range === 'all' ? customers.length : new Set(filteredOrders.map(keyFor)).size");
  });

  it('says what stretch of time each figure covers', () => {
    expect(analytics).toContain("const period = range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'All time';");
    expect(analytics).toContain("period: 'Right now'");
  });

  it('keeps the outstanding balance honest', () => {
    // Money owed comes from pending payments, not from guessing at totals.
    expect(analytics).toContain("payment.status === 'pending'");
    expect(analytics).toContain('Number(payment.balance)');
  });
});
