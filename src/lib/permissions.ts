/**
 * What each role is allowed to do.
 *
 * Permission used to be decided per screen, or not at all. SalesHistory took
 * no user at all, so it showed its all-time takings and its delete control to
 * whoever opened it — and "Reports" in the More sheet led an attendant
 * straight there. Dashboard had no branch for attendants either, so they fell
 * through to `default` and were handed the owner's dashboard.
 *
 * The rule the shop owner asked for is simple: only an owner or a manager sees
 * the business and changes it. Everyone else does their job. This is that rule
 * in one place, so a new screen asks rather than guesses.
 */

export type Capability =
  /** Remove records — sales, expenses, history entries, products. */
  | 'delete'
  /** See takings, profit, margins, lifetime totals. */
  | 'money'
  /** Change what things cost. */
  | 'prices'
  /** Add, edit or remove staff. */
  | 'staff'
  /** Store settings and anything that reshapes the business. */
  | 'settings';

export interface ActingUser {
  role?: string;
  permissions?: {
    sales?: boolean;
    inventory?: boolean;
    reports?: boolean;
    settings?: boolean;
  };
}

const OWNER_ONLY: Capability[] = ['delete', 'money', 'prices', 'staff', 'settings'];
// Staff accounts are the owner's alone: StaffManagement gates every add, edit
// and delete on the owner, so listing 'staff' here claimed a power a manager
// has never actually had.
const MANAGER: Capability[] = ['delete', 'money', 'prices'];

/**
 * Roles that run the shop. Everything below this line does a job in it.
 */
export function isManagement(user: ActingUser | null | undefined): boolean {
  const role = String(user?.role || '').toLowerCase();
  return role === 'owner' || role === 'manager';
}

export function can(user: ActingUser | null | undefined, capability: Capability): boolean {
  const role = String(user?.role || '').toLowerCase();

  // No user means the app is running before sign-in resolves. Deny rather than
  // assume, so a slow load never briefly shows takings to a shop floor.
  if (!role) return false;

  if (role === 'owner') return OWNER_ONLY.includes(capability);
  if (role === 'manager') return MANAGER.includes(capability);

  // An accountant is trusted with the figures and nothing else: they report on
  // the business, they do not reshape it, and they do not delete its records.
  if (role === 'accountant') return capability === 'money';

  // A custom role gets exactly the boxes that were ticked when it was made.
  // Reports covers seeing money; nothing here grants deletion, which stays a
  // management act however the role was configured.
  if (role === 'custom') {
    if (capability === 'money') return !!user?.permissions?.reports;
    if (capability === 'prices') return !!user?.permissions?.inventory;
    if (capability === 'settings') return !!user?.permissions?.settings;
    return false;
  }

  // attendant, cashier, inventory, supervisor: none of them delete, price, or
  // see the shop's takings.
  return false;
}

/** Convenience for the common three. */
export const canDelete = (user: ActingUser | null | undefined) => can(user, 'delete');
export const canSeeMoney = (user: ActingUser | null | undefined) => can(user, 'money');
export const canSetPrices = (user: ActingUser | null | undefined) => can(user, 'prices');

/**
 * Whether a role may open a tab at all.
 *
 * This lived inside Index.tsx, so only the navigation could consult it. The
 * simple home screen could not, and filtered its own tiles by business
 * template alone — which is how an attendant kept a "Services" tile for a
 * screen their role forbids, and saw it flash up before being moved off.
 *
 * Access is decided by role, not by the permission flags on the account:
 * those are only ever read for a custom role.
 */
export function canOpenTab(tabId: string, user: ActingUser | null | undefined): boolean {
  if (!user) return false;
  const role = String((user as { role?: string }).role || '');
  if (role === 'owner') return true;
  switch (role) {
    case 'manager':
      return tabId !== 'settings' && tabId !== 'activity-log';
    case 'cashier':
      return ['dashboard', 'sales', 'history', 'cash-drawer', 'communication-center'].includes(tabId);
    // The shop floor: take the work in, move it along, hand it back, and look
    // up whoever dropped it off. No prices, no takings, no staff, no settings.
    //
    // 'history' is deliberately absent: it is the money ledger, with the
    // takings for every period and a delete control on each row. Records
    // covers everything an attendant actually needs to look up.
    case 'attendant':
      return ['dashboard', 'orders', 'laundry-records', 'customers', 'communication-center'].includes(tabId);
    case 'inventory':
      return ['dashboard', 'inventory', 'suppliers', 'marketplace', 'wishlist', 'communication-center'].includes(tabId);
    // The money roles need the ledger they report on.
    case 'accountant':
      return ['dashboard', 'expenses', 'roi', 'pending', 'history', 'cash-drawer', 'communication-center'].includes(tabId);
    // A supervisor oversees the shop floor, so they need to see the floor.
    case 'supervisor':
      return ['dashboard', 'orders', 'laundry-records', 'customers', 'staff', 'history', 'cash-drawer', 'communication-center'].includes(tabId);
    case 'custom': {
      if (tabId === 'dashboard') return true;
      // "Sales access" has to mean taking work in at a service business too,
      // or a custom role there could reach nothing but the dashboard.
      if (['sales', 'history', 'cash-drawer', 'orders', 'laundry-records', 'customers'].includes(tabId) && user.permissions?.sales) return true;
      if (['inventory', 'suppliers', 'marketplace', 'wishlist'].includes(tabId) && user.permissions?.inventory) return true;
      if (['roi', 'expenses', 'pending'].includes(tabId) && user.permissions?.reports) return true;
      if (tabId === 'settings' && user.permissions?.settings) return true;
      if (tabId === 'communication-center') return true;
      return false;
    }
    default:
      return false;
  }
}
