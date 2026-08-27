import { useEffect, useMemo, useState } from 'react';
import type { StoreData } from '@/types/store';
import LaundryWalkInIntake from '@/components/laundry/LaundryWalkInIntake';
import {
  consumeLaundryWorkspaceView,
  getLaundryRecordSearchText,
  parseLaundryRecordMetadata,
  requestLaundryWorkspace,
  type LaundryWorkspaceView,
} from '@/lib/laundry-workspace';
import {
  getLocalLaundryRecords,
  LAUNDRY_LOCAL_CHANGED_EVENT,
  LAUNDRY_SYNC_CHANGED_EVENT,
  mergeLaundryRecords,
} from '@/lib/laundry-offline';
import { buildLaundryWhatsAppPayload, openLaundryWhatsApp } from '@/lib/laundry-whatsapp';
import { showToast } from '@/components/Toast';
import { ClipboardList, MessageCircle, Plus, Search, Shirt } from 'lucide-react';

interface Props {
  store: StoreData;
  orders: any[];
  onUpdate: (store: StoreData) => void;
}

export default function LaundryWorkspace({ store, orders, onUpdate }: Props) {
  const [view, setView] = useState<LaundryWorkspaceView>(() => consumeLaundryWorkspaceView());
  const [search, setSearch] = useState('');
  const [localRecords, setLocalRecords] = useState(() => getLocalLaundryRecords(store.accessCode));

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

  const laundryRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mergeLaundryRecords(orders || [], localRecords)
      .filter(order => !query || getLaundryRecordSearchText(order).includes(query));
  }, [orders, localRecords, search]);

  const changeView = (next: LaundryWorkspaceView) => {
    requestLaundryWorkspace(next);
    setView(next);
  };

  const sendWhatsApp = (order: any) => {
    if (!openLaundryWhatsApp(store, order)) showToast('This laundry record does not have a valid phone number', 'error');
  };

  return (
    <div className="space-y-4 pt-1">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-primary font-black">Laundry workspace</p>
          <h1 className="font-display font-black text-xl mt-0.5">{view === 'record' ? 'Record Laundry' : 'Laundry Records'}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {view === 'record'
              ? 'Record clothes brought physically to the shop and generate one shared 6-character tag.'
              : 'Find in-store laundry bundles by tag, customer, service or clothing details.'}
          </p>
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
        <div className="space-y-3">
          <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-sm text-left">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Shirt className="w-4 h-4 text-primary" /></div>
              <div><p className="font-display font-black">One tag for the whole bundle</p><p className="text-xs text-muted-foreground mt-1">StoreFlow generates one 6-character code such as K7M2Q9. Write that same code on every cloth tag belonging to this customer.</p></div>
            </div>
          </div>
          <LaundryWalkInIntake store={store} onUpdate={onUpdate} />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative h-11 rounded-xl bg-surface-2 border border-border flex items-center px-3.5">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search tag, customer, phone, service or clothes..." className="w-full bg-transparent border-0 outline-none px-2 text-sm text-foreground placeholder:text-muted-foreground" />
          </div>

          {laundryRecords.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"><ClipboardList className="w-5 h-5 text-primary" /></div>
              <p className="font-display font-black mt-3">{search ? 'No matching laundry record' : 'No laundry recorded yet'}</p>
              <p className="text-xs text-muted-foreground mt-1">{search ? 'Try another tag or customer detail.' : 'Use Record Laundry when a customer brings clothes to the shop.'}</p>
              {!search && <button onClick={() => changeView('record')} className="mt-4 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-display font-black">Record First Laundry</button>}
            </div>
          ) : (
            <div className="space-y-2.5">
              {laundryRecords.map(order => {
                const meta = parseLaundryRecordMetadata(order);
                const tagCode = String(meta.tag_code || meta.receipt_number || order.order_number || '—').toUpperCase();
                const serviceName = meta.service_name || order.order_items?.find((item: any) => item?.metadata?.charge_line)?.item_name || 'Laundry service';
                const garmentSummary = meta.garment_summary || (order.order_items || [])
                  .filter((item: any) => !item?.metadata?.charge_line)
                  .map((item: any) => `${Number(item.quantity || 0)} ${item.item_name || 'item'}`)
                  .join(', ');
                const pieceCount = Number(meta.garment_count || 0) || (order.order_items || []).filter((item: any) => !item?.metadata?.charge_line).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
                const status = String(order.workflow_stage || order.status || 'Received').replace(/_/g, ' ');
                const synced = order._laundrySyncStatus === 'synced';
                const whatsapp = buildLaundryWhatsAppPayload(store, order);

                return (
                  <div key={order.id} className="rounded-2xl border border-border bg-card p-4 text-left">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-black text-xl tracking-[0.12em] text-primary">{tagCode}</span>
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-black capitalize">{status}</span>
                          {synced ? <span className="px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10px] font-black">Synced</span> : <span className="px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-black">Not synced</span>}
                        </div>
                        <p className="font-display font-black text-sm mt-2">{order.customer_name || 'Walk-in Customer'}</p>
                        {order.customer_phone && <p className="text-xs text-muted-foreground mt-0.5">{order.customer_phone}</p>}
                      </div>
                      <div className="sm:text-right shrink-0"><p className="font-display font-black text-base">₦{Number(order.total || 0).toLocaleString()}</p><p className="text-[10px] text-muted-foreground mt-1">{order.created_at ? new Date(order.created_at).toLocaleString() : ''}</p></div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                      <div className="rounded-xl bg-surface-2 border border-border/60 p-2.5"><p className="text-[9px] uppercase font-black text-muted-foreground">Service</p><p className="text-xs font-bold mt-1">{serviceName}</p></div>
                      <div className="rounded-xl bg-surface-2 border border-border/60 p-2.5"><p className="text-[9px] uppercase font-black text-muted-foreground">Pieces</p><p className="text-xs font-bold mt-1">{pieceCount || '—'}</p></div>
                      <div className="rounded-xl bg-surface-2 border border-border/60 p-2.5"><p className="text-[9px] uppercase font-black text-muted-foreground">Clothes</p><p className="text-xs font-bold mt-1 break-words">{garmentSummary || 'Not listed'}</p></div>
                    </div>

                    {whatsapp && (
                      <button onClick={() => sendWhatsApp(order)} className="mt-3 w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-display font-black flex items-center justify-center gap-2">
                        <MessageCircle className="w-4 h-4" /> WhatsApp {whatsapp.kind === 'ready' ? 'Ready Message' : whatsapp.kind === 'reminder' ? 'Collection Reminder' : whatsapp.kind === 'processing' ? 'Progress Update' : whatsapp.kind === 'completed' ? 'Thank You' : 'Receipt'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
