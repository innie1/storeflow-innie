import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * Reaching a closed phone without a backend.
 *
 * Web Push needs a server: the VAPID private key cannot ship in the app, and
 * something has to be awake to sign the request that wakes the device. That is
 * why savings and shrinkage needed a sender adding to the edge function.
 *
 * But both notices are worked out entirely from data already on the phone, so
 * the *content* needs no server — only something awake to show it. Periodic
 * background sync is that: Chrome wakes the service worker on its own
 * schedule, and it reads what the app queued. It is Chrome-and-Android only,
 * only for an installed app, and fires when the browser chooses, so it
 * supplements push rather than replacing it.
 */

const sw = readSource('src/sw.ts');
const lib = readSource('src/lib/push-notifications.ts');
const index = readSource('src/pages/Index.tsx');

describe('a notice can be shown while the app is merely running', () => {
  it('posts one straight from the registration, with no server involved', () => {
    expect(lib).toContain('export async function showLocalNotification');
    expect(lib).toContain('registration.showNotification');
  });

  it('carries the same buttons a pushed one would', () => {
    const fn = lib.slice(lib.indexOf('showLocalNotification'), lib.indexOf('enableBackgroundNotices'));
    expect(fn).toContain("action: 'acknowledge'");
    expect(fn).toContain('I understand');
    // The worker's click handler keys on data.category, so the button behaves
    // identically however the notification got there.
    expect(fn).toContain('category: options.category');
  });

  it('does not stack a duplicate under one already showing', () => {
    const fn = lib.slice(lib.indexOf('showLocalNotification'), lib.indexOf('enableBackgroundNotices'));
    expect(fn).toContain('getNotifications({ tag: options.tag })');
  });
});

describe('a notice can survive the app being closed, without a backend', () => {
  it('has somewhere to wait', () => {
    expect(sw).toContain("'queued'");
    expect(sw).toContain('QUEUE_NOTICE');
    expect(sw).toContain('readQueuedNotices');
  });

  it('is shown when the browser wakes the worker', () => {
    expect(sw).toContain("addEventListener('periodicsync'");
    expect(sw).toContain("event.tag !== 'storeflow-notices'");
    expect(sw).toContain('drainQueuedNotices');
  });

  it('empties the queue so nothing is shown twice', () => {
    const drain = sw.slice(sw.indexOf('async function drainQueuedNotices'), sw.indexOf("addEventListener('periodicsync'"));
    expect(drain).toContain('await writeQueuedNotices([])');
  });

  it('drops stale news rather than announcing last week', () => {
    expect(sw).toContain('QUEUED_NOTICE_TTL_MS');
    const drain = sw.slice(sw.indexOf('async function drainQueuedNotices'), sw.indexOf("addEventListener('periodicsync'"));
    expect(drain).toContain('QUEUED_NOTICE_TTL_MS');
  });

  it('is registered by the app once there is a store', () => {
    expect(lib).toContain('periodicSync.register');
    expect(lib).toContain("'storeflow-notices'");
    expect(index).toContain('enableBackgroundNotices()');
  });
});

describe('the database migration does not break what was already there', () => {
  it('opens one version from one place', () => {
    // A second opener still asking for version 1 would throw VersionError and
    // take notification preferences down with it.
    expect(sw).toContain('const DB_VERSION = 2');
    expect((sw.match(/indexedDB\.open\(/g) || []).length).toBe(1);
  });

  it('creates a store only when it is missing', () => {
    expect(sw).toContain('objectStoreNames.contains(name)');
  });
});

describe('the merchant can still switch these off', () => {
  it('honours the business-insights preference', () => {
    // Otherwise the only way to stop them would be revoking notifications for
    // the whole app.
    const allowed = sw.slice(sw.indexOf('function allowed'), sw.indexOf('/** Tells every open window'));
    expect(allowed).toContain("category==='savings'");
    expect(allowed).toContain("category==='stock_loss'");
    expect(allowed).toContain('prefs.businessInsights');
  });

  it('still respects quiet hours', () => {
    const allowed = sw.slice(sw.indexOf('function allowed'), sw.indexOf('/** Tells every open window'));
    expect(allowed).toContain('quietNow');
  });
});

describe('acknowledging removes every copy', () => {
  it('drops the one waiting in the queue too', () => {
    // Otherwise a copy already handed to the worker would surface days after
    // the merchant said they had understood it.
    expect(index).toContain('dropBackgroundNotice');
    expect(sw).toContain('DROP_QUEUED_NOTICE');
  });
});
