import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, PackageCheck, Wallet } from 'lucide-react';
import type { StoreData, TabId } from '@/types/store';
import { getLocalLaundryRecords, LAUNDRY_LOCAL_CHANGED_EVENT, mergeLaundryRecords } from '@/lib/laundry-offline';
import { decorateRecord } from '@/lib/laundry-records';
import { laundryDayBoard } from '@/lib/laundry-day';
import { requestLaundryWorkspace } from '@/lib/laundry-workspace';

/**
 * The day's work, at the top of the first screen.
 *
 * What used to be here was today's takings and a lifetime customer count.
 * Neither answers the question somebody actually opens the app with, which is
 * "what do I have to do today" - and the customer count only ever goes up, so
 * it stops being read within a week.
 *
 * These four are the ones a paper book cannot answer: it cannot be sorted by
 * date, so finding what is late means reading every ticket, and money owed
 * disappears into it entirely. Each one taps through to the same list,
 * filtered.
 */

interface Props {
  store: StoreData;
  /** Cloud orders, so a bundle taken on another phone is counted here too. */
  orders: any[];
  onNavigate: (tab: TabId) => void;
  /** Money is the owner's business. An attendant sees the work, not the debt. */
  canSeeMoney: boolean;
}

export default function LaundryDayBoard({ store, orders, onNavigate, canSeeMoney }: Props) {
  const accessCode = String(store.accessCode || '');
  const [localRecords, setLocalRecords] = useState(() => getLocalLaundryRecords(accessCode));

  // The counter records a bundle and comes straight back here. A board still
  // showing the old numbers would be worse than no board.
  useEffect(() => {
    const refresh = () => setLocalRecords(getLocalLaundryRecords(accessCode));
    refresh();
    window.addEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, refresh);
  }, [accessCode]);

  const board = useMemo(
    () => laundryDayBoard(mergeLaundryRecords(orders || [], localRecords).map(order => decorateRecord(order, store))),
    [orders, localRecords, store],
  );

  // A shop that has recorded nothing is being asked to start, not reported to.
  if (board.empty) return null;

  const open = (filter: string) => {
    requestLaundryWorkspace('records', filter);
    onNavigate('laundry-records' as TabId);
  };

  const tiles = [
    {
      key: 'late',
      label: 'Late',
      value: String(board.late),
      icon: <AlertTriangle className="w-4 h-4" />,
      filter: 'overdue',
      tone: board.late > 0 ? 'text-destructive' : 'text-muted-foreground',
      ring: board.late > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card',
    },
    {
      key: 'due',
      label: 'Due today',
      value: String(board.dueToday),
      icon: <CalendarClock className="w-4 h-4" />,
      filter: 'active',
      tone: board.dueToday > 0 ? 'text-primary' : 'text-muted-foreground',
      ring: 'border-border bg-card',
    },
    {
      key: 'ready',
      label: 'Ready',
      value: String(board.ready),
      icon: <PackageCheck className="w-4 h-4" />,
      filter: 'ready',
      tone: board.ready > 0 ? 'text-success' : 'text-muted-foreground',
      ring: 'border-border bg-card',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(tile => (
          <button
            key={tile.key}
            onClick={() => open(tile.filter)}
            className={`rounded-2xl border p-3 text-left ${tile.ring}`}
          >
            <div className={`flex items-center gap-1.5 text-[10px] uppercase font-black ${tile.tone}`}>
              {tile.icon} {tile.label}
            </div>
            <p className={`font-display font-black text-2xl mt-1.5 ${tile.tone}`}>{tile.value}</p>
          </button>
        ))}
      </div>

      {/*
        Money owed gets its own row rather than a fourth tile: it is the one
        figure a paper book loses entirely, and the one worth a sentence rather
        than a number on its own.
      */}
      {canSeeMoney && board.owed > 0 && (
        <button
          onClick={() => open('all')}
          className="w-full rounded-2xl border border-amber-500/40 bg-amber-500/5 p-3.5 text-left flex items-center gap-3"
        >
          <Wallet className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="font-display font-black text-sm text-amber-500">
              ₦{board.owed.toLocaleString()} owed to you
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Across {board.owedCount} {board.owedCount === 1 ? 'bundle' : 'bundles'}. Tap to see who.
            </p>
          </div>
        </button>
      )}
    </div>
  );
}
