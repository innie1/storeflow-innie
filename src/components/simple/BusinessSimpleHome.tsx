import { StoreData, TabId } from '@/types/store';
import { canOpenTab, canSeeMoney } from '@/lib/permissions';
import BreakEvenPip from '@/components/laundry/BreakEvenPip';
import BreakEvenWatcher from '@/components/laundry/BreakEvenWatcher';
import { isServiceShop } from '@/lib/flow-service-brain';
import FlowStrategyCard from '@/components/FlowStrategyCard';
import CelebrationRibbon from '@/components/CelebrationRibbon';
import { getBusinessTemplate, isBusinessTabAllowed } from '@/lib/business-runtime';
import { getLaundryActionView, requestLaundryWorkspace } from '@/lib/laundry-workspace';
import { CalendarClock, ClipboardList, DollarSign, Gamepad2, Package, Receipt, Settings2, Shirt, Sparkles, Tag, Users, Briefcase } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  store: StoreData;
  onNavigate: (tab: TabId) => void;
  /** Only an owner can add staff, so only an owner is offered the shortcut. */
  currentUser?: { role?: string } | null;
}

export default function BusinessSimpleHome({ store, onNavigate, currentUser }: Props) {
  const template = getBusinessTemplate(store);
  const today = new Date().toISOString().split('T')[0];
  const todayRevenue = (store.sales || []).filter(s => s.date.startsWith(today)).reduce((sum, s) => sum + s.total, 0);
  const customers = store.customers?.length || 0;
  const isAppointment = template.modes.includes('appointments');
  const isSession = template.modes.includes('sessions');
  const isLaundry = template.type === 'laundry';
  const primary = isLaundry ? 'Record Laundry' : template.labels.primaryAction;
  const noun = template.labels.offeringNoun;

  const candidateActions: { label: string; icon: ReactNode; tab: TabId }[] = [
    { label: primary, icon: isLaundry ? <Shirt className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />, tab: isLaundry ? ('laundry-records' as TabId) : isSession ? 'games-dashboard' : 'orders' },
    { label: noun + (noun.endsWith('s') ? '' : 's'), icon: <Tag className="w-6 h-6" />, tab: 'inventory' },
    { label: isAppointment ? 'Appointments' : isSession ? 'Sessions' : 'Customers', icon: isAppointment ? <CalendarClock className="w-6 h-6" /> : isSession ? <Gamepad2 className="w-6 h-6" /> : <Users className="w-6 h-6" />, tab: isAppointment ? 'orders' : isSession ? 'games-dashboard' : 'customers' },
    ...(isLaundry ? [{ label: 'Laundry Records', icon: <Receipt className="w-6 h-6" />, tab: 'laundry-records' as TabId }] : [{ label: 'Sales', icon: <DollarSign className="w-6 h-6" />, tab: 'sales' as TabId }]),
    // Adding a worker is a first-week job in every one of these trades, and
    // the only route to it was Staff Accounts, sixth in a flat list of
    // sixteen under More. Owners only: nobody else can add staff anyway.
    ...(currentUser?.role === 'owner'
      ? [{ label: 'Staff', icon: <Briefcase className="w-6 h-6" />, tab: 'staff' as TabId }]
      : []),
  ];
  /**
   * Both gates, not just one.
   *
   * This screen filtered on the business template alone, so a role that cannot
   * open a tab was still offered a tile for it: an attendant kept a "Services"
   * tile for the price list, tapped it, and watched it appear and vanish as
   * the tab guard put them back.
   */
  const actions = candidateActions.filter(action => (
    isBusinessTabAllowed(store, action.tab) && canOpenTab(action.tab, currentUser)
  ));

  const navigate = (action: { label: string; tab: TabId }) => {
    if (isLaundry) {
      const view = getLaundryActionView(action.label);
      if (view) requestLaundryWorkspace(view);
    }
    onNavigate(action.tab);
  };

  return (
    <div className="animate-fade-in max-w-lg mx-auto space-y-4">
      <CelebrationRibbon store={store} />
      <FlowStrategyCard store={store} onNavigate={onNavigate} />
      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-bold">{template.icon} {template.name}</p>
            <h1 className="font-display font-black text-2xl mt-1">{store.storeName}</h1>
            <p className="text-sm text-muted-foreground mt-1">{template.customerExperience.intro}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* How far through the month, in the corner. The full figure had a
                card of its own here and it was too much for something checked
                now and then rather than every visit; it lives on Flow now. */}
            {isServiceShop(store) && (
              <BreakEvenPip store={store} canSeeMoney={canSeeMoney(currentUser)} onOpen={() => onNavigate('manager')} />
            )}
            <button onClick={() => onNavigate('settings')} className="w-9 h-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center" title="Settings">
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Takings belong to whoever runs the shop. An attendant was
            shown the day's revenue on their own phone. */}
        {canSeeMoney(currentUser) && (
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="w-4 h-4" /> Today's Revenue</div>
          <p className="font-display font-black text-2xl text-primary mt-2">₦{todayRevenue.toLocaleString()}</p>
        </div>
        )}
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="w-4 h-4" /> Customers</div>
          <p className="font-display font-black text-2xl mt-2">{customers}</p>
        </div>
      </div>

      {/* The moment the month covers itself is still worth catching here,
          even though the figures behind it have moved to Flow. */}
      {isServiceShop(store) && (
        <BreakEvenWatcher store={store} canSeeMoney={canSeeMoney(currentUser)} />
      )}

      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="font-display font-bold">Quick actions</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {actions.map(action => (
            <button key={`${action.tab}-${action.label}`} onClick={() => navigate(action)} className="min-h-24 rounded-2xl bg-surface-2/50 border border-border p-3 text-left hover:border-primary/30 active:scale-[.99] transition-all">
              <span className="text-primary">{action.icon}</span>
              <p className="font-display font-bold text-sm mt-2">{action.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {isBusinessTabAllowed(store, 'orders') && canOpenTab('orders', currentUser) && <button onClick={() => onNavigate('orders')} className="rounded-xl bg-primary text-primary-foreground p-3 text-sm font-display font-bold flex items-center justify-center gap-2"><ClipboardList className="w-4 h-4" /> {template.labels.orderNoun}s</button>}
        {isBusinessTabAllowed(store, 'inventory') && canOpenTab('inventory', currentUser) && <button onClick={() => onNavigate('inventory')} className="rounded-xl bg-card border border-border p-3 text-sm font-display font-bold flex items-center justify-center gap-2"><Package className="w-4 h-4" /> {template.modes.includes('services') && !template.modules.includes('inventory') ? 'Services' : 'Inventory'}</button>}
      </div>
      {isAppointment && <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Appointments can be managed from Orders.</div>}
    </div>
  );
}
