import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { StoreData, CustomerRequest, DEFAULT_MANAGER_SETTINGS, TabId, AutoPriceEvent } from '@/types/store';
import { saveStore, getPendingSummary, updateProduct, undoAutoPrice, generateId, sumOperatingExpenses } from '@/lib/store-data';
import PerformanceCalendar from '@/components/PerformanceCalendar';
import {
  healthScore, forecastHorizon, generateRecommendations, generateInsights,
  generateAdvice, topCustomerRequests, mostActivePeriods, inventoryIntelligence,
  expenseAnalysis, rentAnalysis, pricingAlerts, analyzeSales, flowGreeting,
  generateNotifications, ActivityRange, ActivityBucket, buildFlowReport, stockCoverLabel, type FlowReport,
  getTopOpportunities, getProfitLeaks, getRepaymentInsights, getSeasonalPredictions, getWeatherInsights, generateWeeklyRecap,
  getProductInsightBadges, filterDismissedAdvice, dismissAdvice, markAdviceHelpful
} from '@/lib/manager-intel';
import { getLowStockThreshold } from '@/lib/settings';
import { getFlowMemory, recordStreak, getCoins, addCoins, Supplier, addSupplier, deleteSupplier, claimReferral, addFlowReward, hydrateFlowMemoryFromCloud } from '@/lib/flow-memory';
import { showToast } from '@/components/Toast';
import Mascot, { MascotBadge } from '@/components/Mascot';
import { FlowIcon } from '@/components/FlowIcon';
import NotificationDrawer from '@/components/NotificationDrawer';
import AutoFixConfirmDialog from '@/components/AutoFixConfirmDialog';
import PurchaseOrdersList from '@/components/PurchaseOrdersList';
import MerchantRatings from '@/components/MerchantRatings';
import FlowChat from '@/components/FlowChat';
import { executeAutoFix, AutoFixSpec } from '@/lib/auto-fix';
import { logPrediction, submitPredictionFeedback } from '@/lib/prediction-log';
import PredictionHistory from '@/components/PredictionHistory';
import {
  MessageCircle, Package, Star, CreditCard, TrendingUp, Factory, MapPin, ThumbsUp, ThumbsDown,
  Calendar, Rocket, AlertTriangle, ClipboardList, Banknote, Hourglass, Clock, PiggyBank, ShoppingCart,
  Info, Flame, Moon, Receipt, Home, Undo2, BarChart3, Sparkles, Archive, Bell, Zap, PartyPopper, X, ChevronDown,
} from 'lucide-react';
import ScrollLock from '@/components/ScrollLock';
import FlowAdviceReport from '@/components/FlowAdviceReport';
import type { ProductFocus } from '@/lib/product-focus';
import { speakAsFlow, stopFlowVoice, type FlowVoiceGender } from '@/lib/flow-voice';

interface ManagerProps {
  store: StoreData;
  orders?: any[];
  onUpdate: (s: StoreData) => void;
  onEnable?: () => void;
  onNavigate?: (tab: TabId, focus?: ProductFocus | string) => void;
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
  const expenses = sumOperatingExpenses(store, date => new Date(date).getTime() >= Date.now() - 7 * 86400000);

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
function MoneyOwedCard({ store, onClick }: { store: StoreData; onClick?: () => void }) {
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
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`w-full text-left p-4 rounded-2xl bg-card shadow-card space-y-3 border border-transparent transition-colors ${onClick ? 'cursor-pointer hover:border-warning/30' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div><h3 className="font-display font-bold text-sm flex items-center gap-1.5"><CreditCard className="w-4 h-4" /> Money Owed To You</h3><p className="text-[11px] text-muted-foreground">Outstanding customer balances</p></div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-display font-bold ${s.recoveryRate >= 70 ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>{s.recoveryRate}% recovered</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/20"><p className="text-[10px] text-muted-foreground uppercase">Outstanding</p><p className="font-display font-bold text-warning text-sm">₦{s.totalOwed.toLocaleString()}</p></div>
        <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Customers</p><p className="font-display font-bold text-sm">{s.customerCount}</p></div>
        <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Overdue</p><p className="font-display font-bold text-sm text-destructive">{s.overdue.length}</p></div>
      </div>
      {advices.length > 0 && <div className="space-y-1">{advices.map((a, i) => (<p key={i} className="text-[10px] text-foreground/90 leading-tight flex gap-1"><span className="flex-1">{a}</span></p>))}</div>}
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
              <TrendingUp className="w-4 h-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs"><span className="text-foreground">Peak: </span><span className="font-display font-bold text-primary">{data.peakWindow.startLabel} – {data.peakWindow.endLabel}</span></p>
                <p className="text-[11px] text-muted-foreground">Plan stock and promotions around these hours.</p>
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
              <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Sales</p><p className="font-display font-bold">{selected.sales}</p></div>
              <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Revenue</p><p className="font-display font-bold text-yellow-500 text-xs">₦{Math.round(selected.revenue).toLocaleString()}</p></div>
              <div className="p-2 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Profit</p><p className="font-display font-bold text-success text-xs">₦{Math.round(selected.profit).toLocaleString()}</p></div>
            </div>
            <button onClick={() => setSelected(null)} className="w-full mt-2 p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm">Close</button>
          </div>
        </div>,
        document.body
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
        <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Factory className="w-4 h-4" /> Suppliers</h3>
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
                    {s.distance && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {s.distance}</span>}
                  </div>
                </div>
                <button onClick={() => handleDelete(s.id)} className="text-destructive px-2"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



// ─── Notification Drawer removed inline ──────────────────────────────────────



// Typewriter component for Flow greetings and text outputs
export function Typewriter({ text, speed = 50, speak = false }: { text: string; speed?: number; speak?: boolean }) {
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

  // Natural human-sounding speech synthesis read-out
  useEffect(() => {
    if (!speak || !text) return;

    // Voice choice lives in lib/flow-voice. This used to hunt for names like
    // "david", "zira" and "hazel" — the legacy formant voices, which are the
    // robotic ones — and then push pitch to 1.35 to make one sound younger,
    // which is what makes synthesis sound strained.
    let gender: FlowVoiceGender = 'young-male';
    try {
      const sessionRaw = localStorage.getItem('storeflow_session');
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        const activeStoreRaw = localStorage.getItem(`storeflow_${session.accessCode}`);
        if (activeStoreRaw) {
          const saved = JSON.parse(activeStoreRaw)?.managerSettings?.voiceGender;
          if (saved) gender = saved as FlowVoiceGender;
        }
      }
    } catch { /* fall back to the default voice */ }

    speakAsFlow(text, { gender });
    return () => stopFlowVoice();
  }, [text, speak]);

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
    const start = 0;
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
export default function Manager({ store, orders = [], onUpdate, onEnable, onNavigate }: ManagerProps) {
  const [tab, setTab] = useState<ManagerTab>('overview');
  const [requestText, setRequestText] = useState('');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showPerformanceCalendar, setShowPerformanceCalendar] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const openMessages = (event?: Event) => {
      let startVoice = Boolean((event as CustomEvent<{ startVoice?: boolean }>)?.detail?.startVoice);
      try { const pending = sessionStorage.getItem('storeflow_open_flow_messages'); if (pending) { startVoice = startVoice || pending === 'voice'; sessionStorage.removeItem('storeflow_open_flow_messages'); } } catch {}
      setChatOpen(true);
      if (startVoice) window.setTimeout(() => window.dispatchEvent(new CustomEvent('storeflow:start-flow-voice')), 250);
    };
    window.addEventListener('storeflow:open-flow-messages', openMessages);
    let pending = false; try { pending = Boolean(sessionStorage.getItem('storeflow_open_flow_messages')); } catch {}
    if (pending) openMessages();
    return () => window.removeEventListener('storeflow:open-flow-messages', openMessages);
  }, []);
  const [poListOpen, setPoListOpen] = useState(false);
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [predictionHistoryOpen, setPredictionHistoryOpen] = useState(false);
  const [forecastFeedback, setForecastFeedback] = useState<Record<number, 'correct' | 'incorrect'>>({});

  const handleForecastFeedback = (horizonDays: number, feedback: 'correct' | 'incorrect') => {
    setForecastFeedback(prev => ({ ...prev, [horizonDays]: feedback }));
    submitPredictionFeedback(store, horizonDays, feedback).then(ok => {
      if (ok) showToast(feedback === 'correct' ? 'Thanks — noted as correct 👍' : 'Thanks — noted as incorrect, Flow will learn from this', 'success');
    });
  };

  const [autoFixTarget, setAutoFixTarget] = useState<AutoFixSpec | null>(null);
  const [autoFixBusy, setAutoFixBusy] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
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
    const storeId = (store as any)?.id;
    if (storeId) {
      hydrateFlowMemoryFromCloud(storeId);
    }
  }, [(store as any)?.id]);

  useEffect(() => {
    if (tab === 'advice') {
      const currentIds = generateAdvice(store, orders).map(a => a.id);
      const updatedSet = new Set(currentIds);
      setSeenAdviceIds(updatedSet);
      localStorage.setItem('storeflow_seen_advice_ids', JSON.stringify(Array.from(updatedSet)));
    }
  }, [tab, store]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  const settings = store.managerSettings || DEFAULT_MANAGER_SETTINGS;



  // Record streak + FLOW on mount (once per day, rate-limited by recordStreak itself)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled]);

  // Auto-generate and save notifications. This previously shared an effect
  // with the streak logic above, gated only on [settings.enabled] — meaning
  // new critical issues (stock selling out, expenses spiking) only got
  // checked once when Manager first mounted, not while the merchant was
  // actively using the app during that session. This now reacts to the
  // data that actually drives notifications. The dedup-by-id check below
  // means this safely settles after one extra pass rather than looping.
  useEffect(() => {
    if (!settings.enabled) return;
    const newNotes = generateNotifications(store);
    const existing = store.flowNotifications || [];
    const existingIds = new Set(existing.map(n => n.id));
    const liveIds = new Set(newNotes.map(n => n.id));
    const fresh = newNotes.filter(n => !existingIds.has(n.id));

    // A notification the merchant has dealt with, whose condition has since
    // cleared, is finished with. Dropping it frees its id: alerts are
    // deduplicated by id, and ids are stable per product, so keeping a read one
    // forever meant the same product running low again months later could never
    // raise an alert. Unread ones are always kept — they are still waiting.
    const kept = existing.filter(n => !n.read || liveIds.has(n.id));

    if (fresh.length > 0 || kept.length !== existing.length) {
      const updated = { ...store, flowNotifications: [...fresh, ...kept].slice(0, 50) };
      saveStore(updated); onUpdate(updated);
    }
  }, [settings.enabled, store.sales.length, store.products, store.expenses?.length, store.customerRequests?.length]);

  const insights = generateInsights(store, '7d');
  const recs = generateRecommendations(store).filter(r => r.action !== 'restock' || settings.restockSuggestions);
  const requests = topCustomerRequests(store, 6);
  const savings = store.savingsGoal;
  const unreadCount = (store.flowNotifications || []).filter(n => !n.read).length;
  const flowMood = useMemo(() => {
    const health = healthScore(store);

    // Auto-sleep past 9 PM or before 6 AM
    const currentHour = new Date().getHours();
    const isSleepTime = currentHour >= 21 || currentHour < 6;
    if (isSleepTime) return 'sleeping';

    const activeProducts = store.products.filter(p => !p.discontinued);
    const hasLowStock = activeProducts.some(p => p.quantity <= 3);
    const hasDebt = (store.pendingPayments || []).some(p => p.status === 'pending');
    const isGoalAchieved = savings && savings.saved >= savings.amount && savings.amount > 0;

    if (isGoalAchieved) return 'celebrating';

    // Performance checks
    if (health.overall >= 80) return 'confident';
    if (health.overall >= 65) return 'happy';

    // Open but not performing well: resting
    if (health.overall >= 45 && health.overall < 65) return 'resting';

    if (hasLowStock || hasDebt) return 'concerned';
    if (health.overall < 45 && health.overall >= 25) return 'worried';
    if (health.overall < 25) return 'angry';

    return 'neutral';
  }, [store, savings]);
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  // Forecasts for Predictions tab
  const horizons = [1, 7, 14, 30, 90, 180, 365];
  const [forecastHorizonDays, setForecastHorizonDays] = useState(7);

  useEffect(() => {
    if (tab !== 'predictions') return;
    if (!settings.revenueForecasts && !settings.profitForecasts) return;
    horizons.forEach(h => {
      logPrediction(store, forecastHorizon(store, h));
    });
    // Deliberately store/settings omitted — this should log once per tab
    // visit, not re-fire on every store update while the tab stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);


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

  const [adviceReport, setAdviceReport] = useState<FlowReport | null>(null);
  const [adviceReportVisible, setAdviceReportVisible] = useState(false);
  const [showMoreInsights, setShowMoreInsights] = useState(false);

  const handleGetAdvice = () => {
    try {
      addFlowReward(0.5, 'event', 'Requested business advice report');
    } catch {}
    // buildFlowReport reads the store that is already in memory, so there is
    // nothing to wait for and nothing to defer to.
    //
    // This briefly went through requestAnimationFrame, to let the button paint
    // a loading state first. rAF does not fire while the page is hidden — a
    // backgrounded tab, the PWA behind the launcher, the screen off — so the
    // callback could simply never run and the button did nothing at all.
    // Deferring work that is already synchronous only ever added ways to fail.
    setAdviceLoading(false);
    setAdviceReport(buildFlowReport(store));
    setAdviceReportVisible(true);
  };

  const handleAutoFixConfirmed = async () => {
    if (!autoFixTarget) return;
    setAutoFixBusy(true);
    const minVisible = new Promise(resolve => setTimeout(resolve, 850));
    const [result] = await Promise.all([
      executeAutoFix(store, autoFixTarget, onUpdate),
      minVisible,
    ]);
    setAutoFixBusy(false);
    setAutoFixTarget(null);
    showToast(result.message, result.ok ? 'success' : 'error');
  };

  const tabs: { id: ManagerTab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'predictions', label: 'Forecasts' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'advice', label: 'Advice', badge: settings.businessAdvice ? (generateAdvice(store, orders).filter(a => (a.priority === 'critical' || a.priority === 'high') && !seenAdviceIds.has(a.id)).length || undefined) : undefined },
  ];

  const advice = settings.businessAdvice ? filterDismissedAdvice(generateAdvice(store, orders)) : [];
  const [justDismissed, setJustDismissed] = useState<Set<string>>(new Set());
  const visibleAdvice = advice.filter(a => !justDismissed.has(a.id));

  const handleDismissAdvice = (id: string) => {
    dismissAdvice(id);
    setJustDismissed(prev => new Set(prev).add(id));
  };

  const handleHelpfulAdvice = (id: string) => {
    markAdviceHelpful(id);
    showToast('Thanks — good to know 👍', 'success');
  };
  const [pendingPriceAccept, setPendingPriceAccept] = useState<string | null>(null);

  // Auto-Apply Prices — only runs when the toggle is on, and only touches
  // suggestions within the owner's configured ₦ safety cap. Anything bigger
  // always falls through to the manual Accept flow below instead.
  useEffect(() => {
    if (!settings.autoApplyPrices) return;
    const targetMarginPct = (settings.defaultMargin || 25) / 100;
    const maxChange = settings.autoApplyMaxChangeAmount ?? 200;
    const alerts = pricingAlerts(store, targetMarginPct);
    const toApply = alerts.filter(a => Math.abs(a.suggestedPrice - a.product.sellingPrice) <= maxChange);
    if (toApply.length === 0) return;

    let updated = store;
    const events: AutoPriceEvent[] = [];
    toApply.forEach(a => {
      events.push({
        id: generateId(),
        productId: a.product.id,
        productName: a.product.name,
        oldPrice: a.product.sellingPrice,
        newPrice: a.suggestedPrice,
        costPrice: a.product.costPrice,
        date: new Date().toISOString(),
      });
      updated = updateProduct(updated, a.product.id, { sellingPrice: a.suggestedPrice });
    });
    updated = { ...updated, autoPriceLog: [...events, ...(updated.autoPriceLog || [])].slice(0, 50) };
    saveStore(updated);
    onUpdate(updated);
    showToast(`Auto-applied ${toApply.length} price update${toApply.length > 1 ? 's' : ''} (within your ₦${maxChange} limit)`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoApplyPrices, settings.defaultMargin, settings.autoApplyMaxChangeAmount, store.products]);
  /** Horizon names, shared by the picker and the forecast itself. */
const FORECAST_LABELS: Record<number, string> = {
  1: 'Tomorrow', 7: '7 days', 14: '14 days', 30: '1 month',
  90: '3 months', 180: '6 months', 365: '1 year',
};

const advicePriorityColor: Record<string, string> = { critical: 'border-destructive/40 bg-destructive/5', high: 'border-warning/40 bg-warning/5', medium: 'border-primary/20 bg-surface-2', low: 'border-border bg-surface-2' };
  const adviceIconBg: Record<string, string> = { critical: 'bg-destructive/10', high: 'bg-warning/10', medium: 'bg-primary/10', low: 'bg-surface-3' };

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
          <div className="flex justify-center"><Mascot size={120} mood="sleeping" store={store} /></div>
          <MascotBadge on={false} />
          <h2 className="font-display font-bold text-xl text-foreground">Flow is sleeping</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">Wake Flow for insights, forecasts and savings plans.</p>
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

  return (
    <div className="animate-fade-in flow-card-enter-anim space-y-4">
      <style>{`
        @keyframes flow-card-enter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: none; }
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
            <div className="mt-1.5 inline-flex items-center px-2.5 py-1 rounded-lg bg-primary/5 border border-primary/15 max-w-full">
              <p className="text-[11px] font-medium text-foreground/90 leading-snug">
                <Typewriter text={greeting} />
              </p>
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-col items-center gap-1">
            <Mascot size={72} mood={flowMood} animate={settings.mascotAnimations !== false} store={store} />
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
        <div className="space-y-4 animate-fade-in text-left">
          <StoreHealthCard store={store} onOpenBreakdown={() => setShowBreakdown(true)} animate={settings.numericAnimations !== false} />

          {/* Weekly Recap */}
          {settings.weeklyRecap && (() => {
            const recap = generateWeeklyRecap(store);
            if (!recap) return null;
            return (
              <div className="p-4 rounded-2xl bg-card border border-border/40 shadow-card space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Last Week's Recap</h3>
                  <span className="text-[10px] text-muted-foreground">{recap.weekLabel}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-surface-2">
                    <p className="text-[10px] text-muted-foreground">Revenue</p>
                    <p className="font-display font-bold text-sm text-yellow-500">₦{recap.revenue.toLocaleString()}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-surface-2">
                    <p className="text-[10px] text-muted-foreground">Profit</p>
                    <p className="font-display font-bold text-sm text-success">₦{recap.profit.toLocaleString()}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-surface-2">
                    <p className="text-[10px] text-muted-foreground">Sales</p>
                    <p className="font-display font-bold text-sm">{recap.salesCount}</p>
                  </div>
                </div>
                {recap.revenuePctVsPrevWeek !== null && (
                  <p className={`text-xs ${recap.revenuePctVsPrevWeek >= 0 ? 'text-success' : 'text-warning'}`}>
                    {recap.revenuePctVsPrevWeek >= 0 ? '↑' : '↓'} {Math.abs(recap.revenuePctVsPrevWeek)}% vs the week before
                  </p>
                )}
                {recap.bestSeller && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Star className="w-3.5 h-3.5" /> Best seller: {recap.bestSeller}</p>
                )}
              </div>
            );
          })()}

          {/* Performance Calendar entry point */}
          <button
            onClick={() => setShowPerformanceCalendar(true)}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-card border border-border/40 shadow-card text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0"><Calendar className="w-5 h-5" /></div>
              <div>
                <p className="font-display font-bold text-sm">Performance Calendar</p>
                <p className="text-[11px] text-muted-foreground">See your consistency at a glance</p>
              </div>
            </div>
            <span className="text-muted-foreground">›</span>
          </button>

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

          {/* Top Opportunities Card */}
          {settings.productSuggestions && (() => {
            const opps = getTopOpportunities(store);
            if (opps.length === 0) return null;
            return (
              <div className="p-4 rounded-2xl bg-card border border-primary/20 shadow-card space-y-3">
                <div className="flex items-center gap-1.5">
                  <Rocket className="w-4 h-4 text-primary" />
                  <h3 className="font-display font-bold text-sm">Worth doing next</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {opps.map((o, idx) => (
                    // A button, not a div with a chevron drawn on it. Every one
                    // of these looked tappable and did nothing.
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onNavigate?.(o.goTo, o.focus)}
                      className="p-3 rounded-xl bg-surface-2 border border-border flex flex-col justify-between text-left hover:bg-surface-3 active:scale-[0.99] transition-all"
                    >
                      <div>
                        <p className="font-display font-bold text-xs text-foreground line-clamp-1">{o.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-normal line-clamp-2">{o.description}</p>
                      </div>
                      <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-border/40 gap-2">
                        <span className="text-[9px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full">
                          {o.impactAmount !== undefined
                            ? `₦${o.impactAmount.toLocaleString()} ${o.impactLabel}`
                            : o.impactLabel}
                        </span>
                        <span className="text-[9px] text-primary font-semibold shrink-0">{o.actionLabel} ›</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Profit Leak Detector Card */}
          {(() => {
            const leaks = getProfitLeaks(store);
            if (leaks.length === 0) return null;
            const leaking = leaks.filter(l => l.kind === 'leaking');
            const stuck = leaks.filter(l => l.kind === 'stuck');
            // Only money actually lost is added up. The total used to include
            // stock on the shelf and invoices raised the day before, so it
            // read as a loss several times larger than anything was.
            const leakTotal = leaking.reduce((sum, l) => sum + l.amountLeak, 0);

            const Row = ({ l, tone }: { l: typeof leaks[number]; tone: 'bad' | 'idle' }) => (
              <div className="p-2.5 rounded-xl bg-surface-2 border border-border text-left">
                <div className="flex justify-between items-start gap-2">
                  <p className="font-display font-bold text-xs text-foreground">{l.title}</p>
                  <span className={`text-[9px] font-mono font-bold shrink-0 ${tone === 'bad' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {tone === 'bad' ? '-' : ''}₦{l.amountLeak.toLocaleString()}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 leading-normal">{l.description}</p>
                <p className="text-[10px] text-foreground/80 mt-1">{l.recommendation}</p>
              </div>
            );

            return (
              <div className="p-4 rounded-2xl bg-card border border-destructive/25 shadow-card space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <div>
                      <h3 className="font-display font-bold text-sm">Where money is going</h3>
                      <p className="text-[10px] text-muted-foreground">Last 30 days</p>
                    </div>
                  </div>
                  {leakTotal > 0 && (
                    <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full font-bold shrink-0">
                      ₦{leakTotal.toLocaleString()} lost
                    </span>
                  )}
                </div>

                {leaking.length > 0 && (
                  <div className="space-y-2">
                    {leaking.map((l, i) => <Row key={`leak-${i}`} l={l} tone="bad" />)}
                  </div>
                )}

                {stuck.length > 0 && (
                  <div className="space-y-2">
                    {/* Kept apart on purpose: this is money the merchant still
                        has. Adding it to the figure above turned assets into
                        losses. */}
                    <p className="text-[10px] font-display font-bold text-muted-foreground uppercase pt-1">
                      Money you have but can't spend
                    </p>
                    {stuck.map((l, i) => <Row key={`stuck-${i}`} l={l} tone="idle" />)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Seasonal & Climate Insights Card — was built but never shown anywhere; now wired in */}
          {(() => {
            const seasonal = getSeasonalPredictions(store);
            const weatherEnabled = store.managerSettings?.weatherImpactEnabled !== false;
            const weather = weatherEnabled ? getWeatherInsights(store) : null;
            if (seasonal.length === 0 && !weather) return null;
            return (
              <div className="p-4 rounded-2xl bg-card border border-primary/20 shadow-card space-y-3">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-primary" />
                  <div>
                    <h3 className="font-display font-bold text-sm">Seasonal &amp; Climate Insights</h3>
                    <p className="text-[10px] text-slate-400 font-semibold">General patterns for this time of year — not personalized predictions</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {weather && (
                    <div className="p-2.5 rounded-xl bg-surface-2 border border-border text-left">
                      <p className="font-display font-bold text-xs text-foreground">{weather.weatherCondition}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-normal">{weather.effect}</p>
                      <p className="text-[10px] text-emerald-400 mt-1 bg-emerald-500/5 p-1 rounded border border-emerald-500/10">
                        {weather.suggestedAction}
                      </p>
                    </div>
                  )}
                  {seasonal.map((s, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-surface-2 border border-border text-left">
                      <p className="font-display font-bold text-xs text-foreground">{s.periodName}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-normal">{s.details}</p>
                      {s.suggestedItems.length > 0 && (
                        <p className="text-[10px] text-primary mt-1.5">
                          {s.itemsFromYourCatalog ? 'From your catalog: ' : 'Example items (not in your catalog yet): '}
                          {s.suggestedItems.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Smart Restocking Buy List */}
          {(() => {
            const threshold = store.managerSettings?.minStockThreshold ?? getLowStockThreshold();
            const autoSuggest = !!store.managerSettings?.autoSuggestRestock;

            // Calculate velocity
            const salesCount: Record<string, number> = {};
            store.sales.forEach(sale => {
              salesCount[sale.productId] = (salesCount[sale.productId] || 0) + sale.quantity;
            });

            // Filter needy products (not discontinued, stock <= threshold)
            const needy = store.products
              .filter(p => !p.discontinued && p.quantity <= threshold)
              .map(p => {
                const velocity = salesCount[p.id] || 0;
                const targetQty = store.managerSettings?.defaultRestockQty ?? 50;
                const suggestedQty = Math.max(1, targetQty - p.quantity);
                const totalCost = suggestedQty * p.costPrice;
                return { product: p, velocity, suggestedQty, totalCost };
              });

            // Sort by velocity descending
            needy.sort((a, b) => b.velocity - a.velocity);

            // Calculate Net Income budget
            const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
            const totalExpenses = (store.expenses || []).reduce((sum, e) => sum + e.amount, 0);
            const savingsSaved = store.savingsGoal?.saved || 0;
            const netIncome = totalRevenue - totalExpenses - savingsSaved;

            const suggestions: typeof needy = [];
            let accumulatedCost = 0;

            for (const item of needy) {
              if (accumulatedCost + item.totalCost <= Math.max(0, netIncome)) {
                suggestions.push(item);
                accumulatedCost += item.totalCost;
              } else if (suggestions.length === 0) {
                suggestions.push(item);
                break;
              } else {
                break;
              }
            }

            const activeItems = autoSuggest ? suggestions : needy;
            const totalRestockCost = activeItems.reduce((sum, s) => sum + s.totalCost, 0);

            if (needy.length === 0) return null;

            return (
              <div className="p-4 rounded-2xl bg-card border border-warning/20 shadow-card space-y-3">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <ClipboardList className="w-4 h-4 shrink-0" />
                    <div className="text-left min-w-0">
                      <h3 className="font-display font-bold text-sm truncate">Smart Restocking List</h3>
                      <p className="text-[10px] text-slate-400 leading-normal">
                        {autoSuggest ? 'Capped to Net Income & prioritized by velocity' : 'Estimated capital required to replenish low stock'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1 cursor-pointer select-none">
                      <span>Smart Restock</span>
                      <input
                        type="checkbox"
                        checked={autoSuggest}
                        onChange={e => {
                          const nextSettings = {
                            ...(store.managerSettings || DEFAULT_MANAGER_SETTINGS),
                            autoSuggestRestock: e.target.checked
                          };
                          onUpdate({
                            ...store,
                            managerSettings: nextSettings
                          });
                        }}
                        className="rounded accent-primary w-3.5 h-3.5 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                <div className="flex justify-between items-center px-2 py-1.5 bg-surface-2/30 rounded border border-border/40 text-left">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">Total replenishment cost</span>
                  <span className="text-xs font-display font-bold text-warning">
                    ₦{totalRestockCost.toLocaleString()}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {activeItems.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4 text-xs">No items suggested (budget limit exceeded).</p>
                  ) : (
                    activeItems.map(item => (
                      <div key={item.product.id} className="flex justify-between items-center p-2 rounded-lg bg-surface-2 text-xs border border-border text-left">
                        <div className="text-left">
                          <p className="font-semibold text-foreground">{item.product.name}</p>
                          <p className="text-[9px] text-muted-foreground font-semibold">
                            Stock: {item.product.quantity} left · Suggest: +{item.suggestedQty} {autoSuggest && `· Sold: ${item.velocity}`}
                          </p>
                        </div>
                        <span className="font-mono text-primary font-bold shrink-0">₦{item.totalCost.toLocaleString()}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })()}


          {/* Quick Actions / Shortcuts */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onNavigate?.('cash-drawer')}
              className="p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-all flex items-center justify-between text-left group shadow-card"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="bg-primary/10 text-primary w-8 h-8 rounded-lg flex items-center justify-center shrink-0"><Banknote className="w-4 h-4" /></span>
                <div className="min-w-0">
                  <p className="font-display font-bold text-xs text-foreground group-hover:text-primary transition-colors">Open Cash Drawer</p>
                  <p className="text-[10px] text-muted-foreground truncate">View cash flows & shifts</p>
                </div>
              </div>
              <span className="text-muted-foreground group-hover:text-primary transition-colors font-bold text-sm">›</span>
            </button>

            <button
              onClick={() => onNavigate?.('pending')}
              className="p-3 rounded-xl bg-card border border-border hover:border-warning/30 transition-all flex items-center justify-between text-left group shadow-card"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="bg-warning/10 text-warning w-8 h-8 rounded-lg flex items-center justify-center shrink-0"><CreditCard className="w-4 h-4" /></span>
                <div className="min-w-0">
                  <p className="font-display font-bold text-xs text-foreground group-hover:text-warning transition-colors">Pending Payments</p>
                  <p className="text-[10px] text-muted-foreground truncate">Track customer debts</p>
                </div>
              </div>
              <span className="text-muted-foreground group-hover:text-warning transition-colors font-bold text-sm">›</span>
            </button>
          </div>

          <MoneyOwedCard store={store} onClick={() => onNavigate?.('pending')} />

          {/* Memory Timeline */}
          {(() => {
            const events = store.memoryTimeline || [];
            if (events.length === 0) return null;
            return (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <h3 className="font-display font-bold text-sm text-left flex items-center gap-1.5"><Clock className="w-4 h-4" /> Store Milestones & Timeline</h3>
                <div className="relative pl-4 border-l border-border/80 space-y-4 text-left ml-2 py-1">
                  {events.slice(0, 5).map((e, idx) => (
                    <div key={e.id || idx} className="relative">
                      {/* Dot */}
                      <span className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-card ring-2 ring-primary/20" />
                      <div>
                        <p className="text-[10px] text-slate-400">{new Date(e.date).toLocaleDateString('en-GB')} {new Date(e.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="font-display font-bold text-xs text-foreground mt-0.5">{e.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-normal">{e.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Inventory alerts */}
          {settings.inventoryForecasts && (() => {
            const alerts = inventoryIntelligence(store).filter(f => f.urgency !== 'ok').slice(0, 3);
            if (alerts.length === 0) return null;
            return (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Package className="w-4 h-4" /> Stock Alerts</h3>
                <div className="space-y-2">
                  {alerts.map(f => (
                    <div key={f.product.id} className={`flex items-center justify-between p-2.5 rounded-xl border ${f.urgency === 'critical' ? 'bg-destructive/5 border-destructive/30' : 'bg-warning/5 border-warning/30'}`}>
                      <div>
                        <p className="text-sm font-display font-semibold">{f.product.name}</p>
                        <p className="text-[11px] text-muted-foreground">{stockCoverLabel(f)}{f.hasVelocity ? ` · Order ${f.restockQty} units` : ''}</p>
                      </div>
                      <span className={`text-[10px] font-display font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 ${f.urgency === 'critical' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}><AlertTriangle className="w-3 h-3" /> {f.urgency === 'critical' ? 'Critical' : 'Soon'}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {settings.savingsPlanner && savings && (
            <div className="p-4 rounded-2xl bg-card shadow-card">
              <h3 className="font-display font-bold text-sm mb-3 flex items-center gap-1.5"><PiggyBank className="w-4 h-4" /> Savings Plan</h3>
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
              <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><ShoppingCart className="w-4 h-4" /> Customer Requests</h3>
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


        </div>
      )}

      {/* ─── PREDICTIONS ──────────────────────────────────────────────────── */}
      {tab === 'predictions' && (
        <div className="space-y-4 animate-fade-in">
          <div className="p-4 rounded-2xl bg-card shadow-card">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display font-bold text-base">Revenue Forecasts</h3>
              <button
                onClick={() => setPredictionHistoryOpen(true)}
                className="text-[11px] font-display font-semibold text-primary"
              >
                History
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">A trend line through your recent daily sales. Pick how far ahead to look.</p>
            {!settings.revenueForecasts && !settings.profitForecasts ? (
              <p className="text-xs text-muted-foreground p-3 rounded-lg bg-surface-2 border border-border">Revenue and Profit Forecasts are both turned off in Settings.</p>
            ) : (
            <div className="space-y-3">
              {/* Seven horizons, each a full card with its own figures,
                  confidence bar, range, caveat and pair of feedback buttons —
                  a very long page to answer one question. The horizon is a
                  choice now, and only the chosen one is drawn. */}
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                {horizons.map(h => {
                  const label = FORECAST_LABELS[h] ?? `${h}d`;
                  const active = forecastHorizonDays === h;
                  return (
                    <button
                      key={h}
                      onClick={() => setForecastHorizonDays(h)}
                      className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-display font-bold whitespace-nowrap transition-all ${
                        active
                          ? 'border-primary text-primary bg-primary/5'
                          : 'border-border/60 text-muted-foreground bg-surface-2 hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {(() => {
                const f = forecastHorizon(store, forecastHorizonDays);
                const confColor = f.confidence === 'High' ? 'text-success' : f.confidence === 'Medium' ? 'text-warning' : 'text-muted-foreground';
                const feedbackGiven = forecastFeedback[forecastHorizonDays];
                return (
                  <div className="p-4 rounded-xl bg-surface-2 border border-border space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      {settings.revenueForecasts && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">Expected revenue</p>
                          <p className="font-display font-black text-lg text-primary">₦{Math.round(f.expectedRevenue).toLocaleString()}</p>
                          {/* Range now widens as confidence falls; it used to be
                              a flat ±20% whatever the estimate was built on. */}
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            ₦{Math.round(f.revenueLow).toLocaleString()} – ₦{Math.round(f.revenueHigh).toLocaleString()}
                          </p>
                        </div>
                      )}
                      {settings.profitForecasts && (
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-bold">Expected profit</p>
                          <p className="font-display font-black text-lg text-success">₦{Math.round(f.expectedProfit).toLocaleString()}</p>
                          {/* Profit swings wider than revenue, being the gap
                              between two moving numbers, so it gets its own
                              range rather than borrowing revenue's. */}
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            ₦{Math.round(f.profitLow).toLocaleString()} – ₦{Math.round(f.profitHigh).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-muted-foreground">
                          Confidence · built on {f.daysObserved} day{f.daysObserved === 1 ? '' : 's'} of sales
                        </span>
                        <span className={`font-display font-bold ${confColor}`}>{f.confidencePct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${f.confidencePct}%` }} />
                      </div>
                    </div>

                    {f.caveat && (
                      <p className="text-[10px] text-muted-foreground italic bg-surface-3/50 p-2 rounded flex items-start gap-1.5">
                        <Info className="w-3 h-3 shrink-0 mt-0.5" /> {f.caveat}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                      <span className="text-[10px] text-muted-foreground mr-auto">Was this accurate?</span>
                      <button
                        onClick={() => handleForecastFeedback(forecastHorizonDays, 'correct')}
                        className={`text-xs px-2 py-1 rounded-lg transition flex items-center gap-1 ${feedbackGiven === 'correct' ? 'bg-success/20 text-success' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        <ThumbsUp className="w-3.5 h-3.5" /> Correct
                      </button>
                      <button
                        onClick={() => handleForecastFeedback(forecastHorizonDays, 'incorrect')}
                        className={`text-xs px-2 py-1 rounded-lg transition flex items-center gap-1 ${feedbackGiven === 'incorrect' ? 'bg-destructive/20 text-destructive' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        <ThumbsDown className="w-3.5 h-3.5" /> Incorrect
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
            )}
            {store.sales.length < 10 && (
              <p className="text-xs text-warning mt-3 p-2 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 shrink-0" /> Forecasts become more accurate as you record more sales. Keep going!</p>
            )}
          </div>

          {/* Customer Repayment Predictions */}
          <RepaymentPredictionsCard store={store} />
        </div>
      )}

      {/* ─── ANALYSIS ─────────────────────────────────────────────────────── */}
      {tab === 'analysis' && (
        <div className="space-y-4 animate-fade-in">
          <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider pt-1">What is selling</h3>
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
                    <p className="text-[11px] text-muted-foreground uppercase font-display font-semibold mb-2 flex items-center gap-1"><Flame className="w-3.5 h-3.5" /> Fast Movers (Last 30d)</p>
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
                    <p className="text-[11px] text-muted-foreground uppercase font-display font-semibold mb-2 flex items-center gap-1"><Moon className="w-3.5 h-3.5" /> Never Sold</p>
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
                    <p className="text-[11px] text-muted-foreground uppercase font-display font-semibold mb-2 flex items-center gap-1"><ShoppingCart className="w-3.5 h-3.5" /> Often Bought Together</p>
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

          <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider pt-1">What it costs</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Expense analysis */}
          {settings.expenseAnalysis && (() => {
            const ea = expenseAnalysis(store);
            if (ea.byCat.length === 0) return null;
            return (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Receipt className="w-4 h-4" /> Expense Breakdown</h3>
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
                <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Home className="w-4 h-4" /> Rent Analysis</h3>
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

          </div>

          <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider pt-1">Pricing</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Auto-Applied Price History */}
          {settings.autoApplyPrices && (() => {
            const recentEvents = (store.autoPriceLog || []).filter(e => !e.undone).slice(0, 5);
            if (recentEvents.length === 0) return null;
            return (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><span className="h-4 w-4 shrink-0 overflow-hidden rounded-full"><Mascot size={16} /></span> Auto-Applied Prices</h3>
                <p className="text-[11px] text-muted-foreground -mt-1">Changes your Auto-Apply setting made on its own. Undo any of them any time.</p>
                <div className="space-y-2">
                  {recentEvents.map(e => {
                    const oldProfit = e.oldPrice - e.costPrice;
                    const newProfit = e.newPrice - e.costPrice;
                    const profitDelta = newProfit - oldProfit;
                    const stillCurrent = store.products.find(p => p.id === e.productId)?.sellingPrice === e.newPrice;
                    return (
                      <div key={e.id} className="p-3 rounded-xl bg-surface-2 border border-border space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="font-display font-semibold text-sm truncate">{e.productName}</p>
                          <span className="text-[10px] text-muted-foreground">{new Date(e.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          ₦{e.oldPrice.toLocaleString()} → ₦{e.newPrice.toLocaleString()}
                        </p>
                        <p className={`text-xs font-display font-bold ${profitDelta >= 0 ? 'text-success' : 'text-warning'}`}>
                          Profit per unit: ₦{oldProfit.toLocaleString()} → ₦{newProfit.toLocaleString()} ({profitDelta >= 0 ? '+' : ''}₦{profitDelta.toLocaleString()})
                        </p>
                        {stillCurrent ? (
                          <button
                            onClick={() => {
                              const updated = undoAutoPrice(store, e.id);
                              onUpdate(updated);
                              showToast(`${e.productName} reverted to ₦${e.oldPrice.toLocaleString()}`);
                            }}
                            className="mt-1 px-3 py-1.5 rounded-lg text-[11px] font-display font-bold bg-destructive/10 text-destructive border border-destructive/30 flex items-center gap-1"
                          >
                            <Undo2 className="w-3 h-3" /> Undo
                          </button>
                        ) : (
                          <p className="text-[10px] text-muted-foreground italic">Price has changed again since — undo unavailable.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Pricing alerts */}
          {settings.autoSuggestPrices && (() => {
            const alerts = pricingAlerts(store, (settings.defaultMargin || 25) / 100);
            if (alerts.length === 0) return null;
            return (
              <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
                <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><BarChart3 className="w-4 h-4" /> Pricing Alerts</h3>
                <p className="text-[11px] text-muted-foreground -mt-1">Suggestions only — nothing changes until you tap Accept.</p>
                <div className="space-y-2">
                  {alerts.slice(0, 4).map(a => {
                    const isPendingConfirm = pendingPriceAccept === a.product.id;
                    return (
                    <div key={a.product.id} className={`p-3 rounded-xl border ${a.type === 'zero_margin' ? 'bg-destructive/5 border-destructive/30' : a.type === 'underpriced' ? 'bg-warning/5 border-warning/30' : 'bg-surface-2 border-border'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-display font-semibold text-sm truncate">{a.product.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.type === 'zero_margin' ? 'Selling at or below what you paid!' : a.type === 'underpriced' ? `Only ${(a.currentMarkup * 100).toFixed(0)}% on top of cost` : `Very high markup (${(a.currentMarkup * 100).toFixed(0)}%)`}
                            {' '}· Currently ₦{a.product.sellingPrice.toLocaleString()} → suggest ₦{a.suggestedPrice.toLocaleString()}
                          </p>
                        </div>
                        {!isPendingConfirm ? (
                          <button
                            onClick={() => setPendingPriceAccept(a.product.id)}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-display font-bold bg-primary/10 text-primary border border-primary/30"
                          >
                            Accept
                          </button>
                        ) : (
                          <div className="flex-shrink-0 flex gap-1.5">
                            <button
                              onClick={() => setPendingPriceAccept(null)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-display font-bold border border-border text-muted-foreground"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                const updated = updateProduct(store, a.product.id, { sellingPrice: a.suggestedPrice });
                                saveStore(updated);
                                onUpdate(updated);
                                setPendingPriceAccept(null);
                                showToast(`${a.product.name} price set to ₦${a.suggestedPrice.toLocaleString()}`);
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-display font-bold bg-success text-white"
                            >
                              Confirm ₦{a.suggestedPrice.toLocaleString()}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );})}
                </div>
              </div>
            );
          })()}

          </div>

          {/* Insights */}
          <div className="space-y-2">
            <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider pt-1">Insights</h3>
            {insights.length === 0 ? <p className="text-sm text-muted-foreground p-4 text-center">Record more sales to unlock insights.</p> : null}
            {insights.map(i => {
              const tones: Record<string, string> = { success: 'bg-success/10 border-success/30 text-success', warning: 'bg-warning/10 border-warning/30 text-warning', info: 'bg-primary/10 border-primary/30 text-primary', danger: 'bg-destructive/10 border-destructive/30 text-destructive' };
              return (
                <div key={i.id} className={`p-3 rounded-xl border flex items-start gap-3 ${tones[i.tone]}`}>
                  <span className="text-xl">{i.icon}</span>
                  <div className="flex-1">
                    <p className="font-display font-semibold text-sm">{i.text}</p>
                    <p className="text-xs opacity-70 mt-0.5">{i.explain}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Product Insight Badges */}
          {(() => {
            const badges = getProductInsightBadges(store);
            if (badges.length === 0) return null;
            const badgeStyle: Record<string, string> = {
              'Best Seller': 'bg-warning/10 border-warning/30 text-warning',
              'Fast Mover': 'bg-primary/10 border-primary/30 text-primary',
              'High Sales': 'bg-success/10 border-success/30 text-success',
              'Dormant Product': 'bg-muted/40 border-border text-muted-foreground',
            };
            return (
              <div className="space-y-2">
                <h3 className="font-display font-bold text-xs px-1 text-muted-foreground uppercase tracking-wider">Product Insights</h3>
                <div className="space-y-2">
                  {badges.slice(0, 8).map((b, idx) => (
                    <div key={`${b.productId}-${b.label}-${idx}`} className={`p-3 rounded-xl border flex items-start gap-3 ${badgeStyle[b.label]}`}>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-display font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-current/30">{b.label}</span>
                          <p className="font-display font-semibold text-sm">{b.productName}</p>
                        </div>
                        <p className="text-xs opacity-70 mt-0.5">{b.explain}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── ADVICE ───────────────────────────────────────────────────────── */}
      {tab === 'advice' && (
        <div className="space-y-4 animate-fade-in">
          {/* The two things you came here to do. Purchase Orders, Ratings and
              the notification archive used to sit up here too, pushing the
              actual advice below the fold. */}
          <div className="flex gap-2">
            <button onClick={handleGetAdvice} disabled={adviceLoading}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-70">
              {adviceLoading ? <><Hourglass className="w-4 h-4" /> Analysing...</> : <><Sparkles className="w-4 h-4" /> Get Advice</>}
            </button>
            <button onClick={() => setChatOpen(true)}
              className="flex-1 py-3 rounded-xl bg-surface-2/60 border border-primary/30 text-foreground font-display font-bold text-sm flex items-center justify-center gap-2">
              <MessageCircle className="w-4 h-4" />
              Message with Flow
            </button>
          </div>

          {/* Notification Archive Modal */}
          {showArchive && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={() => setShowArchive(false)}><ScrollLock />
              <div className="w-full max-w-md bg-card border border-border/60 rounded-2xl p-5 shadow-2xl max-h-[80vh] overflow-y-auto space-y-4 animate-scale-in text-left flex flex-col no-scrollbar" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start border-b border-border pb-3">
                  <div>
                    <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2">
                      <Archive className="w-4 h-4" /> Notification Archive
                    </h3>
                    <p className="text-[10px] text-muted-foreground">Full history of alerts and insights from Flow.</p>
                  </div>
                  <button onClick={() => setShowArchive(false)} className="p-1 hover:bg-surface-3 rounded text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>

                <div className="space-y-2 flex-1 overflow-y-auto max-h-[50vh] pr-1">
                  {(store.flowNotifications || []).length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-xs">
                      No notifications recorded in history yet.
                    </div>
                  ) : (
                    (store.flowNotifications || []).map(n => (
                      <div key={n.id} className={`p-3 rounded-xl border flex gap-3 text-left bg-surface-2 border-border/40`}>
                        <span className="text-lg shrink-0 mt-0.5">{n.icon || <Bell className="w-4 h-4" />}</span>
                        <div className="space-y-1 flex-1 min-w-0">
                          <p className="text-xs font-display font-bold text-foreground leading-normal">{n.title || 'Flow Alert'}</p>
                          <p className="text-[11px] text-muted-foreground leading-normal">{n.description || n.text}</p>
                          <p className="text-[9px] text-muted-foreground/60 font-mono pt-1">
                            {new Date(n.date).toLocaleDateString()} · {new Date(n.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-2 border-t border-border flex justify-end">
                  <button
                    onClick={() => setShowArchive(false)}
                    className="px-4 py-2 bg-surface-2 hover:bg-surface-3 border border-border text-xs font-display font-bold rounded-xl transition cursor-pointer"
                  >
                    Close Archive
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Advice Report Card (Typewriter Analysis) */}
          {adviceReportVisible && adviceReport && (
            <FlowAdviceReport
              report={adviceReport}
              onDismiss={() => setAdviceReportVisible(false)}
              onNavigate={onNavigate}
              onAutoFix={setAutoFixTarget}
            />
          )}

          {/* Advice cards */}
          {visibleAdvice.length > 0 ? (
            <div className="space-y-2">
              {visibleAdvice.map(a => (
                <div key={a.id} className={`p-3.5 rounded-xl border shadow-card ${advicePriorityColor[a.priority]}`}>
                  <div className="flex items-start gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0 ${adviceIconBg[a.priority]}`}>{a.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display font-bold text-sm text-foreground">{a.title}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-display font-bold flex-shrink-0 ${a.priority === 'critical' ? 'bg-destructive text-white' : a.priority === 'high' ? 'bg-warning text-white' : a.priority === 'medium' ? 'bg-primary/20 text-primary' : 'bg-surface-3 text-muted-foreground'}`}>{a.priority.toUpperCase()}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{a.detail}</p>
                      {a.items && a.items.length > 0 && (
                        <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                          {a.items.map((it, i) => (
                            <div key={i} className="flex items-center justify-between text-xs gap-2">
                              <span className="text-foreground truncate">{it.name}</span>
                              <span className="text-muted-foreground flex-shrink-0">{it.note}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* One row instead of three. Each card used to stack two
                          full-width buttons and then a bordered "Helpful / Not
                          relevant" strip, so the same chrome repeated down the
                          whole screen and buried the advice between it. Auto
                          Fix stays the one prominent control; going to the
                          screen is a text link, and the feedback is a pair of
                          icons pushed to the end. */}
                      <div className="flex items-center gap-2 mt-2.5">
                        {a.autoFix && (
                          <button
                            onClick={() => setAutoFixTarget(a.autoFix!)}
                            className="px-3 py-1.5 rounded-lg text-xs font-display font-bold bg-foreground/90 text-background active:scale-[0.97] transition flex items-center gap-1 shrink-0"
                          >
                            <Zap className="w-3.5 h-3.5" /> Auto Fix
                          </button>
                        )}
                        {a.goTo && (
                          <button
                            onClick={() => onNavigate?.(a.goTo!, a.focus)}
                            className="px-2 py-1.5 rounded-lg text-xs font-display font-bold text-current/80 hover:text-current active:scale-[0.97] transition shrink-0"
                          >
                            {a.autoFix ? 'Open' : 'Go to Action'}
                          </button>
                        )}
                        <span className="flex-1" />
                        <button
                          onClick={() => handleHelpfulAdvice(a.id)}
                          aria-label="This advice was helpful"
                          title="Helpful"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-success hover:bg-success/10 transition shrink-0"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDismissAdvice(a.id)}
                          aria-label="Not relevant, hide this"
                          title="Not relevant"
                          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition shrink-0"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center">
              <PartyPopper className="w-9 h-9 mx-auto mb-2 text-primary" />
              <p className="font-display font-bold">Looking good!</p>
              <p className="text-sm text-muted-foreground mt-1">No critical actions needed right now. Keep recording sales to unlock deeper advice.</p>
            </div>
          )}

          {/* Recommendations, suppliers and customer requests are background
              reading. They used to sit open below the advice, so the page kept
              going long after it had said anything actionable. */}
          <div className="pt-1">
            <button
              onClick={() => setShowMoreInsights(v => !v)}
              aria-expanded={showMoreInsights}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-border bg-surface-2/30 text-left hover:bg-surface-2/60 transition-colors"
            >
              <span className="text-xs font-display font-bold">
                {showMoreInsights ? 'Hide extras' : 'Recommendations, suppliers & requests'}
              </span>
              <ChevronDown className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${showMoreInsights ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showMoreInsights && (
            <div className="space-y-4 animate-fade-in">
              {/* Recommendations */}
              {recs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-display font-bold text-sm px-1 flex items-center gap-1.5"><ClipboardList className="w-4 h-4" /> Recommendations</h3>
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
                  <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><ShoppingCart className="w-4 h-4" /> Top Customer Requests</h3>
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

          {/* Secondary destinations, out of the way at the end. The archive in
              particular was the second thing on the page. */}
          <div className="pt-2 mt-2 border-t border-border/60 flex flex-wrap gap-x-4 gap-y-2 justify-center">
            <button
              onClick={() => setPoListOpen(true)}
              className="py-1.5 text-[11px] font-display font-semibold text-muted-foreground hover:text-foreground transition flex items-center gap-1.5"
            >
              <Package className="w-3.5 h-3.5" /> Purchase Orders
            </button>
            <button
              onClick={() => setRatingsOpen(true)}
              className="py-1.5 text-[11px] font-display font-semibold text-muted-foreground hover:text-foreground transition flex items-center gap-1.5"
            >
              <Star className="w-3.5 h-3.5" /> Ratings
            </button>
            <button
              onClick={() => setShowArchive(true)}
              className="py-1.5 text-[11px] font-display font-semibold text-muted-foreground hover:text-foreground transition flex items-center gap-1.5"
            >
              <Archive className="w-3.5 h-3.5" /> Archive ({store.flowNotifications?.length || 0})
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showBreakdown && createPortal(
        <HealthBreakdownModal store={store} onClose={() => setShowBreakdown(false)} />,
        document.body
      )}
      {showPerformanceCalendar && createPortal(
        <PerformanceCalendar store={store} onClose={() => setShowPerformanceCalendar(false)} />,
        document.body
      )}
      {showNotifications && createPortal(
        <NotificationDrawer
          store={store}
          onClose={() => setShowNotifications(false)}
          onUpdate={onUpdate}
          onNavigate={onNavigate}
        />,
        document.body
      )}
      {chatOpen && createPortal(
        <FlowChat
          store={store}
          orders={orders}
          onClose={() => setChatOpen(false)}
          onNavigate={onNavigate}
          onUpdate={onUpdate}
        />,
        document.body
      )}
      {poListOpen && createPortal(
        <PurchaseOrdersList store={store} onClose={() => setPoListOpen(false)} onUpdate={onUpdate} />,
        document.body
      )}
      {ratingsOpen && createPortal(
        <MerchantRatings store={store} onClose={() => setRatingsOpen(false)} />,
        document.body
      )}
      {predictionHistoryOpen && createPortal(
        <PredictionHistory store={store} onClose={() => setPredictionHistoryOpen(false)} />,
        document.body
      )}
      {autoFixTarget && createPortal(
        <AutoFixConfirmDialog
          spec={autoFixTarget}
          busy={autoFixBusy}
          onCancel={() => (autoFixBusy ? null : setAutoFixTarget(null))}
          onConfirm={handleAutoFixConfirmed}
        />,
        document.body
      )}
    </div>
  );
}

// ─── Repayment Predictions Card ──────────────────────────────────────────────
function fmtRelDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Math.round((d.getTime() - Date.now()) / 86400000);
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (diff === 0) return `Today · ${label}`;
  if (diff === 1) return `Tomorrow · ${label}`;
  if (diff > 0 && diff < 14) return `In ${diff}d · ${label}`;
  if (diff < 0 && diff > -14) return `${Math.abs(diff)}d ago · ${label}`;
  return label;
}

function RepaymentPredictionsCard({ store }: { store: StoreData }) {
  const insights = useMemo(() => getRepaymentInsights(store), [store]);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (insights.customers.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-card shadow-card">
        <h3 className="font-display font-bold text-base mb-1">Repayment Predictions</h3>
        <p className="text-xs text-muted-foreground">No pending payments yet. Flow learns repayment habits as they settle.</p>
      </div>
    );
  }

  const active = insights.customers.filter(c => c.activeDebts > 0);
  const shown = active.length > 0 ? active : insights.customers.slice(0, 5);

  const toneClass = (r: number) =>
    r >= 75 ? 'bg-success/15 text-success border-success/30'
    : r >= 45 ? 'bg-warning/15 text-warning border-warning/30'
    : 'bg-destructive/15 text-destructive border-destructive/30';

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display font-bold text-base">Repayment Predictions</h3>
          <p className="text-xs text-muted-foreground">Learned from {insights.customers.length} customer{insights.customers.length === 1 ? '' : 's'} · {insights.customers.reduce((s, c) => s + c.sampleSize, 0)} payment events.</p>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-[10px] font-display font-bold border ${toneClass(insights.overallReliability)}`}>
          {insights.overallReliability}% avg reliability
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl bg-surface-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg debt</p>
          <p className="font-display font-bold text-sm text-yellow-500">₦{insights.overallAvgDebtSize.toLocaleString()}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-surface-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Clears in</p>
          <p className="font-display font-bold text-sm">{insights.overallAvgDaysToClear !== null ? `${insights.overallAvgDaysToClear}d` : '—'}</p>
        </div>
        <div className="p-2.5 rounded-xl bg-surface-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Customers</p>
          <p className="font-display font-bold text-sm">{insights.customers.length}</p>
        </div>
      </div>

      {(insights.mostReliable || insights.riskiest) && (
        <div className="grid grid-cols-2 gap-2">
          {insights.mostReliable && (
            <div className="p-2.5 rounded-xl bg-success/10 border border-success/30">
              <p className="text-[10px] text-success uppercase font-semibold flex items-center gap-1"><Star className="w-3 h-3" /> Most reliable</p>
              <p className="text-xs font-display font-bold truncate">{insights.mostReliable.customerName}</p>
              <p className="text-[10px] text-muted-foreground">{insights.mostReliable.reliabilityScore}% score</p>
            </div>
          )}
          {insights.riskiest && insights.riskiest.customerKey !== insights.mostReliable?.customerKey && (
            <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/30">
              <p className="text-[10px] text-destructive uppercase font-semibold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Watch closely</p>
              <p className="text-xs font-display font-bold truncate">{insights.riskiest.customerName}</p>
              <p className="text-[10px] text-muted-foreground">{insights.riskiest.reliabilityScore}% score</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {shown.slice(0, 8).map(c => {
          const isOpen = expanded === c.customerKey;
          const chip = toneClass(c.reliabilityScore);
          return (
            <div key={c.customerKey} className="rounded-xl bg-surface-2 border border-border overflow-hidden">
              <button onClick={() => setExpanded(isOpen ? null : c.customerKey)} className="w-full p-3 flex items-start justify-between gap-2 text-left">
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-sm truncate">{c.customerName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.activeDebts > 0
                      ? <>Owes <span className="text-warning font-semibold">₦{c.currentBalance.toLocaleString()}</span> · next pay {fmtRelDate(c.predictedNextPaymentDate)}</>
                      : <>Cleared {c.completedDebts} debt{c.completedDebts === 1 ? '' : 's'} · avg ₦{c.avgDebtSize.toLocaleString()}</>
                    }
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-[10px] font-display font-bold px-2 py-0.5 rounded-full border ${chip}`}>
                    {c.reliabilityScore}%
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{c.sampleSize} events</p>
                </div>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-0 grid grid-cols-2 gap-2 border-t border-border/60">
                  <Stat label="Avg debt size" value={`₦${c.avgDebtSize.toLocaleString()}`} />
                  <Stat label="Largest debt" value={`₦${c.largestDebt.toLocaleString()}`} />
                  <Stat label="Avg days to clear" value={c.avgDaysToClear !== null ? `${c.avgDaysToClear}d` : 'No data'} />
                  <Stat label="Payment cadence" value={c.avgDaysBetweenPayments !== null ? `every ${c.avgDaysBetweenPayments}d` : 'No data'} />
                  <Stat label="On-time rate" value={c.onTimeRate !== null ? `${c.onTimeRate}%` : 'No due dates'} />
                  <Stat label="Debts (done / total)" value={`${c.completedDebts} / ${c.totalDebts}`} />
                  {c.activeDebts > 0 && (
                    <>
                      <Stat label="Predicted next pay" value={fmtRelDate(c.predictedNextPaymentDate)} tone="primary" />
                      <Stat label="Full clear by" value={fmtRelDate(c.predictedFullClearDate)} tone="primary" />
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {insights.customers.reduce((s, c) => s + c.sampleSize, 0) < 5 && (
        <p className="text-[11px] text-warning p-2 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5 shrink-0" /> Predictions sharpen as more repayments are recorded.</p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'primary' }) {
  return (
    <div className="p-2 rounded-lg bg-card border border-border/60">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-xs font-display font-bold ${tone === 'primary' ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
