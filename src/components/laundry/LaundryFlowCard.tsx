import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StoreData } from '@/types/store';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { laundryFlow, type FlowBundle, type FlowPoint, type FlowRange } from '@/lib/laundry-flow';

/**
 * Clothes coming in and money coming in, on one line graph, and what that
 * means in words. First on a laundry's Analysis page, whose range buttons and
 * day-by-day list it shares rather than repeats.
 */

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

export default function LaundryFlowCard({ store, range }: { store: StoreData; range: FlowRange }) {
  const bundles = useBundles(store);
  const flow = useMemo(() => laundryFlow(store, bundles, range), [store, bundles, range]);
  const colors = seriesColors();
  const hasFlow = flow.broughtIn > 0 || flow.moneyIn > 0;
  // Over a short stretch each point is a day worth seeing, and a single point
  // has no line to draw at all.
  const dot = flow.points.length <= 14 ? { r: 3 } : false;

  return (
    <section className="p-4 rounded-2xl bg-card shadow-card space-y-4 text-left" aria-label="Clothes and money">
      <h3 className="font-display font-bold text-base">Clothes and money</h3>

      <div className="space-y-1" data-testid="flow-story">
        {/* What came in and what is paid on it. Who paid is in the bars below. */}
        {flow.story.slice(0, 2).map(line => <p key={line} className="text-sm text-foreground leading-snug">{line}</p>)}
        {flow.moneyIn > flow.paidOnThese && <p className="text-xs text-muted-foreground leading-snug">Money received in that time, older work included: {naira(flow.moneyIn)}.</p>}
      </div>

      {hasFlow && (
        <div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mb-1">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: colors.clothes }} />Value of clothes brought in</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded" style={{ background: colors.money }} />Money received</span>
          </div>
          <div className="h-52" role="img" aria-label={`Line graph by ${flow.unit}. ${flow.story.join(' ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={flow.points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
        <div className="space-y-2">
          <ShareRow label="Bundles paid in full" count={flow.paidInFull} of={flow.bundles} tone="bg-success" />
          <ShareRow label="Bundles part paid" count={flow.partPaid} of={flow.bundles} tone="bg-warning" />
          <ShareRow label="Bundles with nothing paid" count={flow.nothingPaid} of={flow.bundles} tone="bg-destructive" />
          <ShareRow label="Bundles collected" count={flow.collected} of={flow.bundles} tone="bg-primary" />
          <ShareRow label="Customers who have paid" count={flow.customersPaid} of={flow.customersBrought} tone="bg-success" />
        </div>
      )}

      {store.staffDevice && (
        <p className="text-[11px] text-muted-foreground leading-snug">
          On a worker's phone the money shown is only what this phone took. The owner's phone has the whole shop's money.
        </p>
      )}
    </section>
  );
}
