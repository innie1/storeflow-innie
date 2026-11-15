import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import {
  describeChange,
  periodLabel,
  periodDates,
  periodReport,
  periodHeadline,
  periodsSoFar,
  type Change,
  type PeriodBundle,
  type PeriodReport,
  type PeriodUnit,
} from '@/lib/period-report';

/**
 * Week by week, or month by month, each set against the one before.
 *
 * Pick a week (or a month) with the arrows or the list. It says what came in
 * - clothes, what they are worth, the money received - whether each went up or
 * down, and how the days of the week (or weeks of the month) shared it out.
 */

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

function ChangeBadge({ change }: { change: Change }) {
  // Never colour alone: an arrow and the words say which way it went.
  const tone = change.direction === 'up' ? 'text-success' : change.direction === 'down' ? 'text-destructive' : 'text-muted-foreground';
  const Icon = change.direction === 'up' ? ArrowUpRight : change.direction === 'down' ? ArrowDownRight : ArrowRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${tone}`}>
      <Icon className="w-3 h-3" aria-hidden />
      {describeChange(change)}
    </span>
  );
}

function Figure({ label, value, change, before }: { label: string; value: string; change: Change; before: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
      <p className="font-display font-black text-xl mt-1">{value}</p>
      <div className="mt-1"><ChangeBadge change={change} /></div>
      <p className="text-[10px] text-muted-foreground mt-0.5">{before}</p>
    </div>
  );
}

/**
 * Where the money received in the week (or month) came from.
 *
 * "Money received" counts a payment in the week it was paid, so a good week
 * can be new work or old debts coming home, and one figure cannot say which.
 * This splits the same total by when the clothes it paid for were brought in.
 */
function MoneySourcesBlock({ report, unit }: { report: PeriodReport; unit: PeriodUnit }) {
  const { sources } = report;
  if (sources.total <= 0) return null;
  const word = unit === 'week' ? 'week' : 'month';
  const rows = [
    { key: 'these', label: `Clothes brought in this ${word}`, amount: sources.fromThese, tone: 'bg-success' },
    { key: 'previous', label: `Clothes from the ${word} before`, amount: sources.fromPrevious, tone: 'bg-primary' },
    { key: 'older', label: 'Older clothes', amount: sources.fromOlder, tone: 'bg-orange-500' },
    { key: 'other', label: 'Not tied to a bundle', amount: sources.other, tone: 'bg-muted-foreground' },
  ].filter(row => row.amount > 0);
  const old = sources.fromPrevious + sources.fromOlder;
  return (
    <div className="rounded-xl border border-border p-3 space-y-2.5" data-testid="money-sources">
      <div>
        <p className="text-xs font-bold">Where the {naira(sources.total)} came from</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {old > 0
            ? `${naira(old)} of it paid for clothes brought in earlier. Money counts in the ${word} it is paid.`
            : `All of it paid for clothes brought in this ${word}.`}
        </p>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-surface-2 gap-px">
        {rows.map(row => (
          <div key={row.key} className={row.tone} style={{ width: `${(row.amount / sources.total) * 100}%` }} />
        ))}
      </div>
      <ul className="space-y-1">
        {rows.map(row => (
          <li key={row.key} className="flex items-baseline justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground"><span className={`w-2 h-2 rounded-sm ${row.tone}`} />{row.label}</span>
            <span className="tabular-nums"><b>{naira(row.amount)}</b> · {Math.round((row.amount / sources.total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PeriodCompare({ store, now: at }: { store: StoreData; now?: number }) {
  // Fixed while the page is open, so the figures are not worked out again on every render.
  const [now] = useState(() => at ?? Date.now());
  const version = useShopLaundryVersion();
  const bundles = useMemo<PeriodBundle[]>(() => {
    try {
      return shopLaundryRecords(String(store.accessCode || '')) as unknown as PeriodBundle[];
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);

  const [unit, setUnit] = useState<PeriodUnit>('week');
  const starts = useMemo(() => periodsSoFar(store, bundles, unit, now), [store, bundles, unit, now]);
  const [picked, setPicked] = useState(0);
  const index = Math.min(picked, starts.length - 1);
  const start = starts[index];
  const report = useMemo(() => periodReport(store, bundles, unit, start, now), [store, bundles, unit, start, now]);

  // The list under it: the recent periods, each against the one before.
  const recent = useMemo(
    () => starts.slice(0, 12).map(at => periodReport(store, bundles, unit, at, now)),
    [store, bundles, unit, starts, now],
  );

  const most = Math.max(1, ...report.parts.map(part => Math.max(part.workTakenIn, part.received)));
  const beforeWord = unit === 'week' ? 'last week' : 'last month';
  const sameStretch = report.current;
  // While it runs, last week by this same day, and its whole total.
  const Before = beforeWord[0].toUpperCase() + beforeWord.slice(1);
  const before = (value: number | string, whole: number | string) => sameStretch
    ? `${Before}: ${value} by now · ${whole} in all`
    : `${Before}: ${value}`;
  const beforeMoney = (value: number, whole: number) => before(naira(value), naira(whole));

  const switchUnit = (next: PeriodUnit) => {
    setUnit(next);
    setPicked(0);
  };

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden" aria-label="Week and month">
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display font-bold">{unit === 'week' ? 'Week by week' : 'Month by month'}</h2>
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Weeks or months">
            {(['week', 'month'] as PeriodUnit[]).map(option => (
              <button
                key={option}
                type="button"
                onClick={() => switchUnit(option)}
                aria-pressed={unit === option}
                className={`px-3 py-1 rounded-md text-xs font-bold ${unit === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              >
                {option === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPicked(Math.min(starts.length - 1, index + 1))}
            disabled={index >= starts.length - 1}
            aria-label={unit === 'week' ? 'Week before' : 'Month before'}
            className="w-9 h-9 shrink-0 rounded-lg border border-border bg-surface-2 flex items-center justify-center disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <select
            value={index}
            onChange={event => setPicked(Number(event.target.value))}
            aria-label={unit === 'week' ? 'Pick a week' : 'Pick a month'}
            className="flex-1 min-w-0 h-9 px-2 rounded-lg bg-surface-2 border border-border text-xs text-foreground"
          >
            {starts.map((at, position) => (
              <option key={at} value={position}>{periodLabel(unit, at, now)} · {periodDates(unit, at)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPicked(Math.max(0, index - 1))}
            disabled={index <= 0}
            aria-label={unit === 'week' ? 'Week after' : 'Month after'}
            className="w-9 h-9 shrink-0 rounded-lg border border-border bg-surface-2 flex items-center justify-center disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <p className="font-bold text-sm">{report.label}{report.current ? ' · so far' : ''}</p>
          <p className="text-[11px] text-muted-foreground">{report.dates}</p>
          <p className="text-sm text-foreground leading-snug mt-2" data-testid="period-sentence">{periodHeadline(report)}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Figure
            label="Clothes in (pieces)"
            value={`${report.pieces}`}
            change={report.compared.pieces}
            before={before(report.compared.pieces.before, report.previous.pieces)}
          />
          <Figure
            label="Bundles in"
            value={`${report.bundles}`}
            change={report.compared.bundles}
            before={before(report.compared.bundles.before, report.previous.bundles)}
          />
          <Figure
            label="Value of clothes in"
            value={naira(report.workTakenIn)}
            change={report.compared.workTakenIn}
            before={beforeMoney(report.compared.workTakenIn.before, report.previous.workTakenIn)}
          />
          <Figure
            label="Money received"
            value={naira(report.received)}
            change={report.compared.received}
            before={beforeMoney(report.compared.received.before, report.previous.received)}
          />
        </div>

        {report.bundles > 0 && (
          <div className="rounded-xl border border-border p-3 space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">Paid on these clothes</span>
              <span className="tabular-nums"><b>{naira(report.paid)}</b> of {naira(report.workTakenIn)} · {report.paidShare}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full rounded-full bg-success" style={{ width: `${report.paidShare}%` }} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {naira(report.owed)} still owed · {report.collected} of {report.bundles} {report.bundles === 1 ? 'bundle' : 'bundles'} collected · {report.customers} {report.customers === 1 ? 'customer' : 'customers'}
            </p>
          </div>
        )}

        <MoneySourcesBlock report={report} unit={unit} />

        <div>
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">
            {unit === 'week' ? 'Day by day' : 'Week by week'}
          </p>
          <div className="space-y-2">
            {report.parts.map(part => (
              <div key={part.key} className={part.ahead ? 'opacity-40' : ''}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-semibold">{part.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {part.ahead ? 'not yet' : `${part.pieces} pcs · ${naira(part.workTakenIn)} in · ${naira(part.received)} received`}
                  </span>
                </div>
                {!part.ahead && (
                  <div className="mt-1 space-y-0.5" aria-hidden>
                    <div className="h-1 rounded-full bg-primary/70" style={{ width: `${(part.workTakenIn / most) * 100}%` }} />
                    <div className="h-1 rounded-full bg-success" style={{ width: `${(part.received / most) * 100}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-primary/70" />Value of clothes in</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-success" />Money received</span>
          </div>
        </div>
      </div>

      <div className="border-t border-border">
        <p className="px-4 pt-3 text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
          {unit === 'week' ? 'Recent weeks' : 'Recent months'}
        </p>
        <div className="divide-y divide-border">
          {recent.map((row, position) => (
            <button
              key={row.start}
              type="button"
              onClick={() => setPicked(position)}
              className={`w-full p-4 flex items-center gap-3 text-left ${position === index ? 'bg-primary/5' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm">{row.label}{row.current ? ' · so far' : ''}</p>
                <p className="text-[11px] text-muted-foreground">{row.dates}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {row.pieces} pcs · {naira(row.workTakenIn)} in
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-display font-black text-sm text-success">{naira(row.received)}</p>
                <ChangeBadge change={row.compared.received} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
