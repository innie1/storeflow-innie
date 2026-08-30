import { useMemo, useState } from 'react';
import type { LaundryEquipment, LaundryEquipmentKind, StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';
import { Plus, Power } from 'lucide-react';

interface Props {
  store: StoreData;
  orders: any[];
  onUpdate: (store: StoreData) => void;
}

const KIND_LABELS: Record<LaundryEquipmentKind, string> = {
  washer: 'Washer', dryer: 'Dryer', washer_dryer: 'Washer + dryer', iron: 'Iron / press', other: 'Other machine',
};

function makeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `equipment-${Date.now().toString(36)}`;
}

export default function LaundryEquipmentPanel({ store, orders, onUpdate }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<LaundryEquipmentKind>('washer');
  const [capacity, setCapacity] = useState('');
  const equipment = store.laundryEquipment || [];

  const usage = useMemo(() => {
    const result = new Map<string, { jobs: number; active: number; lastUsed: string | null }>();
    for (const item of equipment) result.set(item.id, { jobs: 0, active: 0, lastUsed: null });
    result.set('manual:hand-wash', { jobs: 0, active: 0, lastUsed: null });
    result.set('manual:sun-dry', { jobs: 0, active: 0, lastUsed: null });
    for (const order of orders || []) {
      const meta = order?.service_metadata && typeof order.service_metadata === 'object' ? order.service_metadata : {};
      const assignments = [meta.wash_method_id, meta.dry_method_id].filter(Boolean).map(String);
      for (const id of new Set(assignments)) {
        const current = result.get(id) || { jobs: 0, active: 0, lastUsed: null };
        current.jobs += 1;
        if (['washing', 'drying'].includes(String(order.workflow_stage || '').toLowerCase())) current.active += 1;
        const usedAt = String(order.updated_at || order.created_at || '');
        if (usedAt && (!current.lastUsed || new Date(usedAt) > new Date(current.lastUsed))) current.lastUsed = usedAt;
        result.set(id, current);
      }
    }
    return result;
  }, [equipment, orders]);

  const persist = (nextEquipment: LaundryEquipment[]) => {
    const next = { ...store, laundryEquipment: nextEquipment };
    saveStore(next);
    onUpdate(next);
  };

  const add = () => {
    const clean = name.trim();
    if (!clean) return;
    persist([...equipment, { id: makeId(), name: clean, kind, capacity: capacity.trim() || undefined, active: true, createdAt: new Date().toISOString() }]);
    setName('');
    setCapacity('');
    setShowAdd(false);
  };

  const toggle = (id: string) => persist(equipment.map(item => item.id === id ? { ...item, active: !item.active } : item));
  const allRows = [
    ...equipment.map(item => ({ ...item, label: KIND_LABELS[item.kind] })),
    { id: 'manual:hand-wash', name: 'Hand wash', kind: 'other' as const, active: true, createdAt: '', label: 'Manual method' },
    { id: 'manual:sun-dry', name: 'Sun dry', kind: 'other' as const, active: true, createdAt: '', label: 'Natural drying' },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-left">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[11px] font-black uppercase text-primary">Machines & methods</p><h2 className="mt-1 font-display font-black">Laundry equipment usage</h2><p className="mt-1 text-xs text-muted-foreground">Assign the exact washer, dryer, hand-wash or sun-dry method when recording each job.</p></div>
        <button type="button" onClick={() => setShowAdd(value => !value)} className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground"><Plus className="h-3.5 w-3.5" /> Machine</button>
      </div>

      {showAdd && <div className="mt-4 grid gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:grid-cols-2">
        <input aria-label="Machine name" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Washer 1" className="rounded-xl border border-border bg-background p-3 text-sm" />
        <select aria-label="Machine type" value={kind} onChange={event => setKind(event.target.value as LaundryEquipmentKind)} className="rounded-xl border border-border bg-background p-3 text-sm">{Object.entries(KIND_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <input aria-label="Machine capacity" value={capacity} onChange={event => setCapacity(event.target.value)} placeholder="Capacity (optional), e.g. 12 kg" className="rounded-xl border border-border bg-background p-3 text-sm" />
        <button type="button" onClick={add} className="rounded-xl bg-primary p-3 text-sm font-black text-primary-foreground">Save machine</button>
      </div>}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {allRows.map(item => {
          const stats = usage.get(item.id) || { jobs: 0, active: 0, lastUsed: null };
          const builtIn = item.id.startsWith('manual:');
          return <div key={item.id} className={`rounded-xl border p-3 ${item.active ? 'border-border bg-surface-2' : 'border-border opacity-50'}`}>
            <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-black">{item.name}</p><p className="text-[10px] text-muted-foreground">{item.label}{'capacity' in item && item.capacity ? ` · ${item.capacity}` : ''}</p></div>{!builtIn && <button type="button" title={item.active ? 'Disable' : 'Enable'} onClick={() => toggle(item.id)} className="rounded-lg border border-border p-2"><Power className="h-3.5 w-3.5" /></button>}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center"><div className="rounded-lg bg-background p-2"><p className="text-lg font-black">{stats.jobs}</p><p className="text-[9px] uppercase text-muted-foreground">Jobs assigned</p></div><div className="rounded-lg bg-background p-2"><p className="text-lg font-black">{stats.active}</p><p className="text-[9px] uppercase text-muted-foreground">In use now</p></div></div>
            {stats.lastUsed && <p className="mt-2 text-[10px] text-muted-foreground">Last activity: {new Date(stats.lastUsed).toLocaleString()}</p>}
          </div>;
        })}
      </div>
    </section>
  );
}
