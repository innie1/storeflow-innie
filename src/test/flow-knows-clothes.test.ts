import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import { clothesAndMoney, serviceOverview } from '@/lib/flow-service-brain';
import { understand, responseFor } from '@/lib/flow-operating-engine';
import { shopProfile } from '@/lib/flow-shop-profile';
import { checkLaundryFlowNote, generateAdvice, generateNotifications } from '@/lib/manager-intel';
import { visibleNotifications, wantsNotification } from '@/lib/notification-gate';

/**
 * Flow knew a laundry by its money. It now has the clothes as well: in what it
 * says, what it has learned, what it recommends, and what it tells the owner.
 */

const CODE = 'FLOWTEST';
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600000).toISOString();
const record = (ref: string, total: number, hours: number) => ({
  clientRef: ref, accessCode: CODE, tagCode: ref.toUpperCase(), customerName: `C ${ref}`, createdAt: hoursAgo(hours),
  total, pieceCount: 5, workflowStage: 'ready', syncStatus: 'synced', garments: [],
});
const shop = (extra: object = {}) => ({
  accessCode: CODE, storeName: 'Washlie', storeType: 'laundry', businessType: 'laundry', products: [], customers: [], expenses: [], restocks: [],
  simpleOnboarding: { complete: true }, createdAt: hoursAgo(24 * 90), managerSettings: {},
  sales: [{ id: 's1', date: hoursAgo(2), total: 4000, profit: 4000, productId: 'x', productName: 'x', quantity: 1, unitPrice: 4000 }],
  pendingPayments: [{ id: 'laundry-a', paid: 4000, balance: 0, total: 4000, status: 'paid', items: [], customerName: 'C a', createdAt: hoursAgo(30) }],
  ...extra,
}) as unknown as StoreData;
const workerPhone = { staffDevice: { requestId: 'r', storeRef: 'S', staffId: 's' } };

beforeEach(() => {
  localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify([
    record('a', 4000, 30), record('b', 4500, 40), record('c', 5000, 50), record('d', 4000, 60), record('e', 1200, 70), record('f', 3000, 80),
  ]));
});
afterEach(() => localStorage.clear());

describe('what Flow says', () => {
  it('tells the clothes and the money together', () => {
    const said = clothesAndMoney(shop());
    expect(said).toContain('6 bundles (30 pieces) worth ₦21,700 came in');
    expect(said).toContain('₦4,000 of that has been paid (18%)');
    expect(said).toContain('1 of the 6 customers');
    expect(said).toContain('Getting paid is the thing to work on');
  });

  it('includes them when asked how the shop is doing', () => {
    expect(serviceOverview(shop())).toContain('₦21,700 came in');
  });

  it.each([
    'how many clothes came in this week',
    'how many customers paid',
    'what percentage of people paid',
    'clothes and money',
    'show me the flow of my shop',
    'how are my sales this week',
  ])('answers "%s" with both', question => {
    const store = shop();
    const plan = understand(store, question);
    expect(plan.intent).toBe('sales');
    expect(responseFor(store, plan)).toContain('₦21,700 came in');
  });

  it('does not mistake recording work for a question', () => {
    expect(understand(shop(), 'Ada brought 3 clothes').reason).not.toBe('clothes and money');
  });

  it('leaves a shop that is not a laundry as it was', () => {
    const other = shop({ storeType: 'retail', businessType: 'retail' });
    expect(understand(other, 'clothes and money').reason).not.toBe('clothes and money');
  });

  it('says so on a worker phone, instead of calling the shop unpaid', () => {
    const said = clothesAndMoney(shop(workerPhone));
    expect(said).toContain('only knows the money it took itself');
    expect(said).not.toContain('Getting paid is the thing');
  });
});

describe('what Flow recommends when asked', () => {
  it('puts getting paid first', () => {
    const store = shop();
    const plan = understand(store, 'what should i do');
    const said = responseFor(store, plan);
    expect(said).toContain('Get paid for the work you have done');
    expect(said).toContain('**18%**');
  });
});

describe('what Flow has learned', () => {
  it('knows how much of the work gets paid for, with enough records to say', () => {
    const many = Array.from({ length: 12 }, (_, i) => record(`m${i}`, 1000, 30 + i));
    localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify(many));
    const paid = { pendingPayments: [{ id: 'laundry-m0', paid: 3000, balance: 0, total: 3000, status: 'paid', items: [], customerName: 'x', createdAt: hoursAgo(30) }] };
    const facts = shopProfile(shop(paid)).facts.map(fact => fact.text).join(' ');
    expect(facts).toContain('Customers have paid 8% of the work brought in');
    expect(shopProfile(shop({ ...paid, ...workerPhone })).facts.map(fact => fact.text).join(' ')).not.toContain('Customers have paid');
  });
});

describe('what Flow recommends', () => {
  it('raises clothes not paid for', () => {
    const card = generateAdvice(shop()).find(item => item.id === 'laundry-clothes-not-paid');
    expect(card).toMatchObject({ priority: 'high', goTo: 'laundry-records' });
    expect(card?.title).toContain('18%');
    expect(card?.detail).toContain('5 of the 6 customers');
  });

  it('stays quiet when most of it is paid, and on a worker phone', () => {
    const paid = ['a', 'b', 'c', 'd', 'e', 'f'].map(ref => ({ id: `laundry-${ref}`, paid: 9000, balance: 0, total: 9000, status: 'paid', items: [], customerName: ref, createdAt: hoursAgo(30) }));
    expect(generateAdvice(shop({ pendingPayments: paid })).some(item => item.id === 'laundry-clothes-not-paid')).toBe(false);
    expect(generateAdvice(shop(workerPhone)).some(item => item.id === 'laundry-clothes-not-paid')).toBe(false);
  });
});

describe('what Flow tells the owner', () => {
  const note = (store: StoreData) => generateNotifications(store).find(item => item.id.startsWith('laundry-flow-'));

  it('sends clothes and money once a week, leading to the bundles', () => {
    const first = note(shop());
    // One line, named for the seven days it counts, not "this week".
    expect(first).toMatchObject({ title: 'Last 7 days: 6 bundles came in', tone: 'warning', category: 'insight', actionTab: 'laundry-records' });
    expect(first?.description).toContain('Worth ₦21,700.');
    expect(first?.description).toContain('not paid yet.');
    expect(note(shop())?.id).toBe(first?.id);
  });

  it('obeys the Insights switch, and goes only to people who see the money', () => {
    const first = note(shop())!;
    expect(wantsNotification({ managerSettings: { notifyInsights: false } } as never, first.category)).toBe(false);
    expect(visibleNotifications([first], { role: 'attendant' } as never)).toEqual([]);
    expect(visibleNotifications([first], { role: 'owner' } as never)).toEqual([first]);
  });

  it('arrives without the Manager screen being opened, and only once', () => {
    const raised = checkLaundryFlowNote(shop())!;
    expect(raised.flowNotifications?.map(item => item.title)).toEqual(['Last 7 days: 6 bundles came in']);
    expect(checkLaundryFlowNote(raised)).toBeNull();
    expect(generateNotifications(raised).find(item => item.id === raised.flowNotifications![0].id)).toBeTruthy();
    expect(checkLaundryFlowNote(shop({ managerSettings: { notifyInsights: false } }))).toBeNull();
    expect(checkLaundryFlowNote(shop(workerPhone))).toBeNull();
  });

  it('is not sent from a worker phone, or with nothing to report', () => {
    expect(note(shop(workerPhone))).toBeUndefined();
    localStorage.clear();
    expect(note(shop())).toBeUndefined();
  });
});
