import { useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { StoreData, TabId } from '@/types/store';
import { snoozeStrategy, topStrategy, type Strategy } from '@/lib/flow-strategies';

/**
 * Flow's advice, with the button that acts on it.
 *
 * The app could say what had happened; it could not say what to do about it.
 * This card carries one piece of shopkeeping advice at a time — the most
 * urgent — with the evidence behind it and the action that resolves it.
 *
 * One at a time on purpose. A list of five things to do is a list nobody
 * reads, and it turns Flow from a colleague into a nag.
 */

interface Props {
  store: StoreData;
  onNavigate?: (tab: TabId) => void;
}

export default function FlowStrategyCard({ store, onNavigate }: Props) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const strategy = useMemo<Strategy | null>(() => topStrategy(store), [store]);

  if (!strategy || dismissed === strategy.id) return null;

  const putAway = () => {
    snoozeStrategy(strategy.id, strategy.cooldownDays);
    setDismissed(strategy.id);
  };

  return (
    <section className="rounded-2xl border border-primary/25 bg-card p-4 text-left space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase font-black tracking-wider text-primary">Flow suggests</p>
          <h3 className="font-display font-bold text-sm text-foreground leading-snug">{strategy.title}</h3>
        </div>
        <button
          type="button"
          onClick={putAway}
          aria-label="Not now"
          title="Not now"
          className="w-8 h-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 flex items-center justify-center transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{strategy.body}</p>

      <div className="flex flex-wrap gap-2">
        {strategy.actions.map(action => (
          action.href ? (
            <a
              key={action.label}
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={putAway}
              className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black flex items-center active:scale-95 transition"
            >
              {action.label}
            </a>
          ) : (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                putAway();
                if (action.tab) onNavigate?.(action.tab as TabId);
              }}
              className="h-9 px-3.5 rounded-xl bg-surface-2 border border-border text-xs font-display font-black flex items-center active:scale-95 transition hover:text-foreground"
            >
              {action.label}
            </button>
          )
        ))}
      </div>
    </section>
  );
}
