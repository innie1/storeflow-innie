import { useEffect, useMemo, useState } from 'react';
import type { StoreData, TabId } from '@/types/store';
import { getLocalLaundryRecords, LAUNDRY_LOCAL_CHANGED_EVENT, mergeLaundryRecords } from '@/lib/laundry-offline';
import { decorateRecord } from '@/lib/laundry-records';
import { laundryDayBoard, type DayBoard } from '@/lib/laundry-day';
import { requestLaundryWorkspace } from '@/lib/laundry-workspace';
import { LONG_WAIT_DAYS } from '@/lib/uncollected';

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

const EMPTY_BOARD: DayBoard = { dueToday: 0, late: 0, ready: 0, longestReadyDays: 0, owed: 0, owedCount: 0, waitingCount: 0, waitingValue: 0, waitingUnpaid: 0, waitingUnpaidCount: 0, empty: true };

/**
 * The day's figures, worked out once for the whole home screen.
 *
 * The Today card and the lines under the money both read it, so it is a hook
 * the screen calls once rather than something each card works out again.
 * A shop that is not a laundry has no bundles to count, and skips the work.
 */
export function useLaundryDayBoard(store: StoreData, orders: any[], enabled = true): DayBoard {
  const accessCode = String(store.accessCode || '');
  const [localRecords, setLocalRecords] = useState(() => (enabled ? getLocalLaundryRecords(accessCode) : []));

  // The counter records a bundle and comes straight back here. A board still
  // showing the old numbers would be worse than no board.
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => setLocalRecords(getLocalLaundryRecords(accessCode));
    refresh();
    window.addEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, refresh);
  }, [accessCode, enabled]);

  return useMemo(
    () => (enabled
      ? laundryDayBoard(mergeLaundryRecords(orders || [], localRecords).map(order => decorateRecord(order, store)))
      : EMPTY_BOARD),
    [orders, localRecords, store, enabled],
  );
}

/** Short enough for a quarter of a phone: ₦9,500, ₦23k, ₦1.2M. */
export function compactNaira(value: number): string {
  const amount = Math.round(value);
  if (amount < 1_000) return `₦${amount.toLocaleString()}`;
  // "₦7,500" is one character too wide for a quarter of a phone and was cut
  // to "₦7,…". Thousands are said the short way too, to one decimal.
  if (amount < 10_000) return `₦${(amount / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (amount < 1_000_000) return `₦${Math.round(amount / 1000)}k`;
  return `₦${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** Opens the bundle list on one filter, the way every tap on this screen does. */
export function openLaundryList(onNavigate: (tab: TabId) => void, filter: string) {
  requestLaundryWorkspace('records', filter);
  onNavigate('laundry-records' as TabId);
}

interface Props {
  board: DayBoard;
  onNavigate: (tab: TabId) => void;
  /** Money is the owner's business. An attendant sees the work, not the debt. */
  canSeeMoney: boolean;
}

/**
 * One "Today" card, four numbers.
 *
 * Late, Due today and Ready were three boxes of their own, each with a label
 * in capitals and a colour whatever the number, and money owed was a fourth
 * box under them. They are one row now. A number is coloured only when it
 * asks for something: late work in red, what is ready in green, money owed in
 * gold. A zero stays grey.
 */
export default function LaundryDayBoard({ board, onNavigate, canSeeMoney }: Props) {
  // A shop that has recorded nothing is being asked to start, not reported to.
  if (board.empty) return null;

  const cells = [
    { key: 'late', label: 'Late', value: String(board.late), filter: 'overdue', tone: board.late > 0 ? 'text-destructive' : 'text-muted-foreground' },
    { key: 'due', label: 'Due today', value: String(board.dueToday), filter: 'active', tone: board.dueToday > 0 ? 'text-foreground' : 'text-muted-foreground' },
    { key: 'ready', label: 'Ready', value: String(board.ready), filter: 'ready', tone: board.ready > 0 ? 'text-success' : 'text-muted-foreground' },
    ...(canSeeMoney
      ? [{ key: 'owed', label: 'Owed', value: compactNaira(board.owed), filter: 'all', tone: board.owed > 0 ? 'text-primary' : 'text-muted-foreground' }]
      : []),
  ];

  return (
    <section
      aria-label="Today"
      className={`grid ${cells.length === 4 ? 'grid-cols-4' : 'grid-cols-3'} rounded-2xl border border-border bg-card overflow-hidden`}
    >
      {cells.map(cell => (
        <button
          key={cell.key}
          type="button"
          onClick={() => openLaundryList(onNavigate, cell.filter)}
          className="min-w-0 px-2.5 py-3 text-left border-r border-border last:border-r-0 active:bg-surface-2 transition-colors"
        >
          <span className="block text-xs text-muted-foreground whitespace-nowrap">{cell.label}</span>
          <span className={`block font-display font-bold text-[22px] leading-tight mt-1 truncate ${cell.tone}`}>{cell.value}</span>
        </button>
      ))}
    </section>
  );
}

/**
 * Who owes, and what is waiting, as two lines under the takings.
 *
 * These were two cards that both said the same ₦23,250, and the second said
 * "9 waiting to be collected" beside a Ready box saying 7 - it counted the
 * clothes still being washed. Ready is said once now, and what is still in
 * the wash is said as that.
 */
export function LaundryMoneyLines({ board, onNavigate }: { board: DayBoard; onNavigate: (tab: TabId) => void }) {
  const stillWashing = Math.max(0, board.waitingCount - board.ready);
  const lines: { key: string; dot: string; title: string; note: string; action: string; filter: string }[] = [];

  // Owed: collected and not paid. The money to chase.
  if (board.owed > 0) {
    lines.push({
      key: 'owed',
      dot: 'bg-destructive',
      title: `₦${board.owed.toLocaleString()} owed`,
      note: `${board.owedCount} ${board.owedCount === 1 ? 'bundle' : 'bundles'} collected, not paid`,
      action: 'See who',
      filter: 'all',
    });
  }
  // Not a debt: the clothes are still here, and this is paid when they go.
  if (board.waitingUnpaid > 0) {
    lines.push({
      key: 'on-collection',
      dot: 'bg-primary',
      title: `₦${board.waitingUnpaid.toLocaleString()} to pay on collection`,
      note: `${board.waitingUnpaidCount} ${board.waitingUnpaidCount === 1 ? 'bundle' : 'bundles'} still with you`,
      action: 'Open',
      filter: 'active',
    });
  }
  if (board.ready > 0) {
    lines.push({
      key: 'ready',
      dot: 'bg-success',
      title: `${board.ready} ready to collect`,
      // Clothes a week on the shelf are the thing to know about, ahead of what is in the wash.
      note: board.longestReadyDays >= LONG_WAIT_DAYS
        ? `The longest has waited ${board.longestReadyDays} days`
        : stillWashing > 0 ? `${stillWashing} more still being washed` : 'Nothing else in the wash',
      action: 'Open',
      filter: 'ready',
    });
  } else if (stillWashing > 0) {
    lines.push({
      key: 'washing',
      dot: 'bg-muted-foreground',
      title: `${stillWashing} ${stillWashing === 1 ? 'bundle' : 'bundles'} still being washed`,
      note: 'None ready yet',
      action: 'Open',
      filter: 'active',
    });
  }

  if (!lines.length) return null;

  return (
    <div>
      {lines.map(line => (
        <button
          key={line.key}
          type="button"
          onClick={() => openLaundryList(onNavigate, line.filter)}
          className="w-full flex items-center gap-3 px-4 py-3 border-t border-border text-left active:bg-surface-2 transition-colors"
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${line.dot}`} aria-hidden />
          <span className="flex-1 min-w-0">
            <span className="block text-sm text-foreground truncate">{line.title}</span>
            <span className="block text-xs text-muted-foreground mt-0.5 truncate">{line.note}</span>
          </span>
          <span className="text-sm font-bold text-primary shrink-0">{line.action} ›</span>
        </button>
      ))}
    </div>
  );
}
