import { useState } from 'react';
import { StoreData } from '@/types/store';
import { AutoFixSpec } from '@/lib/auto-fix';
import { X, ShieldCheck } from 'lucide-react';

interface AutoFixConfirmDialogProps {
  store: StoreData;
  spec: AutoFixSpec;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

// Same store-code confirmation pattern as Settings.tsx's Store Type change —
// Auto Fix changes pricing/inventory/promotions, so it gets the same gate.
export default function AutoFixConfirmDialog({ store, spec, onCancel, onConfirm, busy }: AutoFixConfirmDialogProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const matches = code.trim().toLowerCase() === (store.accessCode || '').trim().toLowerCase();

  const handleConfirm = () => {
    if (!matches) {
      setError('That code doesn\u2019t match your store code.');
      return;
    }
    onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/80 animate-in fade-in-0 duration-200" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-background p-5 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        <button
          onClick={onCancel}
          disabled={busy}
          className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2/60"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-primary" />
          <h3 className="text-base font-display font-bold">Confirm Auto Fix</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {spec.summary}
        </p>

        <label className="text-xs font-display font-semibold uppercase text-muted-foreground mb-1 block">
          Enter your store code to apply
        </label>
        <input
          autoFocus
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(''); }}
          placeholder="Store code"
          className="w-full rounded-xl border border-border bg-surface-2/40 px-3 py-3 text-sm font-mono mb-1"
        />
        {error && <p className="text-xs text-destructive mb-2">{error}</p>}

        <div className="flex gap-2 mt-4">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-3 rounded-xl text-sm font-display font-semibold border border-border active:scale-[0.98] transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy || code.trim().length === 0}
            className="flex-1 py-3 rounded-xl text-sm font-display font-semibold bg-primary text-primary-foreground disabled:opacity-50 active:scale-[0.98] transition"
          >
            {busy ? 'Applying…' : 'Apply Fix'}
          </button>
        </div>
      </div>
    </div>
  );
}
