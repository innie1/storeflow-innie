import { useCallback, useEffect, useMemo, useState } from 'react';
import { byContributor, recordedByLabel } from '@/lib/recorded-by';
import RecordedByFilter from '@/components/RecordedByFilter';
import type { StoreData } from '@/types/store';
import LaundryWalkInIntake from '@/components/laundry/LaundryWalkInIntake';
import {
  consumeLaundryWorkspaceView,
  getLaundryRecordSearchText,
  LAUNDRY_INTAKE_OPEN_SIGNAL,
  parseLaundryRecordMetadata,
  requestLaundryWorkspace,
  type LaundryWorkspaceView,
} from '@/lib/laundry-workspace';
import { describeDue, type DueLabel } from '@/lib/laundry-due';
import { laundryBalance, recordLaundryPayment } from '@/lib/laundry-money';
import {
  getLocalLaundryRecords,
  LAUNDRY_LOCAL_CHANGED_EVENT,
  LAUNDRY_SYNC_CHANGED_EVENT,
  LAUNDRY_SETTLED_STAGES,
  LAUNDRY_WORKFLOW_STAGES,
  mergeLaundryRecords,
  nextLaundryStage,
  updateLaundryOrderStage,
  type LaundryWorkflowStage,
} from '@/lib/laundry-offline';
import { buildLaundryWhatsAppPayload, openLaundryWhatsApp } from '@/lib/laundry-whatsapp';
import { showToast } from '@/components/Toast';
import { saveStore } from '@/lib/store-data';
import { AlertTriangle, ChevronDown, ChevronUp, ClipboardList, Clock, MapPin, MessageCircle, Plus, Search, X } from 'lucide-react';
import BundlePhotos from '@/components/laundry/BundlePhotos';
import LaundryRuns from '@/components/laundry/LaundryRuns';
import { can } from '@/lib/permissions';
import type { LaundryFulfillment, LaundryRunStatus } from '@/lib/laundry-runs';
import { Bike } from 'lucide-react';
import LaundryEquipmentPanel from '@/components/laundry/LaundryEquipmentPanel';
import { getPromisedTime } from '@/lib/business-insights';

interface Props {
  store: StoreData;
  orders: any[];
  onUpdate: (store: StoreData) => void;
  /** Stamped onto every record taken in, so the shop can tell who did what. */
  currentUser?: { name?: string; role?: string } | null;
}

type RecordFilter = 'all' | 'active' | 'ready' | 'overdue' | 'collected';

const FILTERS: { id: RecordFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'ready', label: 'Ready' },
  { id: 'active', label: 'Active' },
  { id: 'collected', label: 'Collected' },
];

/** Everything a record row needs, derived once instead of on every render. */
interface DecoratedRecord {
  order: any;
  key: string;
  tagCode: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  garmentSummary: string;
  pieceCount: number;
  stage: LaundryWorkflowStage;
  statusLabel: string;
  due: DueLabel | null;
  /** Still owed on this bundle, 0 when settled. */
  balance: number;
  clientRef: string;
  /** Free-text shelf or rack, as the attendant wrote it at drop-off. */
  shelfLocation?: string;
  /*
   * decorateRecord has always set these, but the interface never declared
   * them, so DecoratedRecord did not structurally satisfy RecordedBy. That
   * collapsed byContributor's generic to RecordedBy and every field the sort
   * and filter needed went missing from the result type - one omission, most
   * of this file's type errors. The filter itself worked; types are erased.
   */
  recordedByName?: string;
  recordedByRole?: string;
  /** Walk-in, collected from the customer, or delivered back. */
  fulfillment?: LaundryFulfillment;
  /** The journey, which is not the wash stage. */
  runStatus?: LaundryRunStatus;
  synced: boolean;
  whatsapp: ReturnType<typeof buildLaundryWhatsAppPayload>;
  total: number;
  createdAt: number;
  promisedAt: number | null;
  overdue: boolean;
  address: string;
  washMethod: string;
  dryMethod: string;
  searchText: string;
}

function decorateRecord(order: any, store: StoreData): DecoratedRecord {
  const meta = parseLaundryRecordMetadata(order);
  const items = order.order_items || [];
  const garments = items.filter((item: any) => !item?.metadata?.charge_line);
  const stageRaw = String(order.workflow_stage || 'received').toLowerCase() as LaundryWorkflowStage;
  const clientRef = String(order._localClientRef || order.client_ref || order?.service_metadata?.client_ref || '');
  const stage = LAUNDRY_WORKFLOW_STAGES.some(item => item.id === stageRaw) ? stageRaw : 'received';
  const promisedValue = getPromisedTime(order);
  const promisedDate = promisedValue ? new Date(promisedValue) : null;
  const promisedAt = promisedDate && Number.isFinite(promisedDate.getTime()) ? promisedDate.getTime() : null;
  const createdDate = order.created_at ? new Date(order.created_at) : null;

  return {
    order,
    key: String(order._localClientRef || order.client_ref || order.id || ''),
    tagCode: String(meta.tag_code || meta.receipt_number || order.order_number || '—').toUpperCase(),
    customerName: order.customer_name || 'Walk-in Customer',
    shelfLocation: meta.shelf_location || undefined,
    fulfillment: meta.fulfillment || undefined,
    runStatus: meta.run_status || undefined,
    recordedByName: meta.recorded_by_name || undefined,
    recordedByRole: meta.recorded_by_role || undefined,
    customerPhone: order.customer_phone || '',
    serviceName: meta.service_name || items.find((item: any) => item?.metadata?.charge_line)?.item_name || 'Laundry service',
    garmentSummary: meta.garment_summary
      || garments.map((item: any) => `${Number(item.quantity || 0)} ${item.item_name || 'item'}`).join(', '),
    pieceCount: Number(meta.garment_count || 0)
      || garments.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
    stage,
    statusLabel: String(order.workflow_stage || order.status || 'Received').replace(/_/g, ' '),
    synced: order._laundrySyncStatus === 'synced',
    whatsapp: buildLaundryWhatsAppPayload(store, order),
    total: Number(order.total || 0),
    createdAt: createdDate && Number.isFinite(createdDate.getTime()) ? createdDate.getTime() : 0,
    promisedAt,
    overdue: promisedAt !== null && promisedAt < Date.now() && !LAUNDRY_SETTLED_STAGES.includes(stage),
    // A bundle waiting on the Ready shelf past its time is not late — it is
    // finished, and waiting for someone to come for it. Only work still in
    // progress is counted late, which is why the clock is pinned at the
    // promised moment once a bundle settles.
    clientRef,
    balance: laundryBalance(store, clientRef),
    due: LAUNDRY_SETTLED_STAGES.includes(stage)
      ? describeDue(promisedAt, promisedAt !== null ? Math.min(Date.now(), promisedAt) : Date.now())
      : describeDue(promisedAt),
    address: meta.customer_address || '',
    washMethod: meta.wash_method_name || '',
    dryMethod: meta.dry_method_name || '',
    searchText: getLaundryRecordSearchText(order),
  };
}

/** Overdue first, then whatever the counter is most likely to be asked about. */
const SORT_KEY = 'storeflow_laundry_sort';

function urgencyRank(record: DecoratedRecord): number {
  if (record.overdue) return 0;
  if (record.stage === 'ready') return 1;
  if (record.stage === 'collected') return 3;
  return 2;
}

export default function LaundryWorkspace({ store, orders, onUpdate, currentUser }: Props) {
  const [view, setView] = useState<LaundryWorkspaceView>(() => consumeLaundryWorkspaceView());
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [showEquipment, setShowEquipment] = useState(false);
  const [localRecords, setLocalRecords] = useState(() => getLocalLaundryRecords(store.accessCode));
  const [stageBusy, setStageBusy] = useState<string | null>(null);
  /** A bundle about to be handed over with money still owed on it. */
  const [collectGuard, setCollectGuard] = useState<DecoratedRecord | null>(null);
  /*
   * The list is ordered by what needs attention, which is right at the counter
   * but means a bundle you have just taken in lands wherever its due date puts
   * it - often far enough down that you cannot see it saved. 'newest' is for
   * that moment; 'urgent' stays the default because a late bundle should not
   * slide under everything recorded today.
   */
  const [sortMode, setSortMode] = useState<'urgent' | 'newest'>(() => {
    try { return localStorage.getItem(SORT_KEY) === 'newest' ? 'newest' : 'urgent'; } catch { return 'urgent'; }
  });
  /** Just recorded, so it can be found in a list it does not sit at the top of. */
  const [justRecorded, setJustRecorded] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setLocalRecords(getLocalLaundryRecords(store.accessCode));
    refresh();
    window.addEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, refresh);
    window.addEventListener(LAUNDRY_SYNC_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, refresh);
      window.removeEventListener(LAUNDRY_SYNC_CHANGED_EVENT, refresh);
    };
  }, [store.accessCode]);

  useEffect(() => {
    // This workspace is kept mounted (hidden) when another tab is active, so a
    // "Record Laundry" / "Laundry Records" control tapped elsewhere can't rely
    // on the initial consumeLaundryWorkspaceView() mount-time read alone — it
    // needs a live broadcast to switch view while already mounted.
    const onWorkspaceViewRequested = (event: Event) => {
      const requested = (event as CustomEvent<LaundryWorkspaceView>).detail;
      if (requested === 'record' || requested === 'records') setView(requested);
    };
    window.addEventListener(LAUNDRY_INTAKE_OPEN_SIGNAL, onWorkspaceViewRequested);
    return () => window.removeEventListener(LAUNDRY_INTAKE_OPEN_SIGNAL, onWorkspaceViewRequested);
  }, []);

  // Typing must not re-parse every record's metadata on each keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 150);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Derive once per data change, not once per render.
  const decorated = useMemo(
    () => mergeLaundryRecords(orders || [], localRecords).map(order => decorateRecord(order, store)),
    [orders, localRecords, store],
  );

  const counts = useMemo(() => ({
    all: decorated.length,
    overdue: decorated.filter(record => record.overdue).length,
    ready: decorated.filter(record => record.stage === 'ready').length,
    active: decorated.filter(record => !LAUNDRY_SETTLED_STAGES.includes(record.stage)).length,
    collected: decorated.filter(record => record.stage === 'collected').length,
  }), [decorated]);

  /** Whose work to list. null is everyone. */
  const [recordedBy, setRecordedBy] = useState<string | null>(null);

  const visibleRecords = useMemo(() => {
    const matchesFilter = (record: DecoratedRecord) => {
      if (filter === 'overdue') return record.overdue;
      if (filter === 'ready') return record.stage === 'ready';
      if (filter === 'active') return !LAUNDRY_SETTLED_STAGES.includes(record.stage);
      if (filter === 'collected') return record.stage === 'collected';
      return true;
    };

    // Person, then stage, then text. Choosing a person narrows the list; it
    // never decides who is allowed to look.
    return byContributor(decorated, recordedBy)
      .filter(record => matchesFilter(record) && (!debouncedSearch || record.searchText.includes(debouncedSearch)))
      .sort((a, b) => {
        // Newest is a flat recency order on purpose: banding it by urgency
        // first would put the bundle just recorded back down the list, which
        // is the whole thing this mode exists to avoid.
        if (sortMode === 'newest') return b.createdAt - a.createdAt;
        const rank = urgencyRank(a) - urgencyRank(b);
        if (rank !== 0) return rank;
        if (a.promisedAt !== b.promisedAt) {
          if (a.promisedAt === null) return 1;
          if (b.promisedAt === null) return -1;
          return a.promisedAt - b.promisedAt;
        }
        return b.createdAt - a.createdAt;
      });
  }, [decorated, filter, debouncedSearch, recordedBy, sortMode]);

  /*
   * Find the bundle just recorded, and mark it for six seconds.
   *
   * Two things had to be got right, and both were wrong first time.
   *
   * The effect must not depend on the record list: the workspace re-reads
   * local records on a timer, so that array gets a fresh identity every poll,
   * which re-ran the effect, cancelled the countdown and started a new one.
   * The mark never cleared. Waiting for the row is a retry, not a dependency.
   *
   * And the six seconds must start when the row is on screen, not when the
   * bundle was saved. The receipt sits in between, and a merchant reading it
   * is not looking at the list - by the time they opened it the mark had
   * already expired.
   */
  useEffect(() => {
    if (!justRecorded || view !== 'records') return;
    let cancelled = false;
    let tries = 0;
    let clear: ReturnType<typeof setTimeout> | undefined;

    const findAndShow = () => {
      if (cancelled) return;
      const row = document.querySelector(`[data-client-ref="${justRecorded}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clear = setTimeout(() => setJustRecorded(null), 6000);
        return;
      }
      // The list may still be rendering. Give it a few frames, then let go
      // rather than searching for a row that is filtered out of view.
      if (tries++ < 40) requestAnimationFrame(findAndShow);
    };

    requestAnimationFrame(findAndShow);
    return () => { cancelled = true; if (clear) clearTimeout(clear); };
  }, [justRecorded, view]);

  /**
   * What has been taken in today, newest first.
   *
   * Deliberately not the filtered list: this answers "did that save?", which
   * should not depend on which stage tab or search term is set on a screen the
   * merchant is not even looking at.
   */
  const recordedToday = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return decorated
      .filter(record => record.createdAt >= midnight.getTime())
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [decorated]);

  const runCount = useMemo(() => {
    const runs = decorated.filter(record =>
      record.fulfillment === 'pickup'
        ? record.runStatus !== 'picked_up'
        : record.fulfillment === 'delivery'
          && record.runStatus !== 'delivered'
          && (record.stage === 'ready' || record.runStatus === 'out_for_delivery'),
    );
    return runs.length;
  }, [decorated]);

  const changeView = (next: LaundryWorkspaceView) => {
    requestLaundryWorkspace(next);
    setView(next);
  };

  const sendWhatsApp = useCallback((order: any) => {
    if (!openLaundryWhatsApp(store, order)) showToast('This laundry record does not have a valid phone number', 'error');
  }, [store]);

  /**
   * Takes what is still owed on a bundle, at the counter.
   *
   * The whole balance at once is what actually happens at handover — a
   * customer collecting their clothes pays the rest. Part payments are still
   * possible at drop-off, so this does not need to ask for an amount and slow
   * the queue down.
   */
  const collectPayment = useCallback((record: DecoratedRecord) => {
    if (record.balance <= 0) return;
    // onUpdate only moves React state; without saveStore the payment is lost
    // on the next reload, which for money is the worst possible failure.
    const next = recordLaundryPayment(store, {
      clientRef: record.clientRef,
      tagCode: record.tagCode,
      customerName: record.customerName,
      customerPhone: record.customerPhone,
      serviceId: String(record.order?.order_items?.[0]?.product_id || record.serviceName),
      serviceName: record.serviceName,
      total: record.total,
      amountPaid: record.balance,
    });
    saveStore(next);
    onUpdate(next);
    showToast(`₦${record.balance.toLocaleString()} received for ${record.tagCode}`);
  }, [store, onUpdate]);

  /**
   * Handing the clothes back is the last moment anyone can ask for the money.
   *
   * Nothing checked the balance here. The badge and the "Take" button were on
   * the row, but at a busy counter nobody reads a row - you hand over the
   * bundle, tap Collected, and find out days later that it was never paid in
   * full. So the app asks, once, at the only moment it still matters.
   *
   * Deliberately not a hard block: a shop that cannot hand a regular their
   * clothes because the app refuses is worse than the problem. "Hand over
   * unpaid" stays available, and the balance stays on the books.
   */
  const changeStage = useCallback(async (record: DecoratedRecord, stage: LaundryWorkflowStage, force = false) => {
    if (stage === 'collected' && record.balance > 0 && !force) {
      setCollectGuard(record);
      return;
    }
    setStageBusy(record.key);
    try {
      const accepted = await updateLaundryOrderStage(store.accessCode, record.order, stage);
      if (!accepted) {
        showToast('Could not update this laundry stage. Check your connection and try again.', 'error');
        return;
      }
      showToast(`${record.tagCode} marked ${LAUNDRY_WORKFLOW_STAGES.find(item => item.id === stage)?.label || stage}`);
      // Marking it ready is when somebody should remember to ask, before the
      // customer is standing there with their hand out for the bag.
      if (stage === 'ready' && record.balance > 0) {
        showToast(
          `${record.customerName} still owes ₦${record.balance.toLocaleString()} — ask for it at collection.`,
          'warning',
        );
      }
    } finally {
      setStageBusy(null);
    }
  }, [store.accessCode]);

  const settleAndCollect = (record: DecoratedRecord) => {
    collectPayment(record);
    setCollectGuard(null);
    changeStage(record, 'collected', true);
  };

  return (
    <div className="space-y-4 pt-1">
      {collectGuard && (
        <div
          className="fixed inset-0 z-[90] bg-background/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setCollectGuard(null)}
          role="dialog"
          aria-label="Money still owed"
        >
          <div
            className="w-full sm:max-w-sm rounded-3xl bg-card border border-border p-5 space-y-4 text-left"
            onClick={event => event.stopPropagation()}
          >
            <div>
              <p className="text-[10px] uppercase font-black tracking-wider text-destructive">Before you hand it over</p>
              <h3 className="font-display font-black text-lg leading-tight mt-0.5">
                {collectGuard.customerName} still owes ₦{collectGuard.balance.toLocaleString()}
              </h3>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {collectGuard.tagCode} · {collectGuard.serviceName} · ₦{collectGuard.total.toLocaleString()} total
              </p>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => settleAndCollect(collectGuard)}
                className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm active:scale-95 transition"
              >
                Take ₦{collectGuard.balance.toLocaleString()} and collect
              </button>
              <button
                type="button"
                onClick={() => { const record = collectGuard; setCollectGuard(null); changeStage(record, 'collected', true); }}
                className="w-full h-11 rounded-xl bg-surface-2 border border-border font-display font-bold text-sm active:scale-95 transition"
              >
                Hand over unpaid
              </button>
              <button
                type="button"
                onClick={() => setCollectGuard(null)}
                className="w-full h-10 rounded-xl text-xs font-display font-bold text-muted-foreground hover:text-foreground transition"
              >
                Cancel
              </button>
            </div>

            <p className="text-[10px] text-muted-foreground leading-snug">
              Handing it over unpaid keeps the ₦{collectGuard.balance.toLocaleString()} on their account and in Money Owed.
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-primary font-black">Laundry workspace</p>
          <h1 className="font-display font-black text-xl mt-0.5">{view === 'record' ? 'Record Laundry' : view === 'runs' ? 'Runs' : 'Laundry Records'}</h1>
          {view === 'records' && (
            <p className="text-xs text-muted-foreground mt-1">Search by tag, customer or item.</p>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <button data-guide="record-job" onClick={() => changeView('record')} className={`px-3 py-2 rounded-xl border text-xs font-display font-bold flex items-center gap-1.5 ${view === 'record' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
            <Plus className="w-3.5 h-3.5" /> Record Laundry
          </button>
          <button onClick={() => changeView('records')} className={`px-3 py-2 rounded-xl border text-xs font-display font-bold flex items-center gap-1.5 ${view === 'records' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
            <ClipboardList className="w-3.5 h-3.5" /> Records
          </button>
          {runCount > 0 && (
            <button onClick={() => changeView('runs')} className={`px-3 py-2 rounded-xl border text-xs font-display font-bold flex items-center gap-1.5 ${view === 'runs' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
              <Bike className="w-3.5 h-3.5" /> Runs · {runCount}
            </button>
          )}
        </div>
      </div>

      {view === 'record' ? (
        // No explainer card here: the tag rule is stated on the receipt at the
        // moment it matters, and this screen exists to record a bundle, not to
        // describe one.
        <>
          <LaundryWalkInIntake store={store} onUpdate={onUpdate} currentUser={currentUser} onRecorded={setJustRecorded} />

          {/*
            Recording a bundle used to leave no trace on this screen. The
            receipt closed, the form emptied, and the only proof it had worked
            was on another tab. These are the day's bundles, newest first, so
            the answer to "did that save?" is already on the screen you land
            back on.
          */}
          {recordedToday.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] uppercase font-black text-muted-foreground">
                  Taken in today · {recordedToday.length}
                </p>
                <button
                  onClick={() => changeView('records')}
                  className="text-[11px] font-display font-black text-primary active:scale-95 transition"
                >
                  See all
                </button>
              </div>
              {recordedToday.slice(0, 4).map(record => (
                <button
                  key={record.order.id}
                  onClick={() => { setJustRecorded(record.clientRef); changeView('records'); }}
                  className={`w-full text-left rounded-xl border bg-card px-3 py-2.5 flex items-center gap-3 active:scale-[0.99] transition ${
                    justRecorded === record.clientRef ? 'border-primary' : 'border-border'
                  }`}
                >
                  <span className="font-mono font-black text-sm tracking-[0.1em] text-primary shrink-0">{record.tagCode}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-display font-bold truncate">{record.customerName}</span>
                    <span className="block text-[10px] text-muted-foreground truncate">
                      {record.pieceCount ? `${record.pieceCount} ${record.pieceCount === 1 ? 'piece' : 'pieces'}` : record.serviceName}
                      {record.shelfLocation ? ` · ${record.shelfLocation}` : ''}
                    </span>
                  </span>
                  {record.balance > 0 && (
                    <span className="text-[10px] font-black text-amber-500 shrink-0">
                      ₦{record.balance.toLocaleString()}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      ) : view === 'runs' ? (
        <LaundryRuns store={store} canSeeMoney={can(currentUser, 'money')} />
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
          <div className="relative h-11 flex-1 min-w-0 rounded-xl bg-surface-2 border border-border flex items-center px-3.5">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search tag, customer, phone, service or clothes..."
              className="w-full bg-transparent border-0 outline-none px-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            {search && (
              <button onClick={() => setSearch('')} className="p-1 rounded-lg hover:bg-card shrink-0" aria-label="Clear search">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <RecordedByFilter records={decorated} selected={recordedBy} onSelect={setRecordedBy} />
          <button
            onClick={() => {
              const next = sortMode === 'urgent' ? 'newest' : 'urgent';
              setSortMode(next);
              try { localStorage.setItem(SORT_KEY, next); } catch { /* a preference is not worth an error */ }
            }}
            className="h-11 px-2.5 rounded-xl bg-surface-2 border border-border flex items-center gap-1 shrink-0 active:scale-95 transition"
            title={sortMode === 'urgent' ? 'Sorted by what needs attention. Tap for newest first.' : 'Sorted newest first. Tap for what needs attention.'}
            aria-label={sortMode === 'urgent' ? 'Sorted by urgency' : 'Sorted newest first'}
          >
            {sortMode === 'urgent'
              ? <AlertTriangle className="w-3.5 h-3.5 text-primary shrink-0" />
              : <Clock className="w-3.5 h-3.5 text-primary shrink-0" />}
            <span className="text-[10px] font-display font-black text-muted-foreground">
              {sortMode === 'urgent' ? 'Urgent' : 'New'}
            </span>
          </button>
          </div>

          {/* One row, equal columns. Five separate pills wrapped onto a second
              line and read as clutter; a segmented control always fits. */}
          <div className="grid grid-cols-5 gap-1 rounded-xl border border-border bg-surface-2 p-1">
            {FILTERS.map(option => {
              const count = counts[option.id];
              const active = filter === option.id;
              const isOverdue = option.id === 'overdue' && count > 0;
              return (
                <button
                  key={option.id}
                  onClick={() => setFilter(option.id)}
                  className={`rounded-lg py-1.5 px-0.5 text-center transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : isOverdue
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  }`}
                >
                  <span className="block text-[10px] font-display font-bold leading-none truncate">{option.label}</span>
                  <span className="block mt-1 text-sm font-display font-black tabular-nums leading-none">{count}</span>
                </button>
              );
            })}
          </div>

          {visibleRecords.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"><ClipboardList className="w-5 h-5 text-primary" /></div>
              <p className="font-display font-black mt-3">
                {debouncedSearch ? 'No matching laundry record' : filter === 'all' ? 'No laundry recorded yet' : `Nothing ${FILTERS.find(f => f.id === filter)?.label.toLowerCase()}`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {debouncedSearch
                  ? 'Try another tag or customer detail.'
                  : filter === 'all'
                    ? 'Use Record Laundry when a customer brings clothes to the shop.'
                    : 'Switch to All to see every laundry bundle.'}
              </p>
              {!debouncedSearch && filter === 'all' && <button onClick={() => changeView('record')} className="mt-4 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black">Record First Laundry</button>}
              {(debouncedSearch || filter !== 'all') && (
                <button onClick={() => { setSearch(''); setFilter('all'); }} className="mt-4 px-4 py-2.5 rounded-xl border border-border bg-surface-2 text-xs font-display font-black">Clear filters</button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleRecords.map(record => {
                const next = nextLaundryStage(record.stage);
                const busy = stageBusy === record.key;

                return (
                  <div
                    key={record.order.id}
                    data-client-ref={record.clientRef}
                    className={`rounded-2xl border bg-card p-4 text-left transition-colors duration-500 ${
                      justRecorded && record.clientRef === justRecorded
                        ? 'border-primary ring-2 ring-primary/40'
                        : record.overdue ? 'border-destructive/40' : 'border-border'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-black text-xl tracking-[0.12em] text-primary">{record.tagCode}</span>
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black capitalize">{record.statusLabel}</span>
                          {/* Was "Overdue", identical on every late bundle, or
                              the full toLocaleString of the promised time.
                              Neither told an attendant which bundle to pick up
                              first on a busy morning. */}
                          {record.due && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              record.due.tone === 'late'
                                ? 'bg-destructive/10 text-destructive'
                                : record.due.tone === 'soon'
                                  ? 'bg-amber-500/10 text-amber-500'
                                  : 'bg-surface-3 text-muted-foreground'
                            }`}>
                              {record.due.text}
                            </span>
                          )}
                          {/* What is still owed, where the attendant looks
                              before handing clothes over. */}
                          {record.balance > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 text-[10px] font-black">
                              ₦{record.balance.toLocaleString()} owing
                            </span>
                          )}
                          {record.shelfLocation && (
                            <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-500 text-[10px] font-black inline-flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> {record.shelfLocation}
                            </span>
                          )}
                          {record.synced
                            ? <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10px] font-black">Synced</span>
                            : <span className="px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-black">Not synced</span>}
                        </div>
                        <p className="font-display font-black text-sm mt-2">{record.customerName}</p>
                        {recordedByLabel(record) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Taken in by <span className="text-foreground font-semibold">{recordedByLabel(record)}</span>
                            {record.recordedByRole ? ` · ${record.recordedByRole}` : ''}
                          </p>
                        )}
                        {record.customerPhone && <p className="text-xs text-muted-foreground mt-0.5">{record.customerPhone}</p>}
                      </div>
                      <div className="sm:text-right shrink-0">
                        <p className="font-display font-black text-base">₦{record.total.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{record.createdAt ? new Date(record.createdAt).toLocaleString() : ''}</p>
                      </div>
                    </div>

                    {/* One line of plain text. These were three bordered boxes
                        that stacked into three more rows on a phone, which is
                        a lot of furniture for three short facts. */}
                    <p className="mt-2 text-xs text-muted-foreground">
                      <span className="font-bold text-foreground">{record.serviceName}</span>
                      {record.pieceCount ? ` · ${record.pieceCount} ${record.pieceCount === 1 ? 'piece' : 'pieces'}` : ''}
                      {record.garmentSummary ? ` · ${record.garmentSummary}` : ''}
                    </p>

                    <div className="mt-2">
                      <BundlePhotos clientRef={record.clientRef} accessCode={String((store as any).accessCode || '')} hint={false} />
                    </div>

                    {(record.address || record.washMethod || record.dryMethod) && (
                      <div className="mt-2 rounded-xl border border-border/60 bg-surface-2 p-2.5 text-xs text-muted-foreground">
                        {record.address && <p><b className="text-foreground">Address:</b> {record.address}</p>}
                        {(record.washMethod || record.dryMethod) && <p className="mt-1"><b className="text-foreground">Processing:</b> {record.washMethod || 'Not assigned'} · {record.dryMethod || 'Not assigned'}</p>}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {next && (
                        <button
                          onClick={() => changeStage(record, next.id)}
                          disabled={busy}
                          className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black disabled:opacity-40"
                        >
                          {busy ? 'Saving…' : `Mark ${next.label}`}
                        </button>
                      )}

                      {/* Straight to Ready.
                          The chain is Received, Washing, Drying, Ironing,
                          Folding, Ready — five taps to get a bundle to the
                          point a customer can collect it. A shop that only
                          washes and irons still had to walk through Drying and
                          Folding, or find the stage dropdown and work out that
                          it jumps. This is the stage that changes what anyone
                          can do next, so it gets its own button. */}
                      {!LAUNDRY_SETTLED_STAGES.includes(record.stage) && next?.id !== 'ready' && (
                        <button
                          onClick={() => changeStage(record, 'ready')}
                          disabled={busy}
                          className="h-10 px-4 rounded-xl border border-primary/40 bg-primary/10 text-primary text-xs font-display font-black disabled:opacity-40"
                        >
                          Ready
                        </button>
                      )}

                      {record.balance > 0 && (
                        <button
                          onClick={() => collectPayment(record)}
                          disabled={busy}
                          className="h-10 px-4 rounded-xl bg-amber-500 text-black text-xs font-display font-black disabled:opacity-40"
                        >
                          Take ₦{record.balance.toLocaleString()}
                        </button>
                      )}

                      {record.whatsapp && (
                        <button onClick={() => sendWhatsApp(record.order)} className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-xs font-display font-black flex items-center justify-center gap-2">
                          <MessageCircle className="w-4 h-4" /> WhatsApp {record.whatsapp.kind === 'ready' ? 'Ready' : record.whatsapp.kind === 'reminder' ? 'Reminder' : record.whatsapp.kind === 'processing' ? 'Update' : record.whatsapp.kind === 'completed' ? 'Thank You' : 'Receipt'}
                        </button>
                      )}

                      {/* Was a bare dropdown showing the current stage, which
                          reads as a label rather than something to change. */}
                      <label className="text-[10px] text-muted-foreground font-bold" htmlFor={`stage-${record.key}`}>Stage</label>
                      <select
                        id={`stage-${record.key}`}
                        value={record.stage}
                        disabled={busy}
                        onChange={event => changeStage(record, event.target.value as LaundryWorkflowStage)}
                        className="h-10 rounded-xl border border-border bg-surface-2 px-3 text-xs font-bold outline-none focus:border-primary disabled:opacity-50"
                      >
                        {LAUNDRY_WORKFLOW_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card">
            <button
              onClick={() => setShowEquipment(current => !current)}
              className="w-full flex items-center justify-between gap-3 p-4 text-left"
            >
              <span className="font-display font-black text-sm">Machines & methods</span>
              {showEquipment ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showEquipment && (
              <div className="px-4 pb-4">
                {/* Every record, not visibleRecords. Machine usage was counted from
                    whatever the search box and filter tabs happened to be showing,
                    so filtering to Ready made most machines look idle. */}
                <LaundryEquipmentPanel store={store} orders={decorated.map(record => record.order)} onUpdate={onUpdate} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
