import { useState } from 'react';
import { StoreData, CustomerRequest, DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { healthScore, forecast, generateRecommendations, generateInsights, topCustomerRequests } from '@/lib/manager-intel';
import { showToast } from '@/components/Toast';
import Mascot, { MascotBadge } from '@/components/Mascot';

interface ManagerProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
  onEnable?: () => void;
}

type ManagerTab = 'overview' | 'insights' | 'recommendations' | 'alerts';

function Ring({ value, size = 90, stroke = 8, tone = 'primary' }: { value: number; size?: number; stroke?: number; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
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

export default function Manager({ store, onUpdate, onEnable }: ManagerProps) {
  const [tab, setTab] = useState<ManagerTab>('overview');
  const [requestText, setRequestText] = useState('');

  const settings = store.managerSettings || DEFAULT_MANAGER_SETTINGS;

  // --- OFF state: premium empty state ---
  if (!settings.enabled) {
    const enable = () => {
      const updated = { ...store, managerSettings: { ...settings, enabled: true } };
      saveStore(updated); onUpdate(updated);
      showToast('Store Manager enabled');
      onEnable?.();
    };
    return (
      <div className="animate-fade-in space-y-4">
        <div className="p-6 rounded-2xl bg-card shadow-card text-center space-y-4">
          <div className="flex justify-center"><Mascot size={120} mood="sleeping" /></div>
          <MascotBadge on={false} />
          <h2 className="font-display font-bold text-xl text-foreground">Store Manager is sleeping</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Wake Flow up to unlock insights, forecasts, recommendations and savings plans tailored to your store.
          </p>
          <ul className="text-left text-sm text-muted-foreground max-w-xs mx-auto space-y-1.5">
            {['Business Insights','Revenue Forecasts','Expense Analysis','Product Suggestions','Savings Plans'].map(x => (
              <li key={x} className="flex items-center gap-2"><span className="text-success">✓</span>{x}</li>
            ))}
          </ul>
          <button onClick={enable} className="w-full max-w-xs mx-auto p-3 rounded-xl bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity">
            Enable Store Manager
          </button>
        </div>
      </div>
    );
  }

  const health = healthScore(store);
  const insights = generateInsights(store, '7d');
  const recs = generateRecommendations(store);
  const f7 = forecast(store, 7);
  const f30 = forecast(store, 30);
  const f90 = forecast(store, 90);
  const f180 = forecast(store, 180);
  const requests = topCustomerRequests(store, 6);
  const savings = store.savingsGoal;
  const alertCount = recs.filter(r => r.tone === 'danger' || r.tone === 'warning').length;

  const healthTone: 'success' | 'primary' | 'warning' | 'danger' =
    health.overall >= 80 ? 'success' : health.overall >= 60 ? 'primary' : health.overall >= 40 ? 'warning' : 'danger';

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
    { id: 'recommendations', label: 'Recommendations', badge: recs.length || undefined },
    { id: 'alerts', label: 'Alerts', badge: alertCount || undefined },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      <div className="p-4 rounded-2xl bg-card shadow-card flex items-center gap-3">
        <Mascot size={56} mood="thinking" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-lg">Store Manager</h2>
          <p className="text-xs text-muted-foreground">Flow is analyzing your business performance</p>
        </div>
        <MascotBadge on={true} />
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative px-3.5 py-1.5 rounded-full text-xs font-display font-semibold whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground border border-border'
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
          <div className="p-4 rounded-2xl bg-card shadow-card">
            <h3 className="font-display font-bold text-sm mb-3">Store Health</h3>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Ring value={health.overall} size={100} tone={healthTone} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display font-bold text-2xl text-foreground">{health.overall}</span>
                  <span className="text-[10px] text-muted-foreground">/100</span>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                {[
                  { label: 'Sales', v: health.sales },
                  { label: 'Inventory', v: health.inventory },
                  { label: 'Expense', v: health.expense },
                  { label: 'Profit', v: health.profit },
                ].map(s => (
                  <div key={s.label} className="p-2 rounded-lg bg-surface-2">
                    <p className="text-[10px] text-muted-foreground uppercase">{s.label}</p>
                    <p className="font-display font-bold text-sm">{s.v}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">{health.label}</p>
          </div>

          {settings.revenueForecasts && (
            <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
              <h3 className="font-display font-bold text-sm">Business Predictions</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { k: '7 Days', f: f7 },
                  { k: '30 Days', f: f30 },
                  { k: '3 Months', f: f90 },
                  { k: '6 Months', f: f180 },
                ].map(({ k, f }) => {
                  const tone = f.confidence === 'High' ? 'text-success' : f.confidence === 'Medium' ? 'text-warning' : 'text-muted-foreground';
                  return (
                    <div key={k} className="p-3 rounded-xl bg-surface-2 border border-border space-y-1">
                      <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{k}</p>
                      <p className="text-[10px] text-muted-foreground">Revenue</p>
                      <p className="font-display font-bold text-base text-primary">₦{Math.round(f.expectedRevenue).toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Profit ₦{Math.round(f.expectedProfit).toLocaleString()}</p>
                      <p className={`text-[10px] font-display font-semibold ${tone}`}>{f.confidence} Confidence</p>
                    </div>
                  );
                })}
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

          {settings.savingsPlanner && savings && (
            <div className="p-4 rounded-2xl bg-card shadow-card">
              <h3 className="font-display font-bold text-sm mb-3">Savings Plan</h3>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Ring value={(savings.saved / Math.max(1, savings.amount)) * 100} size={88} tone="success" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-display font-bold text-sm">{Math.round((savings.saved / Math.max(1, savings.amount)) * 100)}%</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Goal: {savings.label || 'Savings Goal'}</p>
                  <p className="font-display font-bold text-xl text-foreground">₦{savings.amount.toLocaleString()}</p>
                  <p className="text-xs text-success">Saved ₦{savings.saved.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">{savings.percentage}% of {savings.source}{savings.frequency ? ` · ${savings.frequency}` : ''}</p>
                  {savings.bankName && <p className="text-[10px] text-muted-foreground">Bank: {savings.bankName}</p>}
                </div>
              </div>
              <p className="text-[11px] text-warning/90 mt-3 p-2 rounded bg-warning/10 border border-warning/30">
                💡 Set up an automated save plan in your banking app (Opay, PalmPay, Kuda, etc.) to actually move this money.
              </p>
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

      {tab === 'alerts' && (
        <div className="space-y-2 animate-fade-in">
          {alertCount === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">No critical alerts. 🎉</p>
          )}
          {recs.filter(r => r.tone === 'danger' || r.tone === 'warning').map(r => (
            <div key={r.id} className={`p-3 rounded-xl border flex items-start gap-3 ${r.tone === 'danger' ? 'bg-destructive/10 border-destructive/30' : 'bg-warning/10 border-warning/30'}`}>
              <span className="text-xl">{r.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`font-display font-semibold text-sm ${r.tone === 'danger' ? 'text-destructive' : 'text-warning'}`}>{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
