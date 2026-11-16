import { useState, useMemo, type MouseEvent } from 'react';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { resolveBusinessType } from '@/lib/business-runtime';
import { StoreData, DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import { busyTimes, busyWindow, hourLabel, nearestBusySlot, ActivityRange } from '@/lib/manager-intel';
import { Clock, X } from 'lucide-react';
import { fmtPlusInterval } from './ui';

const RANGES: { id: ActivityRange; label: string }[] = [
  { id: '7d', label: '7 days' }, { id: 'today', label: 'Today' },
  { id: '30d', label: '30 days' }, { id: '1y', label: 'Year' }, { id: 'lifetime', label: 'All' },
];

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const short = (value: number) => {
  if (value >= 1_000_000) return `₦${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `₦${Math.round(value / 1000)}k`;
  return `₦${Math.round(value)}`;
};

/**
 * When the shop is busiest, and how much of that work is paid for.
 *
 * One bar a time slot. For a laundry each bar is the clothes brought in then,
 * green for what has been paid on them and orange for what has not - so the
 * busy hour and the hour the unpaid work arrives are read off one chart
 * instead of two. A shop that sells at a till is paid as it sells, so its bars
 * are all green.
 *
 * Only the hours the shop is busy are drawn, so the bars are wide enough to
 * see and to tap; a chart from midnight to midnight was mostly empty night.
 *
 * A bar is one shape. The two colours used to be two boxes with a pixel of
 * space between them, which showed on some bars and not on others; the orange
 * is now laid over the top of a single green bar, so there is no seam.
 *
 * And the whole chart is the thing you tap. A bar is a few pixels wide, so
 * a finger landed between bars as often as on one and nothing happened.
 * A tap anywhere picks the nearest bar, and what it holds is written under the
 * chart instead of in a pop-up that covered it.
 */
export default function MostActivePeriodsCard({ store }: { store: StoreData }) {
  const [range, setRange] = useState<ActivityRange>('7d');
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const interval = (store.managerSettings || DEFAULT_MANAGER_SETTINGS).graphInterval || 30;
  const isLaundry = resolveBusinessType(store) === 'laundry';
  const laundryVersion = useShopLaundryVersion();

  const data = useMemo(() => {
    if (!isLaundry) {
      const sales = (store.sales || []).map(sale => ({ at: sale.date, paid: Number(sale.total) || 0, unpaid: 0 }));
      return busyTimes(sales, range, interval);
    }
    let bundles: ReturnType<typeof shopLaundryRecords> = [];
    try { bundles = shopLaundryRecords(String(store.accessCode || '')); } catch { /* nothing readable: an empty graph */ }
    // The same rule as Clothes and money: paid is what the bundle's own
    // payment record says, and no record means nothing paid.
    const debts = new Map((store.pendingPayments || []).map(entry => [entry.id, entry]));
    const items = bundles.map(bundle => {
      const total = Math.max(0, Number(bundle.total) || 0);
      const paid = Math.min(total, Math.max(0, Number(debts.get(`laundry-${bundle.clientRef}`)?.paid) || 0));
      return { at: String(bundle.createdAt || ''), paid, unpaid: total - paid };
    });
    return busyTimes(items, range, interval);
  }, [store, range, interval, isLaundry, laundryVersion]);

  const shown = useMemo(() => busyWindow(data.slots, interval), [data, interval]);
  const top = Math.max(1, ...data.slots.map(slot => slot.paid + slot.unpaid));
  const noun = (count: number) => (isLaundry ? (count === 1 ? 'bundle' : 'bundles') : (count === 1 ? 'sale' : 'sales'));
  const selected = data.slots.find(slot => slot.minute === selectedMinute && slot.paid + slot.unpaid > 0) || null;
  const selectedWorth = selected ? selected.paid + selected.unpaid : 0;

  const pickNearest = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    const slot = nearestBusySlot(shown, (event.clientX - box.left) / box.width);
    if (slot) setSelectedMinute(slot.minute);
  };

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card">
      <h3 className="font-display font-bold text-base">Most active periods</h3>

      <div className="flex gap-1 mt-3 overflow-x-auto no-scrollbar">
        {RANGES.map(r => (
          <button key={r.id} type="button" onClick={() => { setRange(r.id); setSelectedMinute(null); }} aria-pressed={range === r.id}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-display font-semibold transition-colors ${range === r.id ? 'bg-primary/15 text-primary border border-primary/40' : 'bg-surface-2 text-muted-foreground border border-transparent'}`}>
            {r.label}
          </button>
        ))}
      </div>

      {data.total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {isLaundry ? 'No clothes came in during this time.' : 'No sales during this time.'}
        </p>
      ) : (
        <>
          <div className="mt-4 flex">
            <div className="w-9 flex flex-col justify-between text-[9px] text-muted-foreground pr-1 h-36 text-right">
              <span>{short(top)}</span>
              <span>{short(top / 2)}</span>
              <span>₦0</span>
            </div>
            <div className="flex-1 relative cursor-pointer" onClick={pickNearest} data-busy-chart>
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[0, 1, 2].map(i => <div key={i} className="border-t border-border/40" />)}
              </div>
              <div className={`relative flex items-end h-36 ${shown.length > 60 ? 'gap-px' : 'gap-[2px]'}`}>
                {shown.map(slot => {
                  const worth = slot.paid + slot.unpaid;
                  const isSelected = selected?.minute === slot.minute;
                  return (
                    <div key={slot.minute} className="flex-1 h-full flex flex-col justify-end min-w-[2px]">
                      {worth > 0 && (
                        <button
                          type="button"
                          onClick={event => { event.stopPropagation(); setSelectedMinute(slot.minute); }}
                          aria-pressed={isSelected}
                          aria-label={`${slot.label}: ${slot.count} ${noun(slot.count)}, ${naira(slot.paid)} paid${isLaundry ? `, ${naira(slot.unpaid)} not paid` : ''}`}
                          className={`relative block w-full min-h-[3px] overflow-hidden rounded-t-[3px] transition-opacity ${slot.paid > 0 ? 'bg-success' : 'bg-orange-500'} ${selected && !isSelected ? 'opacity-35' : ''}`}
                          style={{ height: `${(worth / top) * 100}%` }}
                        >
                          {/* Not paid is laid over the top of the one green bar: one shape, no seam.
                              Pinned to the top, because a button centres whatever is inside it. */}
                          {slot.paid > 0 && slot.unpaid > 0 && (
                            <span className="absolute inset-x-0 top-0 bg-orange-500" style={{ height: `${(slot.unpaid / worth) * 100}%` }} />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="relative h-4 mt-1 ml-9 text-[9px] text-muted-foreground">
            {shown.map((slot, i) => {
              const label = hourLabel(slot, shown.length, interval);
              return label ? (
                <span key={slot.minute} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(i / shown.length) * 100}%` }}>
                  {label}
                </span>
              ) : null;
            })}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-success" />Paid · <b className="text-foreground">{naira(data.paid)}</b></span>
            {isLaundry && (
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />Not paid · <b className="text-foreground">{naira(data.unpaid)}</b></span>
            )}
          </div>

          {selected ? (
            <div className="mt-3 p-3 rounded-xl bg-surface-2 space-y-2.5" data-slot-detail>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display font-bold text-sm">{selected.label} – {fmtPlusInterval(selected.minute, interval)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {selected.count} {noun(selected.count)} · {naira(selectedWorth)}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedMinute(null)} aria-label="Close" className="p-1 -m-1 text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {isLaundry && (
                <div className={`h-2 rounded-full overflow-hidden ${selected.paid > 0 ? 'bg-success' : 'bg-orange-500'}`}>
                  {selected.paid > 0 && selected.unpaid > 0 && (
                    <div className="h-full bg-orange-500 ml-auto" style={{ width: `${(selected.unpaid / selectedWorth) * 100}%` }} />
                  )}
                </div>
              )}
              <div className={`grid gap-2 ${isLaundry ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-success" />Paid</p>
                  <p className="font-display font-bold text-sm">
                    {naira(selected.paid)}
                    {isLaundry && <span className="text-[11px] font-normal text-muted-foreground"> · {Math.round((selected.paid / selectedWorth) * 100)}%</span>}
                  </p>
                </div>
                {isLaundry && (
                  <div>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-orange-500" />Not paid</p>
                    <p className="font-display font-bold text-sm">
                      {naira(selected.unpaid)}
                      <span className="text-[11px] font-normal text-muted-foreground"> · {Math.round((selected.unpaid / selectedWorth) * 100)}%</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {data.peakWindow && (
                <div className="mt-3 p-3 rounded-xl bg-surface-2 flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-xs">
                    Busiest <b className="font-display text-foreground">{data.peakWindow.startLabel} – {data.peakWindow.endLabel}</b>
                    <span className="text-muted-foreground"> · {data.total} {noun(data.total)}</span>
                  </p>
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Tap the chart to see {isLaundry ? 'what was paid and not paid' : 'what was sold'} at that time.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
