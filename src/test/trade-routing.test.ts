import { describe, expect, it } from 'vitest';
import type { StoreData, TabId } from '@/types/store';
import { isBusinessTabAllowed, TAB_POLICY } from '@/lib/business-runtime';
import { readSource } from './helpers/source';

/**
 * Which screens a trade may open.
 *
 * The rule used to be a partial list where anything missing was allowed, so
 * laundry-records - a screen only a laundry has - was open in every trade, and
 * each new trade-only screen was open until somebody remembered to restrict
 * it. A screen reached by a link, or remembered from the last shop, could draw
 * another trade's work in this one.
 */

const shop = (type: string): StoreData => ({
  storeName: type, accessCode: type.toUpperCase().slice(0, 6), storeType: type, businessType: type,
  products: [], sales: [], expenses: [], customers: [], pendingPayments: [], createdAt: new Date(0).toISOString(),
} as unknown as StoreData);

const laundry = shop('laundry');
const provision = shop('provision');
const games = shop('games');
const barber = shop('barber');

describe('every screen says which trade it belongs to', () => {
  it('leaves none of them unclassified', () => {
    // TypeScript keeps this complete - TAB_POLICY is a Record over every TabId,
    // so a new screen will not compile until it is classified. This is the
    // same check at run time, for anyone reading the test.
    for (const [tabId, policy] of Object.entries(TAB_POLICY)) {
      expect(policy, tabId).toBeTruthy();
    }
    expect(Object.keys(TAB_POLICY).length).toBeGreaterThan(30);
  });

  it('closes a screen nobody has classified, rather than opening it', () => {
    expect(isBusinessTabAllowed(provision, 'some-new-screen' as TabId)).toBe(false);
  });
});

describe('trade-only screens', () => {
  it('keeps laundry records to a laundry', () => {
    expect(isBusinessTabAllowed(laundry, 'laundry-records')).toBe(true);
    for (const other of [provision, games, barber]) {
      expect(isBusinessTabAllowed(other, 'laundry-records'), String(other.storeType)).toBe(false);
    }
  });

  it('keeps the games screens to a games shop', () => {
    for (const tabId of ['games-dashboard', 'games-history', 'games-analytics', 'games-settings'] as TabId[]) {
      expect(isBusinessTabAllowed(games, tabId), tabId).toBe(true);
      expect(isBusinessTabAllowed(laundry, tabId), tabId).toBe(false);
      expect(isBusinessTabAllowed(provision, tabId), tabId).toBe(false);
    }
  });

  it('keeps the cash drawer to shops that run a till', () => {
    expect(isBusinessTabAllowed(provision, 'cash-drawer')).toBe(true);
    expect(isBusinessTabAllowed(laundry, 'cash-drawer')).toBe(false);
  });

  it('still opens what every trade has', () => {
    for (const store of [laundry, provision, games, barber]) {
      for (const tabId of ['dashboard', 'settings', 'manager', 'communication-center', 'customers'] as TabId[]) {
        expect(isBusinessTabAllowed(store, tabId), `${store.storeType}:${tabId}`).toBe(true);
      }
    }
  });

  it('opens the price list wherever there is one to keep', () => {
    // A shop with stock, and a service shop that prices its work.
    expect(isBusinessTabAllowed(provision, 'inventory')).toBe(true);
    expect(isBusinessTabAllowed(laundry, 'inventory')).toBe(true);
    expect(isBusinessTabAllowed(barber, 'inventory')).toBe(true);
    // A games shop sells time and its template keeps no price list. That is
    // what the app already did; this rule only writes it down.
    expect(isBusinessTabAllowed(games, 'inventory')).toBe(false);
  });
});

describe('a screen from somewhere else', () => {
  const index = readSource('src/pages/Index.tsx');

  it('is checked against the trade, not only against the worker', () => {
    expect(index).toContain('if (!isTabAllowed(tab, currentUser) || !isBusinessTabAllowed(store, tab)) setTab(\'dashboard\');');
  });

  it('is forgotten when the shop changes', () => {
    expect(index).toContain("sessionStorage.removeItem('storeflow-active-tab');");
    expect(index).toContain('if (!previous || previous === key) return;');
  });
});
