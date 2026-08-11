import { StoreData } from '@/types/store';
import { getBusinessTemplate } from '@/lib/business-templates';

interface BusinessOwnerDashboardProps {
  store: StoreData;
  onNavigate: (tab: any, lowStock?: boolean) => void;
}

const quickActions: Record<string, { label: string; tab: string; icon: string }[]> = {
  laundry: [
    { label: 'New Laundry Order', tab: 'orders', icon: '🧺' },
    { label: 'Services', tab: 'inventory', icon: '👕' },
    { label: 'Customers', tab: 'customers', icon: '👥' },
    { label: 'Sales', tab: 'sales', icon: '💰' },
  ],
  gas_filling: [
    { label: 'New Gas Sale', tab: 'sales', icon: '⛽' },
    { label: 'Gas Stock', tab: 'inventory', icon: '🛢️' },
    { label: 'Orders', tab: 'orders', icon: '📋' },
    { label: 'Customers', tab: 'customers', icon: '👥' },
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

export default function BusinessOwnerDashboard({ store, onNavigate }: BusinessOwnerDashboardProps) {
  const template = getBusinessTemplate(store.storeType);
  const actions = quickActions[store.storeType] || [
    { label: template.labels.primaryAction, tab: 'orders', icon: '✨' },
    { label: 'Products / Services', tab: 'inventory', icon: '📦' },
    { label: 'Sales', tab: 'sales', icon: '💰' },
    { label: 'Customers', tab: 'customers', icon: '👥' },
  ];

  const today = new Date().toISOString().slice(0, 10);
  const todaySales = (store.sales || []).filter(s => s.date?.slice(0, 10) === today);
  const revenue = todaySales.reduce((sum, s) => sum + Number(s.total || 0), 0);
  const activeOrders = store.storeType === 'laundry'
    ? 0
    : 0;

  const stats = store.storeType === 'laundry'
    ? [
        { label: 'Today Revenue', value: `₦${revenue.toLocaleString()}`, icon: '💰' },
        { label: 'Laundry Orders', value: '—', icon: '🧺' },
        { label: 'Ready for Pickup', value: '—', icon: '✅' },
      ]
    : store.storeType === 'gas_filling'
      ? [
          { label: 'Today Revenue', value: `₦${revenue.toLocaleString()}`, icon: '💰' },
          { label: 'Gas Sold', value: '—', icon: '⛽' },
          { label: 'Deliveries', value: '—', icon: '🚚' },
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
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Your business</p>
            <h1 className="font-display font-bold text-xl truncate">{store.storeName}</h1>
            <p className="text-xs text-primary font-semibold mt-0.5">{template.name}</p>
          </div>
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

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display font-bold">Quick actions</h2>
          <span className="text-[10px] text-muted-foreground">Made for your business</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {actions.map(action => (
            <button key={action.label} onClick={() => onNavigate(action.tab)} className="rounded-2xl border border-border bg-card p-4 text-left hover:border-primary/50 active:scale-[0.99] transition-all">
              <div className="text-2xl">{action.icon}</div>
              <div className="font-display font-bold text-sm mt-2">{action.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display font-bold">What you need to do today</h2>
        <p className="text-sm text-muted-foreground mt-1">Manchant has prepared this workspace for your {template.name.toLowerCase()} business. You can start working immediately — no technical setup required.</p>
      </section>
    </div>
  );
}
