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
const MANAGER: Capability[] = ['delete', 'money', 'prices', 'staff'];

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
