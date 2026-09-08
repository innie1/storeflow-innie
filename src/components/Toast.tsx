import { useEffect, useState } from 'react';

interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

let toastId = 0;
let addToastFn: ((msg: string, type?: 'success' | 'error' | 'info') => void) | null = null;

export function showToast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') {
  addToastFn?.(message, type);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    addToastFn = (message, type = 'success') => {
      const id = ++toastId;
      setToasts(prev => [...prev, { id, message, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    };
    return () => { addToastFn = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`animate-fade-in px-4 py-3 rounded-lg font-mono text-sm shadow-lg border ${
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
