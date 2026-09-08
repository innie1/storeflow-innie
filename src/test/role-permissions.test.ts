import { describe, expect, it } from 'vitest';
import { can, canDelete, canOpenTab, canSeeMoney, canSetPrices, isManagement } from '@/lib/permissions';
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
    // History is the takings for every period with a delete control on each
    // row. Records covers everything an attendant needs to look up.
    expect(canOpenTab('history', attendant)).toBe(false);
    expect(canOpenTab('laundry-records', attendant)).toBe(true);
    expect(canOpenTab('inventory', attendant)).toBe(false);
    expect(canOpenTab('settings', attendant)).toBe(false);
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

  it('has retired the admin role everywhere', () => {
    // It was offered in the staff form and implemented nowhere: no case in
    // isTabAllowed, so it hit `default: return false` and reached no tabs at
    // all. Manager is what it always meant.
    expect(staff).not.toContain('value="admin"');
    expect(index).not.toContain("case 'admin':");
    expect(readSource('src/components/Dashboard.tsx')).not.toContain("case 'admin':");
    expect(readSource('src/lib/permissions.ts')).not.toContain("'admin'");
  });

  it('moves anyone already on it across, rather than locking them out', () => {
    // Two places hold a role: the staff list, and the session of whoever is
    // signed in right now. Migrating only the first would strand the very
    // person using it.
    expect(readSource('src/lib/store-data.ts')).toContain('function retireAdminRole');
    expect(readSource('src/lib/store-data.ts')).toContain('store = retireAdminRole(store)');
    expect(index).toContain('const readActiveUser');
    expect(index).toContain("user?.role !== 'admin'");
  });

  it('lets a supervisor see the floor they supervise', () => {
    // They had the staff list and a cash drawer and nothing else, which on a
    // laundry is a read-only list and a till that does not exist.
    const supervisor = { role: 'supervisor' };
    for (const tabId of ['orders', 'laundry-records', 'customers', 'staff']) {
      expect(canOpenTab(tabId, supervisor), tabId).toBe(true);
    }
    expect(canOpenTab('settings', supervisor)).toBe(false);
  });

  it('gives the accountant the ledger they report on', () => {
    for (const tabId of ['expenses', 'roi', 'pending', 'history']) {
      expect(canOpenTab(tabId, accountant), tabId).toBe(true);
    }
  });

  it('lets a custom role take work in at a service business', () => {
    // Without these, a custom role at a laundry could reach nothing but the
    // dashboard however its boxes were ticked.
    const custom = { role: 'custom', permissions: { sales: true } };
    for (const tabId of ['orders', 'laundry-records', 'customers']) {
      expect(canOpenTab(tabId, custom), tabId).toBe(true);
    }
    expect(canOpenTab('inventory', custom)).toBe(false);
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

describe('changing a role reaches the device already using it', () => {
  const index = readSource('src/pages/Index.tsx');

  it('re-reads the role from the staff record instead of trusting the session', () => {
    // storeflow_active_user is a snapshot taken at sign-in, so changing a role
    // in Staff Accounts did nothing to the phone already signed in: the
    // promotion never arrived, and the demotion never took effect.
    expect(index).toContain('(store.staffMembers || []).find(member => member.id === currentUser.id)');
    expect(index).toContain("localStorage.setItem('storeflow_active_user', JSON.stringify(refreshed))");
  });

  it('signs out a staff member whose record has been deleted', () => {
    expect(index).toContain("localStorage.removeItem('storeflow_active_user')");
    expect(index).toContain('if (!record) {');
  });

  it('moves anyone off a screen their role cannot open', () => {
    // Nothing checked, so a tab reached any other way rendered its screen
    // anyway - which is how a worker saw the price list flash up.
    expect(index).toContain("if (tab !== 'dashboard' && !isTabAllowed(tab, currentUser)) setTab('dashboard')");
  });
});

describe('the simple home screen asks the role too', () => {
  const home = readSource('src/components/simple/BusinessSimpleHome.tsx');

  it('filters its tiles by role, not only by business template', () => {
    // It checked isBusinessTabAllowed alone, so an attendant kept a
    // "Services" tile for the price list - tapped it, and watched the screen
    // appear and vanish as the tab guard put them back.
    expect(home).toContain('canOpenTab(action.tab, currentUser)');
    /*
     * One gate, because there is now one grid.
     *
     * A separate pair of Orders and Services buttons used to sit under the
     * tiles, each with its own role check - and under a bottom navigation that
     * already offered both. Three routes to two screens. The pair is gone, so
     * the only check left to make is the one covering every tile.
     */
    expect(home).not.toContain("canOpenTab('orders', currentUser)");
  });

  it('does not show takings to the shop floor', () => {
    // The card behind this gate now offers yesterday, today, fourteen days and
    // all time rather than today alone, which makes the gate matter more, not
    // less: an attendant would otherwise be holding the shop's whole history.
    expect(home).toContain('canSeeMoney(currentUser) && <RevenueCard');
  });

  it('but does show the shop floor the work', () => {
    // Late, due today and ready are the attendant's job. Only the money owed
    // inside the day board is held back, which the board decides for itself.
    const board = readSource('src/components/laundry/LaundryDayBoard.tsx');
    expect(board).toContain('canSeeMoney && board.owed > 0');
  });

  it('keeps the tab rule in one place, where a screen can ask it', () => {
    // It lived inside Index.tsx, so only the navigation could consult it.
    expect(readSource('src/lib/permissions.ts')).toContain('export function canOpenTab');
    expect(readSource('src/pages/Index.tsx')).toContain('canOpenTab(tabId, user)');
  });
});
