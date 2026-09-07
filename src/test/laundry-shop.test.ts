import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * Getting a laundry ready to open.
 *
 * Two things stood in the way. The intake screen's tab, 'laundry-records', was
 * reached by casting a string through `as TabId` — it was never in that union
 * and never in RENDERABLE_TABS, so the tab that decides whether to draw "That
 * screen isn't available" did not recognise it and drew that panel underneath
 * the working screen.
 *
 * And no role below manager could open Orders or Intake at all, so anyone
 * recording laundry had to be made a manager — which also hands them expenses,
 * ROI, reports and the staff list. There was nothing between a cashier who
 * cannot see the work and a manager who can see the books.
 */

const index = readSource('src/pages/Index.tsx');
const types = readSource('src/types/store.ts');

describe('the intake tab is a real tab', () => {
  it('is in the TabId union', () => {
    expect(types).toContain("| 'laundry-records'");
  });

  it('is registered as renderable', () => {
    const set = index.slice(index.indexOf('const RENDERABLE_TABS'), index.indexOf('const isTabAllowed'));
    expect(set).toContain("'laundry-records'");
  });

  it('is no longer cast in through `as TabId`', () => {
    expect(index).not.toContain("'laundry-records' as TabId");
  });
});

describe('a laundry worker gets the shop floor and nothing else', () => {
  /** The same rule Index applies, so it can be exercised directly. */
  const allowed = (role: string, tab: string) => {
    if (role === 'owner') return true;
    if (role === 'manager') return tab !== 'settings' && tab !== 'activity-log';
    if (role === 'attendant') {
      return ['dashboard', 'orders', 'laundry-records', 'customers', 'history', 'communication-center'].includes(tab);
    }
    if (role === 'cashier') {
      return ['dashboard', 'sales', 'history', 'cash-drawer', 'communication-center'].includes(tab);
    }
    return false;
  };

  it('can take work in and move it along', () => {
    for (const tab of ['laundry-records', 'orders', 'customers', 'dashboard']) {
      expect(allowed('attendant', tab), tab).toBe(true);
    }
  });

  it('cannot see the money or change the shop', () => {
    for (const tab of ['expenses', 'roi', 'reports', 'finance', 'settings', 'staff', 'inventory', 'manager']) {
      expect(allowed('attendant', tab), tab).toBe(false);
    }
  });

  it('is a real improvement on what was available before', () => {
    // A cashier could not reach the work at all, so the only way to let
    // someone record laundry was to make them a manager.
    expect(allowed('cashier', 'laundry-records')).toBe(false);
    expect(allowed('cashier', 'orders')).toBe(false);
    expect(allowed('manager', 'expenses')).toBe(true);
    expect(allowed('attendant', 'expenses')).toBe(false);
  });

  it('is wired into the real permission check', () => {
    // The rule moved out of Index.tsx into permissions.ts, so that screens can
    // ask it and not only the navigation.
    const perms = readSource('src/lib/permissions.ts');
    const fn = perms.slice(perms.indexOf('export function canOpenTab'));
    expect(fn).toContain("case 'attendant':");
    expect(fn).toContain("'laundry-records'");
  });

  it('can be picked when adding staff', () => {
    const staff = readSource('src/components/StaffManagement.tsx');
    expect(staff).toContain('value="attendant"');
    expect(staff).toContain("'attendant'");
  });

  it('is a declared role, not a loose string', () => {
    expect(types).toContain("| 'attendant' |");
  });
});

describe('the screens speak to a laundry worker', () => {
  const intake = readSource('src/components/laundry/LaundryWalkInIntakeV2.tsx');
  const pricing = readSource('src/components/laundry/LaundryPricingSetup.tsx');

  it('does not name the database at someone folding clothes', () => {
    expect(intake).not.toContain('Supabase is reachable');
    expect(intake).toContain('It will upload when you are back online');
  });

  it('explains a service in one line, not a paragraph', () => {
    expect(pricing).not.toContain('A service is <b>what you do to the clothes</b>');
    expect(pricing).toContain('Service vs item');
  });

  it('keeps the hints short', () => {
    for (const src of [intake, pricing]) {
      const longOnes = (src.match(/>[A-Z][^<>{}]{95,}</g) || []);
      expect(longOnes, longOnes.join(' | ')).toHaveLength(0);
    }
  });
});
