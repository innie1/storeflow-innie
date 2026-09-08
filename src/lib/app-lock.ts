/**
 * A PIN, and a fingerprint if the phone has one.
 *
 * Both switches existed on the Security screen and neither did anything, which
 * is the worst version of a security control: it says the shop is locked and
 * the shop is not.
 *
 * WHAT THIS IS. A screen lock over a local-first app. It stops somebody
 * picking up the counter phone while the attendant is in the back and reading
 * the day's takings, which is the thing that actually happens in a shop.
 *
 * WHAT IT IS NOT. Encryption. The shop's data sits in this device's
 * localStorage and anyone who can unlock the phone at the operating-system
 * level can read it with the browser's own tools. Saying otherwise would be
 * selling a lock with no door behind it, and a merchant who believed it might
 * leave the phone somewhere they otherwise would not.
 *
 * The PIN is four digits, which is ten thousand possibilities - guessable in
 * no time at all by anything automated. Two things make it worth having
 * anyway: it is stretched with PBKDF2 so each guess costs real work, and the
 * app stops accepting guesses after five wrong ones. A person standing at a
 * counter gets five tries, which is the threat this is for.
 */

const PIN_KEY = 'storeflow_lock_pin';
const ATTEMPTS_KEY = 'storeflow_lock_attempts';
const WEBAUTHN_KEY = 'storeflow_lock_credential';

/** Enough to make ten thousand guesses cost something on a mid-range phone. */
const ITERATIONS = 150_000;

/** Five tries, then a wait. Long enough to be sure; short enough to forgive. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

export const PIN_LENGTH = 4;

interface StoredPin {
  salt: string;
  hash: string;
  iterations: number;
}

interface Attempts {
  count: number;
  until: number;
}

const bytesToHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');

function subtle(): SubtleCrypto | null {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  return crypto.subtle;
}

/**
 * PBKDF2 rather than a bare hash.
 *
 * A single SHA-256 of a four-digit PIN is ten thousand hashes to try, which is
 * less than a second. Stretching does not make a short PIN a good secret, but
 * it does mean somebody has to want it.
 */
async function derive(pin: string, salt: string, iterations: number): Promise<string | null> {
  const api = subtle();
  if (!api) return null;
  const encoder = new TextEncoder();
  const key = await api.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await api.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return bytesToHex(bits);
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function hasPin(): boolean {
  return !!read<StoredPin>(PIN_KEY);
}

/**
 * Store the PIN as a hash and a salt, never as itself.
 *
 * A PIN written down in localStorage is not a PIN, it is a note saying what
 * the PIN is.
 */
export async function setPin(pin: string): Promise<boolean> {
  if (!/^\d{4}$/.test(pin)) return false;
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const hash = await derive(pin, salt, ITERATIONS);
  if (!hash) return false;
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash, iterations: ITERATIONS } satisfies StoredPin));
    localStorage.removeItem(ATTEMPTS_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearPin(): void {
  try {
    localStorage.removeItem(PIN_KEY);
    localStorage.removeItem(ATTEMPTS_KEY);
    localStorage.removeItem(WEBAUTHN_KEY);
  } catch { /* private mode */ }
}

/** How long the shop must wait before trying again, in ms. Zero when free. */
export function lockoutRemaining(now: number = Date.now()): number {
  const attempts = read<Attempts>(ATTEMPTS_KEY);
  if (!attempts?.until) return 0;
  return Math.max(0, attempts.until - now);
}

export function attemptsLeft(): number {
  const attempts = read<Attempts>(ATTEMPTS_KEY);
  return Math.max(0, MAX_ATTEMPTS - (attempts?.count || 0));
}

function recordFailure(now: number): void {
  const attempts = read<Attempts>(ATTEMPTS_KEY) || { count: 0, until: 0 };
  const count = attempts.count + 1;
  const until = count >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0;
  try {
    // Reset the count when the wait is imposed: the wait is the punishment,
    // and a shop that has served it starts clean rather than being locked out
    // for good after five mistakes across a week.
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ count: until ? 0 : count, until }));
  } catch { /* private mode */ }
}

export interface PinResult {
  ok: boolean;
  /** Set when the guess was refused without being checked. */
  waitMs?: number;
  attemptsLeft?: number;
}

export async function verifyPin(pin: string, now: number = Date.now()): Promise<PinResult> {
  const waiting = lockoutRemaining(now);
  if (waiting > 0) return { ok: false, waitMs: waiting };

  const stored = read<StoredPin>(PIN_KEY);
  if (!stored) return { ok: true }; // No PIN set: nothing to check against.

  const hash = await derive(pin, stored.salt, stored.iterations || ITERATIONS);
  if (hash && hash === stored.hash) {
    try { localStorage.removeItem(ATTEMPTS_KEY); } catch { /* private mode */ }
    return { ok: true };
  }

  recordFailure(now);
  return { ok: false, attemptsLeft: attemptsLeft(), waitMs: lockoutRemaining(now) };
}

/* ── Fingerprint ────────────────────────────────────────────────────────── */

/**
 * The phone's own unlock gesture, through WebAuthn.
 *
 * A convenience over the PIN, never a replacement for it: the PIN has to exist
 * first, because a fingerprint that fails - wet hands, a new phone, a browser
 * that does not support it - has to leave a way in that is not "reinstall the
 * app and lose the shop's records".
 */
export function fingerprintSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof PublicKeyCredential !== 'undefined'
    && !!navigator.credentials;
}

export function fingerprintEnrolled(): boolean {
  try { return !!localStorage.getItem(WEBAUTHN_KEY); } catch { return false; }
}

/** Register this device's gesture. Requires a PIN to already exist. */
export async function enrollFingerprint(storeName: string): Promise<boolean> {
  if (!fingerprintSupported() || !hasPin()) return false;
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'StoreFlow' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: storeName || 'StoreFlow',
          displayName: storeName || 'StoreFlow',
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        // The gesture on this device, not a security key from a drawer.
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60_000,
      },
    }) as PublicKeyCredential | null;
    if (!credential) return false;
    localStorage.setItem(WEBAUTHN_KEY, bytesToHex(credential.rawId));
    return true;
  } catch {
    return false;
  }
}

export function forgetFingerprint(): void {
  try { localStorage.removeItem(WEBAUTHN_KEY); } catch { /* private mode */ }
}

/**
 * Ask for the gesture.
 *
 * Returns false for every failure, including the merchant cancelling, and the
 * screen simply stays on the PIN pad. There is nothing to explain: they know
 * they cancelled.
 */
export async function verifyFingerprint(): Promise<boolean> {
  if (!fingerprintSupported() || !fingerprintEnrolled()) return false;
  try {
    const raw = localStorage.getItem(WEBAUTHN_KEY) || '';
    const id = new Uint8Array(raw.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return !!assertion;
  } catch {
    return false;
  }
}

/** Whether the app should be showing a lock screen at all. */
export function appLockActive(): boolean {
  return hasPin();
}
