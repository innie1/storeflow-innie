import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_FLOW_NOTIFICATION_PREFERENCES,
  getFlowNotificationPreferences,
  readFlowNotificationPreferencesSync,
  saveFlowNotificationPreferences,
  setNotificationPreferencesShop,
  isTimeInQuietHours,
} from '@/lib/notification-preferences';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * One phone, two shops, one set of switches.
 *
 * Every notification preference - the master switch, order alerts, Flow
 * check-ins, insights, debt reminders, sounds, critical alerts and quiet hours
 * - was stored once for the whole device under the key 'global'. A merchant
 * who turned off order alerts for the quiet second shop turned them off for
 * the busy one they live on, and muting a shop they were not working in muted
 * the one they were.
 *
 * These are per shop now. There is no IndexedDB in this environment, which is
 * the same position a phone in private mode is in: the localStorage mirror is
 * what answers, and it has to be right on its own.
 */

const laundry = { id: 'uuid-laundry', accessCode: 'LAU001', storeName: 'Sunshine Laundry', businessType: 'laundry' } as unknown as StoreData;
const provisions = { id: 'uuid-provisions', accessCode: 'PRO002', storeName: 'Corner Provisions', businessType: 'provision' } as unknown as StoreData;

const LEGACY_KEY = 'storeflow_notification_preferences_v1';

beforeEach(() => {
  localStorage.clear();
  setNotificationPreferencesShop(null);
});

afterEach(() => {
  localStorage.clear();
  setNotificationPreferencesShop(null);
  vi.restoreAllMocks();
});

describe('each shop keeps its own notification switches', () => {
  it('does not carry one shop\'s master switch into another', async () => {
    setNotificationPreferencesShop(laundry);
    await saveFlowNotificationPreferences({ enabled: false });
    expect((await getFlowNotificationPreferences()).enabled).toBe(false);

    // The busy shop must still be able to reach its owner.
    setNotificationPreferencesShop(provisions);
    expect((await getFlowNotificationPreferences()).enabled).toBe(true);

    setNotificationPreferencesShop(laundry);
    expect((await getFlowNotificationPreferences()).enabled).toBe(false);
  });

  it('keeps every one of the ten switches apart, not just the master', async () => {
    setNotificationPreferencesShop(laundry);
    await saveFlowNotificationPreferences({
      orders: false,
      flowCheckins: false,
      businessInsights: false,
      debtReminders: false,
      sounds: false,
      criticalAlerts: false,
      quietHoursEnabled: false,
      quietStart: '20:00',
      quietEnd: '05:30',
    });

    setNotificationPreferencesShop(provisions);
    const other = await getFlowNotificationPreferences();
    expect(other.orders).toBe(true);
    expect(other.flowCheckins).toBe(true);
    expect(other.businessInsights).toBe(true);
    expect(other.debtReminders).toBe(true);
    expect(other.sounds).toBe(true);
    expect(other.criticalAlerts).toBe(true);
    expect(other.quietHoursEnabled).toBe(true);
    expect(other.quietStart).toBe(DEFAULT_FLOW_NOTIFICATION_PREFERENCES.quietStart);
    expect(other.quietEnd).toBe(DEFAULT_FLOW_NOTIFICATION_PREFERENCES.quietEnd);
  });

  it('lets two shops keep different quiet hours', async () => {
    setNotificationPreferencesShop(laundry);
    await saveFlowNotificationPreferences({ quietStart: '21:00', quietEnd: '06:00' });
    setNotificationPreferencesShop(provisions);
    await saveFlowNotificationPreferences({ quietStart: '23:30', quietEnd: '08:00' });

    setNotificationPreferencesShop(laundry);
    expect((await getFlowNotificationPreferences()).quietStart).toBe('21:00');
    setNotificationPreferencesShop(provisions);
    expect((await getFlowNotificationPreferences()).quietStart).toBe('23:30');
  });

  it('answers for the open shop without waiting, which is how check-ins ask', async () => {
    setNotificationPreferencesShop(laundry);
    await saveFlowNotificationPreferences({ flowCheckins: false });
    expect(readFlowNotificationPreferencesSync().flowCheckins).toBe(false);

    setNotificationPreferencesShop(provisions);
    expect(readFlowNotificationPreferencesSync().flowCheckins).toBe(true);
  });

  it('keys by the shop, not by its trade, so settings survive a change of trade', async () => {
    setNotificationPreferencesShop(laundry);
    await saveFlowNotificationPreferences({ debtReminders: false });

    // The same shop, run as something else. A switch somebody deliberately
    // turned off is a settled preference, not a half-finished draft.
    const nowAGameCentre = { ...laundry, businessType: 'games' } as unknown as StoreData;
    setNotificationPreferencesShop(nowAGameCentre);
    expect((await getFlowNotificationPreferences()).debtReminders).toBe(false);
  });
});

describe('what a phone already had set is not lost', () => {
  it('starts a shop from the switches the phone was using before', async () => {
    // Written by the version where there was one set for the whole device.
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ ...DEFAULT_FLOW_NOTIFICATION_PREFERENCES, orders: false, quietStart: '19:45' }));

    setNotificationPreferencesShop(laundry);
    const inherited = await getFlowNotificationPreferences();
    expect(inherited.orders).toBe(false);
    expect(inherited.quietStart).toBe('19:45');
  });

  it('lets a shop diverge from what it inherited, without dragging the others with it', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ ...DEFAULT_FLOW_NOTIFICATION_PREFERENCES, orders: false }));

    setNotificationPreferencesShop(laundry);
    await saveFlowNotificationPreferences({ orders: true });
    expect((await getFlowNotificationPreferences()).orders).toBe(true);

    // The other shop still starts where the phone was, not where the laundry
    // has since moved to.
    setNotificationPreferencesShop(provisions);
    expect((await getFlowNotificationPreferences()).orders).toBe(false);
  });

  it('takes a copy for the shop rather than pointing at the old record forever', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ ...DEFAULT_FLOW_NOTIFICATION_PREFERENCES, sounds: false }));
    setNotificationPreferencesShop(laundry);

    // Written down as this shop's own, so that whatever later becomes of the
    // shared record - another tab, a clean-up - this shop keeps what it
    // started with.
    const own = localStorage.getItem('storeflow_notification_preferences_v2_uuid-laundry');
    expect(own, 'the shop did not take its own copy').toBeTruthy();
    expect(JSON.parse(own as string).sounds).toBe(false);

    localStorage.removeItem(LEGACY_KEY);
    expect((await getFlowNotificationPreferences()).sounds).toBe(false);
  });

  it('falls back to the defaults for a shop on a phone that had nothing set', async () => {
    setNotificationPreferencesShop(provisions);
    expect(await getFlowNotificationPreferences()).toEqual(DEFAULT_FLOW_NOTIFICATION_PREFERENCES);
  });

  it('saves nothing at all when no shop is open', async () => {
    setNotificationPreferencesShop(null);
    await saveFlowNotificationPreferences({ enabled: false });
    expect(localStorage.length).toBe(0);
  });
});

describe('the worker that shows the pushes is told which shop is open', () => {
  it('hands it the open shop\'s switches when the shop changes', async () => {
    const posted: unknown[] = [];
    const active = { postMessage: (message: unknown) => posted.push(message) };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ active }) },
    });

    setNotificationPreferencesShop(laundry);
    await saveFlowNotificationPreferences({ orders: false });
    setNotificationPreferencesShop(provisions);
    await Promise.resolve();
    await Promise.resolve();

    const preferences = posted
      .map(message => (message as { type?: string; preferences?: { orders?: boolean } }))
      .filter(message => message.type === 'SET_NOTIFICATION_PREFERENCES');
    expect(preferences.length).toBeGreaterThan(0);
    // The last thing it was told is the shop now open, which is the shop whose
    // pushes this device receives.
    expect(preferences[preferences.length - 1].preferences?.orders).toBe(true);
  });

  it('still reads one record, so the worker did not have to change', () => {
    // The worker gates a push on 'global'. Keeping that as a mirror of the
    // open shop is what let this change stay on the phone's side.
    expect(readSource('src/sw.ts')).toContain("objectStore('preferences').get('global')");
    expect(readSource('src/lib/notification-preferences.ts')).toContain("const DELIVERY_KEY = 'global'");
  });
});

/**
 * Flow's check-ins are the notifications the phone raises for itself, and they
 * ask the same switches. They used to read the shared record directly, so a
 * shop that had turned them off silenced Flow everywhere.
 */
describe('Flow\'s own check-ins follow the shop that is open', () => {
  const check = { id: 'low-stock', title: 'Before the day gets busy…', body: '2 products are running low.', tone: 'warning' as const, priority: 90 };

  function stubNotifications(): unknown[] {
    const raised: unknown[] = [];
    class FakeNotification {
      static permission = 'granted';
      constructor(title: string, options?: unknown) { raised.push({ title, options }); }
    }
    Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: FakeNotification });
    return raised;
  }

  it('stays quiet for the shop that turned them off, and speaks for the one that did not', async () => {
    const raised = stubNotifications();
    const { notifyFlowCheckIn } = await import('@/lib/flow-checkins');

    // Quiet hours are set explicitly rather than left to the default, so this
    // does not pass or fail depending on the hour it is run at.
    setNotificationPreferencesShop(laundry);
    await saveFlowNotificationPreferences({ flowCheckins: false, quietHoursEnabled: false });
    setNotificationPreferencesShop(provisions);
    await saveFlowNotificationPreferences({ flowCheckins: true, quietHoursEnabled: false });

    setNotificationPreferencesShop(laundry);
    expect(notifyFlowCheckIn(check), 'the laundry turned check-ins off').toBe(false);
    expect(raised).toHaveLength(0);

    setNotificationPreferencesShop(provisions);
    expect(notifyFlowCheckIn({ ...check, id: 'low-stock-other' }), 'the other shop did not').toBe(true);
    expect(raised).toHaveLength(1);
  });
});

describe('quiet hours still mean what they meant', () => {
  it('covers an evening that runs past midnight', () => {
    expect(isTimeInQuietHours(new Date('2026-09-16T23:30:00'), '22:00', '07:00')).toBe(true);
    expect(isTimeInQuietHours(new Date('2026-09-16T06:30:00'), '22:00', '07:00')).toBe(true);
    expect(isTimeInQuietHours(new Date('2026-09-16T12:00:00'), '22:00', '07:00')).toBe(false);
  });
});
