import { useState, useMemo } from 'react';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { resolveBusinessType } from '@/lib/business-runtime';
import { createPortal } from 'react-dom';
import { StoreData, DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import { mostActivePeriods, ActivityRange, ActivityBucket } from '@/lib/manager-intel';
import { TrendingUp } from 'lucide-react';
import { activityColor, fmtPlusInterval } from './ui';

// ─── Activity Graph Card ──────────────────────────────────────────────────────
export default function MostActivePeriodsCard({ store }: { store: StoreData }) {
  const [range, setRange] = useState<ActivityRange>('today');
  const [selected, setSelected] = useState<ActivityBucket | null>(null);

  const settings = store.managerSettings || DEFAULT_MANAGER_SETTINGS;
  const interval = settings.graphInterval || 30;

  /*
   * A laundry has two busy times: when clothes come in, and when money does.
   * This only ever counted the money, so a morning of drop-offs read as a
   * quiet morning. A bundle counts in the same slots, at what it is worth.
   */
  const isLaundry = resolveBusinessType(store) === 'laundry';
  const [measure, setMeasure] = useState<'clothes' | 'money'>('clothes');
  const showClothes = isLaundry && measure === 'clothes';
  const laundryVersion = useShopLaundryVersion();
  const data = useMemo(() => {
    if (!showClothes) return mostActivePeriods(store, range, interval);
    let bundles: { createdAt: string; total: number }[] = [];
    try { bundles = shopLaundryRecords(String(store.accessCode || '')); } catch { /* nothing readable: an empty graph */ }
    const asSales = bundles.map(bundle => ({ date: bundle.createdAt, total: Number(bundle.total) || 0, profit: 0 }));
    return mostActivePeriods({ ...store, sales: asSales as unknown as StoreData['sales'] }, range, interval);
  }, [store, range, interval, showClothes, laundryVersion]);
  const maxRevenue = Math.max(1, ...data.buckets.map(b => b.revenue));

  const formatYAxisValue = (pct: number) => {
    const val = (maxRevenue * pct) / 100;
    if (val === 0) return '₦0';
    if (val >= 1000000) return `₦${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `₦${(val / 1000).toFixed(0)}k`;
    return `₦${val}`;
  };

  const rangeLabels: { id: ActivityRange; label: string }[] = [
    { id: 'today', label: 'Today' }, { id: '7d', label: '7D' },
    { id: '30d', label: '30D' }, { id: '1y', label: '1Y' }, { id: 'lifetime', label: 'All' },
  ];

  const barGap = interval === 10 ? 'gap-[1px]' : 'gap-[2px]';
  const barMinWidth = interval === 10 ? '1px' : '3px';

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="font-display font-bold text-sm">Most Active Periods</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{showClothes ? 'Value of clothes brought in' : 'Revenue'} by {interval}-min slots</p>
          {isLaundry && (
            <div className="flex gap-1 mt-2">
              {([['clothes', 'Clothes in'], ['money', 'Money in']] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setMeasure(id)} aria-pressed={measure === id}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-display font-semibold ${measure === id ? 'bg-primary/15 text-primary border border-primary/40' : 'bg-surface-2 text-muted-foreground border border-transparent'}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {rangeLabels.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className={`px-2 py-1 rounded-full text-[10px] font-display font-semibold transition-colors ${range === r.id ? 'bg-primary/15 text-primary border border-primary/40' : 'bg-surface-2 text-muted-foreground border border-border'}`}>{r.label}</button>
          ))}
        </div>
      </div>
      {data.totalSales === 0 ? (
        <div className="py-8 text-center"><p className="text-sm text-muted-foreground">{showClothes ? 'No clothes came in during this period.' : 'No sales in this period yet.'}</p></div>
      ) : (
        <>
          <div className="mt-3 relative">
            <div className="flex">
              <div className="w-10 flex flex-col justify-between text-[8px] text-muted-foreground pr-1 h-32 py-0.5">
                {[100, 75, 50, 25, 0].map(v => <span key={v} className="text-right truncate">{formatYAxisValue(v)}</span>)}
              </div>
              <div className="flex-1 relative">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  {[0, 1, 2, 3, 4].map(i => <div key={i} className="border-t border-border/40" />)}
                </div>
                <div className={`flex items-end ${barGap} h-32 relative`}>
                  {data.buckets.map((b, i) => {
                    const h = Math.max(2, (b.revenue / maxRevenue) * 100);
                    const isPeak = b.revenue === maxRevenue && maxRevenue > 0;
                    return (
                      <button key={b.minute} onClick={() => setSelected(b)}
                        className={`flex-1 rounded-t-sm transition-all hover:opacity-80 bar-grow-wave-item ${isPeak ? 'bar-breathe-anim' : ''}`}
                        style={{
                          height: `${h}%`,
                          background: activityColor(b.revenue, maxRevenue),
                          minWidth: barMinWidth,
                          animationDelay: `${i * 12}ms`,
                          transform: 'scaleY(0)'
                        }}
                        aria-label={showClothes
                          ? `${b.label}: ₦${b.revenue.toLocaleString()} worth of clothes (${b.sales} ${b.sales === 1 ? 'bundle' : 'bundles'})`
                          : `${b.label}: ₦${b.revenue.toLocaleString()} revenue (${b.sales} sales)`} />
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="relative h-4 mt-1 text-[9px] text-muted-foreground">
              <div className="absolute left-10 right-0 top-0 bottom-0">
                {data.buckets.map((b, i) => b.shortLabel ? (
                  <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(i / data.buckets.length) * 100}%` }}>
                    {b.shortLabel}
                  </span>
                ) : null)}
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: 'hsl(140 65% 38%)' }} />Low (Green)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: 'hsl(50 95% 55%)' }} />Mid (Yellow)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: 'hsl(18 95% 55%)' }} />High (Gold)</span>
          </div>
          {data.peakWindow && (
            <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/30 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs"><span className="text-foreground">Peak: </span><span className="font-display font-bold text-primary">{data.peakWindow.startLabel} – {data.peakWindow.endLabel}</span></p>
                <p className="text-[11px] text-muted-foreground">{isLaundry ? (showClothes ? 'Have enough people at the counter for these hours.' : 'Most money comes in around these hours.') : 'Plan stock and promotions around these hours.'}</p>
              </div>
            </div>
          )}
        </>
      )}
      {selected && createPortal(
        <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 animate-slide-up space-y-2" onClick={e => e.stopPropagation()}>
            <h4 className="font-display font-bold text-base">{selected.label} – {fmtPlusInterval(selected.minute, interval)}</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">{showClothes ? 'Bundles' : 'Sales'}</p><p className="font-display font-bold">{selected.sales}</p></div>
              <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">{showClothes ? 'Worth' : 'Revenue'}</p><p className="font-display font-bold text-yellow-500 text-xs">₦{Math.round(selected.revenue).toLocaleString()}</p></div>
              {!showClothes && <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Profit</p><p className="font-display font-bold text-success text-xs">₦{Math.round(selected.profit).toLocaleString()}</p></div>}
            </div>
            <button onClick={() => setSelected(null)} className="w-full mt-2 p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm">Close</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
