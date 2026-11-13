import { useState } from 'react';
import {
  getFlowMemory,
  Supplier,
  addSupplier,
  deleteSupplier,
  legacyFlowMemoryAwaitingOwner,
  claimLegacyFlowMemory,
} from '@/lib/flow-memory';
import { showToast } from '@/components/Toast';
import { Factory, MapPin, X } from 'lucide-react';

// ─── Supplier Panel ───────────────────────────────────────────────────────────
export default function SupplierPanel() {
  const mem = getFlowMemory();
  const [suppliers, setSuppliers] = useState<Supplier[]>(mem.suppliers);
  /** Suppliers and coins from the version where every shop shared one pile. */
  const [legacyWaiting, setLegacyWaiting] = useState(() => legacyFlowMemoryAwaitingOwner());
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', products: '', pricePerUnit: '', unit: '', distance: '', notes: '' });

  const handleAdd = () => {
    if (!form.name.trim()) return showToast('Supplier name required', 'error');
    const s = addSupplier({ name: form.name.trim(), products: form.products.split(',').map(p => p.trim()).filter(Boolean), pricePerUnit: Number(form.pricePerUnit) || 0, unit: form.unit, distance: form.distance, notes: form.notes });
    setSuppliers(prev => [s, ...prev]);
    setAdding(false);
    setForm({ name: '', products: '', pricePerUnit: '', unit: '', distance: '', notes: '' });
    showToast('Supplier added');
  };

  const handleDelete = (id: string) => { deleteSupplier(id); setSuppliers(prev => prev.filter(s => s.id !== id)); showToast('Supplier removed'); };

  return (
    <div className="p-4 rounded-2xl bg-card shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-sm flex items-center gap-1.5"><Factory className="w-4 h-4" /> Suppliers</h3>
        <button onClick={() => setAdding(!adding)} className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground font-display font-bold">+ Add</button>
      </div>

      {/*
        Flow's suppliers and coins used to be one pile shared by every shop on
        this phone. They belong to a shop now, and a pile from that older
        version is left exactly where it is until somebody says whose it is -
        moving it by guesswork would hand one shop another's suppliers.
      */}
      {legacyWaiting && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground leading-snug">
            Suppliers and Flow coins from an older version are still on this phone. Every shop shared them then, so StoreFlow will not guess whose they are.
          </p>
          <button
            type="button"
            onClick={() => {
              if (!claimLegacyFlowMemory()) return;
              setSuppliers(getFlowMemory().suppliers);
              setLegacyWaiting(false);
              showToast('Moved into this shop');
            }}
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-display font-black"
          >
            They belong to this shop
          </button>
        </div>
      )}
      {adding && (
        <div className="space-y-2 p-3 rounded-xl bg-surface-2 border border-border">
          <input placeholder="Supplier name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full p-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary" />
          <input placeholder="Products (comma separated)" value={form.products} onChange={e => setForm(f => ({ ...f, products: e.target.value }))} className="w-full p-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary" />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Price per unit (₦)" type="number" value={form.pricePerUnit} onChange={e => setForm(f => ({ ...f, pricePerUnit: e.target.value }))} className="w-full p-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary" />
            <input placeholder="Unit (e.g. carton)" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full p-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary" />
          </div>
          <input placeholder="Distance (e.g. 2km)" value={form.distance} onChange={e => setForm(f => ({ ...f, distance: e.target.value }))} className="w-full p-2 rounded-lg bg-card border border-border text-sm focus:outline-none focus:border-primary" />
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="flex-1 py-2 rounded-lg bg-card border border-border text-sm">Cancel</button>
            <button onClick={handleAdd} className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold">Save</button>
          </div>
        </div>
      )}
      {suppliers.length === 0 && !adding ? (
        <p className="text-xs text-muted-foreground">No suppliers yet. Add them to compare prices.</p>
      ) : (
        <div className="space-y-2">
          {suppliers.map(s => (
            <div key={s.id} className="p-3 rounded-xl bg-surface-2 border border-border">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-sm">{s.name}</p>
                  {s.products.length > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{s.products.join(', ')}</p>}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {s.pricePerUnit > 0 && <span className="text-[10px] text-primary font-display font-bold">₦{s.pricePerUnit.toLocaleString()} {s.unit ? `/ ${s.unit}` : ''}</span>}
                    {s.distance && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {s.distance}</span>}
                  </div>
                </div>
                <button onClick={() => handleDelete(s.id)} className="text-destructive px-2"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
