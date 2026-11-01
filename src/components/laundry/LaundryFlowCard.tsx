import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StoreData } from '@/types/store';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { laundryFlow, laundryPace, PACE_MIN_DAYS, type FlowBundle, type FlowPoint, type FlowRange } from '@/lib/laundry-flow';

/**
 * Clothes coming in and money coming in, on one line graph, and what that
 * means in words. Shown first wherever a laundry owner comes to understand the
 * shop, so the answer is there before any tab has to be opened.
 */

const RANGES: { id: FlowRange; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'all', label: 'All' },
];

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

function shortNaira(value: number): string {
  if (value >= 1000000) return `₦${Number((value / 1000000).toFixed(2))}M`;
  // ₦2,500 is ₦2.5k: rounded to ₦3k, the scale would disagree with the figures.
  if (value >= 1000) return `₦${Number((value / 1000).toFixed(1))}k`;
  return `₦${Math.round(value)}`;
}

/** Selected for each mode, and checked against the chart surface in both. */
function seriesColors(): { clothes: string; money: string } {
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return dark ? { clothes: '#3987e5', money: '#d95926' } : { clothes: '#2a78d6', money: '#eb6834' };
}

function useBundles(store: StoreData): FlowBundle[] {
  const version = useShopLaundryVersion();
  return useMemo(() => {
    try {
      return shopLaundryRecords(String(store.accessCode || '')) as unknown as FlowBundle[];
    } catch {
      return [];
    }
    // The version says when the shop's bundles arrived or changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);
}

function FlowTooltip({ active, payload }: { active?: boolean; payload?: { payload: FlowPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-[11px] text-popover-foreground shadow-card">
      <p className="font-display font-bold">{point.label}</p>
      <p>Clothes in: {naira(point.broughtIn)} ({point.bundles} {point.bundles === 1 ? 'bundle' : 'bundles'}, {point.pieces} {point.pieces === 1 ? 'piece' : 'pieces'})</p>
      <p>Money received: {naira(point.moneyIn)}</p>
    </div>
  );
}

function ShareRow({ label, count, of, tone }: { label: string; count: number; of: number; tone: string }) {
  const share = of > 0 ? Math.round((count / of) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums"><b className="text-foreground">{share}%</b> · {count}</span>
      </div>
      <div className="h-1.5 mt-1 rounded-full bg-surface-2 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  );
}

export default function LaundryFlowCard({ store }: { store: StoreData }) {
  const [range, setRange] = useState<FlowRange>('30d');
  const bundles = useBundles(store);
  const flow = useMemo(() => laundryFlow(store, bundles, range), [store, bundles, range]);
  const colors = seriesColors();
  const worked = flow.points.filter(point => point.bundles > 0 || point.moneyIn > 0);
  const hasFlow = flow.broughtIn > 0 || flow.moneyIn > 0;
  // Over a short stretch each point is a day worth seeing, and a single point
  // has no line to draw at all.
  const dot = flow.points.length <= 14 ? { r: 3 } : false;

  return (
    <section className="p-4 rounded-2xl bg-card shadow-card space-y-4 text-left" aria-label="Clothes and money">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-bold text-base">Clothes and money</h3>
        <div className="flex gap-1">
          {RANGES.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              aria-pressed={range === item.id}
              className={`px-2.5 py-1 rounded-full text-[11px] font-display font-semibold ${range === item.id ? 'bg-primary/15 text-primary border border-primary/40' : 'bg-surface-2 text-muted-foreground border border-transparent'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1" data-testid="flow-story">
        {flow.story.map(line => <p key={line} className="text-sm text-foreground leading-snug">{line}</p>)}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          ['Clothes brought in', naira(flow.broughtIn), `${flow.bundles} ${flow.bundles === 1 ? 'bundle' : 'bundles'} · ${flow.pieces} ${flow.pieces === 1 ? 'piece' : 'pieces'}`],
          ['Money received', naira(flow.moneyIn), 'Includes older work paid now'],
          ['Paid on these clothes', `${flow.paidShare}%`, naira(flow.paidOnThese)],
          ['Still owed on these', naira(flow.owedOnThese), `${flow.nothingPaid} not paid at all`],
        ].map(([label, value, note]) => (
          <div key={label} className="p-2.5 rounded-xl bg-surface-2">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className="font-display font-black text-base tabular-nums leading-tight mt-0.5">{value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>
          </div>
        ))}
      </div>

      {hasFlow && (
        <div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mb-1">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: colors.clothes }} />Value of clothes brought in</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: colors.money }} />Money received</span>
          </div>
          <div className="h-52" role="img" aria-label={`Line graph by ${flow.unit}. ${flow.story.join(' ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flow.points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={28} />
                <YAxis width={40} tickFormatter={shortNaira} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<FlowTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
                <Line type="linear" dataKey="broughtIn" name="Value of clothes brought in" stroke={colors.clothes} strokeWidth={2} dot={dot} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line type="linear" dataKey="moneyIn" name="Money received" stroke={colors.money} strokeWidth={2} dot={dot} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {flow.bundles > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-display font-bold">The {flow.bundles} {flow.bundles === 1 ? 'bundle' : 'bundles'} brought in</p>
            <ShareRow label="Paid in full" count={flow.paidInFull} of={flow.bundles} tone="bg-success" />
            <ShareRow label="Part paid" count={flow.partPaid} of={flow.bundles} tone="bg-warning" />
            <ShareRow label="Nothing paid yet" count={flow.nothingPaid} of={flow.bundles} tone="bg-destructive" />
            <ShareRow label="Collected by the customer" count={flow.collected} of={flow.bundles} tone="bg-primary" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-display font-bold">The {flow.customersBrought} {flow.customersBrought === 1 ? 'customer' : 'customers'} who brought clothes</p>
            <ShareRow label="Have paid something" count={flow.customersPaid} of={flow.customersBrought} tone="bg-success" />
            <ShareRow label="Have not paid yet" count={flow.customersBrought - flow.customersPaid} of={flow.customersBrought} tone="bg-destructive" />
          </div>
        </div>
      )}

      {worked.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-display font-semibold text-primary">See the numbers for each {flow.unit}</summary>
          <table className="w-full mt-2 tabular-nums">
            <thead>
              <tr className="text-[10px] text-muted-foreground text-right">
                <th className="text-left font-medium py-1">{flow.unit === 'week' ? 'Week of' : 'Day'}</th>
                <th className="font-medium">Bundles</th>
                <th className="font-medium">Clothes in</th>
                <th className="font-medium">Money in</th>
              </tr>
            </thead>
            <tbody>
              {[...worked].reverse().map(point => (
                <tr key={point.key} className="border-t border-border/50 text-right">
                  <td className="text-left py-1.5">{point.label}</td>
                  <td>{point.bundles}</td>
                  <td>{naira(point.broughtIn)}</td>
                  <td>{naira(point.moneyIn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {store.staffDevice && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          On a worker's phone the money shown is only what this phone took. The owner's phone has the whole shop's money.
        </p>
      )}
    </section>
  );
}

/** If the next week goes like the last few: for the Forecasts tab. */
export function LaundryPaceCard({ store }: { store: StoreData }) {
  const bundles = useBundles(store);
  const pace = useMemo(() => laundryPace(store, bundles), [store, bundles]);
  return (
    <section className="p-4 rounded-2xl bg-card shadow-card space-y-3 text-left" aria-label="Next week at this pace">
      <div>
        <h3 className="font-display font-bold text-base">Next week at this pace</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Clothes and money, if next week goes like the last {Math.min(pace.daysKnown, 28)} days. An average, not a promise.</p>
      </div>
      {store.staffDevice && (
        <p className="text-[11px] text-muted-foreground">On a worker's phone the money shown is only what this phone took.</p>
      )}
      {pace.enough ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-surface-2">
              <p className="text-[10px] text-muted-foreground">Bundles</p>
              <p className="font-display font-bold text-sm tabular-nums">{pace.bundlesPerWeek}</p>
            </div>
            <div className="p-2 rounded-xl bg-surface-2">
              <p className="text-[10px] text-muted-foreground">Clothes worth</p>
              <p className="font-display font-bold text-sm tabular-nums">{naira(pace.broughtInPerWeek)}</p>
            </div>
            <div className="p-2 rounded-xl bg-surface-2">
              <p className="text-[10px] text-muted-foreground">Money in</p>
              <p className="font-display font-bold text-sm tabular-nums">{naira(pace.moneyPerWeek)}</p>
            </div>
          </div>
          {pace.gapPerWeek > 0 && (
            <p className="text-xs text-foreground">At this pace, about {naira(pace.gapPerWeek)} more of work comes in each week than money does.</p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          The shop has {pace.daysKnown} {pace.daysKnown === 1 ? 'day' : 'days'} of records. An estimate needs at least {PACE_MIN_DAYS}, so one busy day does not decide it.
        </p>
      )}
    </section>
  );
}
