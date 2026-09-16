import type { StaffMember, StoreData } from '@/types/store';

/**
 * Who is signed in, and whether they are signed in *here*.
 *
 * The app keeps one signed-in person for the device, while a shop keeps its own
 * team. Switching shops changed the shop and left the person alone, so the new
 * shop's screens could draw with the old shop's role for a moment, and a worker
 * whose record was not in the new shop was signed out of the app altogether -
 * losing the shop they were actually working in.
 *
 * So the question is asked once, here, at the moment of the switch: who is this
 * person in the shop being opened?
 */

export interface ActiveUser {
  id?: string;
  name?: string;
  role?: string;
  permissions?: StaffMember['permissions'];
}

const ACTIVE_USER_KEY = 'storeflow_active_user';

export type StoreIdentity =
  | { ok: true; user: ActiveUser | null }
  | { ok: false; reason: 'not-on-the-team' };

/**
 * The signed-in person, with the retired 'admin' role moved across.
 *
 * 'admin' was offered in the staff form and implemented nowhere, so anybody
 * left holding it reached no screens at all. Manager is what it always meant,
 * and the session is rewritten as it is read so the device stops carrying it.
 */
export function readActiveUser(): ActiveUser | null {
  try {
    const raw = localStorage.getItem(ACTIVE_USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (user?.role !== 'admin') return user;
    const migrated = { ...user, role: 'manager' };
    localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return null;
  }
}

export function writeActiveUser(user: ActiveUser | null): void {
  try {
    if (user) localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(ACTIVE_USER_KEY);
  } catch { /* private mode */ }
}

/**
 * Who this person is in that shop.
 *
 * The owner owns the device and every shop on it. A worker is only a worker
 * where their record is, and their role comes from that shop's own team list -
 * a manager in one shop may be an attendant in another, and the screens must
 * follow the shop being opened, not the one being left.
 */
export function identityForStore(
  store: Pick<StoreData, 'staffMembers'> | null | undefined,
  user: ActiveUser | null | undefined,
): StoreIdentity {
  // Nobody signed in: the shop's own sign-in decides who this is.
  if (!user) return { ok: true, user: null };

  // The owner's session carries no staff id; it is the device's own owner.
  if (!user.id || String(user.role || '').toLowerCase() === 'owner') return { ok: true, user };

  const record = (store?.staffMembers || []).find(member => member.id === user.id);
  if (!record) return { ok: false, reason: 'not-on-the-team' };

  return {
    ok: true,
    user: { id: record.id, name: record.name, role: record.role, permissions: record.permissions },
  };
}

/**
 * How long a shop stays open on this device before it asks again.
 *
 * This and the session below were part of the Settings screen. They are read
 * at startup, long before anybody opens Settings, so keeping them there meant
 * the biggest screen in the app had to load before the app could tell whether
 * a shop was already open.
 */
export type LockTimer = '1h' | '4h' | '8h' | '12h' | 'never';

const LOCK_TIMER_KEY = 'storeflow_lock_timer';
const SESSION_KEY = 'storeflow_session';

interface SessionData { accessCode: string; loginAt: number; lockTimer: LockTimer; }

export function saveLockTimer(timer: LockTimer) { localStorage.setItem(LOCK_TIMER_KEY, timer); }
export function getLockTimer(): LockTimer { return (localStorage.getItem(LOCK_TIMER_KEY) as LockTimer) || '1h'; }

export function saveSession(accessCode: string) {
  const s: SessionData = { accessCode, loginAt: Date.now(), lockTimer: getLockTimer() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(ACTIVE_USER_KEY);
}

export function getActiveSession(): string | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session: SessionData = JSON.parse(raw);
    const timer = getLockTimer();
    if (timer === 'never') return session.accessCode;
    let maxMs = 3600000;
    if (timer === '4h') maxMs = 4 * 3600000;
    else if (timer === '8h') maxMs = 8 * 3600000;
    else if (timer === '12h') maxMs = 12 * 3600000;
    if (Date.now() - session.loginAt > maxMs) {
      clearSession();
      return null;
    }
    return session.accessCode;
  } catch { return null; }
}
