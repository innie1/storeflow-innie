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

describe('the audit of the staff area', () => {
  const index = readSource('src/pages/Index.tsx');
  const staff = readSource('src/components/StaffManagement.tsx');

  it('gives admin a definition, instead of dropping it to no tabs at all', () => {
    // 'admin' was offered in the staff form and had no case in isTabAllowed,
    // so it hit `default: return false` and reached nothing whatsoever.
    expect(index).toContain("case 'admin':");
    expect(readSource('src/components/Dashboard.tsx')).toContain("case 'admin':");
  });

  it('no longer offers admin for new staff, since manager already means that', () => {
    expect(staff).not.toContain('value="admin"');
  });

  it('lets a supervisor see the floor they supervise', () => {
    // They had the staff list and a cash drawer and nothing else, which on a
    // laundry is a read-only list and a till that does not exist.
    expect(index).toContain("'dashboard', 'orders', 'laundry-records', 'customers', 'staff'");
  });

  it('gives the accountant the ledger they report on', () => {
    expect(index).toContain("'expenses', 'roi', 'pending', 'history'");
  });

  it('lets a custom role take work in at a service business', () => {
    // Without orders/records here, a custom role at a laundry could reach
    // nothing but the dashboard however its boxes were ticked.
    expect(index).toContain("'cash-drawer', 'orders', 'laundry-records', 'customers'");
  });

  it('keeps the cash drawer to shops that have a till', () => {
    // A laundry has the finance module but never opens a drawer.
    expect(readSource('src/lib/business-runtime.ts')).toContain("'cash-drawer': ['sales']");
    expect(readSource('src/lib/business-runtime.ts')).toContain('export function runsATill');
  });

  it('stops offering tick-boxes that only a custom role reads', () => {
    // Every named role's access is fixed in isTabAllowed and ignores
    // permissions entirely, so ticking "Reports" for an attendant did nothing.
    expect(staff).toContain("{role === 'custom' ? (");
    expect(staff).toContain('function roleOpens');
  });

  it('does not promise a manager the staff list they cannot change', () => {
    const perms = readSource('src/lib/permissions.ts');
    expect(perms).toContain("const MANAGER: Capability[] = ['delete', 'money', 'prices'];");
    expect(staff).toContain("currentUser?.role === 'owner'");
  });
});
