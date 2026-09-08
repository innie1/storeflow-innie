import { useEffect, useMemo, useState } from 'react';
import { Check, MoonStar } from 'lucide-react';
import type { StoreData, TabId } from '@/types/store';
import { getLocalLaundryRecords, LAUNDRY_LOCAL_CHANGED_EVENT, mergeLaundryRecords } from '@/lib/laundry-offline';
import { decorateRecord } from '@/lib/laundry-records';
import {
  dayCloseSentence,
  isClosingTime,
  laundryDayClose,
  markDayClosed,
  tomorrowSentence,
  wasDayClosed,
} from '@/lib/laundry-day-close';
import { requestLaundryWorkspace } from '@/lib/laundry-workspace';

/**
 * The evening count, on the screen that is already open.
 *
 * A laundry closes by going through the book. That count is the one moment
 * where paper is doing real work rather than just being written on, so it is
 * the habit the app has to take over - and the way to take it over is to have
 * the answer waiting rather than to offer a report somebody has to go and
 * fetch at nine at night.
 *
 * It shows from the late afternoon, and once it has been marked done it stays
 * gone until tomorrow evening. A close that keeps asking to be closed is a
 * nag, and a nag gets dismissed unread.
 */

interface Props {
  store: StoreData;
  orders: any[];
  onNavigate: (tab: TabId) => void;
  /** Money is the owner's business. Nobody else is shown the day's takings. */
  canSeeMoney: boolean;
}

export default function DayClose({ store, orders, onNavigate, canSeeMoney }: Props) {
  const accessCode = String(store.accessCode || '');
  const [localRecords, setLocalRecords] = useState(() => getLocalLaundryRecords(accessCode));
  const [closed, setClosed] = useState(() => wasDayClosed(accessCode));

  useEffect(() => {
    const refresh = () => setLocalRecords(getLocalLaundryRecords(accessCode));
    refresh();
    window.addEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, refresh);
  }, [accessCode]);

  const close = useMemo(
    () => laundryDayClose(store, mergeLaundryRecords(orders || [], localRecords).map(order => decorateRecord(order, store))),
    [store, orders, localRecords],
  );

  // Only in the evening, only once, and never to somebody who cannot see money.
  if (!canSeeMoney || closed || !isClosingTime()) return null;

  // A shop that took nothing today does not need a card telling it so.
  if (close.quiet) return null;

  const tomorrow = tomorrowSentence(close);

  const done = () => {
    markDayClosed(accessCode);
    setClosed(true);
  };

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left">
      <p className="text-[10px] uppercase font-black text-primary flex items-center gap-1.5">
        <MoonStar className="w-3 h-3" /> How today went
      </p>

      {/* The three figures the book gets counted for, in the order they are
          asked: what came in, what was taken, what is still out. */}
      <div className="grid grid-cols-3 gap-2 mt-2.5">
        <div>
          <p className="font-display font-black text-xl">{close.bundlesIn}</p>
          <p className="text-[10px] text-muted-foreground">
            {close.bundlesIn === 1 ? 'bundle in' : 'bundles in'}
            {close.piecesIn > 0 ? ` · ${close.piecesIn} pcs` : ''}
          </p>
        </div>
        <div>
          <p className="font-display font-black text-xl text-success">₦{close.taken.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">taken</p>
        </div>
        <div>
          <p className={`font-display font-black text-xl ${close.owedTotal > 0 ? 'text-amber-500' : ''}`}>
            ₦{close.owedTotal.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground">still owed</p>
        </div>
      </div>

      {/*
        And the one forward-looking line, because the reason anybody counts the
        book at night is to know what the morning looks like.
      */}
      {tomorrow && (
        <button
          onClick={() => { requestLaundryWorkspace('records', 'active'); onNavigate('laundry-records' as TabId); }}
          className="mt-3 w-full text-left text-[11px] text-muted-foreground border-t border-border pt-2.5"
        >
          Tomorrow: <span className="text-foreground font-semibold">{tomorrow}</span>
        </button>
      )}

      <button
        onClick={done}
        className="mt-3 w-full h-10 rounded-xl bg-primary text-primary-foreground font-display font-black text-xs flex items-center justify-center gap-2"
      >
        <Check className="w-3.5 h-3.5" /> Done for today
      </button>

      <p className="sr-only">{dayCloseSentence(close)}</p>
    </div>
  );
}
