import { useMemo, useState } from 'react';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { averageJobByMonth, averageJobByWeek, withAverageChanges } from '@/lib/manager-intel';
import type { StoreData } from '@/types/store';
import { TrendingDown, TrendingUp, Minus, Scale } from 'lucide-react';

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

/** Under two percent either way is the same average, not a rise or a fall. */
const STEADY = 2;

type Unit = 'week' | 'month';

/**
 * What one job is worth, week by week or month by month.
 *
 * A job is one drop-off, at the price it was charged, in the stretch it came
 * in. The newest is at the top, because that is the one being asked about.
 * Every row says how far it moved on the one before, as a figure and as a
 * percentage, and how many jobs it is an average of - an average of three
 * jobs and an average of sixty are not the same kind of number.
 *
 * Shown as a card on Flow, and opened from the Average job figure on the
 * Analysis page, which used to be a number that did nothing when tapped.
 */
export default function AverageJobCard({ store, startWith = 'month', bare = false }: { store: StoreData; startWith?: Unit; bare?: boolean }) {
  const version = useShopLaundryVersion();
  const [unit, setUnit] = useState<Unit>(startWith);
  const rows = useMemo(() => {
    let bundles: ReturnType<typeof shopLaundryRecords> = [];
    try { bundles = shopLaundryRecords(String(store.accessCode || '')); } catch { /* none readable */ }
    const jobs = bundles.map(bundle => ({
      at: String(bundle.createdAt || ''),
      value: Number(bundle.total) || 0,
      pieces: Number(bundle.pieceCount) || 0,
    }));
    return withAverageChanges(unit === 'week' ? averageJobByWeek(jobs) : averageJobByMonth(jobs));
  }, [store, version, unit]);

  const current = rows[rows.length - 1];
  const top = Math.max(1, ...rows.map(row => row.average || 0));
  const word = unit === 'week' ? 'week' : 'month';

  const moved = (change: NonNullable<(typeof rows)[number]['change']>) => {
    const steady = Math.abs(change.percent) < STEADY;
    const up = change.difference > 0;
    const Icon = steady ? Minus : up ? TrendingUp : TrendingDown;
    return { steady, up, Icon, tone: steady ? 'text-muted-foreground' : up ? 'text-success' : 'text-destructive' };
  };

  return (
    <div className={bare ? 'space-y-3' : 'p-4 rounded-2xl bg-card shadow-card space-y-3'} data-average-job>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Scale className="w-4 h-4" /> Average job</h3>
          <p className="text-[11px] text-muted-foreground">What one drop-off is charged, {word} by {word}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          {(['week', 'month'] as const).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setUnit(option)}
              aria-pressed={unit === option}
              className={`px-2.5 py-1 rounded-full text-[11px] font-display font-semibold transition-colors ${unit === option ? 'bg-primary/15 text-primary border border-primary/40' : 'bg-surface-2 text-muted-foreground border border-transparent'}`}
            >
              {option === 'week' ? 'Weeks' : 'Months'}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 || !current ? (
        <p className="text-sm text-muted-foreground py-2">No jobs recorded yet.</p>
      ) : (
        <>
          <div>
            <p className="font-display font-bold text-2xl leading-none">
              {current.average !== null ? naira(current.average) : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {current.jobs > 0
                ? `${current.label}${unit === 'month' ? ' so far' : ''}, across ${current.jobs} ${current.jobs === 1 ? 'job' : 'jobs'}`
                : `No jobs yet ${unit === 'week' ? 'this week' : `in ${current.name}`}`}
            </p>
            {current.change && (() => {
              const { steady, up, Icon, tone } = moved(current.change);
              return (
                <p className="text-xs mt-1.5 flex items-center gap-1.5">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${tone}`} />
                  <span>
                    {steady
                      ? `About the same as ${current.change.against}`
                      : `${up ? 'Up' : 'Down'} ${Math.round(Math.abs(current.change.percent))}% on ${current.change.against}`}
                    {!steady && <span className="text-muted-foreground"> ({naira(Math.abs(current.change.difference))} {up ? 'more' : 'less'} a job)</span>}
                  </span>
                </p>
              );
            })()}
          </div>

          <div className="space-y-2.5 pt-1">
            {[...rows].reverse().map(row => (
              <div key={row.key} data-average-row>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-display font-semibold">
                    {row.label}
                    {row.current && unit === 'month' && <span className="text-[10px] font-normal text-muted-foreground"> · so far</span>}
                  </span>
                  <span className="flex items-baseline gap-2">
                    {row.change && (() => {
                      const { steady, up, tone } = moved(row.change);
                      return (
                        <span className={`text-[11px] font-display font-semibold ${tone}`}>
                          {steady ? 'Same' : `${up ? '↑' : '↓'} ${Math.round(Math.abs(row.change.percent))}%`}
                        </span>
                      );
                    })()}
                    <span className="text-sm font-display font-bold">{row.average !== null ? naira(row.average) : '—'}</span>
                  </span>
                </div>
                <div className="h-1.5 mt-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className={`h-full rounded-full ${row.current ? 'bg-primary' : 'bg-primary/50'}`} style={{ width: `${row.average ? (row.average / top) * 100 : 0}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {row.jobs === 0 ? 'No jobs' : (
                    <>
                      {row.jobs} {row.jobs === 1 ? 'job' : 'jobs'} · {naira(row.value)} in all
                      {row.pieces > 0 && <> · {(row.pieces / row.jobs).toFixed(1)} pieces a job · {naira(row.perPiece || 0)} a piece</>}
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Counted by the day the clothes came in, at the price charged, paid or not. Each percentage is against the {word} before it that had jobs.
            More jobs at the same average means more customers; a higher average means bigger bundles or better prices.
          </p>
        </>
      )}
    </div>
  );
}
