import { useMemo, useState } from 'react';
import { useShopLaundryVersion } from '@/hooks/use-shop-laundry';
import { requestLaundryWorkspace } from '@/lib/laundry-workspace';
import { normalizeWhatsAppPhone } from '@/lib/laundry-whatsapp';
import {
  collectionReminderLink,
  LONG_WAIT_DAYS,
  noteCollectionReminder,
  remindedInWords,
  remindedRecently,
  uncollectedBundles,
  waitingInWords,
  type UncollectedBundle,
} from '@/lib/uncollected';
import type { StoreData, TabId } from '@/types/store';
import { ChevronRight, MessageCircle, PackageCheck, Phone } from 'lucide-react';

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;

/** How many are listed before "Show all". The longest waiting are the ones to act on. */
const SHOWN_FIRST = 4;

/**
 * Finished clothes still on the shelf, longest waiting first, each with a
 * button that opens WhatsApp with the reminder already written.
 *
 * Nothing is sent from here. The button opens the customer's chat with the
 * message in it and the shop presses send, so a reminder is always something a
 * person chose to send. What is kept is only that it was opened, so the list
 * can say who has been told and who has not.
 */
export default function UncollectedCard({ store, onNavigate }: { store: StoreData; onNavigate?: (tab: TabId) => void }) {
  const version = useShopLaundryVersion();
  const [sent, setSent] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const waiting = useMemo(() => uncollectedBundles(store), [store, version, sent]);
  if (waiting.count === 0) return null;

  const remind = (bundle: UncollectedBundle) => {
    window.open(collectionReminderLink(store, bundle), '_blank', 'noopener,noreferrer');
    noteCollectionReminder(String(store.accessCode || ''), bundle.clientRef, Date.now(), waiting.list.map(item => item.clientRef));
    setSent(count => count + 1);
  };

  const rows = showAll ? waiting.list : waiting.list.slice(0, SHOWN_FIRST);

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-3" data-uncollected>
      <div>
        <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><PackageCheck className="w-4 h-4" /> Ready and not collected</h3>
        <p className="text-[11px] text-muted-foreground">Finished clothes still on your shelf, longest waiting first</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">Bundles</p><p className="font-display font-bold text-sm">{waiting.count}</p></div>
        <div className="p-2.5 rounded-lg bg-surface-2"><p className="text-[10px] text-muted-foreground uppercase">To pay</p><p className="font-display font-bold text-sm">{naira(waiting.toPay)}</p></div>
        <div className={`p-2.5 rounded-lg ${waiting.longWaiting > 0 ? 'bg-destructive/10 border border-destructive/20' : 'bg-surface-2'}`}>
          <p className="text-[10px] text-muted-foreground uppercase">A week or more</p>
          <p className={`font-display font-bold text-sm ${waiting.longWaiting > 0 ? 'text-destructive' : ''}`}>{waiting.longWaiting}</p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {rows.map(bundle => {
          const long = bundle.daysWaiting >= LONG_WAIT_DAYS;
          const told = remindedInWords(bundle);
          const recently = remindedRecently(bundle);
          const phone = normalizeWhatsAppPhone(bundle.customerPhone);
          return (
            <div key={bundle.clientRef} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-sm truncate">{bundle.customerName}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {[bundle.tagCode, `${bundle.pieceCount} ${bundle.pieceCount === 1 ? 'piece' : 'pieces'}`, bundle.shelfLocation ? `Shelf ${bundle.shelfLocation}` : ''].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[11px] mt-0.5">
                  <span className={long ? 'text-destructive font-semibold' : 'text-foreground'}>{waitingInWords(bundle.daysWaiting)}</span>
                  <span className="text-muted-foreground"> · {bundle.balance > 0 ? `${naira(bundle.balance)} to pay` : 'Paid'}</span>
                </p>
                {told && <p className="text-[11px] text-muted-foreground mt-0.5">{told}</p>}
                {!phone && <p className="text-[11px] text-muted-foreground mt-0.5">No phone number: WhatsApp will ask who to send it to</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {phone && (
                  <a
                    href={`tel:+${phone}`}
                    aria-label={`Call ${bundle.customerName}`}
                    className="h-9 w-9 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-foreground"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => remind(bundle)}
                  className={`h-9 px-3 rounded-xl text-[11px] font-display font-bold flex items-center gap-1.5 ${recently ? 'bg-surface-2 border border-border text-foreground' : 'bg-emerald-600 text-white'}`}
                >
                  <MessageCircle className="w-3.5 h-3.5" /> {bundle.reminders > 0 ? 'Remind again' : 'Remind'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {waiting.count > SHOWN_FIRST && (
        <button type="button" onClick={() => setShowAll(all => !all)} className="text-[11px] font-display font-semibold text-primary">
          {showAll ? 'Show fewer' : `Show all ${waiting.count}`}
        </button>
      )}

      {onNavigate && (
        <button
          type="button"
          onClick={() => { requestLaundryWorkspace('records', 'ready'); onNavigate('laundry-records' as TabId); }}
          className="w-full flex items-center justify-between pt-2 border-t border-border text-xs font-display font-semibold text-foreground"
        >
          Open the Ready list to hand clothes over
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
