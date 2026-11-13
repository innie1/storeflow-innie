import { useState, type ReactNode } from 'react';
import { BarChart3, ClipboardList, DollarSign, Fuel, Gamepad2, Package, Plus, Receipt, Shirt, Sparkles, Tag, TrendingUp, Users, Wallet, type LucideIcon } from 'lucide-react';
import FlowStrategyCard from '@/components/FlowStrategyCard';
import CelebrationRibbon from '@/components/CelebrationRibbon';
import { StoreData } from '@/types/store';
import { getBusinessTemplate } from '@/lib/business-templates';
import { getLaundryActionView, requestLaundryWorkspace } from '@/lib/laundry-workspace';
import BusinessAnalytics from '@/components/analytics/BusinessAnalytics';
import BusinessPulse from '@/components/BusinessPulse';
import FeatureErrorBoundary from '@/components/FeatureErrorBoundary';
import LaundryDayBoard, { LaundryMoneyLines, useLaundryDayBoard } from '@/components/laundry/LaundryDayBoard';
import RevenueCard from '@/components/RevenueCard';
import BreakEvenPip from '@/components/BreakEvenPip';
import { BREAK_EVEN_SPOTLIGHT } from '@/components/BreakEvenCard';
import { requestSpotlight } from '@/lib/spotlight';
import { canOpenTab, canSeeMoney } from '@/lib/permissions';
import { isBusinessTabAllowed } from '@/lib/business-runtime';
import { requestExpenseForm } from '@/lib/expense-shortcut';
import { bundleCount } from '@/lib/money-figures';

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
  /*
   * Price List and Laundry Records were shortcuts here as well as tabs in
   * the bottom bar (Price List, Intake), so the screen offered two doors to
   * each. The bar keeps them; Home keeps what the bar does not have.
   */
  laundry: [
    { label: 'Record Laundry', tab: 'laundry-records', icon: icon(Shirt) },
    { label: 'Customers', tab: 'customers', icon: icon(Users) },
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
  const template = getBusinessTemplate(store.storeType);
  const tradeActions = quickActions[store.storeType] || [
    { label: template.labels.primaryAction, tab: 'orders', icon: icon(Sparkles) },
    { label: 'Products / Services', tab: 'inventory', icon: icon(Tag) },
    { label: 'Sales', tab: 'sales', icon: icon(DollarSign) },
    { label: 'Customers', tab: 'customers', icon: icon(Users) },
  ];
  // The expense book, for whoever may open it - it used to be reachable only
  // from More, so Home read as if the app kept no record of spending.
  const actions = canOpenTab('expenses', currentUser) && isBusinessTabAllowed(store, 'expenses')
    ? [...tradeActions, { label: 'Record Expense', tab: 'expenses', icon: icon(Wallet) }]
    : tradeActions;
  const board = useLaundryDayBoard(store, orders || [], isLaundry);
  const seesMoney = canSeeMoney(currentUser);

  const handleQuickAction = (action: { label: string; tab: string }) => {
    if (action.tab === 'expenses') requestExpenseForm();
    if (store.storeType === 'laundry') {
      const laundryView = getLaundryActionView(action.label);
      if (laundryView) requestLaundryWorkspace(laundryView);
    }
    onNavigate(action.tab);
  };

  /*
   * Business insights used to be a box of its own on Home, with a "View"
   * that opened it in place and an "Analysis" beside it that opened the
   * same kind of figures on another page - two buttons for one errand. They
   * are one door now: Analysis, with the insights at its top.
   */
  if (showAnalysis) {
    return (
      <BusinessAnalytics
        store={store}
        onBack={() => setShowAnalysis(false)}
        insights={<FeatureErrorBoundary name="Business insights"><BusinessPulse store={store} orders={orders} onNavigate={onNavigate} /></FeatureErrorBoundary>}
      />
    );
  }

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
        // Bundles, not payments: a deposit and a balance are one job, and an
        // unpaid bundle is still a job.
        { label: 'Recorded', value: String(bundleCount(store)), icon: '🧾' },
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
  // A laundry's big button says what it does, in the Intake screen's own words.
  const primaryLabel = isLaundry && primaryAction?.label === 'Record Laundry' ? 'New bundle' : primaryAction?.label;
  const shortcuts = [
    ...actions.slice(1).map(action => ({
      key: action.label,
      label: action.label === 'Record Expense' ? 'Add expense' : action.label,
      icon: action.icon,
      run: () => handleQuickAction(action),
    })),
    { key: 'analysis', label: 'Analysis', icon: icon(BarChart3), run: () => setShowAnalysis(true) },
  ];

  return (
    <div className="space-y-3 animate-fade-in pb-4">
      <CelebrationRibbon store={store} />
      {/*
        The day's work, before anything else: what is late, what is promised
        today, what is ready, and what is owed - the four a paper book cannot
        answer. One card, one row.
      */}
      {isLaundry && <LaundryDayBoard board={board} onNavigate={onNavigate as (tab: any) => void} canSeeMoney={seesMoney} />}

      {/* The evening "How today went" card lived here. The day is recorded
          by date on its own now, and read back in Analysis. */}

      {/*
        One button, saying what it does. It carried "START HERE" in small
        capitals above the words every day, long after the owner had started.
      */}
      {primaryAction && (
        <button
          onClick={() => handleQuickAction(primaryAction)}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground shadow-sm flex items-center justify-center gap-2 font-display font-bold text-base active:scale-[0.99] transition-transform"
        >
          {isLaundry ? <Plus className="w-5 h-5" strokeWidth={2.5} /> : <span className="[&>svg]:w-5 [&>svg]:h-5">{primaryAction.icon}</span>}
          {primaryLabel}
        </button>
      )}

      {/*
        The money, in one card: takings over the chosen stretch with the
        month's costs ring beside them, then who owes and what is ready.
      */}
      {seesMoney && (
        <RevenueCard
          store={store}
          trailing={<BreakEvenPip
              store={store}
              canSeeMoney
              onOpen={() => { requestSpotlight(BREAK_EVEN_SPOTLIGHT); onNavigate('manager'); }}
            />}
        >
          {isLaundry && <LaundryMoneyLines board={board} onNavigate={onNavigate as (tab: any) => void} />}
        </RevenueCard>
      )}

      {/*
        A laundry's strip read "0 Services · 9 Customers · 63 Recorded" in
        nine-pixel type: three numbers that never change the day. It is gone
        for a laundry; other trades keep the figures of their day in it.
      */}
      {!isLaundry && (
        <section className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-card">
          {stats.map(stat => (
            <div key={stat.label} className="min-w-0 border-r border-border p-3 last:border-r-0">
              <div className="font-display font-bold text-base truncate">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5 truncate">{stat.label}</div>
            </div>
          ))}
        </section>
      )}

      <section className={`grid ${shortcuts.length >= 4 ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
        {shortcuts.map(shortcut => (
          <button
            key={shortcut.key}
            onClick={shortcut.run}
            className="min-h-[76px] rounded-2xl border border-border bg-card px-2 py-3 flex flex-col items-center justify-center gap-2 text-center hover:border-primary/50 active:scale-[0.99] transition-all"
          >
            <span className="text-muted-foreground">{shortcut.icon}</span>
            <span className="font-display font-bold text-[13px] leading-tight">{shortcut.label}</span>
          </button>
        ))}
      </section>

      {/* Flow's suggestion follows the day's own figures rather than standing
          in front of them. */}
      <FlowStrategyCard store={store} onNavigate={onNavigate} />
    </div>
  );
}
