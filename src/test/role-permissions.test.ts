import { describe, expect, it } from 'vitest';
import { can, canDelete, canSeeMoney, canSetPrices, isManagement } from '@/lib/permissions';
import { readSource } from './helpers/source';

/**
 * What a worker is allowed to do in someone else's shop.
 *
 * Three faults, all found on one laundry with one attendant.
 *
 * Dashboard's switch had no branch for 'attendant', so the role fell through
 * to `default` and was handed the *owner's* dashboard: store health, lifetime
 * revenue and "Log Expense".
 *
 * SalesHistory took no user at all, so it showed every period's takings and a
 * delete control on each row to whoever opened it — and "Reports" in the More
 * sheet led an attendant straight there.
 *
 * And the setup guide navigated whoever was signed in to the price list, a
 * screen an attendant's role forbids, then held them on it.
 *
 * The rule asked for: only an owner or a manager sees the business and changes
 * it. Everyone else does their job.
 */

const owner = { role: 'owner' };
const manager = { role: 'manager' };
const attendant = { role: 'attendant' };
const cashier = { role: 'cashier' };
const accountant = { role: 'accountant' };

describe('who runs the shop', () => {
  it('is the owner and the manager, and nobody else', () => {
    expect(isManagement(owner)).toBe(true);
    expect(isManagement(manager)).toBe(true);
    expect(isManagement(attendant)).toBe(false);
    expect(isManagement(cashier)).toBe(false);
    expect(isManagement(accountant)).toBe(false);
  });
});

describe('deleting records', () => {
  it('is for management only', () => {
    expect(canDelete(owner)).toBe(true);
    expect(canDelete(manager)).toBe(true);
  });

  it('is closed to everyone on the shop floor', () => {
    for (const user of [attendant, cashier, { role: 'inventory' }, { role: 'supervisor' }]) {
      expect(canDelete(user), user.role).toBe(false);
    }
  });

  it('stays closed to an accountant, who reports rather than removes', () => {
    expect(canDelete(accountant)).toBe(false);
  });

  it('cannot be granted by ticking boxes on a custom role', () => {
    const everything = { role: 'custom', permissions: { sales: true, inventory: true, reports: true, settings: true } };
    expect(canDelete(everything)).toBe(false);
  });
});

describe('seeing the takings', () => {
  it('is for management and the accountant', () => {
    expect(canSeeMoney(owner)).toBe(true);
    expect(canSeeMoney(manager)).toBe(true);
    expect(canSeeMoney(accountant)).toBe(true);
  });

  it('is closed to an attendant', () => {
    expect(canSeeMoney(attendant)).toBe(false);
  });

  it('follows the reports box on a custom role', () => {
    expect(canSeeMoney({ role: 'custom', permissions: { reports: true } })).toBe(true);
    expect(canSeeMoney({ role: 'custom', permissions: { reports: false } })).toBe(false);
  });
});

describe('setting prices', () => {
  it('is management, or a custom role trusted with inventory', () => {
    expect(canSetPrices(owner)).toBe(true);
    expect(canSetPrices(manager)).toBe(true);
    expect(canSetPrices({ role: 'custom', permissions: { inventory: true } })).toBe(true);
    expect(canSetPrices(attendant)).toBe(false);
  });
});

describe('before anyone has signed in', () => {
  it('grants nothing, rather than assuming', () => {
    // A slow load must never flash the shop's takings at whoever is holding
    // the phone.
    for (const capability of ['delete', 'money', 'prices', 'staff', 'settings'] as const) {
      expect(can(null, capability), capability).toBe(false);
      expect(can(undefined, capability), capability).toBe(false);
      expect(can({}, capability), capability).toBe(false);
    }
  });
});

describe('the screens actually ask', () => {
  it('history hides its delete controls and its totals', () => {
    const history = readSource('src/components/SalesHistory.tsx');
    expect(history).toContain('const mayDelete = canDelete(currentUser)');
    expect(history).toContain('const maySeeMoney = canSeeMoney(currentUser)');
    expect(history).toContain('{mayDelete && (entry.type');
  });

  it('an attendant cannot reach the money ledger at all', () => {
    const index = readSource('src/pages/Index.tsx');
    const attendantLine = index
      .split('\n')
      .find(line => line.includes("return ['dashboard', 'orders', 'laundry-records'"));
    expect(attendantLine).toBeTruthy();
    expect(attendantLine).not.toContain("'history'");
  });

  it('attendants get their own dashboard rather than the owner default', () => {
    const dashboard = readSource('src/components/Dashboard.tsx');
    expect(dashboard).toContain("case 'attendant':");
    expect(dashboard).toContain('AttendantDashboard');
  });

  it('the setup guide only runs for the owner, and never navigates past a role', () => {
    const index = readSource('src/pages/Index.tsx');
    expect(index).toContain("currentUser?.role === 'owner' && (");
    expect(index).toContain('if (isTabAllowed(next as TabId, currentUser)) setTab(next as TabId)');
  });
});
