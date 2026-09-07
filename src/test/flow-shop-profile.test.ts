import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shopProfile, shopProfileBrief } from '@/lib/flow-shop-profile';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { responseFor, understand } from '@/lib/flow-operating-engine';

/**
 * Flow knowing one shop from another.
 *
 * Its memory held conversation context - the last thing asked, the last
 * product mentioned - and nothing about how the shop behaves. Every shop got
 * the same generic advice however long it had been trading.
 *
 * The patterns are derived from the shop's own records rather than stored, so
 * they cannot drift from the truth. And they are withheld when the evidence is
 * thin: a shop with four jobs has no busiest day, and an app that invents one
 * teaches its owner not to believe the next thing it says.
 */

const store = { storeName: 'Shine Laundry', storeType: 'laundry', category: 'retail', accessCode: 'TEST01', products: [], sales: [], customers: [] } as any;

const at = (daysAgo: number, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

function seed(rows: Array<{ ref: string; customer: string; total: number; inDays: number; outDays?: number; garment?: string; promisedDays?: number }>) {
  localStorage.setItem(laundryLocalStorageKey('TEST01'), JSON.stringify(rows.map(row => ({
    clientRef: row.ref, accessCode: 'TEST01', tagCode: row.ref.toUpperCase(),
    customerName: row.customer, customerPhone: `0803${row.customer.length}${row.customer.charCodeAt(0)}`,
    serviceId: 'sv1', serviceName: 'Wash & Iron', pricing: 'per_piece', billingQuantity: 1,
    total: row.total, notes: '', garments: [{ garmentType: row.garment || 'Shirt', quantity: 2 }],
    pieceCount: 2, garmentSummary: '2 Shirt',
    createdAt: at(row.inDays),
    promisedFor: row.promisedDays !== undefined ? at(row.promisedDays) : undefined,
    workflowStage: row.outDays !== undefined ? 'collected' : 'received',
    stageUpdatedAt: row.outDays !== undefined ? at(row.outDays) : undefined,
    syncStatus: 'pending',
  }))));
}

/** Ten jobs, two days' turnaround, one customer who came back twice. */
function busyShop() {
  seed([
    { ref: 'r1', customer: 'Chidi', total: 4000, inDays: 20, outDays: 18 },
    { ref: 'r2', customer: 'Chidi', total: 4000, inDays: 14, outDays: 12 },
    { ref: 'r3', customer: 'Ada', total: 2000, inDays: 13, outDays: 11 },
    { ref: 'r4', customer: 'Musa', total: 6000, inDays: 12, outDays: 10 },
    { ref: 'r5', customer: 'Ngozi', total: 3000, inDays: 11, outDays: 9 },
    { ref: 'r6', customer: 'Bola', total: 4000, inDays: 10, outDays: 8 },
    { ref: 'r7', customer: 'Chidi', total: 4000, inDays: 9, outDays: 7 },
    { ref: 'r8', customer: 'Ada', total: 2000, inDays: 8, outDays: 6 },
    { ref: 'r9', customer: 'Emeka', total: 5000, inDays: 7, outDays: 5 },
    { ref: 'r10', customer: 'Tunde', total: 4000, inDays: 6, outDays: 4 },
  ]);
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('with barely any history', () => {
  it('says so plainly rather than inventing a pattern', () => {
    seed([{ ref: 'r1', customer: 'Chidi', total: 4000, inDays: 1 }]);
    const profile = shopProfile(store);
    expect(profile.confident).toBe(false);
    expect(profile.facts).toEqual([]);
    expect(shopProfileBrief(store)).toContain('not enough to call anything a pattern');
  });

  it('admits knowing nothing at all on day one', () => {
    expect(shopProfileBrief(store)).toContain('I have not seen any work yet');
  });
});

describe('once a shop has traded a while', () => {
  beforeEach(() => busyShop());

  it('works out what a job is usually worth', () => {
    const facts = shopProfile(store).facts.map(f => f.text).join('\n');
    expect(facts).toContain('A typical job here is ₦4,000.');
  });

  it('works out how long work really takes', () => {
    const facts = shopProfile(store).facts.map(f => f.text).join('\n');
    expect(facts).toContain('turn work around in 2 days');
  });

  it('knows how many customers come back', () => {
    // Chidi three times, Ada twice, five others once: 2 of 7.
    const facts = shopProfile(store).facts.map(f => f.text).join('\n');
    expect(facts).toContain('29% of your customers come back — 2 of 7.');
  });

  it('knows what the shop actually handles', () => {
    const facts = shopProfile(store).facts.map(f => f.text).join('\n');
    expect(facts).toContain('Shirt is what you handle most.');
  });

  it('carries the evidence behind each finding', () => {
    for (const fact of shopProfile(store).facts) {
      expect(fact.evidence, fact.text).toBeGreaterThan(0);
    }
  });
});

describe('promises kept', () => {
  it('praises a clean record rather than reporting 0%', () => {
    seed(Array.from({ length: 10 }, (_, i) => ({
      ref: `r${i}`, customer: `C${i}`, total: 3000,
      inDays: 20 - i, outDays: 19 - i, promisedDays: 18 - i,
    })));
    expect(shopProfile(store).facts.map(f => f.text).join('\n')).toContain('never missed a promised day');
  });

  it('reports the share when days are missed', () => {
    seed(Array.from({ length: 10 }, (_, i) => ({
      ref: `r${i}`, customer: `C${i}`, total: 3000,
      inDays: 20 - i, outDays: 10 - i, promisedDays: 19 - i,
    })));
    expect(shopProfile(store).facts.map(f => f.text).join('\n')).toMatch(/went past the promised day/);
  });
});

describe('asking Flow directly', () => {
  it('answers what it has learned about the shop', () => {
    busyShop();
    const reply = responseFor(store, understand(store, 'What have you learned about my shop?'));
    expect(reply).toContain('Here is what I have noticed');
    expect(reply).toContain('A typical job here is');
  });

  it('is honest when asked too early', () => {
    seed([{ ref: 'r1', customer: 'Chidi', total: 4000, inDays: 1 }]);
    const reply = responseFor(store, understand(store, 'what do you know about my shop?'));
    expect(reply).toContain('not enough to call anything a pattern');
  });
});
