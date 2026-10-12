import { useState } from 'react';
import { Store } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { loadStore, saveStore } from '@/lib/store-data';
import { readJoin } from '@/lib/staff-join';
import { signInErrorText, signInWorker, type Worker } from '@/lib/staff-session';
import { writeActiveUser } from '@/lib/store-session';

/**
 * "Washlie · Faith - enter your PIN", on a worker's own approved phone.
 *
 * Shown on the opening screen once the phone has joined a shop. The PIN is
 * asked every time; see staff-session for what happens online and offline.
 */

interface Props {
  onSignedIn: (store: StoreData) => void;
}

const roleLabel = (role?: string) => role ? role.charAt(0).toUpperCase() + role.slice(1) : '';

export default function WorkerSignIn({ onSignedIn }: Props) {
  const join = readJoin();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!join || join.status !== 'authorized') return null;

  const signIn = async () => {
    if (!/^\d{4}$/.test(pin)) return setError('Your PIN is 4 digits.');
    setError('');
    setBusy(true);
    const result = await signInWorker(pin, {
      loadCopy: code => loadStore(code),
      // A worker copy is never sent to the cloud as the shop; saveStore
      // already refuses, and this says so twice.
      saveCopy: store => saveStore(store, { skipCloudSync: true }),
    });
    setBusy(false);
    setPin('');
    if ('error' in result) return setError(signInErrorText(result.error));
    const worker: Worker = result.worker;
    // Missing boxes are no, never yes: the cloud sends what the owner ticked.
    const ticked = worker.permissions || {};
    writeActiveUser({
      id: worker.id, name: worker.name, role: worker.role,
      permissions: { sales: !!ticked.sales, inventory: !!ticked.inventory, reports: !!ticked.reports, settings: !!ticked.settings, money: !!ticked.money },
    });
    onSignedIn(result.store);
  };

  return (
    <section className="mb-5 p-4 rounded-2xl border border-primary/40 bg-primary/5 text-left space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0"><Store className="w-5 h-5" /></div>
        <div className="min-w-0">
          <p className="font-display font-black text-lg leading-tight truncate">{join.storeName}</p>
          <p className="text-xs text-muted-foreground">{join.staffName}{join.staffRole ? ` · ${roleLabel(join.staffRole)}` : ''}</p>
        </div>
      </div>
      <input
        value={pin}
        onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}
        onKeyDown={e => { if (e.key === 'Enter') void signIn(); }}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        placeholder="Your 4-digit PIN"
        aria-label="Your PIN"
        className={`w-full h-12 px-3 rounded-xl bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-center ${pin ? 'tracking-[0.5em] text-xl' : ''}`}
      />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        onClick={() => void signIn()}
        disabled={busy}
        className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-display font-black disabled:opacity-60 active:scale-[0.98] transition"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </section>
  );
}
