import { describe, expect, it } from 'vitest';
import type { StoreData } from '@/types/store';
import { allowedNotifications, wantsNotification } from '@/lib/notification-gate';
import { monthlyFixedCosts } from '@/lib/service-breakeven';
import { readSource } from './helpers/source';

/**
 * Switches that move and change something.
 *
 * Reported plainly: "all those toggles that are supposed to be working are not
 * working". They were not. Nineteen of the fifty-four settings the app offers
 * were written to storage, shown with the right state, and read by nothing -
 * a merchant could turn off low-stock alerts and keep getting low-stock
 * alerts, which teaches them the settings screen is decoration and the app
 * does not listen.
 *
 * The gates below are deliberately in one place each. Five gates for
 * notifications would be five chances to forget one, and the sixth producer
 * added next month would forget by default.
 */

const store = (settings: Record<string, unknown>) =>
  ({ managerSettings: settings }) as unknown as StoreData;

describe('the notification switches are honoured', () => {
  it('lets everything through for a shop that has never opened them', () => {
    // All eight default on. A shop that has not asked for silence gets told
    // when a bundle goes late.
    expect(wantsNotification(store({}), 'lowStock')).toBe(true);
    expect(wantsNotification(undefined, 'alert')).toBe(true);
  });

  it('stops the kind that was switched off', () => {
    expect(wantsNotification(store({ notifyLowStock: false }), 'lowStock')).toBe(false);
  });

  it('stops only that kind', () => {
    const quiet = store({ notifyLowStock: false });
    expect(wantsNotification(quiet, 'alert')).toBe(true);
    expect(wantsNotification(quiet, 'customerRequest')).toBe(true);
  });

  it('lets an unclassified notification through rather than swallowing it', () => {
    /*
     * Failing towards showing somebody something is safer than failing
     * towards silence: a notification nobody sees is a bundle nobody washes.
     */
    expect(wantsNotification(store({ notifyAlerts: false }), undefined)).toBe(true);
  });

  it('filters a batch by what each one is', () => {
    const kept = allowedNotifications(store({ notifyLowStock: false }), [
      { id: 'a', category: 'lowStock' },
      { id: 'b', category: 'alert' },
      { id: 'c' },
    ] as any);
    expect(kept.map(n => n.id)).toEqual(['b', 'c']);
  });

  it('is applied where notifications are raised, not where they are shown', () => {
    // A notification that exists but is hidden still buzzes a phone.
    expect(readSource('src/lib/manager-intel.ts')).toContain('allowedNotifications(store, newNotifications)');
    expect(readSource('src/components/Manager.tsx')).toContain('allowedNotifications(store, fresh)');
    expect(readSource('src/pages/Index.tsx')).toContain("wantsNotification(prev, 'lowStock')");
  });
});

describe('the appearance switches reach the whole app', () => {
  const css = readSource('src/index.css');

  it('reduce motion stops things travelling and spinning', () => {
    // The app has a mascot that walks off the screen, confetti and pulsing
    // rings. Somebody turning this on is usually asking because the movement
    // makes them ill or their phone cannot keep up.
    expect(css).toContain('.prefers-less-motion');
    expect(css).toContain('animation-duration: 0.001ms !important');
  });

  it('compact mode tightens the spacing and leaves the tap targets alone', () => {
    const compact = css.slice(css.indexOf('.compact-mode'));
    expect(compact).toContain('padding');
    // A smaller button is not what was asked for and would make the app
    // harder to use, not denser.
    expect(compact).not.toContain('font-size');
  });

  it('is applied from one place, like the theme', () => {
    expect(readSource('src/pages/Index.tsx')).toContain('applyDisplayPreferences(store)');
  });
});

describe('the voice switch stops the app talking', () => {
  it('is gated inside the one function that speaks', () => {
    // Four call sites would be four chances to forget one.
    const voice = readSource('src/lib/flow-voice.ts');
    expect(voice).toContain('if (!voiceAllowed && !options.force) return;');
    expect(readSource('src/pages/Index.tsx')).toContain('setFlowVoiceEnabled(');
  });

  it('still lets the settings screen preview a voice', () => {
    // Choosing a voice has to let you hear it, even with voice switched off.
    expect(readSource('src/components/Settings.tsx')).toContain('force: true');
  });
});

describe('show product profit is honoured', () => {
  it('hides what the shop makes when it is switched off', () => {
    const inventory = readSource('src/components/Inventory.tsx');
    expect(inventory).toContain("store.managerSettings?.showProductProfit !== false");
    expect(inventory).toContain('{showProfit && <div');
  });
});

describe('the rent on the profile reaches the figures', () => {
  // September, so a rent expense dated the 3rd falls inside it.
  const window = {
    start: new Date('2026-09-01').getTime(),
    end: new Date('2026-10-01').getTime(),
    daysInMonth: 30,
    dayOfMonth: 8,
  };

  const shop = (over: Record<string, unknown>) => ({
    expenses: [], recurringBills: [], staffMembers: [], ...over,
  }) as unknown as StoreData;

  it('counts rent entered under Edit Profile', () => {
    /*
     * There were two places to enter rent and only one counted. A shop that
     * filled in Store Rent had that money reach a rent panel and nothing
     * else, so the break-even target was computed as though the largest bill
     * the shop pays did not exist - low, reachable, and wrong.
     */
    const withRent = shop({ profile: { rent: { isRented: true, amount: 150000, frequency: 'monthly' } } });
    expect(monthlyFixedCosts(withRent, window)).toBe(150000);
  });

  it('spreads a yearly rent across the year', () => {
    const yearly = shop({ profile: { rent: { isRented: true, amount: 1200000, frequency: 'yearly' } } });
    expect(monthlyFixedCosts(yearly, window)).toBe(100000);
  });

  it('does not charge a shop twice for rent it has already paid', () => {
    // The opposite error, and just as wrong.
    const paid = shop({
      profile: { rent: { isRented: true, amount: 150000, frequency: 'monthly' } },
      expenses: [{ amount: 150000, category: 'Rent', date: '2026-09-03T10:00:00.000Z' }],
    });
    expect(monthlyFixedCosts(paid, window)).toBe(150000);
  });

  it('counts the rest when only part of the rent has been paid', () => {
    const part = shop({
      profile: { rent: { isRented: true, amount: 150000, frequency: 'monthly' } },
      expenses: [{ amount: 50000, category: 'Rent', date: '2026-09-03T10:00:00.000Z' }],
    });
    expect(monthlyFixedCosts(part, window)).toBe(150000);
  });

  it('ignores a shop that owns its premises', () => {
    const owned = shop({ profile: { rent: { isRented: false, amount: 150000 } } });
    expect(monthlyFixedCosts(owned, window)).toBe(0);
  });
});
