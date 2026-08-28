import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, Loader2, Pause, Play, Plus, RefreshCw, Square, UserRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { showToast } from '@/components/Toast';

interface Props { storeId: string; }

type ServiceOrder = {
  id: string;
  order_number?: string;
  status?: string;
  customer_name?: string;
  customer_phone?: string;
  total?: number | string;
  created_at: string;
  notes?: string;
  order_items?: Array<{ product_id: string; quantity: number | string; price: number | string }>;
  session_started_at?: string | null;
  session_paused_at?: string | null;
  session_seconds?: number | null;
  session_duration_minutes?: number | null;
};

function notesFor(order: ServiceOrder) {
  try { return order.notes ? JSON.parse(order.notes) : {}; } catch { return {}; }
}

function itemsFor(order: ServiceOrder) {
  const notes = notesFor(order);
  if (Array.isArray(notes.items_summary)) return notes.items_summary;
  return (order.order_items || []).map(i => ({ name: i.product_id, quantity: i.quantity, price: i.price }));
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function ServiceOrders({ storeId }: Props) {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const { data, error } = await supabase.from('orders').select('id,order_number,status,customer_name,customer_phone,total,created_at,notes,order_items(product_id,quantity,price)').eq('store_id', storeId).order('created_at', { ascending: false }).limit(100);
    if (error) showToast(error.message || 'Could not load service requests', 'error');
    setOrders((data || []) as ServiceOrder[]);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const channel = supabase.channel(`service-orders-${storeId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` }, () => { void load(); })
      .subscribe();
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [storeId, load]);

  const pending = useMemo(() => orders.filter(o => !['Completed', 'Cancelled', 'Rejected'].includes(String(o.status))), [orders]);

  const run = async (order: ServiceOrder, action: 'accept' | 'start' | 'pause' | 'resume' | 'add' | 'complete') => {
    setWorking(order.id);
    try {
      let error: any = null;
      if (action === 'accept') {
        ({ error } = await supabase.from('orders').update({ status: 'Accepted' }).eq('id', order.id).eq('store_id', storeId));
      } else {
        const fn: Record<string, string> = { start: 'service_order_start', pause: 'service_order_pause', resume: 'service_order_resume', add: 'service_order_add_time', complete: 'service_order_complete' };
        const args: any = { p_order_id: order.id };
        if (action === 'add') args.p_minutes = 30;
        ({ error } = await supabase.rpc(fn[action], args));
      }
      if (error) throw error;
      await load();
      showToast(action === 'add' ? 'Added 30 minutes' : action === 'complete' ? 'Session completed' : action === 'accept' ? 'Service request accepted' : `${action.charAt(0).toUpperCase() + action.slice(1)} successful`);
    } catch (e: any) {
      showToast(e?.message || 'Action failed', 'error');
    } finally { setWorking(null); }
  };

  const elapsed = (order: ServiceOrder) => {
    if (!order.session_started_at) return 0;
    const start = new Date(order.session_started_at).getTime();
    const paused = Number(order.session_seconds || 0);
    if (order.session_paused_at) return paused;
    return paused + Math.max(0, Math.floor((now - start) / 1000));
  };

  return (
    <section className="bg-card border border-border rounded-2xl p-4 md:p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary font-bold">Customer requests</p>
          <h2 className="font-display font-black text-lg mt-1">Service Orders {pending.length > 0 ? `· ${pending.length}` : ''}</h2>
          <p className="text-xs text-muted-foreground mt-1">Orders from the customer app appear here in real time.</p>
        </div>
        <button onClick={() => void load()} className="w-9 h-9 rounded-xl border border-border bg-background flex items-center justify-center" title="Refresh"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {loading && orders.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading requests…</div> : pending.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No active service requests.</div> : (
        <div className="space-y-3">
          {pending.map(order => {
            const status = String(order.status || 'Pending');
            const running = status === 'In Progress' || status === 'Active' || status === 'Started';
            const paused = status === 'Paused';
            const accepted = status === 'Accepted';
            const items = itemsFor(order);
            const duration = Number(order.session_duration_minutes || 0);
            const remaining = duration > 0 ? Math.max(0, duration * 60 - elapsed(order)) : null;
            return (
              <div key={order.id} className="rounded-2xl border border-border bg-surface-2/30 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="font-display font-bold">#{order.order_number || order.id.slice(0, 8)}</span><span className="text-[10px] px-2 py-1 rounded-full bg-primary/10 text-primary font-bold">{status}</span></div>
                    <p className="text-sm mt-1 flex items-center gap-1.5"><UserRound className="w-3.5 h-3.5 text-muted-foreground" />{order.customer_name || 'Customer'}</p>
                  </div>
                  <p className="font-display font-black text-primary">₦{Number(order.total || 0).toLocaleString()}</p>
                </div>
                <div className="space-y-1 text-sm">{items.map((item: any, i: number) => <div key={`${item.name}-${i}`} className="flex justify-between gap-3"><span>{item.name} × {item.quantity}</span><span className="text-muted-foreground">₦{Number(item.price || 0).toLocaleString()}</span></div>)}</div>
                {running || paused ? <div className="rounded-xl bg-background border border-border p-3 text-center"><Clock3 className="w-4 h-4 mx-auto text-primary" /><p className="font-mono font-black text-2xl mt-1">{remaining === null ? formatTime(elapsed(order)) : formatTime(remaining)}</p>{remaining !== null && <p className="text-[10px] text-muted-foreground">time remaining</p>}</div> : null}
                <div className="flex flex-wrap gap-2">
                  {status === 'Pending' && <button disabled={working === order.id} onClick={() => void run(order, 'accept')} className="flex-1 min-w-[120px] px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2"><Check className="w-4 h-4" />Accept</button>}
                  {accepted && <button disabled={working === order.id} onClick={() => void run(order, 'start')} className="flex-1 min-w-[120px] px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2"><Play className="w-4 h-4" />Start Session</button>}
                  {running && <><button disabled={working === order.id} onClick={() => void run(order, 'pause')} className="px-3 py-2.5 rounded-xl bg-background border border-border text-sm font-bold flex items-center gap-2"><Pause className="w-4 h-4" />Pause</button><button disabled={working === order.id} onClick={() => void run(order, 'add')} className="px-3 py-2.5 rounded-xl bg-background border border-border text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" />+30 min</button></>}
                  {paused && <button disabled={working === order.id} onClick={() => void run(order, 'resume')} className="flex-1 min-w-[120px] px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2"><Play className="w-4 h-4" />Resume</button>}
                  {(running || paused) && <button disabled={working === order.id} onClick={() => void run(order, 'complete')} className="px-3 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold flex items-center gap-2"><Square className="w-4 h-4" />End Session</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
