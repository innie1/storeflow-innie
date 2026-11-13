import { useEffect, useMemo } from 'react';
import type { StoreData } from '@/types/store';
import { getCustomerActivitySignals, getEarningsPulse, getPromisedTime } from '@/lib/business-insights';
import { BellRing, TrendingDown, TrendingUp, Users } from 'lucide-react';

interface Props {
  store: StoreData;
  orders?: any[];
  onNavigate: (tab: any) => void;
}

export default function BusinessPulse({ store, orders = [], onNavigate }: Props) {
  const earnings = useMemo(() => getEarningsPulse(store), [store]);
  const signals = useMemo(() => getCustomerActivitySignals(store), [store]);
  const safeOrders = useMemo(() => Array.isArray(orders) ? orders : [], [orders]);
  const urgentOrders = useMemo(() => safeOrders.filter(order => {
    if (['completed', 'cancelled', 'rejected'].includes(String(order.status || '').toLowerCase())) return false;
    const promised = getPromisedTime(order);
    return promised && new Date(promised).getTime() <= Date.now() + 2 * 60 * 60 * 1000;
  }), [safeOrders]);

  useEffect(() => {
    if (!urgentOrders.length || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const dayKey = new Date().toISOString().slice(0, 13);
      const storageKey = `storeflow_due_notice_${store.accessCode}_${dayKey}`;
      if (localStorage.getItem(storageKey)) return;
      new Notification(`${urgentOrders.length} order${urgentOrders.length === 1 ? '' : 's'} due soon`, {
        body: `Open ${store.storeName} to review promised pickup or delivery times.`,
        tag: `storeflow-due-${store.accessCode}`,
      });
      localStorage.setItem(storageKey, '1');
    } catch {
      // Some mobile privacy modes block notification or storage access.
    }
  }, [store.accessCode, store.storeName, urgentOrders]);

  const direction = earnings.dailyChange === null ? 'neutral' : earnings.dailyChange >= 0 ? 'up' : 'down';
  const attention = signals.filter(signal => signal.kind === 'slowing' || signal.kind === 'inactive').length;

  return (
    <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
          {direction === 'down' ? <TrendingDown className="h-4 w-4 text-destructive" /> : <TrendingUp className="h-4 w-4 text-success" />} Earnings pulse
        </div>
        <p className="mt-2 font-display text-xl font-black">₦{earnings.today.toLocaleString()} today</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {earnings.dailyChange === null
            ? earnings.action
            : `${Math.abs(Math.round(earnings.dailyChange))}% ${earnings.dailyChange >= 0 ? 'above' : 'below'} a normal day by now. ${earnings.action}`}
        </p>
      </div>

      <button onClick={() => onNavigate('customers')} className="rounded-2xl border border-border bg-card p-4 text-left">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><Users className="h-4 w-4 text-primary" /> Customer activity</div>
        <p className="mt-2 font-display text-xl font-black">{attention} need attention</p>
        <p className="mt-1 text-xs text-muted-foreground">Regulars who have gone quiet. Tap to message them.</p>
      </button>

      <button onClick={() => onNavigate(urgentOrders.some(order => order.business_type === 'laundry') ? 'laundry-records' : 'orders')} className="rounded-2xl border border-border bg-card p-4 text-left">
        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground"><BellRing className="h-4 w-4 text-amber-500" /> Promised-time reminders</div>
        <p className="mt-2 font-display text-xl font-black">{urgentOrders.length} due / due soon</p>
        <p className="mt-1 text-xs text-muted-foreground">Late, or due in the next 2 hours.</p>
      </button>
    </section>
  );
}
