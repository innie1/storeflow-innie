import { useMemo, useState } from 'react';
import { Bike, MapPin, MessageCircle, Navigation, Phone } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { getLocalLaundryRecords, setLocalLaundryRunStatus } from '@/lib/laundry-offline';
import { laundryBalance } from '@/lib/laundry-money';
import { whatsappUrl } from '@/lib/flow-message-orders';
import { showToast } from '@/components/Toast';
import {
  byPromised,
  mapsLink,
  nextRunStatus,
  runActionLabel,
  runMessage,
  describeRunEvent,
  runStatusLabel,
  splitRuns,
  telLink,
  type RunStop,
} from '@/lib/laundry-runs';

/**
 * The day's collections and deliveries.
 *
 * A checklist, not a map. Nothing here streams a location or calls a mapping
 * service: the addresses are the shop's own, the navigation is a plain link
 * the phone's map app opens, and the customer is told by WhatsApp. It costs no
 * quota and works with the network coming and going, which is the condition it
 * will actually be used in.
 */

interface Props {
  store: StoreData;
  /** Amounts are hidden from anyone without permission to see money. */
  canSeeMoney: boolean;
  /** Stamped on each step, so a disputed delivery has a name against it. */
  currentUser?: { name?: string; role?: string } | null;
}

function stopsFromStore(store: StoreData): RunStop[] {
  const accessCode = String(store.accessCode || '');
  if (!accessCode) return [];

  return getLocalLaundryRecords(accessCode)
    .filter(record => record.fulfillment === 'pickup' || record.fulfillment === 'delivery')
    .filter(record => {
      // A delivery is only a run once the washing is actually finished.
      // Listing it earlier sends a rider out for a bundle still in a machine.
      if (record.fulfillment !== 'delivery') return true;
      return record.workflowStage === 'ready' || record.runStatus === 'out_for_delivery';
    })
    .map(record => ({
      clientRef: record.clientRef,
      tagCode: record.tagCode,
      customerName: record.customerName,
      customerPhone: record.customerPhone,
      address: record.runAddress || record.customerAddress || '',
      landmark: record.runLandmark,
      kind: record.fulfillment === 'pickup' ? 'pickup' : 'delivery',
      runStatus: record.runStatus,
      promisedFor: record.promisedFor,
      balance: laundryBalance(store, record.clientRef),
      events: record.runEvents,
    }));
}

export default function LaundryRuns({ store, canSeeMoney, currentUser }: Props) {
  const [tick, setTick] = useState(0);
  const { pickups, deliveries } = useMemo(() => {
    const runs = splitRuns(stopsFromStore(store));
    return { pickups: byPromised(runs.pickups), deliveries: byPromised(runs.deliveries) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, tick]);

  const advance = (stop: RunStop) => {
    const next = nextRunStatus(stop.kind, stop.runStatus);
    if (!next) return;
    setLocalLaundryRunStatus(String(store.accessCode || ''), stop.clientRef, next, currentUser?.name || undefined);
    setTick(value => value + 1);
    showToast(`${stop.tagCode} — ${runStatusLabel(next)}`, 'success');
  };

  const tell = (stop: RunStop) => {
    const status = nextRunStatus(stop.kind, stop.runStatus) || stop.runStatus;
    if (!status) return;
    const url = whatsappUrl(stop.customerPhone, runMessage(store, stop, status));
    if (url) window.open(url, '_blank');
  };

  const renderStop = (stop: RunStop) => {
    const action = runActionLabel(stop.kind, stop.runStatus);
    const link = mapsLink(stop.address, stop.landmark);
    const phone = telLink(stop.customerPhone);

    return (
      <div key={stop.clientRef} className="rounded-2xl border border-border bg-card p-3.5 text-left space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm tracking-[0.1em] text-primary">{stop.tagCode}</span>
              {stop.runStatus && (
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black">
                  {runStatusLabel(stop.runStatus)}
                </span>
              )}
            </div>
            <p className="font-display font-bold text-sm mt-1 truncate">{stop.customerName}</p>
            {stop.address ? (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {stop.address}{stop.landmark ? ` · ${stop.landmark}` : ''}
              </p>
            ) : (
              <p className="text-[11px] text-amber-500 mt-0.5">No address on this bundle</p>
            )}
          </div>
          {/* A rider needs to know to ask for money; they do not need the
              shop's takings, so this follows the same permission as the rest. */}
          {canSeeMoney && stop.balance > 0 && (
            <span className="text-xs font-display font-black text-amber-500 shrink-0">
              ₦{stop.balance.toLocaleString()}
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          {phone && (
            <a href={phone} className="h-9 px-3 rounded-xl bg-surface-2 border border-border flex items-center gap-1.5 text-[11px] font-display font-bold">
              <Phone className="w-3 h-3" /> Call
            </a>
          )}
          <button type="button" onClick={() => tell(stop)} className="h-9 px-3 rounded-xl bg-surface-2 border border-border flex items-center gap-1.5 text-[11px] font-display font-bold">
            <MessageCircle className="w-3 h-3" /> Tell them
          </button>
          {link && (
            <a href={link} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-xl bg-surface-2 border border-border flex items-center gap-1.5 text-[11px] font-display font-bold">
              <Navigation className="w-3 h-3" /> Map
            </a>
          )}
        </div>

        {/* What has happened, so "when did we deliver it?" has an answer. */}
        {stop.events && stop.events.length > 0 && (
          <div className="rounded-xl bg-surface-2 border border-border px-2.5 py-2 space-y-0.5">
            {stop.events.map((event, index) => (
              <p key={`${event.at}-${index}`} className="text-[10px] text-muted-foreground">
                {describeRunEvent(event)}
              </p>
            ))}
          </div>
        )}

        {action && (
          <button
            type="button"
            onClick={() => advance(stop)}
            className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-display font-black text-xs active:scale-[0.99] transition"
          >
            {action}
          </button>
        )}
      </div>
    );
  };

  if (!pickups.length && !deliveries.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Bike className="w-5 h-5 text-primary" />
        </div>
        <p className="font-display font-black mt-3">No runs today</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Bundles marked “We collect” or “We deliver” show up here. A delivery
          appears once its washing is marked ready.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pickups.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase font-black text-muted-foreground flex items-center gap-1.5">
            <MapPin className="w-3 h-3" /> To collect · {pickups.length}
          </p>
          {pickups.map(renderStop)}
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase font-black text-muted-foreground flex items-center gap-1.5">
            <Bike className="w-3 h-3" /> To deliver · {deliveries.length}
          </p>
          {deliveries.map(renderStop)}
        </div>
      )}
    </div>
  );
}
