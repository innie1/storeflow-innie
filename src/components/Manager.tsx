import { useState, useMemo, useEffect } from 'react';
import { StoreData, CustomerRequest, DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import { saveStore, getPendingSummary } from '@/lib/store-data';
import {
  healthScore, forecastHorizon, generateRecommendations, generateInsights,
  generateAdvice, topCustomerRequests, mostActivePeriods, inventoryIntelligence,
  expenseAnalysis, rentAnalysis, pricingAlerts, analyzeSales, flowGreeting,
  generateNotifications, ActivityRange, ActivityBucket, generateFlowReport,
} from '@/lib/manager-intel';
import { getFlowMemory, recordStreak, getCoins, addCoins, Supplier, addSupplier, deleteSupplier, claimReferral, addFlowReward } from '@/lib/flow-memory';
import { showToast } from '@/components/Toast';
import Mascot, { MascotBadge } from '@/components/Mascot';
import { FlowIcon } from '@/components/FlowIcon';

interface ManagerProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
  onEnable?: () => void;
}

type ManagerTab = 'overview' | 'predictions' | 'analysis' | 'advice';

// ─── Ring ─────────────────────────────────────────────────────────────────────
function Ring({ value, size = 100, stroke = 9, tone = 'primary' }: { value: number; size?: number; stroke?: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)); const dash = (pct / 100) * c;
  const colors: Record<string, string> = { primary: 'hsl(var(--primary))', success: 'hsl(var(--success))', warning: 'hsl(var(--warning))', danger: 'hsl(var(--destructive))' };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--surface-2))" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={colors[tone]} strokeWidth={stroke} fill="none"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 800ms ease-out' }} />
    </svg>
  );
}

// ─── Activity graph helpers ───────────────────────────────────────────────────
function activityColor(revenue: number, maxRevenue: number): string {
  if (revenue <= 0) return 'hsl(142 60% 25%)'; // Neutral/empty bar

  let greenThreshold = 10000;
  let yellowThreshold = 30000;

  if (maxRevenue > 30000) {
    greenThreshold = maxRevenue * 0.33;
    yellowThreshold = maxRevenue * 0.7;
  }

  if (revenue <= greenThreshold) {
    return 'hsl(140 65% 38%)'; // Green bar
  } else if (revenue <= yellowThreshold) {
    return 'hsl(50 95% 55%)'; // Yellowish bar
  } else {
    return 'hsl(18 95% 55%)'; // Gold bar
  }
}
function fmtPlusInterval(min: number, interval = 30): string {
  const end = Math.min(1440, min + interval); const h = Math.floor(end / 60); const m = end % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// ─── Health Breakdown Modal ───────────────────────────────────────────────────
function HealthBreakdownModal({ store, onClose }: { store: StoreData; onClose: () => void }) {
  const h = healthScore(store);
  const rows = [
    { label: 'Revenue Performance', weight: 25, score: h.revenue, detail: h.details.revenue },
    { label: 'Profit Performance', weight: 25, score: h.profit, detail: h.details.profit },
    { label: 'Inventory Health', weight: 15, score: h.inventory, detail: h.details.inventory },
    { label: 'Expense Control', weight: 15, score: h.expense, detail: h.details.expense },
    { label: 'Savings Progress', weight: 10, score: h.savings, detail: h.details.savings },
    { label: 'Customer Debt', weight: 10, score: h.debt, detail: h.details.debt },
  ];
  const tone = h.overall >= 80 ? 'text-success' : h.overall >= 60 ? 'text-primary' : h.overall >= 40 ? 'text-warning' : 'text-destructive';
  return (
    <div className="fixed inset-0 z-[70] bg-background/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-lg">Store Health Breakdown</h3>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">×</button>
        </div>
        <div className="text-center">
          <p className={`font-display font-bold text-5xl ${tone}`}>{h.overall}<span className="text-muted-foreground text-lg font-normal">/100</span></p>
          <p className={`text-sm font-display font-semibold mt-1 ${tone}`}>{h.label}</p>
        </div>
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.label}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-display font-semibold">{r.label}</span>
                <span className="text-xs text-muted-foreground">{r.score}/100 · {r.weight}%</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden mb-1">
                <div className={`h-full transition-all ${r.score >= 70 ? 'bg-success' : r.score >= 40 ? 'bg-warning' : 'bg-destructive'}`} style={{ width: `${r.score}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground">{r.detail}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Flow weighs these 6 signals into your Store Health score. Improving any component lifts the total.
        </p>
        <button onClick={onClose} className="w-full p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold">Got it</button>
      </div>
    </div>
  );
}

// ─── Store Health Card ────────────────────────────────────────────────────────
function StoreHealthCard({ store, onOpenBreakdown, animate = true }: { store: StoreData; onOpenBreakdown: () => void; animate?: boolean }) {
  const health = healthScore(store);
  const tone: 'success' | 'primary' | 'warning' | 'danger' = health.overall >= 80 ? 'success' : health.overall >= 60 ? 'primary' : health.overall >= 40 ? 'warning' : 'danger';
  const last7Sales = store.sales.filter(s => new Date(s.date).getTime() >= Date.now() - 7 * 86400000);
  const revenue = last7Sales.reduce((s, x) => s + x.total, 0);
  const profit = last7Sales.reduce((s, x) => s + x.profit, 0);
  const expenses = (store.expenses || []).filter(e => new Date(e.date).getTime() >= Date.now() - 7 * 86400000).reduce((s, e) => s + e.amount, 0);

  const animatedHealth = useCountUp(animate ? health.overall : 0, 1500);
  const displayHealth = animate ? animatedHealth : health.overall;
  const isHealthDone = animate ? animatedHealth === health.overall : true;

  const animatedRevenue = useCountUp(animate ? revenue : 0, 2000);
  const displayRevenue = animate ? animatedRevenue : revenue;

  const animatedProfit = useCountUp(animate ? profit : 0, 2000);
  const displayProfit = animate ? animatedProfit : profit;
  const isProfitDone = animate ? animatedProfit === profit : true;

  const animatedExpenses = useCountUp(animate ? expenses : 0, 2000);
  const displayExpenses = animate ? animatedExpenses : expenses;
  const isExpenseDone = animate ? animatedExpenses === expenses : true;

  return (
    <button onClick={onOpenBreakdown} className="w-full text-left p-4 rounded-2xl bg-card shadow-card hover:border-primary/30 border border-transparent transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div><h3 className="font-display font-bold text-base">Store Health</h3><p className="text-[10px] text-muted-foreground">Tap to see breakdown</p></div>
        <span className="text-muted-foreground">›</span>
      </div>
      <div className="flex items-center gap-4">
        <div className={`relative flex-shrink-0 ${animate && isHealthDone ? 'pulse-once-anim' : ''}`}>
          <Ring value={displayHealth} size={104} tone={tone} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display font-bold text-3xl text-foreground leading-none">{displayHealth}</span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-2 min-w-0">
          <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Revenue</p><p className="font-display font-bold text-sm truncate">₦{displayRevenue.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Profit</p><p className={`font-display font-bold text-sm truncate transition-all duration-300 ${animate && isProfitDone && profit > 0 ? 'text-success font-black drop-shadow-[0_0_4px_rgba(34,197,94,0.3)] pulse-twice-anim' : 'text-success'}`}>₦{displayProfit.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Expenses</p><p className={`font-display font-bold text-sm truncate transition-all duration-300 ${animate && isExpenseDone && expenses > 0 ? 'text-destructive font-black drop-shadow-[0_0_4px_rgba(239,68,68,0.3)]' : 'text-destructive'}`}>₦{displayExpenses.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Score</p><p className={`font-display font-bold text-sm ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-primary'}`}>{health.label}</p></div>
        </div>
      </div>
    </button>
  );
}

// ─── Money Owed Card ──────────────────────────────────────────────────────────
function MoneyOwedCard({ store }: { store: StoreData }) {
  const s = getPendingSummary(store);
  if (s.list.length === 0) return null;
  const advices: string[] = [];
  if (s.totalOwed > 0) advices.push(`Collecting 50% would add ₦${Math.round(s.totalOwed * 0.5).toLocaleString()} this month.`);
  if (s.overdue.length > 0) advices.push(`${s.overdue.length} customer${s.overdue.length === 1 ? ' is' : 's are'} overdue.`);
  const nameCount = new Map<string, number>();
  (store.pendingPayments || []).forEach(p => nameCount.set(p.customerName, (nameCount.get(p.customerName) || 0) + 1));
  const repeat = [...nameCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (repeat && repeat[1] >= 2) advices.push(`${repeat[0]} has delayed payment ${repeat[1]} times.`);
  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
      <div className="flex items-start justify-between">
        <div><h3 className="font-display font-bold text-sm">💳 Money Owed To You</h3><p className="text-[11px] text-muted-foreground">Outstanding customer balances</p></div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-display font-bold ${s.recoveryRate >= 70 ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>{s.recoveryRate}% recovered</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/20"><p className="text-[10px] text-muted-foreground uppercase">Outstanding</p><p className="font-display font-bold text-warning text-sm">₦{s.totalOwed.toLocaleString()}</p></div>
        <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Customers</p><p className="font-display font-bold text-sm">{s.customerCount}</p></div>
        <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Overdue</p><p className="font-display font-bold text-sm text-destructive">{s.overdue.length}</p></div>
      </div>
      {advices.length > 0 && <div className="space-y-1.5">{advices.map((a, i) => (<p key={i} className="text-[11px] text-foreground/90 leading-snug flex gap-1.5"><span>💡</span><span className="flex-1">{a}</span></p>))}</div>}
    </div>
  );
}

// ─── Activity Graph Card ──────────────────────────────────────────────────────
function MostActivePeriodsCard({ store }: { store: StoreData }) {
  const [range, setRange] = useState<ActivityRange>('today');
  const [selected, setSelected] = useState<ActivityBucket | null>(null);
  
  const settings = store.managerSettings || DEFAULT_MANAGER_SETTINGS;
  const interval = settings.graphInterval || 30;

  const data = useMemo(() => mostActivePeriods(store, range, interval), [store, range, interval]);
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
          <p className="text-[11px] text-muted-foreground mt-0.5">Revenue by {interval}-min slots</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {rangeLabels.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className={`px-2 py-1 rounded-full text-[10px] font-display font-semibold transition-colors ${range === r.id ? 'bg-primary/15 text-primary border border-primary/40' : 'bg-surface-2 text-muted-foreground border border-border'}`}>{r.label}</button>
          ))}
        </div>
      </div>
      {data.totalSales === 0 ? (
        <div className="py-8 text-center"><p className="text-sm text-muted-foreground">No sales in this period yet.</p></div>
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
                        aria-label={`${b.label}: ₦${b.revenue.toLocaleString()} revenue (${b.sales} sales)`} />
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
              <span className="text-base">📈</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs"><span className="text-foreground">Peak: </span><span className="font-display font-bold text-primary">{data.peakWindow.startLabel} – {data.peakWindow.endLabel}</span></p>
                <p className="text-[11px] text-muted-foreground">Plan stock and promotions around these hours.</p>
              </div>
            </div>
          )}
        </>
      )}
      {selected && (
        <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 animate-slide-up space-y-2" onClick={e => e.stopPropagation()}>
            <h4 className="font-display font-bold text-base">{selected.label} – {fmtPlusInterval(selected.minute, interval)}</h4>
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

// ─── Supplier Panel ───────────────────────────────────────────────────────────
function SupplierPanel() {
  const mem = getFlowMemory();
  const [suppliers, setSuppliers] = useState<Supplier[]>(mem.suppliers);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', products: '', pricePerUnit: '', unit: '', distance: '', notes: '' });

  const handleAdd = () => {
    if (!form.name.trim()) return showToast('Supplier name required', 'error');
    const s = addSupplier({ name: form.name.trim(), products: form.products.split(',').map(p => p.trim()).filter(Boolean), pricePerUnit: Number(form.pricePerUnit) || 0, unit: form.unit, distance: form.distance, notes: form.notes });
    setSuppliers(prev => [s, ...prev]);
    setAdding(false);
    setForm({ name: '', products: '', pricePerUnit: '', unit: '', distance: '', notes: '' });
    showToast('Supplier added');
  };

  const handleDelete = (id: string) => { deleteSupplier(id); setSuppliers(prev => prev.filter(s => s.id !== id)); showToast('Supplier removed'); };

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-sm">🏭 Suppliers</h3>
        <button onClick={() => setAdding(!adding)} className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-display font-bold">+ Add</button>
      </div>
      {adding && (
        <div className="space-y-2 p-3 rounded-xl bg-surface-2 border border-border">
          <input placeholder="Supplier name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full p-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary" />
          <input placeholder="Products (comma separated)" value={form.products} onChange={e => setForm(f => ({ ...f, products: e.target.value }))} className="w-full p-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary" />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Price per unit (₦)" type="number" value={form.pricePerUnit} onChange={e => setForm(f => ({ ...f, pricePerUnit: e.target.value }))} className="w-full p-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary" />
            <input placeholder="Unit (e.g. carton)" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full p-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary" />
          </div>
          <input placeholder="Distance (e.g. 2km)" value={form.distance} onChange={e => setForm(f => ({ ...f, distance: e.target.value }))} className="w-full p-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary" />
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-lg bg-card border border-border text-sm">Cancel</button>
            <button onClick={handleAdd} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold">Save</button>
          </div>
        </div>
      )}
      {suppliers.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">No suppliers yet. Add them to compare prices.</p>
      ) : (
        <div className="space-y-2">
          {suppliers.map(s => (
            <div key={s.id} className="p-3 rounded-xl bg-surface-2 border border-border">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm">{s.name}</p>
                  {s.products.length > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{s.products.join(', ')}</p>}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {s.pricePerUnit > 0 && <span className="text-[10px] text-primary font-display font-bold">₦{s.pricePerUnit.toLocaleString()} {s.unit ? `/ ${s.unit}` : ''}</span>}
                    {s.distance && <span className="text-[10px] text-muted-foreground">📍 {s.distance}</span>}
                  </div>
                </div>
                <button onClick={() => handleDelete(s.id)} className="text-destructive text-sm px-2">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Coins Card ───────────────────────────────────────────────────────────────
// ─── Flow Wallet Card ─────────────────────────────────────────────────────────
function FlowWalletCard({ store, onUpdate }: { store: StoreData; onUpdate: (s: StoreData) => void }) {
  const [mem, setMem] = useState(() => getFlowMemory());
  const [refCode, setRefCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [showTx, setShowTx] = useState(false);

  const todaySales = store.sales.filter(s => s.date.startsWith(new Date().toISOString().split('T')[0])).length;
  const { streak, flowBalance, lifetimeFlowEarned, flowEarnedToday, flowTransactions = [], claimedReferralCode } = mem;

  const handleClaimReferral = () => {
    const code = refCode.trim();
    if (!code) return;
    setClaiming(true);
    setTimeout(() => {
      const res = claimReferral(code);
      if (res.success) {
        showToast(res.message, 'success');
        const updatedMem = getFlowMemory();
        setMem(updatedMem);
        // Force update store coins for compatibility
        const updatedStore = {
          ...store,
          coins: updatedMem.coins,
        };
        saveStore(updatedStore);
        onUpdate(updatedStore);
        setRefCode('');
      } else {
        showToast(res.message, 'error');
      }
      setClaiming(false);
    }, 800);
  };

  const getTxColor = (type: string) => {
    switch (type) {
      case 'referral': return 'text-purple-400';
      case 'streak': return 'text-amber-400';
      case 'daily': return 'text-emerald-400';
      case 'game': return 'text-sky-400';
      default: return 'text-gold';
    }
  };

  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-gold/15 via-gold-dim/5 to-surface-1 border border-gold/25 shadow-card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlowIcon className="w-6 h-6 animate-pulse" />
          <h3 className="font-display font-bold text-base text-white tracking-wide">FLOW Wallet</h3>
        </div>
        <span className="text-[10px] bg-gold/10 border border-gold/30 text-gold px-2 py-0.5 rounded-full font-display font-semibold uppercase tracking-wider">
          1 FLOW = ₦20
        </span>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 gap-3">
        {/* Balance Card */}
        <div className="p-3.5 rounded-xl bg-gold/5 border border-gold/15 relative overflow-hidden flex flex-col justify-between min-h-[90px]">
          <div className="absolute -right-3 -top-3 opacity-10">
            <FlowIcon className="w-16 h-16" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Available FLOW</p>
            <p className="font-display font-extrabold text-2xl text-gold mt-1">
              {flowBalance.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </p>
          </div>
          <p className="font-display font-bold text-xs text-emerald-400 mt-1">
            ≈ ₦{(flowBalance * 20).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {/* Earnings Card */}
        <div className="p-3.5 rounded-xl bg-surface-2 border border-border flex flex-col justify-between min-h-[90px]">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Today's Earned</p>
            <p className="font-display font-bold text-base text-white mt-1">
              +{flowEarnedToday.toLocaleString(undefined, { minimumFractionDigits: 1 })} FLOW
            </p>
          </div>
          <div className="text-[10px] text-muted-foreground pt-1 border-t border-border mt-2 flex justify-between">
            <span>Lifetime:</span>
            <span className="font-bold text-white">{lifetimeFlowEarned.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
          </div>
        </div>
      </div>

      {/* Streak & Activity Progress */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-xl bg-surface-2 border border-border/60 text-center flex items-center justify-between px-3">
          <div className="text-left">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">🔥 Streak</p>
            <p className="font-display font-bold text-xs text-white mt-0.5">{streak} day{streak !== 1 ? 's' : ''}</p>
          </div>
          <div className="text-lg">🔥</div>
        </div>
        <div className="p-2.5 rounded-xl bg-surface-2 border border-border/60 text-center flex items-center justify-between px-3">
          <div className="text-left">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Today's Sales</p>
            <p className="font-display font-bold text-xs text-white mt-0.5">{todaySales} sale{todaySales !== 1 ? 's' : ''}</p>
          </div>
          <div className="text-lg">📈</div>
        </div>
      </div>

      {/* Referral Welcomer Code Section */}
      <div className="p-3.5 rounded-xl bg-surface-2/40 border border-border/60 space-y-2">
        <h4 className="font-display font-bold text-xs text-white flex items-center gap-1.5">
          🎁 Welcome Bonus
        </h4>
        {claimedReferralCode ? (
          <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
            <span>Claimed: <strong>{claimedReferralCode}</strong></span>
            <span className="font-bold">+5 FLOW Bonus</span>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-muted-foreground">Enter a referral code to instantly claim 5 FLOW welcome bonus (₦100).</p>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="e.g. FLOW-WELCOME" 
                value={refCode}
                onChange={e => setRefCode(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-surface-3 border border-border text-xs text-white placeholder-muted-foreground focus:outline-none focus:border-gold"
              />
              <button 
                onClick={handleClaimReferral}
                disabled={claiming || !refCode.trim()}
                className="px-3 py-1.5 bg-gold text-surface-1 font-display font-bold text-xs rounded-lg hover:brightness-110 active:scale-95 transition disabled:opacity-50"
              >
                {claiming ? 'Claiming...' : 'Claim'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible Recent Transactions */}
      {flowTransactions.length > 0 && (
        <div className="space-y-1.5">
          <button 
            onClick={() => setShowTx(!showTx)} 
            className="w-full flex items-center justify-between p-2.5 rounded-xl bg-surface-2 border border-border text-xs text-muted-foreground font-display font-semibold hover:text-white transition"
          >
            <span>📜 Recent Transactions ({flowTransactions.length})</span>
            <span>{showTx ? '▲' : '▼'}</span>
          </button>
          
          {showTx && (
            <div className="p-2 rounded-xl bg-surface-2 border border-border/50 max-h-[150px] overflow-y-auto space-y-1.5 scrollbar-thin">
              {flowTransactions.map((tx: any) => (
                <div key={tx.id} className="flex justify-between items-start p-2 rounded-lg bg-surface-3 text-[11px] border border-border/30">
                  <div className="space-y-0.5 max-w-[70%]">
                    <p className="text-white font-medium truncate">{tx.description}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {new Date(tx.date).toLocaleDateString()} · <span className={`capitalize font-semibold ${getTxColor(tx.type)}`}>{tx.type}</span>
                    </p>
                  </div>
                  <span className="font-display font-bold text-gold flex-shrink-0">
                    +{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Notification Drawer ──────────────────────────────────────────────────────
function NotificationDrawer({ store, onClose, onUpdate }: { store: StoreData; onClose: () => void; onUpdate: (s: StoreData) => void }) {
  const notes = store.flowNotifications || [];
  const markAllRead = () => {
    const updated = { ...store, flowNotifications: notes.map(n => ({ ...n, read: true })) };
    saveStore(updated); onUpdate(updated);
  };

  useEffect(() => {
    if (notes.some(n => !n.read)) {
      const updated = { ...store, flowNotifications: notes.map(n => ({ ...n, read: true })) };
      saveStore(updated); onUpdate(updated);
    }
  }, [notes, store, onUpdate]);
  const toneStyle: Record<string, string> = {
    success: 'bg-success/10 border-success/30 text-success',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    info: 'bg-primary/10 border-primary/30 text-primary',
    danger: 'bg-destructive/10 border-destructive/30 text-destructive',
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div className="w-full bg-card rounded-t-3xl shadow-2xl animate-slide-up max-h-[80vh] flex flex-col" style={{ maxWidth: '448px', margin: '0 auto' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1.5 rounded-full bg-border" /></div>
        <div className="px-5 py-3 flex items-center justify-between border-b border-border">
          <h3 className="font-display font-bold text-lg">Flow Notifications</h3>
          <div className="flex items-center gap-3">
            {notes.some(n => !n.read) && <button onClick={markAllRead} className="text-xs text-primary font-display font-semibold">Mark all read</button>}
            <button onClick={onClose} className="text-xl text-muted-foreground leading-none">×</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No notifications yet.</p>
          ) : (
            [...notes].reverse().map(n => (
              <div key={n.id} className={`p-3 rounded-xl border flex items-start gap-3 ${toneStyle[n.tone]} ${n.read ? 'opacity-60' : ''}`}>
                <span className="text-xl">{n.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-semibold">{n.text}</p>
                  <p className="text-[10px] mt-0.5 opacity-70">{new Date(n.date).toLocaleString()}</p>
                </div>
                {!n.read && <span className="w-2 h-2 rounded-full bg-current flex-shrink-0 mt-1.5" />}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}



// Typewriter component for Flow greetings and text outputs
export function Typewriter({ text, speed = 50 }: { text: string; speed?: number }) {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setDisplayedText('');
    setIndex(0);
  }, [text]);

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text.charAt(index));
        setIndex(prev => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    }
  }, [index, text, speed]);

  const isDone = index >= text.length;

  return (
    <span>
      {displayedText}
      <span className={`inline-block w-[1.5px] h-3.5 ml-0.5 bg-primary/80 ${isDone ? 'animate-[cursor-blink_1s_step-end_infinite]' : 'bg-primary'}`} />
    </span>
  );
}

// useCountUp React hook for animating numerical values
export function useCountUp(target: number, durationMs = 1500) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = target;
    if (start === end) {
      setCount(end);
      return;
    }
    const totalSteps = 45;
    const stepTime = durationMs / totalSteps;
    const increment = (end - start) / totalSteps;
    
    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      setCount(prev => {
        const next = start + increment * currentStep;
        if (currentStep >= totalSteps) {
          clearInterval(timer);
          return end;
        }
        return Math.round(next);
      });
    }, stepTime);
    
    return () => clearInterval(timer);
  }, [target, durationMs]);

  return count;
}

// ─── Main Manager ─────────────────────────────────────────────────────────────
export default function Manager({ store, onUpdate, onEnable }: ManagerProps) {
  const [tab, setTab] = useState<ManagerTab>('overview');
  const [requestText, setRequestText] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [hasPatted, setHasPatted] = useState(() => localStorage.getItem('storeflow_flow_patted') === new Date().toISOString().split('T')[0]);
  const [showPatHearts, setShowPatHearts] = useState(false);
  const [flowXP, setFlowXP] = useState(() => Number(localStorage.getItem('storeflow_flow_xp') || '0'));
  const [xpAnimation, setXpAnimation] = useState(false);
  const [greeting] = useState(() => flowGreeting(store));
  const [seenAdviceIds, setSeenAdviceIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('storeflow_seen_advice_ids');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (tab === 'advice') {
      const currentIds = generateAdvice(store).map(a => a.id);
      const updatedSet = new Set(currentIds);
      setSeenAdviceIds(updatedSet);
      localStorage.setItem('storeflow_seen_advice_ids', JSON.stringify(Array.from(updatedSet)));
    }
  }, [tab, store]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  const settings = store.managerSettings || DEFAULT_MANAGER_SETTINGS;

  // Record streak + FLOW on mount
  useEffect(() => {
    if (!settings.enabled) return;
    const { isNew } = recordStreak();
    if (isNew) {
      try {
        addFlowReward(1.0, 'streak', 'Daily streak bonus'); 
        if (store.sales.some(s => s.date.startsWith(new Date().toISOString().split('T')[0]))) {
          addFlowReward(0.5, 'daily', 'First sale of the day bonus');
        }
      } catch (e) {
        // Cooldown or anti-cheat triggered
      }
    }
    // Auto-generate and save notifications
    const newNotes = generateNotifications(store);
    if (newNotes.length > 0) {
      const existing = store.flowNotifications || [];
      const existingIds = new Set(existing.map(n => n.id));
      const fresh = newNotes.filter(n => !existingIds.has(n.id));
      if (fresh.length > 0) {
        const updated = { ...store, flowNotifications: [...fresh, ...existing].slice(0, 50) };
        saveStore(updated); onUpdate(updated);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled]);

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
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">Wake Flow up to unlock insights, forecasts, recommendations and savings plans tailored to your store.</p>
          <ul className="text-left text-sm text-muted-foreground max-w-xs mx-auto space-y-1.5">
            {['Business Insights', 'Revenue Forecasts', 'Expense Analysis', 'Product Suggestions', 'Savings Plans', 'FLOW Rewards'].map(x => (
              <li key={x} className="flex items-center gap-2"><span className="text-success">✓</span>{x}</li>
            ))}
          </ul>
          <button onClick={enable} className="w-full max-w-xs mx-auto p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity">Activate Flow</button>
        </div>
      </div>
    );
  }

  const insights = generateInsights(store, '7d');
  const recs = generateRecommendations(store);
  const requests = topCustomerRequests(store, 6);
  const savings = store.savingsGoal;
  const unreadCount = (store.flowNotifications || []).filter(n => !n.read).length;
  const flowMood = useMemo(() => {
    const health = healthScore(store);
    const hasLowStock = store.products.some(p => p.quantity <= 3);
    const hasDebt = (store.pendingPayments || []).some(p => p.status === 'pending');
    const isGoalAchieved = savings && savings.saved >= savings.amount && savings.amount > 0;
    
    if (isGoalAchieved) return 'celebrating';
    if (health.overall >= 80) return 'confident';
    if (health.overall >= 65) return 'happy';
    if (hasLowStock) return 'concerned';
    if (hasDebt || health.overall < 50) return 'worried';
    return 'neutral';
  }, [store, savings]);
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  // Forecasts for Predictions tab
  const horizons = [1, 7, 14, 30, 90, 180, 365];

  const addRequest = () => {
    const text = requestText.trim();
    if (!text) return;
    const req: CustomerRequest = { id: Math.random().toString(36).slice(2), text, date: new Date().toISOString() };
    const updated = { ...store, customerRequests: [req, ...(store.customerRequests || [])] };
    saveStore(updated); onUpdate(updated);
    setRequestText('');
    showToast('Request recorded');
    try {
      addFlowReward(0.2, 'event', 'Recorded customer request');
    } catch {}
  };

  const [adviceReport, setAdviceReport] = useState('');
  const [adviceReportVisible, setAdviceReportVisible] = useState(false);

  const handleGetAdvice = () => {
    setAdviceLoading(true);
    setAdviceReport('');
    setAdviceReportVisible(false);
    try {
      addFlowReward(0.5, 'event', 'Requested business advice report');
    } catch {}
    setTimeout(() => {
      setAdviceLoading(false);
      setAdviceReport(generateFlowReport(store));
      setAdviceReportVisible(true);
    }, 1500);
  };

  const tabs: { id: ManagerTab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'predictions', label: 'Forecasts' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'advice', label: 'Advice', badge: generateAdvice(store).filter(a => (a.priority === 'critical' || a.priority === 'high') && !seenAdviceIds.has(a.id)).length || undefined },
  ];

  const advice = generateAdvice(store);
  const advicePriorityColor: Record<string, string> = { critical: 'border-destructive/40 bg-destructive/5', high: 'border-warning/40 bg-warning/5', medium: 'border-primary/20 bg-surface-2', low: 'border-border bg-surface-2' };
  const adviceIconBg: Record<string, string> = { critical: 'bg-destructive/10', high: 'bg-warning/10', medium: 'bg-primary/10', low: 'bg-surface-3' };

  return (
    <div className="animate-fade-in flow-card-enter-anim space-y-4">
      <style>{`
        @keyframes flow-card-enter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bar-grow-wave {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        @keyframes bar-breathe {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 2px rgba(232, 195, 78, 0.2)); }
          50% { transform: scale(1.04); filter: drop-shadow(0 0 8px rgba(232, 195, 78, 0.5)); }
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 0; }
          50% { opacity: 1; }
        }
        @keyframes pulse-once {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes bar-glow-twice {
          0%, 100% { filter: drop-shadow(0 0 0px transparent); }
          50% { filter: drop-shadow(0 0 8px rgba(232, 195, 78, 0.6)); }
        }
        @keyframes pulse-opacity-twice {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .flow-card-enter-anim {
          animation: flow-card-enter 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .bar-grow-wave-item {
          transform-origin: bottom;
          animation: bar-grow-wave 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .bar-breathe-anim {
          transform-origin: bottom;
          animation: bar-grow-wave 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards, bar-glow-twice 2s ease-in-out 2 forwards;
          border: 1px solid rgba(232, 195, 78, 0.4);
        }
        .pulse-twice-anim {
          animation: pulse-opacity-twice 1s ease-in-out 2;
        }
        .pulse-once-anim {
          animation: pulse-once 0.35s ease-out;
        }
      `}</style>
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
            {/* Flow greeting */}
            <div className="mt-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15 flex items-start gap-2">
              <span className="text-base animate-[mascot-float_2s_infinite]">💡</span>
              <p className="text-xs text-foreground/90 leading-relaxed flex-1">
                <Typewriter text={greeting} />
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <Mascot size={72} mood={flowMood} animate={settings.mascotAnimations !== false} />
            {/* Notification bell */}
            <button onClick={() => setShowNotifications(true)} className="relative w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-sm">
              🔔
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white text-[9px] font-bold flex items-center justify-center">{unreadCount}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-full bg-card border border-border">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative flex-1 px-2 py-2 rounded-full text-[11px] font-display font-semibold whitespace-nowrap transition-colors ${tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
            {t.label}
            {t.badge ? <span className="ml-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-0.5 rounded-full bg-destructive text-white text-[8px] font-bold">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          <StoreHealthCard store={store} onOpenBreakdown={() => setShowBreakdown(true)} animate={settings.numericAnimations !== false} />

          {/* Next Best Action */}
          {advice.length > 0 && (
            <div className={`p-4 rounded-2xl border ${advicePriorityColor[advice[0].priority]} shadow-card`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-display font-semibold">Next Best Action</p>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${adviceIconBg[advice[0].priority]}`}>{advice[0].icon}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-sm text-foreground">{advice[0].title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{advice[0].detail}</p>
                </div>
              </div>
              <button onClick={() => setTab('advice')} className="mt-3 text-xs text-primary font-display font-semibold">See all advice →</button>
            </div>
          )}

          <MoneyOwedCard store={store} />

          {/* Inventory alerts */}
          {(() => {
            const alerts = inventoryIntelligence(store).filter(f => f.urgency !== 'ok').slice(0, 3);
            if (alerts.length === 0) return null;
            return (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <h3 className="font-display font-bold text-sm">📦 Stock Alerts</h3>
                <div className="space-y-2">
                  {alerts.map(f => (
                    <div key={f.product.id} className={`flex items-center justify-between p-2.5 rounded-xl border ${f.urgency === 'critical' ? 'bg-destructive/5 border-destructive/30' : 'bg-warning/5 border-warning/30'}`}>
                      <div>
                        <p className="text-sm font-display font-semibold">{f.product.name}</p>
                        <p className="text-[11px] text-muted-foreground">{f.daysLeft === 0 ? 'Running out today' : `${f.daysLeft} day${f.daysLeft === 1 ? '' : 's'} left`} · Order {f.restockQty} units</p>
                      </div>
                      <span className={`text-[10px] font-display font-bold px-2 py-0.5 rounded-full ${f.urgency === 'critical' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>{f.urgency === 'critical' ? '🚨 Critical' : '⚠️ Soon'}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {settings.savingsPlanner && savings && (
            <div className="p-4 rounded-2xl bg-card shadow-card">
              <h3 className="font-display font-bold text-sm mb-3">💰 Savings Plan</h3>
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
              </div>
            </div>
          )}

          {settings.customerRequests && (
            <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
              <h3 className="font-display font-bold text-sm">🛒 Customer Requests</h3>
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
              ) : <p className="text-xs text-muted-foreground">No requests yet. Tap + Record when a customer asks for something out of stock.</p>}
            </div>
          )}

          <FlowWalletCard store={store} onUpdate={onUpdate} />
        </div>
      )}

      {/* ─── PREDICTIONS ──────────────────────────────────────────────────── */}
      {tab === 'predictions' && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-4 rounded-2xl bg-card shadow-card">
            <h3 className="font-display font-bold text-base mb-1">Revenue Forecasts</h3>
            <p className="text-xs text-muted-foreground mb-4">Based on your last 30 days of sales using linear trend analysis.</p>
            <div className="space-y-3">
              {horizons.map(h => {
                const f = forecastHorizon(store, h);
                const confColor = f.confidence === 'High' ? 'text-success' : f.confidence === 'Medium' ? 'text-warning' : 'text-muted-foreground';
                return (
                  <div key={h} className="p-3 rounded-xl bg-surface-2 border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-display font-semibold text-sm">{f.label}</p>
                      <span className={`text-[10px] font-display font-bold ${confColor}`}>{f.confidencePct}% confidence</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><p className="text-[10px] text-muted-foreground">Expected Revenue</p><p className="font-display font-bold text-primary">₦{Math.round(f.expectedRevenue).toLocaleString()}</p></div>
                      <div><p className="text-[10px] text-muted-foreground">Expected Profit</p><p className="font-display font-bold text-success">₦{Math.round(f.expectedProfit).toLocaleString()}</p></div>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${f.confidencePct}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Range: ₦{Math.round(f.expectedRevenue * 0.8).toLocaleString()} – ₦{Math.round(f.expectedRevenue * 1.2).toLocaleString()}</p>
                  </div>
                );
              })}
            </div>
            {store.sales.length < 10 && (
              <p className="text-xs text-warning mt-3 p-2 rounded-lg bg-warning/10 border border-warning/20">📊 Forecasts become more accurate as you record more sales. Keep going!</p>
            )}
          </div>
        </div>
      )}

      {/* ─── ANALYSIS ─────────────────────────────────────────────────────── */}
      {tab === 'analysis' && (
        <div className="space-y-4 animate-fade-in">
          {/* Activity graph */}
          <MostActivePeriodsCard store={store} />

          {/* Sales analysis */}
          {(() => {
            const sa = analyzeSales(store);
            return (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-4">
                <h3 className="font-display font-bold text-base">Sales Breakdown</h3>
                {sa.fastMovers.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase font-display font-semibold mb-2">🔥 Fast Movers (Last 30d)</p>
                    <div className="space-y-1.5">
                      {sa.fastMovers.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-surface-2 text-sm">
                          <span className="truncate">{p.name}</span>
                          <span className="text-xs text-primary font-display font-bold ml-2 flex-shrink-0">{p.qty} sold · ₦{p.revenue.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {sa.neverSold.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase font-display font-semibold mb-2">😴 Never Sold</p>
                    <div className="space-y-1">
                      {sa.neverSold.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-warning/5 border border-warning/20 text-sm">
                          <span className="truncate">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.daysInStock}d in stock</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {sa.coPurchases.length > 0 && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase font-display font-semibold mb-2">🛒 Often Bought Together</p>
                    {sa.coPurchases.map((cp, i) => (
                      <p key={i} className="text-xs p-2 rounded-lg bg-surface-2 mb-1">{cp.a} + {cp.b} <span className="text-primary font-display font-bold">({cp.count}x)</span></p>
                    ))}
                  </div>
                )}
                {sa.fastMovers.length === 0 && sa.neverSold.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Record more sales to unlock analysis.</p>
                )}
              </div>
            );
          })()}

          {/* Expense analysis */}
          {(() => {
            const ea = expenseAnalysis(store);
            if (ea.byCat.length === 0) return null;
            return (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-sm">🧾 Expense Breakdown</h3>
                  <span className={`text-[10px] font-display font-bold ${ea.trendPct > 0 ? 'text-destructive' : 'text-success'}`}>
                    {ea.trendPct > 0 ? '↑' : '↓'} {Math.abs(ea.trendPct).toFixed(0)}% vs prev month
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Last 30 days total: ₦{ea.totalLast30.toLocaleString()}</p>
                <div className="space-y-2">
                  {ea.byCat.map(c => (
                    <div key={c.category}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-sm font-display font-semibold">{c.category}</span>
                        <span className="text-xs flex items-center gap-1">
                          {c.trend === 'up' && <span className="text-destructive">↑</span>}
                          {c.trend === 'down' && <span className="text-success">↓</span>}
                          ₦{c.total.toLocaleString()} · {c.pct}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full bg-primary/70 transition-all" style={{ width: `${c.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Rent Analysis */}
          {(() => {
            const rent = rentAnalysis(store);
            if (!rent) return null;
            return (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <h3 className="font-display font-bold text-sm">🏠 Rent Analysis</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Monthly Rent</p><p className="font-display font-bold">₦{rent.monthly.toLocaleString()}</p></div>
                  <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Weekly Target</p><p className="font-display font-bold">₦{rent.weeklyTarget.toLocaleString()}</p></div>
                  <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground">Emergency Buffer</p><p className="font-display font-bold">₦{rent.emergencyBuffer.toLocaleString()}</p></div>
                  <div className={`p-2.5 rounded-lg ${rent.affordabilityPct > 30 ? 'bg-warning/10 border border-warning/20' : 'bg-surface-2'}`}>
                    <p className="text-[10px] text-muted-foreground">% of Revenue</p>
                    <p className={`font-display font-bold ${rent.affordabilityPct > 30 ? 'text-warning' : 'text-success'}`}>{rent.affordabilityPct}%</p>
                  </div>
                </div>
                {rent.affordabilityPct > 30 && <p className="text-xs text-warning p-2 rounded-lg bg-warning/10 border border-warning/20">Rent is high relative to revenue. Consider growing sales to reduce this ratio.</p>}
              </div>
            );
          })()}

          {/* Pricing alerts */}
          {(() => {
            const alerts = pricingAlerts(store);
            if (alerts.length === 0) return null;
            return (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <h3 className="font-display font-bold text-sm">📊 Pricing Alerts</h3>
                <div className="space-y-2">
                  {alerts.slice(0, 4).map(a => (
                    <div key={a.product.id} className={`p-3 rounded-xl border ${a.type === 'zero_margin' ? 'bg-destructive/5 border-destructive/30' : a.type === 'underpriced' ? 'bg-warning/5 border-warning/30' : 'bg-surface-2 border-border'}`}>
                      <p className="font-display font-semibold text-sm">{a.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.type === 'zero_margin' ? 'Selling at zero or negative margin!' : a.type === 'underpriced' ? `Margin only ${(a.currentMargin * 100).toFixed(0)}% — suggest ₦${a.suggestedPrice.toLocaleString()}` : `Very high margin (${(a.currentMargin * 100).toFixed(0)}%)`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Insights */}
          <div className="space-y-2">
            <h3 className="font-display font-bold text-sm px-1">💡 Insights</h3>
            {insights.length === 0 ? <p className="text-sm text-muted-foreground p-4 text-center">Record more sales to unlock insights.</p> : null}
            {insights.map(i => {
              const tones: Record<string, string> = { success: 'bg-success/10 border-success/30 text-success', warning: 'bg-warning/10 border-warning/30 text-warning', info: 'bg-primary/10 border-primary/30 text-primary', danger: 'bg-destructive/10 border-destructive/30 text-destructive' };
              return (
                <div key={i.id} className={`p-3 rounded-xl border flex items-start gap-3 ${tones[i.tone]}`}>
                  <span className="text-xl">{i.icon}</span>
                  <p className="font-display font-semibold text-sm flex-1">{i.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── ADVICE ───────────────────────────────────────────────────────── */}
      {tab === 'advice' && (
        <div className="space-y-4 animate-fade-in">
          {/* Get fresh advice button */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">✨</span>
              <div>
                <h3 className="font-display font-bold text-base">Flow Advice Engine</h3>
                <p className="text-xs text-muted-foreground">Analysing your sales, inventory, expenses &amp; debts</p>
              </div>
            </div>
            <button onClick={handleGetAdvice} disabled={adviceLoading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
              {adviceLoading ? '⏳ Analysing...' : '✨ Get Fresh Advice'}
            </button>
          </div>

          {/* Advice Report Card (Typewriter Analysis) */}
          {adviceReportVisible && adviceReport && (
            <div className="p-4 rounded-2xl bg-card border border-primary/25 shadow-card space-y-2 animate-fade-in relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-[#9b5de5] to-success" />
              <div className="flex items-center gap-2">
                <span className="text-xs">🤖</span>
                <h4 className="font-display font-bold text-xs uppercase tracking-wider text-primary">Flow's Analysis Breakdown</h4>
              </div>
              <Typewriter text={adviceReport} speed={12} />
            </div>
          )}

          {/* Advice cards */}
          {advice.length > 0 ? (
            <div className="space-y-2">
              {advice.map(a => (
                <div key={a.id} className={`p-4 rounded-2xl border shadow-card ${advicePriorityColor[a.priority]}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${adviceIconBg[a.priority]}`}>{a.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display font-bold text-sm text-foreground">{a.title}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-display font-bold flex-shrink-0 ${a.priority === 'critical' ? 'bg-destructive text-white' : a.priority === 'high' ? 'bg-warning text-white' : a.priority === 'medium' ? 'bg-primary/20 text-primary' : 'bg-surface-3 text-muted-foreground'}`}>{a.priority.toUpperCase()}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{a.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-4xl mb-2">🌟</p>
              <p className="font-display font-bold">Looking good!</p>
              <p className="text-sm text-muted-foreground mt-1">No critical actions needed right now. Keep recording sales to unlock deeper advice.</p>
            </div>
          )}

          {/* Recommendations */}
          {recs.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-display font-bold text-sm px-1">📋 Recommendations</h3>
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

          {/* Supplier management */}
          <SupplierPanel />

          {/* Customer requests */}
          {settings.customerRequests && requests.length > 0 && (
            <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
              <h3 className="font-display font-bold text-sm">🛒 Top Customer Requests</h3>
              <div className="space-y-1.5">
                {requests.map((r, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-2 border border-border text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                      <span className="capitalize truncate">{r.text}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-primary font-display font-bold">{r.count}×</span>
                      {r.count >= 5 && <span className="text-[9px] bg-success/15 text-success px-1.5 py-0.5 rounded-full font-bold">Stock it</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showBreakdown && <HealthBreakdownModal store={store} onClose={() => setShowBreakdown(false)} />}
      {showNotifications && <NotificationDrawer store={store} onClose={() => setShowNotifications(false)} onUpdate={onUpdate} />}
    </div>
  );
}
