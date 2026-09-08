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

describe('a setting only appears where its trade can use it', () => {
  /*
   * Reported: the settings page is full of things that belong to a provision
   * shop. It was - the screen was written for a retailer and shown to every
   * trade, so a laundry got a low-stock threshold, restock suggestions,
   * backorder selling, retail and wholesale price tiers, and a default profit
   * margin on a business that has no cost price to take a margin over.
   *
   * The test each one has to pass is not "is this a service business" - which
   * is a list of trade names somebody has to remember to update - but "does
   * this shop have the thing the setting configures".
   */
  const settings = readSource('src/components/Settings.tsx');

  it('asks the business template rather than keeping its own list of trades', () => {
    expect(settings).toContain("hasBusinessModule(store, 'inventory')");
  });

  it('keeps stock settings for shops with stock', () => {
    for (const gated of ['<SettingTile', '<ToggleRow label="Product Suggestions"']) {
      expect(settings).toContain(`{keepsStock && ${gated}`);
    }
  });

  it('does not offer margin arithmetic to a business with no cost price', () => {
    // A laundry does not buy a wash in and sell it on. What it needs is the
    // pricing advisor on its own price list, which is a different thing.
    const pricing = settings.slice(settings.indexOf("view === 'pricing'"));
    const section = pricing.slice(0, pricing.indexOf('Automatic Checkout Discounts'));
    expect(section).toContain('{keepsStock && <>');
  });

  it('still offers discounts to everybody, because any shop runs a promotion', () => {
    const pricing = settings.slice(settings.indexOf("view === 'pricing'"));
    const discounts = pricing.slice(pricing.indexOf('Automatic Checkout Discounts'));
    expect(discounts).toContain('Enable Automatic Discount');
    expect(discounts.slice(0, discounts.indexOf('Enable Automatic Discount'))).not.toContain('keepsStock');
  });

  it('does not offer two price tiers on one item to a service', () => {
    expect(settings).toContain('{keepsStock && <ToggleRow\n              label="Enable Retail Pricing Mode"');
  });
});

describe('one back button, and it goes up rather than out', () => {
  const settings = readSource('src/components/Settings.tsx');
  const index = readSource('src/pages/Index.tsx');

  it('the sub-page no longer draws a second one', () => {
    // Two arrows a centimetre apart that looked alike and did different
    // things: the outer one left Settings entirely and landed on Home.
    const subPage = settings.slice(settings.indexOf('function SubPage'), settings.indexOf('function ProductQRRow'));
    expect(subPage).not.toContain('aria-label="Back"');
  });

  it('the page back steps up a level while there is one', () => {
    expect(index).toContain('if (settingsSubView) window.history.back(); else setTab(\'dashboard\');');
  });

  it('and Settings says when there is one', () => {
    expect(settings).toContain("onSubViewChange?.(view !== 'home')");
  });
});

describe('the shop picture is the same picture everywhere', () => {
  it('is one component rather than two copies that disagreed', () => {
    /*
     * The menu tile fell back to a shop emoji and the profile screen you
     * reached by tapping it fell back to a drawn icon, so a shop with neither
     * a photo nor a logo saw one picture, tapped it, and found another.
     */
    const settings = readSource('src/components/Settings.tsx');
    // Both the menu tile and the profile screen draw it through the one
    // component now. (The emoji still appears in the printable receipt
    // templates, which are a different thing entirely.)
    expect(settings.match(/<StoreAvatar/g)?.length).toBeGreaterThanOrEqual(2);
    expect(readSource('src/components/StoreAvatar.tsx')).toContain('<Store className');
  });
});

describe('help that describes this app', () => {
  const settings = readSource('src/components/Settings.tsx');

  it('covers the screens a service shop actually uses', () => {
    // The help had fourteen articles and every one was about stock.
    for (const topic of ['Taking a bundle in', 'The customer ticket', 'What to do today', 'Closing the day', 'What the month must take']) {
      expect(settings).toContain(topic);
    }
  });

  it('keeps the service articles off a retailer\'s help screen', () => {
    expect(settings).toContain('...(serviceBusiness ? [');
  });

  it('does not overclaim what the app lock does', () => {
    expect(settings).toContain('It does not encrypt the records');
  });
});

describe('the profile names the trade, not the bucket', () => {
  it('reads the business template rather than store.category', () => {
    /*
     * A laundry's own profile told it that it was a Retail business. Retail is
     * one of four buckets the app sorts shops into; it is not what the shop
     * is, and its owner has no reason to know the bucket exists.
     */
    const settings = readSource('src/components/Settings.tsx');
    expect(settings).toContain('const tradeTemplate = getBusinessTemplate(store);');
    expect(settings).not.toContain("{store.category || 'Retail'}");
  });
});

describe('what the shop typed at sign-up reaches its profile', () => {
  const access = readSource('src/components/StoreAccess.tsx');

  it('asks for the owner\'s name, which nothing ever did', () => {
    /*
     * The profile screen had an Owner Name field and nothing ever filled it,
     * because nothing ever asked - so a merchant who had just typed their
     * shop name, email and phone opened their profile and found a blank where
     * their own name should be, which reads as the app having lost it.
     */
    expect(access).toContain('Your Name');
    expect(access).toContain('setOwnerName');
  });

  it('writes it onto the profile beside the email and phone', () => {
    const profileWrite = access.slice(access.indexOf('email: recoveryEmail.trim()'));
    expect(profileWrite.slice(0, 400)).toContain('ownerName:');
    expect(profileWrite.slice(0, 400)).toContain('phone: recoveryPhone.trim()');
  });

  it('does not wipe a name the shop already had', () => {
    // Securing a store a second time must not blank what is there.
    expect(access).toContain('ownerName.trim() || loadedStore.profile?.ownerName');
  });
});
