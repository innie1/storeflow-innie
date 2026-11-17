import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { laundryLocalStorageKey } from '@/lib/laundry-offline';
import {
  collectionReminderLink,
  collectionReminderMessage,
  collectionReminders,
  LONG_WAIT_DAYS,
  noteCollectionReminder,
  readySince,
  remindedInWords,
  remindedRecently,
  uncollectedBundles,
  waitingInWords,
} from '@/lib/uncollected';
import { laundryDayBoard } from '@/lib/laundry-day';
import { readSource } from '@/test/helpers/source';

/*
 * Finished clothes still on the shelf are money the shop has already earned
 * and not been paid. The list puts the longest waiting first, says what is to
 * be paid on each, and remembers who has been reminded.
 */

const CODE = 'SHELF1';
const NOW = new Date(2026, 10, 16, 12).getTime();
const DAY = 86400000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const bundle = (ref: string, over: Record<string, unknown> = {}) => ({
  clientRef: ref, accessCode: CODE, tagCode: `t-${ref}`, customerName: `Customer ${ref}`, customerPhone: '08012345678',
  serviceId: 'wash-iron', serviceName: 'Full Service', garments: [{ garmentType: 'Shirt', quantity: 6 }], pieceCount: 6,
  total: 3_000, createdAt: ago(12), workflowStage: 'ready', syncStatus: 'synced',
  stageHistory: [{ stage: 'washing', at: ago(11) }, { stage: 'ready', at: ago(3) }],
  ...over,
});
const unpaid = (ref: string, total: number, paid: number) => ({
  id: `laundry-${ref}`, customerName: 'x', items: [], total, paid, balance: total - paid,
  createdAt: ago(12), status: total - paid > 0 ? 'pending' : 'paid', events: [], saleIds: [],
});

const shop = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's', storeId: 'SF-S', storeName: 'Shine Laundry', accessCode: CODE, storeType: 'laundry', businessType: 'laundry',
  products: [], sales: [], customers: [], expenses: [], pendingPayments: [],
  profile: { location: '4 Market Road', phone: '0700 000 0000' },
  createdAt: ago(200),
  ...over,
} as unknown as StoreData);

const seed = (bundles: ReturnType<typeof bundle>[]) =>
  localStorage.setItem(laundryLocalStorageKey(CODE), JSON.stringify(bundles));

beforeEach(() => localStorage.clear());

describe('when a bundle became ready', () => {
  it('is the last time it was moved to Ready', () => {
    const since = readySince({ steps: [{ stage: 'ready', at: ago(9) }, { stage: 'ironing', at: ago(8) }, { stage: 'ready', at: ago(2) }] });
    expect(since).toBe(Date.parse(ago(2)));
  });

  it('falls back to when its stage last changed, then to when it came in', () => {
    expect(readySince({ steps: [], stageUpdatedAt: ago(4), createdAt: ago(10) })).toBe(Date.parse(ago(4)));
    expect(readySince({ createdAt: ago(10) })).toBe(Date.parse(ago(10)));
    expect(readySince({})).toBe(0);
  });
});

describe('the uncollected list', () => {
  it('is only finished clothes still in the shop', () => {
    seed([
      bundle('ready'),
      bundle('washing', { workflowStage: 'washing' }),
      bundle('gone', { workflowStage: 'collected' }),
    ]);
    expect(uncollectedBundles(shop(), NOW).list.map(item => item.clientRef)).toEqual(['ready']);
  });

  it('leaves out a bundle the shop is delivering: that one is not waiting on the customer', () => {
    seed([bundle('walkin'), bundle('deliver', { fulfillment: 'delivery' })]);
    expect(uncollectedBundles(shop(), NOW).list.map(item => item.clientRef)).toEqual(['walkin']);
  });

  it('puts the longest waiting first', () => {
    seed([
      bundle('new', { stageHistory: [{ stage: 'ready', at: ago(1) }] }),
      bundle('old', { stageHistory: [{ stage: 'ready', at: ago(15) }] }),
      bundle('mid', { stageHistory: [{ stage: 'ready', at: ago(6) }] }),
    ]);
    const waiting = uncollectedBundles(shop(), NOW);
    expect(waiting.list.map(item => [item.clientRef, item.daysWaiting])).toEqual([['old', 15], ['mid', 6], ['new', 1]]);
    expect(waiting.longestDays).toBe(15);
    expect(waiting.longWaiting).toBe(1);
  });

  it('adds up what is to be paid when they are collected', () => {
    seed([bundle('a'), bundle('b'), bundle('c')]);
    const waiting = uncollectedBundles(shop({
      pendingPayments: [unpaid('a', 3_000, 0), unpaid('b', 3_000, 1_000), unpaid('c', 3_000, 3_000)] as any,
    }), NOW);
    expect(waiting).toMatchObject({ count: 3, value: 9_000, toPay: 5_000, toPayCount: 2 });
    expect(waiting.list.find(item => item.clientRef === 'c')!.balance).toBe(0);
  });

  it('is empty in a shop with nothing ready', () => {
    seed([bundle('washing', { workflowStage: 'washing' })]);
    expect(uncollectedBundles(shop(), NOW)).toMatchObject({ count: 0, toPay: 0, longWaiting: 0, longestDays: 0 });
  });

  it('says how long in plain words', () => {
    expect(waitingInWords(0)).toBe('Ready today');
    expect(waitingInWords(1)).toBe('Ready since yesterday');
    expect(waitingInWords(9)).toBe('Ready 9 days');
  });
});

describe('who has been reminded', () => {
  it('remembers a reminder, and counts a second one', () => {
    seed([bundle('a')]);
    noteCollectionReminder(CODE, 'a', NOW - 5 * DAY);
    let [first] = uncollectedBundles(shop(), NOW).list;
    expect(first.reminders).toBe(1);
    expect(remindedInWords(first, NOW)).toBe('Reminded 5 days ago');
    expect(remindedRecently(first, NOW)).toBe(false);

    noteCollectionReminder(CODE, 'a', NOW);
    [first] = uncollectedBundles(shop(), NOW).list;
    expect(remindedInWords(first, NOW)).toBe('Reminded 2 times, last today');
    expect(remindedRecently(first, NOW)).toBe(true);
  });

  it('says nothing about a bundle nobody has been reminded of', () => {
    seed([bundle('a')]);
    const [first] = uncollectedBundles(shop(), NOW).list;
    expect(remindedInWords(first, NOW)).toBe('');
    expect(remindedRecently(first, NOW)).toBe(false);
  });

  it('drops its notes on bundles that have since been collected', () => {
    noteCollectionReminder(CODE, 'gone', NOW - 9 * DAY);
    noteCollectionReminder(CODE, 'here', NOW, ['here']);
    expect(Object.keys(collectionReminders(CODE))).toEqual(['here']);
  });

  it('keeps one shop\'s notes apart from another\'s', () => {
    noteCollectionReminder(CODE, 'a', NOW);
    expect(collectionReminders('OTHER1')).toEqual({});
  });
});

describe('the reminder', () => {
  const waiting = { customerName: 'Ada Obi', customerPhone: '08012345678', tagCode: 'T-204', pieceCount: 6, balance: 4_500, readySince: NOW - 6 * DAY, daysWaiting: 6 };

  it('says it is ready, which bundle, and what to bring', () => {
    const message = collectionReminderMessage(shop(), waiting);
    expect(message).toContain('Hello Ada Obi,');
    expect(message).toContain('Your laundry at Shine Laundry has been ready since Tuesday 10 November.');
    expect(message).toContain('*Laundry code: T-204*');
    expect(message).toContain('6 pieces');
    expect(message).toContain('To pay on collection: ₦4,500');
    expect(message.split('\n').slice(-3)).toEqual(['*Shine Laundry*', '4 Market Road', 'Tel: 0700 000 0000']);
  });

  it('does not ask for money on a bundle that is paid', () => {
    const message = collectionReminderMessage(shop(), { ...waiting, balance: 0 });
    expect(message).toContain('Paid in full');
    expect(message).not.toContain('To pay on collection');
  });

  it('does not count days for something finished today, or greet a walk-in by that name', () => {
    const message = collectionReminderMessage(shop(), { ...waiting, customerName: 'Walk-in Customer', readySince: NOW - 3_600_000, daysWaiting: 0 });
    expect(message.startsWith('Hello,')).toBe(true);
    expect(message).toContain('is ready for collection.');
  });

  it('opens the customer\'s own chat, or asks who when there is no number', () => {
    expect(collectionReminderLink(shop(), waiting)).toMatch(/^https:\/\/wa\.me\/2348012345678\?text=Hello%20Ada/);
    expect(collectionReminderLink(shop(), { ...waiting, customerPhone: '' })).toMatch(/^https:\/\/wa\.me\/\?text=/);
  });
});

describe('where it shows', () => {
  const record = (stage: string, readyDaysAgo: number) => ({
    stage, balance: 0, total: 3_000, promisedAt: null, overdue: false, createdAt: NOW - 20 * DAY,
    steps: stage === 'ready' ? [{ stage: 'ready', at: new Date(NOW - readyDaysAgo * DAY).toISOString() }] : [],
    order: {},
  }) as any;

  it('Home knows how long the longest has waited', () => {
    const board = laundryDayBoard([record('ready', 2), record('ready', 11), record('washing', 0)], NOW);
    expect(board.ready).toBe(2);
    expect(board.longestReadyDays).toBe(11);
  });

  it('Home says so once it is a week, and Flow lists them', () => {
    expect(readSource('src/components/laundry/LaundryDayBoard.tsx')).toContain('board.longestReadyDays >= LONG_WAIT_DAYS');
    expect(LONG_WAIT_DAYS).toBe(7);
    const overview = readSource('src/components/manager/OverviewTab.tsx');
    expect(overview).toContain('<UncollectedCard');
    // Under the money owed, which is the other pile not in hand yet.
    expect(overview.indexOf('<UncollectedCard')).toBeGreaterThan(overview.indexOf('<MoneyOwedCard'));
  });

  it('never sends anything itself: it opens WhatsApp for a person to press send', () => {
    const card = readSource('src/components/manager/UncollectedCard.tsx');
    expect(card).toContain('window.open(collectionReminderLink(store, bundle)');
    expect(card).not.toMatch(/fetch\(|supabase/);
  });
});
