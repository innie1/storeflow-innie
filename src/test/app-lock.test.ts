import { beforeEach, describe, expect, it } from 'vitest';
import {
  attemptsLeft,
  clearPin,
  hasPin,
  lockoutRemaining,
  MAX_ATTEMPTS,
  setPin,
  verifyPin,
} from '@/lib/app-lock';
import { readSource } from './helpers/source';

/**
 * A lock that locks.
 *
 * App Lock and PIN Lock were two switches on the Security screen that saved
 * their state and did nothing else - the worst version of a security control,
 * because it tells a shop it is locked when it is not, and somebody might
 * leave the counter phone somewhere they otherwise would not have.
 *
 * What this is: a screen lock over a local-first app, so a passer-by cannot
 * pick up the phone and read the day's takings. What it is not: encryption.
 * The records are in this device's localStorage and anyone who can unlock the
 * phone at the operating-system level can read them with the browser's own
 * tools. That distinction is written into the module and is worth keeping
 * written down.
 */

describe('setting a PIN', () => {
  beforeEach(() => { localStorage.clear(); clearPin(); });

  it('starts with none', () => {
    expect(hasPin()).toBe(false);
  });

  it('takes four digits', async () => {
    expect(await setPin('1234')).toBe(true);
    expect(hasPin()).toBe(true);
  });

  it('refuses anything that is not four digits', async () => {
    expect(await setPin('123')).toBe(false);
    expect(await setPin('12345')).toBe(false);
    expect(await setPin('12a4')).toBe(false);
    expect(hasPin()).toBe(false);
  });

  it('never writes the PIN down', async () => {
    /*
     * A PIN stored as itself is not a PIN, it is a note saying what the PIN
     * is - and this is a device somebody else may be holding.
     */
    await setPin('4821');
    const stored = String(localStorage.getItem('storeflow_lock_pin'));
    expect(stored).not.toContain('4821');
    expect(stored).toContain('salt');
  });

  it('salts, so two shops with the same PIN do not share a hash', async () => {
    await setPin('1111');
    const first = String(localStorage.getItem('storeflow_lock_pin'));
    clearPin();
    await setPin('1111');
    expect(String(localStorage.getItem('storeflow_lock_pin'))).not.toBe(first);
  });
});

describe('unlocking', () => {
  beforeEach(async () => { localStorage.clear(); clearPin(); await setPin('4821'); });

  it('accepts the PIN', async () => {
    expect((await verifyPin('4821')).ok).toBe(true);
  });

  it('refuses anything else', async () => {
    expect((await verifyPin('1234')).ok).toBe(false);
  });

  it('counts down the tries so nobody is guessing in the dark', async () => {
    await verifyPin('0000');
    expect(attemptsLeft()).toBe(MAX_ATTEMPTS - 1);
  });

  it('forgets the failures once the right PIN arrives', async () => {
    await verifyPin('0000');
    await verifyPin('4821');
    expect(attemptsLeft()).toBe(MAX_ATTEMPTS);
  });

  it('stops accepting guesses after five wrong ones', async () => {
    /*
     * Four digits is ten thousand possibilities, which is nothing to a script.
     * The stretching makes each guess cost work; this makes the number of
     * guesses small. A person at a counter gets five, which is the threat this
     * is actually for.
     */
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await verifyPin('0000');
    expect(lockoutRemaining()).toBeGreaterThan(0);
  });

  it('refuses even the right PIN while it is waiting', async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await verifyPin('0000');
    const result = await verifyPin('4821');
    expect(result.ok).toBe(false);
    expect(result.waitMs).toBeGreaterThan(0);
  });

  it('lets a shop with no PIN straight through', async () => {
    // Nothing was asked for, so nothing is withheld.
    clearPin();
    expect((await verifyPin('0000')).ok).toBe(true);
  });
});

describe('the fingerprint is a convenience, not the lock', () => {
  const lock = readSource('src/lib/app-lock.ts');
  const screen = readSource('src/components/AppLockScreen.tsx');
  const settings = readSource('src/components/Settings.tsx');

  it('cannot be set up before a PIN exists', () => {
    // A reader that will not take - wet hands, a cut, a new phone - has to
    // leave a way in that is not "reinstall and lose the shop's records".
    expect(lock).toContain('if (!fingerprintSupported() || !hasPin()) return false;');
    expect(settings).toContain('{pinSet && fingerprintSupported() && (');
  });

  it('leaves the PIN pad on screen underneath it', () => {
    expect(screen).toContain('Use fingerprint');
    expect(screen).toContain('KEYS.map');
  });
});

describe('what the lock claims', () => {
  it('says in the module that it is not encryption', () => {
    /*
     * Kept as a test because it is the sentence most likely to be quietly
     * deleted, and a merchant who believes the data is encrypted will treat
     * the phone differently from one who knows it is not.
     */
    const lock = readSource('src/lib/app-lock.ts');
    expect(lock).toContain('WHAT IT IS NOT');
    expect(lock).toContain('localStorage');
  });

  it('relocks after the app has been away, not only on a cold start', () => {
    // A PWA is backgrounded far more often than it is closed.
    expect(readSource('src/pages/Index.tsx')).toContain('RELOCK_AFTER_MS');
    expect(readSource('src/pages/Index.tsx')).toContain('appLockActive() && away > RELOCK_AFTER_MS');
  });
});
