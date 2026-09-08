import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { StoreData } from '@/types/store';
import {
  getMonthHistory,
  monthReport,
  recordMonthSnapshot,
  type MonthReport,
} from '@/lib/service-month-report';

/**
 * How the month went, and the months before it.
 *
 * A shop that never closes its books cannot tell a good month from a busy one.
 * The summary is a sentence rather than a table, because the figures only
 * matter once somebody knows what they add up to - the table is there
 * underneath for anyone who wants it.
 */

interface Props {
  store: StoreData;
  canSeeMoney: boolean;
}

const money = (value: number) => `₦${Math.round(value).toLocaleString()}`;

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className={`text-xs font-display font-black ${tone || ''}`}>{value}</span>
    </div>
  );
}

export default function MonthReportCard({ store, canSeeMoney }: Props) {
  const [open, setOpen] = useState(false);
  const [showing, setShowing] = useState<string | null>(null);

  const thisMonth = useMemo(() => monthReport(store), [store]);

  /*
   * File the month that has just ended, once.
   *
   * Done on view rather than on a timer: nothing runs while the app is closed,
   * and the first time the shop is opened in a new month is exactly when the
   * last one becomes history.
   */
  const [history, setHistory] = useState<MonthReport[]>(() => getMonthHistory(String(store.accessCode || '')));
  useEffect(() => {
    setHistory(recordMonthSnapshot(store));
  }, [store]);

  if (!canSeeMoney) return null;

  const shown = showing ? history.find(entry => entry.key === showing) || thisMonth : thisMonth;
  const isCurrent = shown.key === thisMonth.key;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-left">
      <button onClick={() => setOpen(value => !value)} className="w-full flex items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-[10px] uppercase font-black text-muted-foreground">
            {isCurrent ? 'This month so far' : shown.label}
          </p>
          <p className={`font-display font-black text-xl mt-1 ${shown.profit < 0 ? 'text-destructive' : 'text-foreground'}`}>
            {shown.profit < 0 ? `−${money(Math.abs(shown.profit))}` : money(shown.profit)}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* The sentence first. The figures only mean something once somebody
          knows what they add up to. */}
      <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{shown.summary}</p>

      {open && (
        <div className="mt-3 pt-3 border-t border-border">
          <Row label="Taken" value={money(shown.revenue)} />
          <Row label="Running the shop" value={`−${money(shown.fixedCosts)}`} />
          <Row label="Doing the washing" value={`−${money(shown.variableCosts)}`} />
          <Row
            label={shown.profit < 0 ? 'Short by' : 'Kept'}
            value={money(Math.abs(shown.profit))}
            tone={shown.profit < 0 ? 'text-destructive' : 'text-success'}
          />

          <div className="mt-2 pt-2 border-t border-border/60">
            <Row label="Drop-offs" value={String(shown.jobs)} />
            <Row label="Pieces" value={String(shown.pieces)} />
            <Row label="Average drop-off" value={money(shown.averageJob)} />
            <Row
              label="Costs covered on"
              value={shown.breakEvenOn ? new Date(shown.breakEvenOn).toLocaleDateString() : 'Not yet'}
            />
          </div>

          {history.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[10px] uppercase font-black text-muted-foreground mb-1.5">Earlier months</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setShowing(null)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-display font-bold border ${
                    showing === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 border-border text-muted-foreground'
                  }`}
                >
                  This month
                </button>
                {history.map(entry => (
                  <button
                    key={entry.key}
                    onClick={() => setShowing(entry.key)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-display font-bold border ${
                      showing === entry.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 border-border text-muted-foreground'
                    }`}
                  >
                    {entry.label.split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
