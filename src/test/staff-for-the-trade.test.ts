import { describe, expect, it } from 'vitest';
import { isBusinessTabAllowed, runsATill } from '@/lib/business-runtime';
import type { StoreData } from '@/types/store';
import { readSource } from './helpers/source';

/**
 * Adding a worker, in a shop that has no till.
 *
 * A laundry owner reported two things: they could not find where to create a
 * role for their staff, and when they did create one the app "just took me to
 * a provision business".
 *
 * The second was the screen itself. Staff Accounts opened with a Shift
 * Controller, an "Opening drawer cash (₦)" box and an "Open Cashier Shift"
 * button above the thing they came for, and the role list offered Cashier
 * first. A laundry has no cash drawer to float or tally, so the whole top of
 * the screen was somebody else's shop.
 *
 * The first was routing: the only way in was Staff Accounts, sixth in a flat
 * list under More.
 */

const staff = readSource('src/components/StaffManagement.tsx');
const home = readSource('src/components/simple/BusinessSimpleHome.tsx');

describe('the till only appears where there is a till', () => {
  it('asks the business template rather than keeping its own list of trades', () => {
    // This screen used to carry its own CASH_DRAWER_TRADES array, a second
    // copy of a judgement the templates already make. A drawer belongs to a
    // till, and the 'sales' module is what says a shop has one.
    expect(staff).toContain("import { runsATill } from '@/lib/business-runtime'");
    expect(staff).toContain('const hasTill = runsATill(store)');
    expect(staff).not.toContain('CASH_DRAWER_TRADES');
  });

  it('counts a provision shop as having a till, and a laundry as not', () => {
    expect(runsATill({ storeType: 'provision', category: 'retail' } as any)).toBe(true);
    expect(runsATill({ storeType: 'laundry', category: 'retail' } as any)).toBe(false);
  });

  it('hides the shift controller and the drawer tally without one', () => {
    // Both sections are gated on the same flag, so neither can come back on
    // its own the way the tally did.
    expect(staff).toContain('{hasTill && (');
    expect(staff.split('{hasTill && (').length - 1).toBe(2);
  });

  it('never offers a cashier role to a shop with no till', () => {
    // The default role is picked from the same test, so a laundry owner is
    // not handed "cashier" before they touch the dropdown.
    expect(staff).toContain("runsATill(store) ? 'cashier' : 'attendant'");
    expect(staff).toContain('{hasTill && <option value="cashier"');
  });

  it('says what the screen is in the words of the trade', () => {
    expect(staff).toContain("{hasTill ? 'Staff Accounts & Shifts' : 'Staff Accounts'}");
    // Not "Registered Staff Members", not "app access modules".
    expect(staff).not.toContain('Registered Staff Members');
    expect(staff).not.toContain('app access modules');
    expect(staff).not.toContain('Module Access Controls');
  });

  it('does not talk about inventory to a shop that keeps none', () => {
    expect(staff).toContain("{hasTill ? 'Inventory access' : 'Price list'}");
  });
});

describe('a laundry owner can find it', () => {
  it('puts Staff in the home screen quick actions', () => {
    expect(home).toContain("label: 'Staff'");
    expect(home).toContain("tab: 'staff' as TabId");
  });

  it('offers it only to the owner, who is the only one who can use it', () => {
    expect(home).toContain("currentUser?.role === 'owner'");
  });

  it('gives it its own icon rather than reusing the Customers one', () => {
    // Both sat in the same four-tile grid; two identical icons read as one
    // repeated tile.
    expect(home).toContain("label: 'Staff', icon: <Briefcase");
    expect(home).toContain('<Users className="w-6 h-6" />');
  });

  it('is reachable at all for a laundry', () => {
    // A shortcut to a tab the runtime filters out would render nothing.
    const laundry: Partial<StoreData> = { storeType: 'laundry', category: 'retail' };
    expect(isBusinessTabAllowed(laundry, 'staff')).toBe(true);
  });
});
