import { useState, useEffect, useRef } from 'react';

interface ConfirmAccessCodeProps {
  expectedCode: string;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmAccessCode({
  expectedCode,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: ConfirmAccessCodeProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (code.trim().toUpperCase() !== expectedCode.toUpperCase()) {
      setError('Incorrect access code');
      return;
    }
    onConfirm();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-card rounded-2xl shadow-card p-5 space-y-4"
      >
        <div className="space-y-1">
          <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
            <span>🔒</span> {title}
          </h3>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-display font-semibold">
            Enter store access code
          </label>
          <input
            ref={inputRef}
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="ABC123"
            maxLength={6}
            autoComplete="off"
            className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-center text-lg tracking-[0.4em] font-display font-bold uppercase"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 p-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-display font-semibold hover:bg-surface-3"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={code.length === 0}
            className="flex-1 p-2.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-display font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
