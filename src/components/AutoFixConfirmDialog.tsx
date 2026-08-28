import { useEffect, useState } from 'react';
import { AutoFixSpec, AutoFixType } from '@/lib/auto-fix';
import { X, Zap, Check } from 'lucide-react';

interface AutoFixConfirmDialogProps {
  spec: AutoFixSpec;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}

// Short, type-specific progress steps shown while the fix is applying.
// Purely cosmetic — the underlying work is already fast (local state
// mutation for everything except purchase orders, which is one insert) —
// this just gives the tap something to look at for the ~0.3-1s it takes,
// instead of a single frozen "Applying..." label.
const STEPS: Record<AutoFixType, string[]> = {
  adjust_reorder_level: ['Scanning inventory…', 'Calculating reorder levels…', 'Saving…'],
  update_price: ['Scanning inventory…', 'Recalculating margin…', 'Updating price…'],
  create_promotion: ['Scanning inventory…', 'Finding affected products…', 'Applying promo pricing…'],
  archive_product: ['Scanning inventory…', 'Archiving product…'],
  generate_purchase_order: ['Scanning inventory…', 'Calculating order quantities…', 'Creating purchase order…'],
};

export default function AutoFixConfirmDialog({ spec, onCancel, onConfirm, busy }: AutoFixConfirmDialogProps) {
  const steps = STEPS[spec.type] || ['Applying…'];
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!busy) { setStepIndex(0); return; }
    if (stepIndex >= steps.length - 1) return;
    const t = setTimeout(() => setStepIndex(i => i + 1), 320);
    return () => clearTimeout(t);
  }, [busy, stepIndex, steps.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/80 animate-in fade-in-0 duration-200" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-background p-5 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {!busy && (
          <button
            onClick={onCancel}
            className="absolute right-4 top-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2/60"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-2 mb-1">
          <Zap className="w-5 h-5 text-primary" />
          <h3 className="text-base font-display font-bold">Confirm Auto Fix</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          {spec.summary}
        </p>

        {busy ? (
          <div className="py-2">
            {steps.map((label, i) => (
              <div key={label} className={`flex items-center gap-2 py-1.5 text-sm transition-opacity ${i > stepIndex ? 'opacity-30' : 'opacity-100'}`}>
                {i < stepIndex ? (
                  <Check className="w-4 h-4 text-success flex-shrink-0" />
                ) : i === stepIndex ? (
                  <span className="w-4 h-4 flex-shrink-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                ) : (
                  <span className="w-4 h-4 flex-shrink-0" />
                )}
                <span className={i === stepIndex ? 'font-display font-semibold text-foreground' : 'text-muted-foreground'}>{label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-2 mt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl text-sm font-display font-semibold border border-border active:scale-[0.98] transition"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3 rounded-xl text-sm font-display font-semibold bg-primary text-primary-foreground active:scale-[0.98] transition"
            >
              Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
