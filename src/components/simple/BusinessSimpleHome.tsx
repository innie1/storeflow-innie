import { StoreData, TabId } from '@/types/store';
import { getBusinessTemplate, isBusinessTabAllowed } from '@/lib/business-runtime';
import { CalendarClock, ClipboardList, DollarSign, Package, Settings2, Sparkles, Users } from 'lucide-react';

interface Props {
  store: StoreData;
  onNavigate: (tab: TabId) => void;
}

export default function BusinessSimpleHome({ store, onNavigate }: Props) {
  const template = getBusinessTemplate(store);
  const today = new Date().toISOString().split('T')[0];
  const todayRevenue = (store.sales || []).filter(s => s.date.startsWith(today)).reduce((sum, s) => sum + s.total, 0);
  const customers = store.customers?.length || 0;
  const isAppointment = template.modes.includes('appointments');
  const isSession = template.modes.includes('sessions');
  const primary = template.labels.primaryAction;
  const noun = template.labels.offeringNoun;

  const candidateActions: { label: string; icon: string; tab: TabId }[] = [
    { label: primary, icon: '✨', tab: isSession ? 'games-dashboard' : 'orders' },
    { label: noun + (noun.endsWith('s') ? '' : 's'), icon: template.icon, tab: 'inventory' },
    { label: isAppointment ? 'Appointments' : isSession ? 'Sessions' : 'Customers', icon: isAppointment ? '📅' : isSession ? '🎮' : '👥', tab: isAppointment ? 'orders' : isSession ? 'games-dashboard' : 'customers' },
    { label: 'Sales', icon: '💰', tab: 'sales' },
  ];
  const actions = candidateActions.filter(action => isBusinessTabAllowed(store, action.tab));

  return (
    <div className="animate-fade-in max-w-lg mx-auto space-y-4">
      <div className="rounded-2xl bg-card border border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-bold">{template.icon} {template.name}</p>
            <h1 className="font-display font-black text-2xl mt-1">{store.storeName}</h1>
            <p className="text-sm text-muted-foreground mt-1">{template.customerExperience.intro}</p>
          </div>
          <button onClick={() => onNavigate('settings')} className="w-9 h-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center" title="Settings">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><DollarSign className="w-4 h-4" /> Today's Revenue</div>
          <p className="font-display font-black text-2xl text-primary mt-2">₦{todayRevenue.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Users className="w-4 h-4" /> Customers</div>
          <p className="font-display font-black text-2xl mt-2">{customers}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="font-display font-bold">Quick actions</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {actions.map(action => (
            <button key={`${action.tab}-${action.label}`} onClick={() => onNavigate(action.tab)} className="min-h-24 rounded-2xl bg-surface-2/50 border border-border p-3 text-left hover:border-primary/30 active:scale-[.99] transition-all">
              <span className="text-2xl">{action.icon}</span>
              <p className="font-display font-bold text-sm mt-2">{action.label}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {isBusinessTabAllowed(store, 'orders') && <button onClick={() => onNavigate('orders')} className="rounded-xl bg-primary text-primary-foreground p-3 text-sm font-display font-bold flex items-center justify-center gap-2"><ClipboardList className="w-4 h-4" /> {template.labels.orderNoun}s</button>}
        {isBusinessTabAllowed(store, 'inventory') && <button onClick={() => onNavigate('inventory')} className="rounded-xl bg-card border border-border p-3 text-sm font-display font-bold flex items-center justify-center gap-2"><Package className="w-4 h-4" /> {template.modes.includes('services') && !template.modules.includes('inventory') ? 'Services' : 'Inventory'}</button>}
      </div>
      {isAppointment && <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Appointments can be managed from Orders.</div>}
    </div>
  );
}
