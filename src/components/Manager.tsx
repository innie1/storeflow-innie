import { useState, useMemo } from 'react';
import { StoreData, CustomerRequest, DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import { saveStore, getPendingSummary } from '@/lib/store-data';
import {
  healthScore, forecast, generateRecommendations, generateInsights,
  topCustomerRequests, mostActivePeriods, ActivityRange, ActivityBucket,
} from '@/lib/manager-intel';
import { showToast } from '@/components/Toast';
import Mascot, { MascotBadge } from '@/components/Mascot';

interface ManagerProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
  onEnable?: () => void;
}

type ManagerTab = 'overview' | 'insights' | 'recommendations';

function Ring({ value, size = 100, stroke = 9, tone = 'primary' }: { value: number; size?: number; stroke?: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;
  const colors: Record<string,string> = {
    primary: 'hsl(var(--primary))',
    success: 'hsl(var(--success))',
    warning: 'hsl(var(--warning))',
    danger: 'hsl(var(--destructive))',
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} stroke="hsl(var(--surface-2))" strokeWidth={stroke} fill="none" />
      <circle cx={size/2} cy={size/2} r={r} stroke={colors[tone]} strokeWidth={stroke} fill="none"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 800ms ease-out' }} />
    </svg>
  );
}

function activityColor(sales: number, max: number): string {
  if (max <= 0 || sales <= 0) return 'hsl(142 60% 25%)'; // very dark green for empty
  const r = sales / max;
  if (r >= 0.85) return 'hsl(18 95% 55%)';   // peak orange
  if (r >= 0.65) return 'hsl(38 95% 55%)';   // gold
  if (r >= 0.4)  return 'hsl(50 95% 55%)';   // yellow
  if (r >= 0.2)  return 'hsl(115 70% 50%)';  // bright green
  return 'hsl(140 65% 38%)';                 // dark green
}

function MostActivePeriodsCard({ store }: { store: StoreData }) {
  const [range, setRange] = useState<ActivityRange>('7d');
  const [selected, setSelected] = useState<ActivityBucket | null>(null);
  const data = useMemo(() => mostActivePeriods(store, range), [store, range]);
  const max = Math.max(1, ...data.buckets.map(b => b.sales));
  const rangeLabels: { id: ActivityRange; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7D' },
    { id: '30d', label: '30D' },
    { id: '1y', label: '1Y' },
    { id: 'lifetime', label: 'All' },
  ];

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="font-display font-bold text-sm flex items-center gap-1.5">
            Most Active Periods
            <span className="w-4 h-4 rounded-full bg-surface-2 border border-border text-[10px] flex items-center justify-center text-muted-foreground" title="When your customers buy the most">?</span>
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Sales activity by 30-min intervals</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {rangeLabels.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className={`px-2 py-1 rounded-full text-[10px] font-display font-semibold transition-colors ${
                range === r.id ? 'bg-primary/15 text-primary border border-primary/40' : 'bg-surface-2 text-muted-foreground border border-border'
              }`}>{r.label}</button>
          ))}
        </div>
      </div>

      {data.totalSales === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Not enough sales data yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Record more sales to discover your busiest periods.</p>
        </div>
      ) : (
        <>
          <div className="mt-3 relative">
            {/* y-axis grid */}
            <div className="flex">
              <div className="w-7 flex flex-col justify-between text-[9px] text-muted-foreground pr-1 h-32 py-0.5">
                {[100, 75, 50, 25, 0].map(v => <span key={v} className="text-right">{v}</span>)}
              </div>
              <div className="flex-1 relative">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  {[0,1,2,3,4].map(i => <div key={i} className="border-t border-border/40" />)}
                </div>
                <div className="flex items-end gap-[2px] h-32 relative">
                  {data.buckets.map((b) => {
                    const h = Math.max(2, (b.sales / max) * 100);
                    return (
                      <button key={b.minute} onClick={() => setSelected(b)}
                        className="flex-1 rounded-t-sm transition-all hover:opacity-80"
                        style={{
                          height: `${h}%`,
                          background: activityColor(b.sales, max),
                          minWidth: '4px',
                        }}
                        aria-label={`${b.label}: ${b.sales} sales`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex pl-7 mt-1 text-[9px] text-muted-foreground">
              {data.buckets.map((b, i) => (
                <span key={i} className="flex-1 text-left">{b.shortLabel}</span>
              ))}
            </div>
          </div>

          <div className="flex justify-center gap-4 mt-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{background:'hsl(140 65% 38%)'}}/>Low</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{background:'hsl(50 95% 55%)'}}/>Medium</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{background:'hsl(18 95% 55%)'}}/>High</span>
          </div>

          {data.peakWindow && (
            <div className="mt-3 p-3 rounded-xl bg-primary/5 border border-primary/30 flex items-center gap-2">
              <span className="text-base">📈</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs"><span className="text-foreground">You are most active between </span><span className="font-display font-bold text-primary">{data.peakWindow.startLabel} – {data.peakWindow.endLabel}</span></p>
                <p className="text-[11px] text-muted-foreground">Plan your stock and promotions around these hours.</p>
              </div>
              <span className="text-muted-foreground">›</span>
            </div>
          )}
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 animate-slide-up space-y-2" onClick={e => e.stopPropagation()}>
            <h4 className="font-display font-bold text-base">{selected.label} – {fmtPlus30(selected.minute)}</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Sales</p><p className="font-display font-bold">{selected.sales}</p></div>
              <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Revenue</p><p className="font-display font-bold text-primary text-xs">₦{Math.round(selected.revenue).toLocaleString()}</p></div>
              <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Profit</p><p className="font-display font-bold text-success text-xs">₦{Math.round(selected.profit).toLocaleString()}</p></div>
            </div>
            <button onClick={() => setSelected(null)} className="w-full mt-2 p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtPlus30(min: number): string {
  const end = Math.min(1440, min + 30);
  const h = Math.floor(end / 60);
  const m = end % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2,'0')} ${ampm}`;
}

function StoreHealthCard({ store, onOpenBreakdown }: { store: StoreData; onOpenBreakdown: () => void }) {
  const health = healthScore(store);
  const tone: 'success' | 'primary' | 'warning' | 'danger' =
    health.overall >= 80 ? 'success' : health.overall >= 60 ? 'primary' : health.overall >= 40 ? 'warning' : 'danger';
  const last7Sales = store.sales.filter(s => new Date(s.date).getTime() >= Date.now() - 7 * 86400000);
  const revenue = last7Sales.reduce((s, x) => s + x.total, 0);
  const profit = last7Sales.reduce((s, x) => s + x.profit, 0);
  const expenses = (store.expenses || []).filter(e => new Date(e.date).getTime() >= Date.now() - 7 * 86400000).reduce((s, e) => s + e.amount, 0);
  const inventory = store.products.reduce((s, p) => s + p.quantity, 0);
  const label = health.label;

  return (
    <button onClick={onOpenBreakdown} className="w-full text-left p-4 rounded-2xl bg-card shadow-card hover:border-primary/30 border border-transparent transition-colors">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-bold text-base">Store Health</h3>
        <span className="text-muted-foreground">›</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <Ring value={health.overall} size={104} tone={tone} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display font-bold text-3xl text-foreground leading-none">{health.overall}</span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
          <div className="p-2 rounded-lg bg-surface-2">
            <p className="text-[10px] text-muted-foreground">Sales</p>
            <p className="font-display font-bold text-sm truncate">₦{revenue.toLocaleString()}</p>
          </div>
          <div className="p-2 rounded-lg bg-surface-2">
            <p className="text-[10px] text-muted-foreground">Profit</p>
            <p className="font-display font-bold text-sm text-success truncate">₦{profit.toLocaleString()}</p>
          </div>
          <div className="p-2 rounded-lg bg-surface-2">
            <p className="text-[10px] text-muted-foreground">Expenses</p>
            <p className="font-display font-bold text-sm text-destructive truncate">₦{expenses.toLocaleString()}</p>
          </div>
          <div className="p-2 rounded-lg bg-surface-2">
            <p className="text-[10px] text-muted-foreground">Inventory</p>
            <p className="font-display font-bold text-sm">{inventory} <span className="text-[10px] text-muted-foreground font-normal">items</span></p>
          </div>
        </div>
      </div>
      <p className={`text-xs font-display font-semibold mt-3 ${tone === 'success' ? 'text-success' : tone === 'primary' ? 'text-primary' : tone === 'warning' ? 'text-warning' : 'text-destructive'}`}>{label}</p>
    </button>
  );
}

function HealthBreakdownModal({ store, onClose }: { store: StoreData; onClose: () => void }) {
  const h = healthScore(store);
  // Weights from spec
  const rows = [
    { label: 'Sales Consistency', weight: 30, score: h.sales },
    { label: 'Inventory Management', weight: 25, score: h.inventory },
    { label: 'Profitability', weight: 25, score: h.profit },
    { label: 'Expense Control', weight: 20, score: h.expense },
  ];
  return (
    <div className="fixed inset-0 z-[70] bg-background/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg">Store Health Breakdown</h3>
          <button onClick={onClose} className="text-muted-foreground text-lg">×</button>
        </div>
        <p className="font-display font-bold text-4xl text-primary">{h.overall}<span className="text-muted-foreground text-base font-normal">/100</span></p>
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.label}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-display font-semibold">{r.label}</span>
                <span className="text-xs text-muted-foreground">{r.score} · weight {r.weight}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${r.score}%` }} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Flow combines these signals into your overall Store Health score. Improving any single component lifts the total.
        </p>
        <button onClick={onClose} className="w-full p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold">Got it</button>
      </div>
    </div>
  );
}

export default function Manager({ store, onUpdate, onEnable }: ManagerProps) {
  const [tab, setTab] = useState<ManagerTab>('overview');
  const [requestText, setRequestText] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);

  const settings = store.managerSettings || DEFAULT_MANAGER_SETTINGS;

  if (!settings.enabled) {
    const enable = () => {
      const updated = { ...store, managerSettings: { ...settings, enabled: true } };
      saveStore(updated); onUpdate(updated);
      showToast('Flow activated');
      onEnable?.();
    };
    return (
      <div className="animate-fade-in space-y-4">
        <div className="p-6 rounded-2xl bg-card shadow-card text-center space-y-4">
          <div className="flex justify-center"><Mascot size={120} mood="sleeping" /></div>
          <MascotBadge on={false} />
          <h2 className="font-display font-bold text-xl text-foreground">Flow is sleeping</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Wake Flow up to unlock insights, forecasts, recommendations and savings plans tailored to your store.
          </p>
          <ul className="text-left text-sm text-muted-foreground max-w-xs mx-auto space-y-1.5">
            {['Business Insights','Revenue Forecasts','Expense Analysis','Product Suggestions','Savings Plans'].map(x => (
              <li key={x} className="flex items-center gap-2"><span className="text-success">✓</span>{x}</li>
            ))}
          </ul>
          <button onClick={enable} className="w-full max-w-xs mx-auto p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity">
            Activate Flow
          </button>
        </div>
      </div>
    );
  }

  const insights = generateInsights(store, '7d');
  const recs = generateRecommendations(store);
  // Daily-rate forecasts derived from 30-day horizon
  const f30 = forecast(store, 30);
  const dailyRev = f30.expectedRevenue / 30;
  const dailyProfit = f30.expectedProfit / 30;
  const requests = topCustomerRequests(store, 6);
  const savings = store.savingsGoal;

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const predictions = [
    { k: "Today's Sales",   v: dailyRev,        confKey: f30.confidence },
    { k: "Today's Profit",  v: dailyProfit,     confKey: f30.confidence },
    { k: 'This Week Sales', v: dailyRev * 7,    confKey: f30.confidence },
    { k: 'This Week Profit',v: dailyProfit * 7, confKey: f30.confidence },
  ];
  const confPct = (c: 'High'|'Medium'|'Low') => c === 'High' ? 86 : c === 'Medium' ? 72 : 55;

  const addRequest = () => {
    const text = requestText.trim();
    if (!text) return;
    const req: CustomerRequest = { id: Math.random().toString(36).slice(2), text, date: new Date().toISOString() };
    const updated = { ...store, customerRequests: [req, ...(store.customerRequests || [])] };
    saveStore(updated); onUpdate(updated);
    setRequestText('');
    showToast('Request recorded');
  };

  const tabs: { id: ManagerTab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'insights', label: 'Insights', badge: insights.length || undefined },
    { id: 'recommendations', label: 'Recommendations' },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      {/* Hero */}
      <div className="relative pt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display font-bold text-2xl truncate">{store.storeName}</h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/15 text-success text-[10px] font-display font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />Active
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Today, {today}</p>
          </div>
          <div className="flex-shrink-0 relative">
            <Mascot size={72} mood="happy" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-full bg-card border border-border">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative flex-1 px-3 py-2 rounded-full text-xs font-display font-semibold whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}>
            {t.label}
            {t.badge ? (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-white text-[9px] font-bold">{t.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          <StoreHealthCard store={store} onOpenBreakdown={() => setShowBreakdown(true)} />

          <MoneyOwedCard store={store} />

          <MostActivePeriodsCard store={store} />

          {settings.revenueForecasts && (
            <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm">Business Predictions</h3>
                <button onClick={() => setTab('insights')} className="text-xs text-primary font-display font-semibold">View all</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {predictions.map(p => (
                  <div key={p.k} className="p-3 rounded-xl bg-surface-2 border border-border space-y-1">
                    <p className="text-[11px] font-display font-semibold">{p.k}</p>
                    <p className="text-[10px] text-muted-foreground">Predicted</p>
                    <p className="font-display font-bold text-base text-primary">₦{Math.max(0, Math.round(p.v)).toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">Range: ₦{Math.max(0, Math.round(p.v * 0.8)).toLocaleString()} - ₦{Math.round(p.v * 1.2).toLocaleString()}</p>
                    <p className="text-[10px]"><span className="text-muted-foreground">Confidence: </span><span className="text-success font-display font-semibold">{confPct(p.confKey)}%</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {settings.savingsPlanner && savings && (
            <div className="p-4 rounded-2xl bg-card shadow-card">
              <h3 className="font-display font-bold text-sm mb-3">Savings Plan</h3>
              <div className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <Ring value={(savings.saved / Math.max(1, savings.amount)) * 100} size={84} tone="success" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display font-bold text-sm">{Math.round((savings.saved / Math.max(1, savings.amount)) * 100)}%</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">Goal: {savings.label || 'Savings Goal'}</p>
                  <p className="font-display font-bold text-lg text-foreground">₦{savings.amount.toLocaleString()}</p>
                  <p className="text-xs text-success">Saved: ₦{savings.saved.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">{savings.frequency ? `${savings.frequency} target` : `${savings.percentage}% of ${savings.source}`}</p>
                </div>
                <button className="px-4 py-2 rounded-full border border-primary/60 text-primary text-xs font-display font-bold whitespace-nowrap">View Plan</button>
              </div>
            </div>
          )}

          {recs.length > 0 && (
            <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm">Top Recommendations</h3>
                <button onClick={() => setTab('recommendations')} className="text-xs text-primary font-display font-semibold">View All</button>
              </div>
              <div className="space-y-2">
                {recs.slice(0, 3).map(r => (
                  <div key={r.id} className="p-3 rounded-xl bg-surface-2 border border-border flex items-start gap-3">
                    <span className="text-xl">{r.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-sm">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.detail}</p>
                    </div>
                    <span className="text-muted-foreground">›</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {settings.customerRequests && (
            <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
              <h3 className="font-display font-bold text-sm">Customer Requests</h3>
              <div className="flex gap-2">
                <input value={requestText} onChange={e => setRequestText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRequest()}
                  placeholder='e.g. "Peak Milk"'
                  className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-sm focus:outline-none focus:border-primary" />
                <button onClick={addRequest} className="px-4 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold">+ Record</button>
              </div>
              {requests.length > 0 ? (
                <div className="space-y-1.5">
                  {requests.map((r, i) => (
                    <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-surface-2 text-sm">
                      <span className="capitalize">{r.text}</span>
                      <span className="text-xs text-primary font-display font-semibold">requested {r.count}×</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No requests yet. Tap + Record when a customer asks for something out of stock.</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'insights' && (
        <div className="space-y-2 animate-fade-in">
          {insights.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No insights yet. Record more sales to unlock predictions.</p>}
          {insights.map(i => {
            const tones: Record<string,string> = {
              success: 'bg-success/10 border-success/30 text-success',
              warning: 'bg-warning/10 border-warning/30 text-warning',
              info: 'bg-primary/10 border-primary/30 text-primary',
              danger: 'bg-destructive/10 border-destructive/30 text-destructive',
            };
            return (
              <div key={i.id} className={`p-3 rounded-xl border flex items-start gap-3 ${tones[i.tone]}`}>
                <span className="text-xl">{i.icon}</span>
                <p className="font-display font-semibold text-sm flex-1">{i.text}</p>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'recommendations' && (
        <div className="space-y-2 animate-fade-in">
          {recs.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">All caught up — no recommendations right now.</p>}
          {recs.map(r => (
            <div key={r.id} className="p-3 rounded-xl bg-card shadow-card flex items-start gap-3">
              <span className="text-xl">{r.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-sm">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBreakdown && <HealthBreakdownModal store={store} onClose={() => setShowBreakdown(false)} />}
    </div>
  );
}
