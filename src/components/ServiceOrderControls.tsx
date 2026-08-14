import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { showToast } from '@/components/Toast';
import { Play, Pause, Plus, CheckCircle2, Timer } from 'lucide-react';

interface Props {
  order: any;
  store: any;
  normStatus: string;
  meta: any;
  onUpdateOrderStatus: (orderId: string, status: string, metadata?: any) => void;
}

type Workflow = {
  mode?: 'job' | 'session' | 'appointment';
  requiresStart?: boolean;
  timer?: boolean;
  allowPause?: boolean;
  allowAddTime?: boolean;
  durationMinutes?: number;
};

function getWorkflow(order: any, store: any): Workflow {
  const item = (order.order_items || []).find((i: any) => store.products?.find((p: any) => String(p.id) === String(i.product_id) && p.isService));
  const product = item ? store.products?.find((p: any) => String(p.id) === String(item.product_id)) : null;
  return product?.serviceWorkflow || {};
}

function readSession(meta: any) {
  const s = meta?.serviceSession || {};
  return {
    status: s.status || 'running',
    startedAt: s.started_at ? new Date(s.started_at).getTime() : 0,
    elapsed: Number(s.elapsed_seconds || 0),
    addedMinutes: Number(s.added_minutes || 0),
  };
}

export default function ServiceOrderControls({ order, store, normStatus, meta, onUpdateOrderStatus }: Props) {
  const workflow = useMemo(() => getWorkflow(order, store), [order, store]);
  const isService = (order.order_items || []).some((i: any) => store.products?.some((p: any) => String(p.id) === String(i.product_id) && p.isService));
  const [now, setNow] = useState(Date.now());
  const session = readSession(meta);

  useEffect(() => {
    if (!isService || normStatus !== 'In Progress' || !workflow.timer || session.status !== 'running') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isService, normStatus, workflow.timer, session.status]);

  if (!isService) return null;

  const elapsedSeconds = session.elapsed + (session.status === 'running' && session.startedAt ? Math.max(0, (now - session.startedAt) / 1000) : 0);
  const targetSeconds = workflow.timer && workflow.durationMinutes ? (workflow.durationMinutes + session.addedMinutes) * 60 : null;
  const remainingSeconds = targetSeconds == null ? null : Math.max(0, targetSeconds - elapsedSeconds);
  const minutes = Math.floor((remainingSeconds ?? elapsedSeconds) / 60);
  const seconds = Math.floor((remainingSeconds ?? elapsedSeconds) % 60);
  const timerText = `${minutes}:${String(seconds).padStart(2, '0')}`;

  const callRpc = async (fn: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.rpc(fn as any, { p_order_id: order.id, ...args } as any);
    if (error) {
      showToast(error.message || 'Could not update service session', 'error');
      return false;
    }
    return data;
  };

  const start = async () => {
    const data = await callRpc('service_order_start');
    if (data) onUpdateOrderStatus(order.id, 'In Progress', { serviceSession: data.serviceSession || data });
  };

  const pause = async () => {
    const data = await callRpc('service_order_pause');
    if (data) onUpdateOrderStatus(order.id, 'In Progress', { serviceSession: data.serviceSession || data });
  };

  const resume = async () => {
    const data = await callRpc('service_order_resume');
    if (data) onUpdateOrderStatus(order.id, 'In Progress', { serviceSession: data.serviceSession || data });
  };

  const addTime = async () => {
    const raw = window.prompt('Add how many minutes?', '30');
    if (raw == null) return;
    const minutesToAdd = Number(raw);
    if (!Number.isFinite(minutesToAdd) || minutesToAdd <= 0) {
      showToast('Enter a valid number of minutes', 'error');
      return;
    }
    const data = await callRpc('service_order_add_time', { p_minutes: Math.round(minutesToAdd) });
    if (data) onUpdateOrderStatus(order.id, 'In Progress', { serviceSession: data.serviceSession || data });
  };

  const complete = async () => {
    const data = await callRpc('service_order_complete');
    if (data) onUpdateOrderStatus(order.id, 'Completed', { serviceSession: data.serviceSession || data });
  };

  if (normStatus === 'Accepted') {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/30">
        <button onClick={start} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold flex items-center gap-1.5 active:scale-95">
          <Play className="w-3.5 h-3.5" /> {workflow.mode === 'session' ? 'Start Session' : workflow.mode === 'appointment' ? 'Start Appointment' : 'Start Service'}
        </button>
      </div>
    );
  }

  if (normStatus !== 'In Progress') return null;

  return (
    <div className="pt-2 border-t border-border/30 space-y-2">
      {workflow.timer && (
        <div className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${remainingSeconds === 0 ? 'border-red-500/40 bg-red-500/5' : 'border-primary/20 bg-primary/5'}`}>
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-primary" />
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{session.status === 'paused' ? 'Session paused' : remainingSeconds === 0 ? 'Time complete' : 'Session running'}</p>
              <p className="font-mono font-black text-xl text-primary">{timerText}</p>
            </div>
          </div>
          {remainingSeconds === 0 && <span className="text-[10px] font-bold text-red-500">Time is up</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {workflow.allowPause && session.status === 'running' && (
          <button onClick={pause} className="px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-xs font-bold flex items-center gap-1.5 active:scale-95"><Pause className="w-3.5 h-3.5" /> Pause</button>
        )}
        {workflow.allowPause && session.status === 'paused' && (
          <button onClick={resume} className="px-3 py-1.5 rounded-lg border border-primary/30 text-primary bg-primary/5 text-xs font-bold flex items-center gap-1.5 active:scale-95"><Play className="w-3.5 h-3.5" /> Resume</button>
        )}
        {workflow.allowAddTime && (
          <button onClick={addTime} className="px-3 py-1.5 rounded-lg border border-border bg-surface-2 text-xs font-bold flex items-center gap-1.5 active:scale-95"><Plus className="w-3.5 h-3.5" /> Add Time</button>
        )}
        <button onClick={complete} className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold flex items-center gap-1.5 active:scale-95"><CheckCircle2 className="w-3.5 h-3.5" /> Complete</button>
      </div>
    </div>
  );
}
