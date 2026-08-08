import { useState } from 'react';
import { StoreData, Product } from '@/types/store';
import { addProduct, updateProduct, deleteProduct, generateId } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { Plus, Pencil, Trash2, X, Clock, Power } from 'lucide-react';

interface ServicesProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  currentUser?: { name?: string; role?: string };
}

const TURNAROUND_OPTIONS = ['Same day', '24 hours', '48 hours', '3 days', '1 week'];

interface ServiceDraft {
  name: string;
  price: string;
  turnaround: string;
}

const emptyDraft = (): ServiceDraft => ({ name: '', price: '', turnaround: TURNAROUND_OPTIONS[0] });

export default function Services({ store, onUpdate, currentUser }: ServicesProps) {
  const services = store.products.filter(p => p.isService);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServiceDraft>(emptyDraft());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openNew = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setShowForm(true);
  };

  const openEdit = (s: Product) => {
    setEditingId(s.id);
    setDraft({ name: s.name, price: String(s.sellingPrice), turnaround: s.turnaround || TURNAROUND_OPTIONS[0] });
    setShowForm(true);
  };

  const save = () => {
    const name = draft.name.trim();
    const price = Number(draft.price);
    if (!name) return showToast('Enter a service name', 'error');
    if (!(price > 0)) return showToast('Enter a valid price', 'error');

    if (editingId) {
      const updated = updateProduct(store, editingId, { name, sellingPrice: price, turnaround: draft.turnaround }, currentUser?.name, currentUser?.role);
      onUpdate(updated);
      showToast('Service updated');
    } else {
      // Services don't track stock the way physical products do — a large
      // quantity keeps every existing stock-check in the order pipeline
      // (recordSale, cart limits) from ever blocking a service booking.
      const updated = addProduct(store, {
        name,
        costPrice: 0,
        sellingPrice: price,
        quantity: 999999,
        category: 'Service',
        unit: 'load',
        isService: true,
        turnaround: draft.turnaround,
      }, currentUser?.name, currentUser?.role);
      onUpdate(updated);
      showToast('Service added');
    }
    setShowForm(false);
  };

  const toggleEnabled = (s: Product) => {
    const updated = updateProduct(store, s.id, { discontinued: !s.discontinued }, currentUser?.name, currentUser?.role);
    onUpdate(updated);
  };

  const remove = (id: string) => {
    const updated = deleteProduct(store, id, currentUser?.name, currentUser?.role);
    onUpdate(updated);
    setConfirmDeleteId(null);
    showToast('Service removed');
  };

  return (
    <div className="px-4 py-4 max-w-lg mx-auto pb-24">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-black text-xl text-foreground">Services</h2>
          <p className="text-xs text-muted-foreground">What customers see and book when they scan your QR code</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm shrink-0"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {services.length === 0 && (
        <div className="text-center py-16 px-4">
          <p className="text-4xl mb-2">🧺</p>
          <p className="font-display font-bold text-foreground">No services yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add your first one — e.g. "Wash & Iron" at ₦1,500, same day.</p>
        </div>
      )}

      <div className="space-y-2.5">
        {services.map(s => (
          <div
            key={s.id}
            className={`p-3.5 rounded-2xl border bg-surface-2/40 flex items-center gap-3 ${s.discontinued ? 'opacity-50' : 'border-border'}`}
          >
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-sm text-foreground truncate">{s.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground">₦{s.sellingPrice.toLocaleString()}</span>
                {s.turnaround && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3" /> {s.turnaround}
                  </span>
                )}
                {s.discontinued && <span className="text-[10px] font-bold text-destructive uppercase">Disabled</span>}
              </div>
            </div>
            <button onClick={() => toggleEnabled(s)} title={s.discontinued ? 'Enable' : 'Disable'} className="w-8 h-8 flex items-center justify-center text-muted-foreground shrink-0">
              <Power className="w-4 h-4" />
            </button>
            <button onClick={() => openEdit(s)} className="w-8 h-8 flex items-center justify-center text-muted-foreground shrink-0">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={() => setConfirmDeleteId(s.id)} className="w-8 h-8 flex items-center justify-center text-muted-foreground shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 animate-fade-in" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-sm bg-background rounded-t-2xl sm:rounded-2xl p-5 pb-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-bold text-base">{editingId ? 'Edit Service' : 'New Service'}</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[11px] text-muted-foreground uppercase font-bold">Service Name</label>
                <input
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g. Wash & Iron"
                  autoFocus
                  className="w-full px-3.5 py-3 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-muted-foreground uppercase font-bold">Price</label>
                <input
                  value={draft.price}
                  onChange={e => setDraft({ ...draft, price: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="₦"
                  inputMode="numeric"
                  className="w-full px-3.5 py-3 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] text-muted-foreground uppercase font-bold">Turnaround Time</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {TURNAROUND_OPTIONS.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDraft({ ...draft, turnaround: t })}
                      className={`py-2 rounded-lg border text-xs font-display font-semibold ${
                        draft.turnaround === t ? 'bg-primary/10 border-primary text-foreground' : 'bg-surface-2/40 border-border text-muted-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={save}
              className="w-full mt-5 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm"
            >
              {editingId ? 'Save Changes' : 'Add Service'}
            </button>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in px-5" onClick={() => setConfirmDeleteId(null)}>
          <div className="w-full max-w-sm bg-background rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <p className="font-display font-bold text-sm text-foreground">Remove this service?</p>
            <p className="text-xs text-muted-foreground mt-1">Customers won't be able to book it anymore.</p>
            <div className="flex gap-3 mt-4">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm">
                Cancel
              </button>
              <button onClick={() => remove(confirmDeleteId)} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-display font-bold text-sm">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
