import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { ChevronDown, ChevronUp, ClipboardList, MessageCircle, Plus, Search, X } from 'lucide-react';
import LaundryEquipmentPanel from '@/components/laundry/LaundryEquipmentPanel';
import { getPromisedTime } from '@/lib/business-insights';

interface Props {
  store: StoreData;
  orders: any[];
  onUpdate: (store: StoreData) => void;
}

type RecordFilter = 'all' | 'active' | 'ready' | 'overdue' | 'collected';

const FILTERS: { id: RecordFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'ready', label: 'Ready' },
  { id: 'active', label: 'In progress' },
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
    address: meta.customer_address || '',
    washMethod: meta.wash_method_name || '',
    dryMethod: meta.dry_method_name || '',
    searchText: getLaundryRecordSearchText(order),
  };
}

/** Overdue first, then whatever the counter is most likely to be asked about. */
function urgencyRank(record: DecoratedRecord): number {
  if (record.overdue) return 0;
  if (record.stage === 'ready') return 1;
  if (record.stage === 'collected') return 3;
  return 2;
}

export default function LaundryWorkspace({ store, orders, onUpdate }: Props) {
  const [view, setView] = useState<LaundryWorkspaceView>(() => consumeLaundryWorkspaceView());
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState<RecordFilter>('all');
  const [showEquipment, setShowEquipment] = useState(false);
  const [localRecords, setLocalRecords] = useState(() => getLocalLaundryRecords(store.accessCode));
  const [stageBusy, setStageBusy] = useState<string | null>(null);

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

  const visibleRecords = useMemo(() => {
    const matchesFilter = (record: DecoratedRecord) => {
      if (filter === 'overdue') return record.overdue;
      if (filter === 'ready') return record.stage === 'ready';
      if (filter === 'active') return !LAUNDRY_SETTLED_STAGES.includes(record.stage);
      if (filter === 'collected') return record.stage === 'collected';
      return true;
    };

    return decorated
      .filter(record => matchesFilter(record) && (!debouncedSearch || record.searchText.includes(debouncedSearch)))
      .sort((a, b) => {
        const rank = urgencyRank(a) - urgencyRank(b);
        if (rank !== 0) return rank;
        if (a.promisedAt !== b.promisedAt) {
          if (a.promisedAt === null) return 1;
          if (b.promisedAt === null) return -1;
          return a.promisedAt - b.promisedAt;
        }
        return b.createdAt - a.createdAt;
      });
  }, [decorated, filter, debouncedSearch]);

  const changeView = (next: LaundryWorkspaceView) => {
    requestLaundryWorkspace(next);
    setView(next);
  };

  const sendWhatsApp = useCallback((order: any) => {
    if (!openLaundryWhatsApp(store, order)) showToast('This laundry record does not have a valid phone number', 'error');
  }, [store]);

  const changeStage = useCallback(async (record: DecoratedRecord, stage: LaundryWorkflowStage) => {
    setStageBusy(record.key);
    try {
      const accepted = await updateLaundryOrderStage(store.accessCode, record.order, stage);
      if (!accepted) {
        showToast('Could not update this laundry stage. Check your connection and try again.', 'error');
        return;
      }
      showToast(`${record.tagCode} marked ${LAUNDRY_WORKFLOW_STAGES.find(item => item.id === stage)?.label || stage}`);
    } finally {
      setStageBusy(null);
    }
  }, [store.accessCode]);

  return (
    <div className="space-y-4 pt-1">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-primary font-black">Laundry workspace</p>
          <h1 className="font-display font-black text-xl mt-0.5">{view === 'record' ? 'Record Laundry' : 'Laundry Records'}</h1>
          {view === 'records' && (
            <p className="text-xs text-muted-foreground mt-1">Find bundles by tag, customer, service or clothing.</p>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          <button onClick={() => changeView('record')} className={`px-3 py-2 rounded-xl border text-xs font-display font-bold flex items-center gap-1.5 ${view === 'record' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
            <Plus className="w-3.5 h-3.5" /> Record Laundry
          </button>
          <button onClick={() => changeView('records')} className={`px-3 py-2 rounded-xl border text-xs font-display font-bold flex items-center gap-1.5 ${view === 'records' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground'}`}>
            <ClipboardList className="w-3.5 h-3.5" /> Records
          </button>
        </div>
      </div>

      {view === 'record' ? (
        // No explainer card here: the tag rule is stated on the receipt at the
        // moment it matters, and this screen exists to record a bundle, not to
        // describe one.
        <LaundryWalkInIntake store={store} onUpdate={onUpdate} />
      ) : (
        <div className="space-y-3">
          <div className="relative h-11 rounded-xl bg-surface-2 border border-border flex items-center px-3.5">
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

          <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-0.5">
            {FILTERS.map(option => {
              const count = counts[option.id];
              const active = filter === option.id;
              const isOverdue = option.id === 'overdue' && count > 0;
              return (
                <button
                  key={option.id}
                  onClick={() => setFilter(option.id)}
                  className={`shrink-0 h-8 px-3 rounded-full border text-xs font-display font-bold flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : isOverdue
                        ? 'bg-destructive/5 border-destructive/30 text-destructive'
                        : 'bg-card border-border text-muted-foreground'
                  }`}
                >
                  {option.label}
                  <span className={`px-1.5 rounded-full text-[10px] font-black ${active ? 'bg-primary-foreground/20' : 'bg-surface-2'}`}>{count}</span>
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
                  <div key={record.order.id} className={`rounded-2xl border bg-card p-4 text-left ${record.overdue ? 'border-destructive/40' : 'border-border'}`}>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-black text-xl tracking-[0.12em] text-primary">{record.tagCode}</span>
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black capitalize">{record.statusLabel}</span>
                          {record.promisedAt !== null && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${record.overdue ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-500'}`}>
                              {record.overdue ? 'Overdue' : `Due ${new Date(record.promisedAt).toLocaleString()}`}
                            </span>
                          )}
                          {record.synced
                            ? <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10px] font-black">Synced</span>
                            : <span className="px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-black">Not synced</span>}
                        </div>
                        <p className="font-display font-black text-sm mt-2">{record.customerName}</p>
                        {record.customerPhone && <p className="text-xs text-muted-foreground mt-0.5">{record.customerPhone}</p>}
                      </div>
                      <div className="sm:text-right shrink-0">
                        <p className="font-display font-black text-base">₦{record.total.toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{record.createdAt ? new Date(record.createdAt).toLocaleString() : ''}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                      <div className="rounded-xl bg-surface-2 border border-border/60 p-2.5"><p className="text-[9px] uppercase font-black text-muted-foreground">Treatment</p><p className="text-xs font-bold mt-1">{record.serviceName}</p></div>
                      <div className="rounded-xl bg-surface-2 border border-border/60 p-2.5"><p className="text-[9px] uppercase font-black text-muted-foreground">Pieces</p><p className="text-xs font-bold mt-1">{record.pieceCount || '—'}</p></div>
                      <div className="rounded-xl bg-surface-2 border border-border/60 p-2.5"><p className="text-[9px] uppercase font-black text-muted-foreground">Clothes</p><p className="text-xs font-bold mt-1 break-words">{record.garmentSummary || 'Not listed'}</p></div>
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

                      {record.whatsapp && (
                        <button onClick={() => sendWhatsApp(record.order)} className="h-10 px-4 rounded-xl bg-emerald-600 text-white text-xs font-display font-black flex items-center justify-center gap-2">
                          <MessageCircle className="w-4 h-4" /> WhatsApp {record.whatsapp.kind === 'ready' ? 'Ready' : record.whatsapp.kind === 'reminder' ? 'Reminder' : record.whatsapp.kind === 'processing' ? 'Update' : record.whatsapp.kind === 'completed' ? 'Thank You' : 'Receipt'}
                        </button>
                      )}

                      <label className="sr-only" htmlFor={`stage-${record.key}`}>Laundry status</label>
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
                <LaundryEquipmentPanel store={store} orders={visibleRecords.map(record => record.order)} onUpdate={onUpdate} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
