import { useMemo } from 'react';
import { ClipboardList, Clock, PackageCheck, Users } from 'lucide-react';
import type { StoreData, TabId } from '@/types/store';
import { getBusinessTemplate } from '@/lib/business-runtime';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';
import { requestLaundryWorkspace } from '@/lib/laundry-workspace';

/**
 * What someone on the shop floor needs to see.
 *
 * An attendant used to be handed the owner's dashboard — Dashboard's switch
 * had no branch for the role, so it fell through to `default`. That meant
 * store health, lifetime revenue and "Log Expense" for a laundry worker: not
 * their job, and not their business.
 *
 * This is the work instead: what is waiting, what is late, what is ready to go
 * back. No takings anywhere on it.
 */

interface Props {
  store: StoreData;
  onNavigate: (tab: TabId) => void;
  userName?: string;
}

export default function AttendantDashboard({ store, onNavigate, userName }: Props) {
  const template = getBusinessTemplate(store);
  const isLaundry = String(store.storeType || '').toLowerCase() === 'laundry';

  const counts = useMemo(() => {
    const accessCode = String(store.accessCode || '');
    const records = accessCode ? getLocalLaundryRecords(accessCode) : [];
    const now = Date.now();
    const open = records.filter(record => record.workflowStage !== 'collected');
    const late = open.filter(record => {
      const due = new Date(record.promisedFor || '').getTime();
      return Number.isFinite(due) && due < now;
    });
    const ready = open.filter(record => record.workflowStage === 'ready');
    return { open: open.length, late: late.length, ready: ready.length, today: records.length };
  }, [store]);

  const openIntake = () => {
    if (isLaundry) requestLaundryWorkspace('record');
    onNavigate((isLaundry ? 'laundry-records' : 'orders') as TabId);
  };

  const tiles = [
    { label: 'Waiting', value: counts.open, icon: <ClipboardList className="w-5 h-5" />, tone: 'text-foreground' },
    { label: 'Past due', value: counts.late, icon: <Clock className="w-5 h-5" />, tone: counts.late > 0 ? 'text-destructive' : 'text-foreground' },
    { label: 'Ready', value: counts.ready, icon: <PackageCheck className="w-5 h-5" />, tone: 'text-success' },
  ];

  return (
    <div className="space-y-3 animate-fade-in">
      <section className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[11px] uppercase font-black tracking-wider text-primary">
          {template.name}
        </p>
        <h1 className="font-display font-black text-lg truncate">
          {userName ? `Hello, ${userName.split(' ')[0]}` : 'Hello'}
        </h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {counts.late > 0
            ? `${counts.late} order${counts.late > 1 ? 's' : ''} past the promised time.`
            : counts.open > 0
              ? `${counts.open} order${counts.open > 1 ? 's' : ''} in the shop.`
              : 'Nothing waiting. Ready when a customer walks in.'}
        </p>
      </section>

      <button
        type="button"
        onClick={openIntake}
        className="w-full rounded-2xl bg-primary text-primary-foreground p-4 text-left active:scale-[0.99] transition"
      >
        <p className="text-[10px] uppercase font-black tracking-wider opacity-80">Start here</p>
        <p className="font-display font-black text-xl">
          {isLaundry ? 'Record Laundry' : template.labels.primaryAction}
        </p>
      </button>

      <div className="grid grid-cols-3 gap-3">
        {tiles.map(tile => (
          <div key={tile.label} className="rounded-2xl border border-border bg-card p-3 text-center">
            <div className="flex justify-center text-muted-foreground mb-1">{tile.icon}</div>
            <p className={`font-display font-black text-xl ${tile.tone}`}>{tile.value}</p>
            <p className="text-[10px] text-muted-foreground">{tile.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onNavigate((isLaundry ? 'laundry-records' : 'orders') as TabId)}
          className="rounded-2xl border border-border bg-card p-4 text-left active:scale-[0.99] transition"
        >
          <ClipboardList className="w-6 h-6 text-primary mb-2" />
          <p className="font-display font-bold text-sm">{isLaundry ? 'Laundry Records' : 'Orders'}</p>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('customers')}
          className="rounded-2xl border border-border bg-card p-4 text-left active:scale-[0.99] transition"
        >
          <Users className="w-6 h-6 text-primary mb-2" />
          <p className="font-display font-bold text-sm">Customers</p>
        </button>
      </div>
    </div>
  );
}
