import { useMemo } from 'react';
import { Target } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { breakEven, breakEvenSentence } from '@/lib/laundry-breakeven';

/**
 * What the shop still has to take this month.
 *
 * One card, because this screen has been trimmed twice for carrying too much.
 * The figure, a bar, and one sentence saying what to do about it - the rest
 * belongs in the month-end report, where somebody is actually reading.
 */

interface Props {
  store: StoreData;
  /** Hidden from anyone without permission to see money. */
  canSeeMoney: boolean;
}

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

const PACE_TONE: Record<string, string> = {
  ahead: 'text-success',
  'on track': 'text-success',
  'slightly behind': 'text-amber-500',
  behind: 'text-destructive',
  'no target': 'text-muted-foreground',
};

export default function BreakEvenCard({ store, canSeeMoney }: Props) {
  const state = useMemo(() => breakEven(store), [store]);

  if (!canSeeMoney) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-black text-muted-foreground flex items-center gap-1.5">
            <Target className="w-3 h-3" /> This month
          </p>
          <p className="font-display font-black text-xl mt-1">
            {state.target > 0 ? money(state.revenue) : '—'}
            {state.target > 0 && (
              <span className="text-sm text-muted-foreground font-bold"> of {money(state.target)}</span>
            )}
          </p>
        </div>
        {state.target > 0 && (
          <span className={`text-[10px] font-display font-black shrink-0 ${PACE_TONE[state.pace]}`}>
            {state.reached ? 'COVERED' : state.pace.toUpperCase()}
          </span>
        )}
      </div>

      {state.target > 0 && (
        <div className="mt-2.5 h-2 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${state.reached ? 'bg-success' : 'bg-primary'}`}
            style={{ width: `${Math.round(state.progress * 100)}%` }}
          />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
        {breakEvenSentence(state)}
      </p>

      {/*
        Said where the number is, so it is never mistaken for something the
        owner typed. It is derived from real spending divided by real pieces
        and sharpens every month the shop trades.
      */}
      {state.variableCostPerPiece !== null && (
        <p className="text-[10px] text-muted-foreground mt-1.5">
          {money(state.variableCostPerPiece)} of soap and the rest per piece, from this month's {state.pieces} pieces.
        </p>
      )}
    </div>
  );
}
