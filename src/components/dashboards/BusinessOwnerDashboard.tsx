import { useState, type ReactNode } from 'react';
import { ClipboardList, DollarSign, Fuel, Gamepad2, Package, Receipt, Shirt, Sparkles, Tag, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import FlowStrategyCard from '@/components/FlowStrategyCard';
import CelebrationRibbon from '@/components/CelebrationRibbon';
import { StoreData } from '@/types/store';
import { getBusinessTemplate } from '@/lib/business-templates';
import { getLaundryActionView, requestLaundryWorkspace } from '@/lib/laundry-workspace';
import BusinessAnalytics from '@/components/analytics/BusinessAnalytics';
import BusinessPulse from '@/components/BusinessPulse';
import FeatureErrorBoundary from '@/components/FeatureErrorBoundary';
import LaundryDayBoard from '@/components/laundry/LaundryDayBoard';
import DayClose from '@/components/laundry/DayClose';
import RevenueCard from '@/components/RevenueCard';
import { canSeeMoney } from '@/lib/permissions';

interface BusinessOwnerDashboardProps {
  store: StoreData;
  orders?: any[];
  onNavigate: (tab: any, lowStock?: boolean) => void;
  /** Takings and money owed are the owner's business, not the counter's. */
  currentUser?: { role?: string } | null;
}

/*
 * The same icons the simple-mode home uses.
 *
 * These were emoji here and lucide components there, so Customers was a pair
 * of silhouettes on one screen and a grey outline on the other, Record Laundry
 * was a basket in one place and a shirt in the other, and the price list was a
 * t-shirt against a tag. Two vocabularies for one app, and whichever screen a
 * shop learned first made the other look like somebody else's software.
 */
const icon = (Glyph: LucideIcon) => <Glyph className="w-5 h-5" />;

const quickActions: Record<string, { label: string; tab: string; icon: ReactNode }[]> = {
  laundry: [
    { label: 'Record Laundry', tab: 'laundry-records', icon: icon(Shirt) },
    { label: 'Price List', tab: 'inventory', icon: icon(Tag) },
    { label: 'Customers', tab: 'customers', icon: icon(Users) },
    { label: 'Laundry Records', tab: 'laundry-records', icon: icon(Receipt) },
  ],
  gas_filling: [
    { label: 'New Gas Sale', tab: 'sales', icon: icon(Fuel) },
    { label: 'Gas Stock', tab: 'inventory', icon: icon(Package) },
    { label: 'Orders', tab: 'orders', icon: icon(ClipboardList) },
    { label: 'Customers', tab: 'customers', icon: icon(Users) },
  ],
  games: [
    { label: 'Start Session', tab: 'games-dashboard', icon: icon(Gamepad2) },
    { label: 'Games & Prices', tab: 'games-settings', icon: icon(Tag) },
    { label: 'Session History', tab: 'games-history', icon: icon(Receipt) },
    { label: 'Analytics', tab: 'games-analytics', icon: icon(TrendingUp) },
  ],
  restaurant: [
    { label: 'New Order', tab: 'orders', icon: icon(Sparkles) },
    { label: 'Menu / Products', tab: 'inventory', icon: icon(Tag) },
    { label: 'Sales', tab: 'sales', icon: icon(DollarSign) },
    { label: 'Customers', tab: 'customers', icon: icon(Users) },
  ],
  food: [
    { label: 'New Order', tab: 'orders', icon: icon(Sparkles) },
    { label: 'Products', tab: 'inventory', icon: icon(Package) },
    { label: 'Sales', tab: 'sales', icon: icon(DollarSign) },
    { label: 'Customers', tab: 'customers', icon: icon(Users) },
  ],
  provision: [
    { label: 'Sell', tab: 'sales', icon: icon(DollarSign) },
    { label: 'Inventory', tab: 'inventory', icon: icon(Package) },
    { label: 'Orders', tab: 'orders', icon: icon(ClipboardList) },
    { label: 'Customers', tab: 'customers', icon: icon(Users) },
  ],
};

export default function BusinessOwnerDashboard({ store, orders = [], onNavigate, currentUser }: BusinessOwnerDashboardProps) {
  const isLaundry = String(store.businessType || store.storeType || '').toLowerCase() === 'laundry';
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const template = getBusinessTemplate(store.storeType);
  const actions = quickActions[store.storeType] || [
    { label: template.labels.primaryAction, tab: 'orders', icon: icon(Sparkles) },
    { label: 'Products / Services', tab: 'inventory', icon: icon(Tag) },
    { label: 'Sales', tab: 'sales', icon: icon(DollarSign) },
    { label: 'Customers', tab: 'customers', icon: icon(Users) },
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
  /**
   * How many services this shop actually offers.
   *
   * This used to be Math.max(what the merchant has, what the template ships
   * with), so a laundry that had entered nothing still read "5" - the five
   * built-in offerings (Wash & Iron, Wash Only, Ironing, Dry Cleaning, Express
   * Laundry). It looked like their data and was not, which is exactly the
   * complaint: it appeared out of nowhere.
   */
  const serviceCount = (store.products || []).filter(p => p.isService).length;
  // Each trade's own word for what it sells, rather than a spa's.
  const serviceNoun = template.labels.offeringNoun.endsWith('s')
    ? template.labels.offeringNoun
    : `${template.labels.offeringNoun}s`;
  const gameCount = (store.games || []).filter(g => g.enabled).length || (store.games || []).length;
  const todaySessions = (store.gameSessions || []).filter(s => s.date?.slice(0, 10) === today).length;
  const todaySessionRevenue = (store.gameSessions || [])
    .filter(s => s.date?.slice(0, 10) === today)
    .reduce((sum, s) => sum + Number(s.amount || 0), 0);

  const stats = isLaundry
    ? [
        // No takings here. They have their own card above with a window
        // control, and repeating one day of them beside a service count made
        // the strip look like a summary when it was three unrelated numbers.
        { label: serviceNoun, value: String(serviceCount), icon: '🧺' },
        { label: 'Customers', value: String((store.customers || []).length), icon: '👥' },
        { label: 'Recorded', value: String((store.sales || []).length), icon: '🧾' },
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
    // pb-20: the Flow button floats over the bottom-right corner, and
    // without room to scroll past it the last card's own controls sit
    // underneath it - the Analysis button was half-covered.
    <div className="space-y-3 animate-fade-in pb-20">
      <CelebrationRibbon store={store} />
      <FlowStrategyCard store={store} onNavigate={onNavigate} />
      {/*
        The shop's own name is not news to the shop.
        
        A whole card carrying the name, the trade and one button sat directly
        under an app header already showing the name and the trade. It was the
        second-largest thing on a screen that had just gained the day's work,
        and it told nobody anything. Analysis moved down to Business insights,
        which is the same errand - going to look at the numbers - and already
        had a row of its own.
      */}
      {/*
        The day's work, before anything else.
        
        This screen opened with a strip of three figures - today's takings, how
        many services the shop offers, how many customers it has ever had - and
        none of them tell an owner what to do. Takings read zero at eight in
        the morning however good the month is, the service count changes about
        twice a year, and the customer count only goes up.
        
        What is late, what is promised today, what is finished and waiting, and
        who owes money: those are the four a paper book physically cannot
        answer, and they are the reason to open this app instead of the book.
      */}
      {isLaundry && (
        <LaundryDayBoard
          store={store}
          orders={orders || []}
          onNavigate={onNavigate as (tab: any) => void}
          canSeeMoney={canSeeMoney(currentUser)}
        />
      )}

      {/* And how it went, once the evening comes round. */}
      {isLaundry && (
        <DayClose
          store={store}
          orders={orders || []}
          onNavigate={onNavigate as (tab: any) => void}
          canSeeMoney={canSeeMoney(currentUser)}
        />
      )}

      {primaryAction && (
        <button onClick={() => handleQuickAction(primaryAction)} className="w-full rounded-2xl bg-primary px-4 py-4 text-left text-primary-foreground shadow-sm active:scale-[0.99] transition-transform">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-black/10 [&>svg]:w-6 [&>svg]:h-6">{primaryAction.icon}</span>
            <span className="flex-1"><span className="block text-[10px] font-black uppercase tracking-wider opacity-70">Start here</span><span className="font-display text-lg font-black">{primaryAction.label}</span></span>
            <span className="text-xl" aria-hidden="true">→</span>
          </div>
        </button>
      )}

      {/* Revenue, over whichever stretch is being asked about rather than
          today alone - and only for whoever is allowed to see money. */}
      {canSeeMoney(currentUser) && <RevenueCard store={store} />}

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
              <div className="text-muted-foreground">{action.icon}</div>
              <div className="font-display font-bold text-[11px] mt-1.5 leading-tight">{action.label}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 p-4">
          <button type="button" onClick={() => setShowInsights(value => !value)} className="flex flex-1 items-center justify-between gap-3 text-left min-w-0">
            <span className="min-w-0"><span className="block font-display text-sm font-black">Business insights</span><span className="mt-0.5 block text-[10px] text-muted-foreground truncate">Earnings, customers and promised times</span></span>
            <span className="text-sm text-muted-foreground shrink-0">{showInsights ? 'Hide' : 'View'}</span>
          </button>
          <button type="button" onClick={() => setShowAnalysis(true)} className="shrink-0 rounded-xl border border-border px-3 py-2 text-[11px] font-display font-bold">
            Analysis
          </button>
        </div>
        {showInsights && <div className="border-t border-border p-3"><FeatureErrorBoundary name="Business insights"><BusinessPulse store={store} orders={orders} onNavigate={onNavigate} /></FeatureErrorBoundary></div>}
      </section>

    </div>
  );
}
