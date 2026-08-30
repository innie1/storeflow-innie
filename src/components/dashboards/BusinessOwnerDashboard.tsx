import { useState } from 'react';
import { StoreData } from '@/types/store';
import { getBusinessTemplate } from '@/lib/business-templates';
import { getLaundryActionView, requestLaundryWorkspace } from '@/lib/laundry-workspace';
import BusinessAnalytics from '@/components/analytics/BusinessAnalytics';
import BusinessPulse from '@/components/BusinessPulse';
import FeatureErrorBoundary from '@/components/FeatureErrorBoundary';

interface BusinessOwnerDashboardProps {
  store: StoreData;
  orders?: any[];
  onNavigate: (tab: any, lowStock?: boolean) => void;
}

const quickActions: Record<string, { label: string; tab: string; icon: string }[]> = {
  laundry: [
    { label: 'Record Laundry', tab: 'laundry-records', icon: '🧺' },
    { label: 'Price List', tab: 'inventory', icon: '👕' },
    { label: 'Customers', tab: 'customers', icon: '👥' },
    { label: 'Laundry Records', tab: 'laundry-records', icon: '🧾' },
  ],
  gas_filling: [
    { label: 'New Gas Sale', tab: 'sales', icon: '⛽' },
    { label: 'Gas Stock', tab: 'inventory', icon: '🛢️' },
    { label: 'Orders', tab: 'orders', icon: '📋' },
    { label: 'Customers', tab: 'customers', icon: '👥' },
  ],
  games: [
    { label: 'Start Session', tab: 'games-dashboard', icon: '🎮' },
    { label: 'Games & Prices', tab: 'games-settings', icon: '🕹️' },
    { label: 'Session History', tab: 'games-history', icon: '📋' },
    { label: 'Analytics', tab: 'games-analytics', icon: '📈' },
  ],
  restaurant: [
    { label: 'New Order', tab: 'orders', icon: '🍔' },
    { label: 'Menu / Products', tab: 'inventory', icon: '📋' },
    { label: 'Sales', tab: 'sales', icon: '💰' },
    { label: 'Customers', tab: 'customers', icon: '👥' },
  ],
  food: [
    { label: 'New Order', tab: 'orders', icon: '🍲' },
    { label: 'Products', tab: 'inventory', icon: '📦' },
    { label: 'Sales', tab: 'sales', icon: '💰' },
    { label: 'Customers', tab: 'customers', icon: '👥' },
  ],
  provision: [
    { label: 'Sell', tab: 'sales', icon: '💰' },
    { label: 'Inventory', tab: 'inventory', icon: '📦' },
    { label: 'Orders', tab: 'orders', icon: '🛍️' },
    { label: 'Customers', tab: 'customers', icon: '👥' },
  ],
};

export default function BusinessOwnerDashboard({ store, orders = [], onNavigate }: BusinessOwnerDashboardProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const template = getBusinessTemplate(store.storeType);
  const actions = quickActions[store.storeType] || [
    { label: template.labels.primaryAction, tab: 'orders', icon: '✨' },
    { label: 'Products / Services', tab: 'inventory', icon: '📦' },
    { label: 'Sales', tab: 'sales', icon: '💰' },
    { label: 'Customers', tab: 'customers', icon: '👥' },
  ];

  const handleQuickAction = (action: { label: string; tab: string }) => {
    if (store.storeType === 'laundry') {
      const laundryView = getLaundryActionView(action.label);
      if (laundryView) requestLaundryWorkspace(laundryView);
    }
    onNavigate(action.tab);
  };

  if (showAnalysis) return <BusinessAnalytics store={store} onBack={() => setShowAnalysis(false)} />;

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = (store.sales || []).filter(s => s.date?.slice(0, 10) === today);
  const revenue = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const serviceCount = Math.max(
    (store.products || []).filter(p => p.isService).length,
    template.offerings.filter(o => o.mode === 'services').length,
  );
  const gameCount = (store.games || []).filter(g => g.enabled).length || (store.games || []).length;
  const todaySessions = (store.gameSessions || []).filter(s => s.date?.slice(0, 10) === today).length;
  const todaySessionRevenue = (store.gameSessions || [])
    .filter(s => s.date?.slice(0, 10) === today)
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const stats = store.storeType === 'laundry'
    ? [
        { label: 'Today Revenue', value: `₦${revenue.toLocaleString()}`, icon: '💰' },
        { label: 'Treatments', value: String(serviceCount), icon: '🧺' },
        { label: 'Customers', value: String((store.customers || []).length), icon: '👥' },
      ]
    : store.storeType === 'gas_filling'
      ? [
          { label: 'Today Revenue', value: `₦${revenue.toLocaleString()}`, icon: '💰' },
          { label: 'Gas Sold', value: '—', icon: '⛽' },
          { label: 'Deliveries', value: '—', icon: '🚚' },
        ]
      : store.storeType === 'games'
        ? [
            { label: 'Today Revenue', value: `₦${(revenue + todaySessionRevenue).toLocaleString()}`, icon: '💰' },
            { label: 'Games', value: String(gameCount), icon: '🎮' },
            { label: 'Sessions Today', value: String(todaySessions), icon: '⏱️' },
          ]
        : [
            { label: 'Today Revenue', value: `₦${revenue.toLocaleString()}`, icon: '💰' },
            { label: 'Products', value: String((store.products || []).length), icon: '📦' },
            { label: 'Customers', value: String((store.customers || []).length), icon: '👥' },
          ];

  const primaryAction = actions[0];
  const secondaryActions = actions.slice(1);

  return (
    <div className="space-y-3 animate-fade-in">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">{template.icon}</div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-black text-lg truncate">{store.storeName}</h1>
            <p className="text-[11px] text-muted-foreground">{template.name}</p>
          </div>
          <button onClick={() => setShowAnalysis(true)} className="shrink-0 rounded-xl border border-border px-3 py-2 text-[11px] font-display font-bold">Analysis</button>
        </div>
      </section>

      {primaryAction && (
        <button onClick={() => handleQuickAction(primaryAction)} className="w-full rounded-2xl bg-primary px-4 py-4 text-left text-primary-foreground shadow-sm active:scale-[0.99] transition-transform">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/10 text-2xl">{primaryAction.icon}</span>
            <span className="flex-1"><span className="block text-[10px] font-black uppercase tracking-wider opacity-70">Start here</span><span className="font-display text-lg font-black">{primaryAction.label}</span></span>
            <span className="text-xl" aria-hidden="true">→</span>
          </div>
        </button>
      )}

      <section className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-card">
        {stats.map(stat => (
          <div key={stat.label} className="min-w-0 border-r border-border p-3 last:border-r-0">
            <div className="font-display font-black text-sm truncate">{stat.value}</div>
            <div className="text-[9px] text-muted-foreground mt-0.5 truncate">{stat.label}</div>
          </div>
        ))}
      </section>

      <section>
        <div className="grid grid-cols-3 gap-2">
          {secondaryActions.map(action => (
            <button key={action.label} onClick={() => handleQuickAction(action)} className="min-h-20 rounded-xl border border-border bg-card p-3 text-left hover:border-primary/50 active:scale-[0.99] transition-all">
              <div className="text-lg">{action.icon}</div>
              <div className="font-display font-bold text-[11px] mt-1.5 leading-tight">{action.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <button type="button" onClick={() => setShowInsights(value => !value)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
          <span><span className="block font-display text-sm font-black">Business insights</span><span className="mt-0.5 block text-[10px] text-muted-foreground">Earnings, customers and promised times</span></span>
          <span className="text-sm text-muted-foreground">{showInsights ? 'Hide' : 'View'}</span>
        </button>
        {showInsights && <div className="border-t border-border p-3"><FeatureErrorBoundary name="Business insights"><BusinessPulse store={store} orders={orders} onNavigate={onNavigate} /></FeatureErrorBoundary></div>}
      </section>

    </div>
  );
}
