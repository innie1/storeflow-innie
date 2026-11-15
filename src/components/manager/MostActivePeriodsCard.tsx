import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { resolveBusinessType } from '@/lib/business-runtime';
import { StoreData, DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import { busyTimes, ActivityRange, SlotActivity } from '@/lib/manager-intel';
import { Clock } from 'lucide-react';
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
 * green for what has been paid on them and amber for what is still owed - so
 * the busy hour and the hour the unpaid work arrives are read off one chart
 * instead of two. A shop that sells at a till is paid as it sells, so its bars
 * are all green.
 */
export default function MostActivePeriodsCard({ store }: { store: StoreData }) {
  const [range, setRange] = useState<ActivityRange>('7d');
  const [selected, setSelected] = useState<SlotActivity | null>(null);
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

  const top = Math.max(1, ...data.slots.map(slot => slot.paid + slot.unpaid));
  const noun = isLaundry ? (data.total === 1 ? 'bundle' : 'bundles') : (data.total === 1 ? 'sale' : 'sales');

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card">
      <h3 className="font-display font-bold text-base">Most active periods</h3>

      <div className="flex gap-1 mt-3 overflow-x-auto no-scrollbar">
        {RANGES.map(r => (
          <button key={r.id} type="button" onClick={() => setRange(r.id)} aria-pressed={range === r.id}
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
            <div className="flex-1 relative">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                {[0, 1, 2].map(i => <div key={i} className="border-t border-border/40" />)}
              </div>
              <div className={`relative flex items-end h-36 ${interval === 10 ? 'gap-px' : 'gap-[2px]'}`}>
                {data.slots.map(slot => {
                  const worth = slot.paid + slot.unpaid;
                  return (
                    <button
                      key={slot.minute}
                      type="button"
                      onClick={() => worth > 0 && setSelected(slot)}
                      className="flex-1 h-full flex flex-col justify-end min-w-[2px]"
                      aria-label={`${slot.label}: ${slot.count} ${isLaundry ? 'bundles' : 'sales'}, ${naira(slot.paid)} paid${isLaundry ? `, ${naira(slot.unpaid)} not paid` : ''}`}
                    >
                      {slot.unpaid > 0 && (
                        <span className="block w-full rounded-t-sm bg-orange-500" style={{ height: `${(slot.unpaid / top) * 100}%` }} />
                      )}
                      {slot.paid > 0 && (
                        <span className={`block w-full bg-success ${slot.unpaid > 0 ? 'mt-px' : 'rounded-t-sm'}`} style={{ height: `${(slot.paid / top) * 100}%` }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="relative h-4 mt-1 ml-9 text-[9px] text-muted-foreground">
            {data.slots.map((slot, i) => slot.shortLabel ? (
              <span key={slot.minute} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(i / data.slots.length) * 100}%` }}>
                {slot.shortLabel}
              </span>
            ) : null)}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-success" />Paid · <b className="text-foreground">{naira(data.paid)}</b></span>
            {isLaundry && (
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500" />Not paid · <b className="text-foreground">{naira(data.unpaid)}</b></span>
            )}
          </div>

          {data.peakWindow && (
            <div className="mt-3 p-3 rounded-xl bg-surface-2 flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs">
                Busiest <b className="font-display text-foreground">{data.peakWindow.startLabel} – {data.peakWindow.endLabel}</b>
                <span className="text-muted-foreground"> · {data.total} {noun}</span>
              </p>
            </div>
          )}
        </>
      )}

      {selected && createPortal(
        <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 animate-slide-up space-y-3" onClick={e => e.stopPropagation()}>
            <h4 className="font-display font-bold text-base">{selected.label} – {fmtPlusInterval(selected.minute, interval)}</h4>
            <div className={`grid gap-2 text-center ${isLaundry ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">{isLaundry ? 'Bundles' : 'Sales'}</p><p className="font-display font-bold">{selected.count}</p></div>
              <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Paid</p><p className="font-display font-bold text-success text-sm">{naira(selected.paid)}</p></div>
              {isLaundry && <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Not paid</p><p className="font-display font-bold text-orange-500 text-sm">{naira(selected.unpaid)}</p></div>}
            </div>
            <button type="button" onClick={() => setSelected(null)} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm">Close</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
