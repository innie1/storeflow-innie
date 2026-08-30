import { useState } from 'react';
import { StoreData } from '@/types/store';
import { getBusinessTemplate } from '@/lib/business-templates';
import { getLaundryActionView, requestLaundryWorkspace } from '@/lib/laundry-workspace';
import BusinessAnalytics from '@/components/analytics/BusinessAnalytics';
import BusinessPulse from '@/components/BusinessPulse';

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

  return (
    <div className="space-y-5 animate-fade-in">
      <section className="rounded-3xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl">{template.icon}</div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Your business</p>
            <h1 className="font-display font-bold text-xl truncate">{store.storeName}</h1>
            <p className="text-xs text-primary font-semibold mt-0.5">{template.name}</p>
          </div>
          <button onClick={() => setShowAnalysis(true)} className="shrink-0 rounded-xl bg-primary text-primary-foreground px-3 py-2 text-xs font-display font-bold">Analysis</button>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-2xl border border-border bg-card p-3">
            <div className="text-lg">{stat.icon}</div>
            <div className="font-display font-bold text-sm mt-2 truncate">{stat.value}</div>
            <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{stat.label}</div>
          </div>
        ))}
      </section>

      <BusinessPulse store={store} orders={orders} onNavigate={onNavigate} />

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-bold">Quick actions</h2>
          <span className="text-[10px] text-muted-foreground">Made for your business</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {actions.map(action => (
            <button key={action.label} onClick={() => handleQuickAction(action)} className="rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/50 active:scale-[0.99] transition-all">
              <div className="text-2xl">{action.icon}</div>
              <div className="font-display font-bold text-sm mt-2">{action.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold">Customer & QR analysis</h2>
            <p className="text-sm text-muted-foreground mt-1">See scans, visitors, guest buyers, successful orders and repeat customers.</p>
          </div>
          <button onClick={() => setShowAnalysis(true)} className="px-4 py-2 rounded-xl border border-primary text-primary text-xs font-bold whitespace-nowrap">Open</button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display font-bold">What you need to do today</h2>
        <p className="text-sm text-muted-foreground mt-1">Manchant has prepared this workspace for your {template.name.toLowerCase()} business. You can start working immediately — no technical setup required.</p>
      </section>
    </div>
  );
}
