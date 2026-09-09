import { useEffect, useState } from 'react';

interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  /** Makes the toast tappable — for a message that offers to do something. */
  onTap?: () => void;
}

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

/** Long enough to read a sentence, short enough not to sit in the way. */
const DEFAULT_MS = 3000;

let toastId = 0;
let addToastFn: ((msg: string, type?: ToastTone, ms?: number, onTap?: () => void) => void) | null = null;

/**
 * @param ms How long to leave it up. Some messages genuinely need longer -
 * a verification code is read off the screen and typed somewhere else, and
 * three seconds is not enough for that.
 *
 * Four call sites were already passing this and had been since before the
 * typechecker could see them: the argument was accepted by JavaScript,
 * ignored, and the code vanished in three seconds anyway.
 */
export function showToast(message: string, type: ToastTone = 'success', ms: number = DEFAULT_MS, onTap?: () => void) {
  addToastFn?.(message, type, ms, onTap);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    addToastFn = (message, type = 'success', ms = DEFAULT_MS, onTap) => {
      const id = ++toastId;
      setToasts(prev => [...prev, { id, message, type, onTap }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), Math.max(1000, ms));
    };
    return () => { addToastFn = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    /*
     * Above everything, because a message nobody can read is worse than no
     * message. At z-50 it sat *behind* every sheet in the app - the laundry
     * counter opens at 70, the worker screens at 75, the celebrations at 9999
     * - so "Laundry saved", "could not save on this device" and every
     * explanation raised from inside an open tray appeared as a strip peeking
     * out from behind it, unreadable and looking like something had gone
     * wrong.
     *
     * Toasts are small, transient and dismiss themselves, so there is nothing
     * they can usefully be underneath.
     */
    <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          onClick={t.onTap}
          role={t.onTap ? 'button' : undefined}
          className={`animate-fade-in px-4 py-3 rounded-lg font-mono text-sm shadow-lg border ${t.onTap ? 'cursor-pointer active:scale-[0.98] transition' : ''} ${
            t.type === 'success' ? 'bg-surface-2 border-success/30 text-success' :
            t.type === 'error' ? 'bg-surface-2 border-destructive/30 text-destructive' :
            t.type === 'warning' ? 'bg-surface-2 border-amber-500/40 text-amber-500' :
            'bg-surface-2 border-primary/30 text-primary'
          }`}
        >
          {t.type === 'success' ? '✓' : t.type === 'error' ? '✗' : 'ℹ'} {t.message}
        </div>
      ))}
    </div>
  );
}
