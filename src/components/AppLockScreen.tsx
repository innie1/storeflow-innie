import { useCallback, useEffect, useState } from 'react';
import { Delete, Fingerprint, Lock } from 'lucide-react';
import {
  fingerprintEnrolled,
  lockoutRemaining,
  MAX_ATTEMPTS,
  PIN_LENGTH,
  verifyFingerprint,
  verifyPin,
} from '@/lib/app-lock';

/**
 * The way back in.
 *
 * Fingerprint first when the phone has one, because it is one touch and the
 * shop is usually holding something. The PIN pad is always underneath it,
 * never behind a menu: a fingerprint that will not read - wet hands, a cut, a
 * cold morning - has to leave a way in that is right there.
 *
 * Big keys. This gets used by somebody with a customer waiting and a phone in
 * one hand, and a keypad that needs care is a keypad that gets the PIN wrong.
 */

interface Props {
  storeName: string;
  onUnlock: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

export default function AppLockScreen({ storeName, onUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [wait, setWait] = useState(() => lockoutRemaining());
  const [checking, setChecking] = useState(false);

  const canUseFingerprint = fingerprintEnrolled();

  // Count the wait down, so somebody locked out can see it ending rather than
  // tapping a dead pad and wondering if the app has frozen.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setInterval(() => setWait(lockoutRemaining()), 500);
    return () => clearInterval(timer);
  }, [wait]);

  const tryFingerprint = useCallback(async () => {
    if (!canUseFingerprint) return;
    if (await verifyFingerprint()) onUnlock();
    // A refusal says nothing: they either cancelled, which they know about, or
    // the reader did not take, which the phone has already told them.
  }, [canUseFingerprint, onUnlock]);

  // Offered on arrival, so the common case is one touch and no tapping.
  useEffect(() => { void tryFingerprint(); }, [tryFingerprint]);

  const submit = useCallback(async (candidate: string) => {
    setChecking(true);
    const result = await verifyPin(candidate);
    setChecking(false);
    if (result.ok) { onUnlock(); return; }

    setPin('');
    if (result.waitMs) {
      setWait(result.waitMs);
      setError('Too many tries. Wait a moment.');
    } else {
      const left = result.attemptsLeft ?? MAX_ATTEMPTS;
      setError(left === 1 ? '1 try left' : `${left} tries left`);
    }
  }, [onUnlock]);

  const press = (key: string) => {
    if (wait > 0 || checking) return;
    setError('');
    if (key === 'back') { setPin(value => value.slice(0, -1)); return; }
    if (!key) return;

    const next = (pin + key).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-xs text-center">
        <div className="w-12 h-12 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <p className="font-display font-black text-lg mt-3">{storeName || 'Locked'}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {wait > 0 ? `Try again in ${Math.ceil(wait / 1000)}s` : 'Enter your PIN to continue'}
        </p>

        {/* The four dots, so the count is obvious without reading anything. */}
        <div className="flex items-center justify-center gap-3 mt-5" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`w-3.5 h-3.5 rounded-full border transition-colors ${
                i < pin.length ? 'bg-primary border-primary' : 'border-border'
              }`}
            />
          ))}
        </div>

        <p className={`text-[11px] mt-3 h-4 ${error ? 'text-destructive' : 'text-transparent'}`}>{error || '.'}</p>

        <div className="grid grid-cols-3 gap-2.5 mt-2">
          {KEYS.map((key, index) => (
            key === ''
              ? <span key={index} />
              : (
                <button
                  key={index}
                  onClick={() => press(key)}
                  disabled={wait > 0 || checking}
                  aria-label={key === 'back' ? 'Delete' : key}
                  className="h-16 rounded-2xl bg-surface-2 border border-border font-display font-black text-xl flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
                >
                  {key === 'back' ? <Delete className="w-5 h-5" /> : key}
                </button>
              )
          ))}
        </div>

        {/* Underneath, never instead. A fingerprint that will not read has to
            leave the PIN right there rather than behind a menu. */}
        {canUseFingerprint && (
          <button
            onClick={() => void tryFingerprint()}
            disabled={wait > 0}
            className="mt-5 inline-flex items-center gap-2 text-xs font-display font-bold text-primary disabled:opacity-40"
          >
            <Fingerprint className="w-4 h-4" /> Use fingerprint
          </button>
        )}
      </div>
    </div>
  );
}
