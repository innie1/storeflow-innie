import { StoreData, TabId } from '@/types/store';
import { canOpenTab, canSeeMoney } from '@/lib/permissions';
import BreakEvenPip from '@/components/BreakEvenPip';
import BreakEvenWatcher from '@/components/BreakEvenWatcher';
import LaundryDayBoard from '@/components/laundry/LaundryDayBoard';
import RevenueCard from '@/components/RevenueCard';
import { isServiceShop } from '@/lib/flow-service-brain';
import FlowStrategyCard from '@/components/FlowStrategyCard';
import CelebrationRibbon from '@/components/CelebrationRibbon';
import { getBusinessTemplate, isBusinessTabAllowed } from '@/lib/business-runtime';
import { getLaundryActionView, requestLaundryWorkspace } from '@/lib/laundry-workspace';
import { CalendarClock, DollarSign, Gamepad2, Receipt, Shirt, Sparkles, Tag, Users, Briefcase } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  store: StoreData;
  onNavigate: (tab: TabId) => void;
  /** Only an owner can add staff, so only an owner is offered the shortcut. */
  currentUser?: { role?: string } | null;
  /** Cloud orders, so the day board counts bundles taken on another phone. */
  orders?: any[];
}

export default function BusinessSimpleHome({ store, onNavigate, currentUser, orders }: Props) {
  const template = getBusinessTemplate(store);
  const customers = store.customers?.length || 0;
  const isAppointment = template.modes.includes('appointments');
  const isSession = template.modes.includes('sessions');
  const isLaundry = template.type === 'laundry';
  const primary = isLaundry ? 'Record Laundry' : template.labels.primaryAction;
  const noun = template.labels.offeringNoun;

  const candidateActions: { label: string; icon: ReactNode; tab: TabId }[] = [
    { label: primary, icon: isLaundry ? <Shirt className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />, tab: isLaundry ? ('laundry-records' as TabId) : isSession ? 'games-dashboard' : 'orders' },
    { label: noun + (noun.endsWith('s') ? '' : 's'), icon: <Tag className="w-6 h-6" />, tab: 'inventory' },
    /*
     * Appointments and Sessions only.
     *
     * Customers used to be the third option here, and it was the second
     * Customers on the screen - there is already a card above showing the
     * count and going to the same place. Two doors to one room, one of them
     * carrying less information than the other.
     */
    ...(isAppointment
      ? [{ label: 'Appointments', icon: <CalendarClock className="w-6 h-6" />, tab: 'orders' as TabId }]
      : isSession
        ? [{ label: 'Sessions', icon: <Gamepad2 className="w-6 h-6" />, tab: 'games-dashboard' as TabId }]
        : []),
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
    <div className="animate-fade-in max-w-lg mx-auto space-y-4 pb-20">
      <CelebrationRibbon store={store} />
      <FlowStrategyCard store={store} onNavigate={onNavigate} />
      {/*
        The shop's own name, trade and a sentence introducing it to itself used
        to open this screen, under an app header already carrying the name and
        the trade. It was the tallest thing here and told nobody anything, so
        it is gone. Settings was in it and is still two taps away in More,
        where the rest of the app's settings already live. The break-even ring
        moved down to sit with Revenue, which is the only other money on this
        screen.
      */}
      {/*
        The work first.
        
        What used to open this screen was today's takings beside a lifetime
        customer count. Neither answers what somebody actually arrives with,
        which is "what do I have to do today" - and at eight in the morning
        takings read zero however good the month is, which is a poor reason to
        open an app twice.
      */}
      {isLaundry && (
        <LaundryDayBoard
          store={store}
          orders={orders || []}
          onNavigate={onNavigate}
          canSeeMoney={canSeeMoney(currentUser)}
        />
      )}

      {/* The month's progress, beside the month's takings. */}
      {isServiceShop(store) && canSeeMoney(currentUser) && (
        <div className="flex justify-end">
          <BreakEvenPip store={store} canSeeMoney onOpen={() => onNavigate('manager')} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Takings belong to whoever runs the shop. An attendant was
            shown the day's revenue on their own phone. */}
        {canSeeMoney(currentUser) && <RevenueCard store={store} />}
        <button onClick={() => onNavigate('customers')} className="rounded-2xl bg-card border border-border p-4 text-left">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="w-4 h-4" /> Customers</div>
          <p className="font-display font-black text-2xl mt-2">{customers}</p>
        </button>
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

      {/*
        A pair of buttons for Orders and Services used to sit here, directly
        under a grid that already offered Services, and above a bottom
        navigation that already offers Orders. Three routes to two screens on
        one page, which is not choice - it is the screen not knowing what it
        is for.
      */}
      {isAppointment && <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Appointments can be managed from Orders.</div>}
    </div>
  );
}
