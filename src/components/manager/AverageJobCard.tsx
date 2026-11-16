import { useMemo } from 'react';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { averageJobByMonth, averageJobChange } from '@/lib/manager-intel';
import type { StoreData } from '@/types/store';
import { TrendingDown, TrendingUp, Minus, Scale } from 'lucide-react';

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

/**
 * What one job is worth, month by month.
 *
 * A job is one drop-off, at the price it was charged, in the month it came in.
 * The newest month is at the top, because that is the one being asked about,
 * and each row carries how many jobs it is an average of - an average of three
 * jobs and an average of sixty are not the same kind of number.
 */
export default function AverageJobCard({ store }: { store: StoreData }) {
  const version = useShopLaundryVersion();
  const months = useMemo(() => {
    let bundles: ReturnType<typeof shopLaundryRecords> = [];
    try { bundles = shopLaundryRecords(String(store.accessCode || '')); } catch { /* none readable */ }
    return averageJobByMonth(bundles.map(bundle => ({
      at: String(bundle.createdAt || ''),
      value: Number(bundle.total) || 0,
      pieces: Number(bundle.pieceCount) || 0,
    })));
  }, [store, version]);

  const current = months[months.length - 1];
  const change = averageJobChange(months);
  const top = Math.max(1, ...months.map(month => month.average || 0));
  // Under two percent either way is the same average, not a rise or a fall.
  const steady = change !== null && Math.abs(change.share) < 0.02;
  const Trend = !change || steady ? Minus : change.difference > 0 ? TrendingUp : TrendingDown;

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
      <div>
        <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Scale className="w-4 h-4" /> Average job</h3>
        <p className="text-[11px] text-muted-foreground">What one drop-off is charged, month by month</p>
      </div>

      {months.length === 0 || !current ? (
        <p className="text-sm text-muted-foreground py-2">No jobs recorded yet.</p>
      ) : (
        <>
          <div>
            <p className="font-display font-bold text-2xl leading-none">
              {current.average !== null ? naira(current.average) : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {current.jobs > 0
                ? `${current.name} so far, across ${current.jobs} ${current.jobs === 1 ? 'job' : 'jobs'}`
                : `No jobs yet in ${current.name}`}
            </p>
            {change && (
              <p className="text-xs mt-1.5 flex items-center gap-1.5">
                <Trend className={`w-3.5 h-3.5 shrink-0 ${steady ? 'text-muted-foreground' : change.difference > 0 ? 'text-success' : 'text-destructive'}`} />
                <span>
                  {steady
                    ? `About the same as ${change.against.name}`
                    : `${naira(Math.abs(change.difference))} ${change.difference > 0 ? 'more' : 'less'} than ${change.against.name}`}
                  <span className="text-muted-foreground"> ({naira(change.against.average || 0)}{steady ? '' : `, ${change.difference > 0 ? 'up' : 'down'} ${Math.round(Math.abs(change.share) * 100)}%`})</span>
                </span>
              </p>
            )}
          </div>

          <div className="space-y-2.5 pt-1">
            {[...months].reverse().map(month => (
              <div key={month.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-display font-semibold">
                    {month.label}
                    {month.current && <span className="text-[10px] font-normal text-muted-foreground"> · so far</span>}
                  </span>
                  <span className="text-sm font-display font-bold">{month.average !== null ? naira(month.average) : '—'}</span>
                </div>
                <div className="h-1.5 mt-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className={`h-full rounded-full ${month.current ? 'bg-primary' : 'bg-primary/50'}`} style={{ width: `${month.average ? (month.average / top) * 100 : 0}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {month.jobs === 0 ? 'No jobs' : (
                    <>
                      {month.jobs} {month.jobs === 1 ? 'job' : 'jobs'} · {naira(month.value)} in all
                      {month.pieces > 0 && <> · {(month.pieces / month.jobs).toFixed(1)} pieces a job · {naira(month.perPiece || 0)} a piece</>}
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Counted by the day the clothes came in, at the price charged, paid or not.
            More jobs at the same average means more customers; a higher average means bigger bundles or better prices.
          </p>
        </>
      )}
    </div>
  );
}
