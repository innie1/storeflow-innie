import { useState } from 'react';
import { StoreData, CustomerRequest, DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { healthScore, forecast, generateRecommendations, generateInsights, topCustomerRequests } from '@/lib/manager-intel';
import { showToast } from '@/components/Toast';

interface ManagerProps {
  store: StoreData;
  onUpdate: (s: StoreData) => void;
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

export default function Manager({ store, onUpdate }: ManagerProps) {
  const [tab, setTab] = useState<ManagerTab>('overview');
  const [requestText, setRequestText] = useState('');

  const settings = store.managerSettings || DEFAULT_MANAGER_SETTINGS;
  const health = healthScore(store);
  const insights = generateInsights(store, '7d');
  const recs = generateRecommendations(store);
  const f7 = forecast(store, 7);
  const f30 = forecast(store, 30);
  const f90 = forecast(store, 90);
  const f180 = forecast(store, 180);
  const requests = topCustomerRequests(store, 6);
  const savings = store.savingsGoal;

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

  const tabs: { id: ManagerTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'insights', label: 'Insights' },
    { id: 'recommendations', label: 'Recommendations' },
    { id: 'alerts', label: 'Alerts' },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      <div className="p-4 rounded-2xl bg-card shadow-card flex items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-2xl">🤖</div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-bold text-lg">Store Manager</h2>
          <p className="text-xs text-muted-foreground">Your AI Business Assistant</p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-success/15 text-success text-[10px] font-display font-bold uppercase tracking-wide">Active</span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-display font-semibold whitespace-nowrap transition-colors ${
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground border border-border'
            }`}>
            {t.label}
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
                  <p className="text-[10px] text-muted-foreground">{savings.percentage}% of {savings.source}</p>
                </div>
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

      {tab === 'alerts' && (
        <div className="space-y-2 animate-fade-in">
          {recs.filter(r => r.tone === 'danger' || r.tone === 'warning').length === 0 && (
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
