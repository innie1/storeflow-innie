import { useEffect, useMemo, useRef, useState } from 'react';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { Target } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { breakEven, breakEvenSentence } from '@/lib/service-breakeven';
import { consumablePace, estimateUnitCost, pieceCostSentence, powerPaceSentence, soapPaceSentence } from '@/lib/cost-estimator';
import { consumableAsk } from '@/lib/trade-supplies';
import { claimSpotlight, scrollSpotlightIntoView, SPOTLIGHT_CLASS, SPOTLIGHT_MS, SPOTLIGHT_SIGNAL } from '@/lib/spotlight';

/** What the month ring asks for when it sends somebody here. */
export const BREAK_EVEN_SPOTLIGHT = 'break-even';

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
  const laundryVersion = useShopLaundryVersion();
  const state = useMemo(() => breakEven(store), [store, laundryVersion]);
  const soapLine = useMemo(() => soapPaceSentence(store), [store, laundryVersion]);
  const powerLine = useMemo(() => powerPaceSentence(store), [store, laundryVersion]);
  const pieceCost = useMemo(() => pieceCostSentence(store, estimateUnitCost(store)), [store, laundryVersion]);
  const soapNoun = consumableAsk(store).noun;
  const soapLots = useMemo(
    () => consumablePace(store).find(pace => pace.key === soapNoun.toLowerCase())?.lots || [],
    [store, soapNoun, laundryVersion],
  );

  /*
   * Lit, briefly, when the ring on the home screen sent somebody here.
   *
   * Arriving on a page of cards with no idea which one you were sent to is not
   * an answer, it is a second question - and the ring is a small thing in a
   * corner whose meaning has to be learned once.
   */
  const [lit, setLit] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const light = () => {
      setLit(true);
      // Lighting a card the merchant cannot see is the same as not lighting
      // it, and this page is long enough that the answer is often below the
      // fold. Given a beat so the tab it lives on is showing first.
      setTimeout(() => scrollSpotlightIntoView(cardRef.current), 80);
      clearTimeout(timer);
      timer = setTimeout(() => setLit(false), SPOTLIGHT_MS);
    };

    // Already asked for before this mounted.
    if (claimSpotlight(BREAK_EVEN_SPOTLIGHT)) light();

    /*
     * And asked for while it was sitting here hidden, which is the usual case:
     * every tab is mounted at once and hidden with CSS, so this card has been
     * on the page since the app opened and its mount-time check ran long
     * before the merchant tapped the ring.
     */
    const onRequest = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== BREAK_EVEN_SPOTLIGHT) return;
      claimSpotlight(BREAK_EVEN_SPOTLIGHT);
      light();
    };
    window.addEventListener(SPOTLIGHT_SIGNAL, onRequest);
    return () => {
      window.removeEventListener(SPOTLIGHT_SIGNAL, onRequest);
      clearTimeout(timer);
    };
  }, []);

  if (!canSeeMoney) return null;

  const hasWorking = state.target > 0 && (state.workTakenIn > 0 || state.variableCostPerPiece !== null || !!soapLine || !!powerLine);

  return (
    <div ref={cardRef} className={`rounded-2xl border border-border bg-card p-3 text-left ${lit ? SPOTLIGHT_CLASS : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-black text-muted-foreground flex items-center gap-1.5">
            <Target className="w-3 h-3" /> Received this month
          </p>
          <p className="font-display font-black text-base mt-0.5">
            {state.target > 0 ? money(state.revenue) : '—'}
            {state.target > 0 && (
              <span className="text-xs text-muted-foreground font-bold"> of {money(state.target)}</span>
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
        <div className="mt-2 h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${state.reached ? 'bg-success' : 'bg-primary'}`}
            style={{ width: `${Math.round(state.progress * 100)}%` }}
          />
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
        {breakEvenSentence(state)}
      </p>

      {/* A warning stays in the open: it is the one line here that asks for something. */}
      {state.costsDoubtful && (
        <p className="text-[10px] text-amber-500 mt-1.5">
          Soap and electricity came to most of the price of the work, which usually means some bundles are
          not in the app yet. The target is your fixed costs alone until they are.
        </p>
      )}

      {/*
        The working, folded away. It used to sit open under the figure - the
        work taken in, what a piece costs, the soap line, the light line - and
        made this the tallest card on the page for one number. It is one tap
        away for whoever wants to check it.
      */}
      {hasWorking && (
        <details className="mt-1.5 group">
          <summary className="text-[10px] font-bold text-primary cursor-pointer list-none">How this is worked out</summary>
          {/* The price of the work beside the money for it, so a busy month with
              little paid shows as exactly that. */}
          {state.target > 0 && state.workTakenIn > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {money(state.workTakenIn)} of work taken in this month.
            </p>
          )}

          {/*
            Said where the number is, so it is never mistaken for something the
            owner typed. It is derived from real spending divided by real pieces
            and sharpens every month the shop trades.
          */}
          {state.variableCostPerPiece !== null && pieceCost && (
            <p className="text-[10px] text-muted-foreground mt-1.5">{pieceCost}</p>
          )}

          {/* What a piece of soap-work costs, which is what its share above comes from. */}
          {state.target > 0 && soapLine && (
            <p className="text-[10px] text-muted-foreground mt-1">{soapLine}</p>
          )}
          {state.target > 0 && powerLine && (
            <p className="text-[10px] text-muted-foreground mt-1">{powerLine}</p>
          )}
        </details>
      )}

      {/* Each lot on its own, so one that went much faster than usual can be asked about. */}
      {soapLots.length > 1 && (
        <details className="mt-1.5">
          <summary className="text-[10px] font-bold text-primary cursor-pointer">Each lot of {soapNoun}</summary>
          <ul className="mt-1.5 space-y-1.5">
            {[...soapLots].reverse().map(lot => (
              <li key={lot.boughtAt} className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="font-bold text-foreground">
                  {new Date(lot.boughtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {money(lot.amount)}
                  {lot.packs ? ` · ${lot.packs} ${lot.packs === 1 ? 'pack' : 'packs'}` : ''}
                </span>
                {' - '}
                {lot.finished
                  ? `washed ${lot.washed} pieces${lot.perPiece !== null ? `, ${money(lot.perPiece)} a piece` : ''}`
                  : `in use, ${lot.washed} pieces so far`}
                {lot.high && <span className="text-amber-500 font-bold"> · used more than usual</span>}
                {lot.washers.length > 0 && (
                  <span className="block">
                    Washed by {lot.washers.map(washer => `${washer.name} (${washer.pieces})`).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
