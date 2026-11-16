import { useMemo } from 'react';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { explainUnitCost, serviceCosting, serviceCostSentence } from '@/lib/cost-estimator';
import type { StoreData } from '@/types/store';
import { Shirt } from 'lucide-react';

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

/**
 * What a laundry's customers bring, by service, and what each service leaves.
 *
 * Every laundry payment is recorded as one product called "Laundry", so the
 * shop's sales breakdown was a single line reading "Laundry: 41 sold". The
 * bundles themselves know which service they were for.
 *
 * Under each service is what a piece of it is charged, what it costs to do and
 * what is left, with the cost taken apart - because a figure like "₦45 left on
 * ironing" cannot be acted on, or argued with, until it says what it is made of.
 */
export default function ServicesCard({ store }: { store: StoreData }) {
  const version = useShopLaundryVersion();
  const costing = useMemo(() => {
    try { return serviceCosting(store); } catch { return null; }
  }, [store, version]);
  const rows = costing?.services || [];
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const anyCost = rows.some(row => row.perPiece !== null);

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
      <div>
        <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Shirt className="w-4 h-4" /> What customers bring</h3>
        <p className="text-[11px] text-muted-foreground">By service, last 30 days</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No bundles in the last 30 days.</p>
      ) : (
        <div className="space-y-4">
          {rows.map(row => {
            const charged = row.pieces > 0 ? row.value / row.pieces : null;
            const left = charged !== null && row.perPiece !== null ? charged - row.perPiece : null;
            return (
              <div key={row.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-display font-semibold truncate">{row.name}</span>
                  <span className="text-sm font-display font-bold shrink-0">{naira(row.value)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {row.bundles} {row.bundles === 1 ? 'bundle' : 'bundles'} · {row.pieces} {row.pieces === 1 ? 'piece' : 'pieces'}
                </p>
                <div className="h-1.5 mt-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${total > 0 ? (row.value / total) * 100 : 0}%` }} />
                </div>
                {charged !== null && row.perPiece !== null && left !== null && (
                  <div className="mt-2 grid grid-cols-3 gap-1.5 text-center" data-service-cost={row.key}>
                    <div className="p-1.5 rounded-lg bg-surface-2">
                      <p className="text-[10px] text-muted-foreground">Charged a piece</p>
                      <p className="font-display font-bold text-sm">{naira(charged)}</p>
                    </div>
                    <div className="p-1.5 rounded-lg bg-surface-2">
                      <p className="text-[10px] text-muted-foreground">Costs to do</p>
                      <p className="font-display font-bold text-sm">{naira(row.perPiece)}</p>
                    </div>
                    <div className={`p-1.5 rounded-lg ${left <= 0 ? 'bg-destructive/10' : 'bg-surface-2'}`}>
                      <p className="text-[10px] text-muted-foreground">{left <= 0 ? 'Lost a piece' : 'Left a piece'}</p>
                      <p className={`font-display font-bold text-sm ${left <= 0 ? 'text-destructive' : ''}`}>{naira(Math.abs(left))}</p>
                    </div>
                  </div>
                )}
                {row.perPiece !== null && (
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{serviceCostSentence(store, row)}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (anyCost ? (
        <details className="group">
          <summary className="text-[11px] font-display font-semibold text-primary cursor-pointer list-none">How the cost is worked out</summary>
          <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
            <p><b className="text-foreground">Soap</b> is charged only to clothes that were washed. Ironing carries none.</p>
            <p>
              <b className="text-foreground">Light</b> is shared by the work a piece goes through: washing counts once and ironing counts once.
              So a piece that is washed and ironed carries twice the light of one that is only ironed.
            </p>
            <p><b className="text-foreground">Piece-work pay</b> goes to the service of the bundle the work was done on.</p>
            <p>
              One meter runs the machines and the irons, so the even split between washing and ironing is the one part here that is assumed, not measured.
              Rent and salaries are not in these figures: they are owed whether or not clothes come in, and the month's target covers them.
            </p>
          </div>
        </details>
      ) : costing && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">{explainUnitCost(costing.estimate)}</p>
      ))}
    </div>
  );
}
