import { useEffect, useState } from 'react';
import { StoreData, Product } from '@/types/store';
import { addProduct, updateProduct, deleteProduct, saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { getServicePricingLabel, getServicePricingOptions, getStoredServicePricing, serviceUnitForPricing, type ServicePricing } from '@/lib/service-pricing';
import { Plus, Pencil, Trash2, X, Clock, Power, Scale, Tag } from 'lucide-react';

interface ServicesProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  currentUser?: { name?: string; role?: string };
}

const TURNAROUND_OPTIONS = ['Same day', '24 hours', '48 hours', '3 days', '1 week'];

interface ServiceDraft {
  name: string;
  description: string;
  price: string;
  turnaround: string;
  pricing: ServicePricing;
}

function defaultPricing(store: StoreData): ServicePricing {
  return getServicePricingOptions(store)[0]?.id || 'fixed';
}

function emptyDraft(store: StoreData): ServiceDraft {
  return { name: '', description: '', price: '', turnaround: TURNAROUND_OPTIONS[0], pricing: defaultPricing(store) };
}

/** Publish the merchant service catalogue into the cloud store payload consumed by the customer app. */
function syncCustomerServiceCatalog(store: StoreData): StoreData {
  const services = (store.products || [])
    .filter(p => p.isService && !p.discontinued)
    .map(p => {
      const pricing = getStoredServicePricing(p);
      const pricingInfo = getServicePricingLabel(pricing);
      return {
        id: String(p.id),
        name: p.name,
        description: p.description || '',
        price: Number(p.sellingPrice || 0),
        sellingPrice: Number(p.sellingPrice || 0),
        pricing,
        unit: (p as any).unit || undefined,
        unitLabel: pricingInfo.unitLabel,
        turnaround: p.turnaround || '',
        enabled: true,
        active: true,
        discontinued: false,
      };
    });

  const current = ((store as any).businessTemplate || {}) as any;
  const currentModes = Array.isArray(current.modes) ? current.modes : [];
  const nextModes = Array.from(new Set([...currentModes, 'services']));
  const same = JSON.stringify(current.offerings || []) === JSON.stringify(services) && JSON.stringify(currentModes) === JSON.stringify(nextModes);
  if (same) return store;

  return { ...(store as any), businessTemplate: { ...current, modes: nextModes, offerings: services } } as StoreData;
}

function publishServiceCatalog(store: StoreData, onUpdate: (store: StoreData) => void) {
  const synced = syncCustomerServiceCatalog(store);
  if (synced === store) return store;
  saveStore(synced);
  onUpdate(synced);
  return synced;
}

export default function Services({ store, onUpdate, currentUser }: ServicesProps) {
  const services = store.products.filter(p => p.isService);
  const pricingOptions = getServicePricingOptions(store);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServiceDraft>(() => emptyDraft(store));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    publishServiceCatalog(store, onUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.products]);

  const openNew = () => {
    setEditingId(null);
    setDraft(emptyDraft(store));
    setShowForm(true);
  };

  const openEdit = (s: Product) => {
    const pricing = getStoredServicePricing(s);
    setEditingId(s.id);
    setDraft({
      name: s.name,
      description: s.description || '',
      price: String(s.sellingPrice || ''),
      turnaround: s.turnaround || TURNAROUND_OPTIONS[0],
      pricing: pricingOptions.some(o => o.id === pricing) ? pricing : defaultPricing(store),
    });
    setShowForm(true);
  };

  const save = () => {
    const name = draft.name.trim();
    const quoteBased = draft.pricing === 'quote';
    const price = Number(draft.price);
    if (!name) return showToast('Enter a service name', 'error');
    if (!quoteBased && (!(price > 0) || !Number.isFinite(price))) return showToast('Enter a valid price', 'error');

    const unit = serviceUnitForPricing(draft.pricing);
    const serviceData: any = {
      name,
      description: draft.description.trim(),
      costPrice: 0,
      sellingPrice: quoteBased ? 0 : price,
      quantity: 999999,
      category: 'Service',
      unit,
      isService: true,
      turnaround: draft.turnaround,
      servicePricing: draft.pricing,
    };

    let updated: StoreData;
    if (editingId) {
      updated = updateProduct(store, editingId, serviceData, currentUser?.name, currentUser?.role);
      showToast('Service updated');
    } else {
      updated = addProduct(store, serviceData, currentUser?.name, currentUser?.role);
      showToast('Service added');
    }

    publishServiceCatalog(updated, onUpdate);
    setShowForm(false);
  };

  const toggleEnabled = (s: Product) => {
    const updated = updateProduct(store, s.id, { discontinued: !s.discontinued }, currentUser?.name, currentUser?.role);
    publishServiceCatalog(updated, onUpdate);
  };

  const remove = (id: string) => {
    const updated = deleteProduct(store, id, currentUser?.name, currentUser?.role);
    publishServiceCatalog(updated, onUpdate);
    setConfirmDeleteId(null);
    showToast('Service removed');
  };

  const pricingText = (s: Product) => {
    const pricing = getStoredServicePricing(s);
    return getServicePricingLabel(pricing).unitLabel;
  };

  return (
    <div className="px-4 py-4 max-w-lg mx-auto pb-24">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-display font-black text-xl text-foreground">Services</h2>
          <p className="text-xs text-muted-foreground">Set exactly how each service is priced. Customers see the same pricing on your storefront.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm shrink-0"><Plus className="w-4 h-4" /> Add</button>
      </div>

      {store.storeType === 'laundry' && (
        <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3"><Scale className="w-5 h-5 text-primary mt-0.5" /><div><p className="font-display font-bold text-sm">Laundry pricing</p><p className="text-xs text-muted-foreground mt-1">You can charge per piece, per KG, per load, or use one fixed price. Each laundry service can have its own price.</p></div></div>
        </div>
      )}

      {store.storeType !== 'games' && services.length === 0 && (
        <div className="text-center py-16 px-4"><p className="text-4xl mb-2">🛠️</p><p className="font-display font-bold text-foreground">No services yet</p><p className="text-sm text-muted-foreground mt-1">Add your first service and choose its pricing method.</p></div>
      )}

      <div className="space-y-2.5">
        {services.map(s => {
          const pricing = getStoredServicePricing(s);
          const pricingInfo = getServicePricingLabel(pricing);
          return (
            <div key={s.id} className={`p-3.5 rounded-2xl border bg-surface-2/40 ${s.discontinued ? 'opacity-50 border-border' : 'border-border'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Tag className="w-4 h-4 text-primary" /></div>
                <div className="flex-1 min-w-0"><p className="font-display font-semibold text-sm text-foreground truncate">{s.name}</p><div className="flex items-center gap-2 mt-0.5"><span className="text-sm font-display font-bold text-primary">{pricing === 'quote' ? 'Quote' : `₦${Number(s.sellingPrice || 0).toLocaleString()}`}</span><span className="text-[11px] text-muted-foreground">{pricingInfo.unitLabel || pricingInfo.label}</span></div></div>
                <button onClick={() => toggleEnabled(s)} title={s.discontinued ? 'Enable' : 'Disable'} className="w-8 h-8 flex items-center justify-center text-muted-foreground shrink-0"><Power className="w-4 h-4" /></button>
                <button onClick={() => openEdit(s)} className="w-8 h-8 flex items-center justify-center text-muted-foreground shrink-0"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => setConfirmDeleteId(s.id)} className="w-8 h-8 flex items-center justify-center text-muted-foreground shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="flex items-center gap-2 mt-2 ml-13 text-[11px] text-muted-foreground">
                {s.turnaround && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {s.turnaround}</span>}
                <span>{pricingInfo.label}</span>
                {s.discontinued && <span className="font-bold text-destructive uppercase">Disabled</span>}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 animate-fade-in" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-sm bg-background rounded-t-2xl sm:rounded-2xl p-5 pb-6 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><div><h3 className="font-display font-bold text-base">{editingId ? 'Edit Service' : 'New Service'}</h3><p className="text-xs text-muted-foreground mt-0.5">Customers will see this exactly as configured.</p></div><button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button></div>

            <div className="space-y-3">
              <div className="space-y-1"><label className="block text-[11px] text-muted-foreground uppercase font-bold">Service Name</label><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={store.storeType === 'laundry' ? 'e.g. Shirt Wash' : 'e.g. Haircut'} autoFocus className="w-full px-3.5 py-3 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary" /></div>
              <div className="space-y-1"><label className="block text-[11px] text-muted-foreground uppercase font-bold">How should customers be charged?</label><div className="grid grid-cols-2 gap-2">{pricingOptions.map(option => <button key={option.id} type="button" onClick={() => setDraft({ ...draft, pricing: option.id })} className={`p-3 rounded-xl border text-left transition-all ${draft.pricing === option.id ? 'bg-primary/10 border-primary ring-1 ring-primary/20' : 'bg-surface-2/40 border-border'}`}><p className="text-xs font-display font-bold">{option.label}</p>{option.unitLabel && <p className="text-[10px] text-muted-foreground mt-0.5">Price shown {option.unitLabel}</p>}</button>)}</div></div>
              {draft.pricing !== 'quote' && <div className="space-y-1"><label className="block text-[11px] text-muted-foreground uppercase font-bold">Price {getServicePricingLabel(draft.pricing).unitLabel}</label><input value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value.replace(/[^0-9]/g, '') })} placeholder="₦" inputMode="numeric" className="w-full px-3.5 py-3 rounded-xl border border-border bg-surface-2/40 text-sm font-display placeholder:text-muted-foreground focus:outline-none focus:border-primary" /></div>}
              {draft.pricing === 'quote' && <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">Customers will see <b>Get a quote</b> instead of a made-up price. You can agree the price after reviewing the request.</div>}
              <div className="space-y-1"><label className="block text-[11px] text-muted-foreground uppercase font-bold">Description <span className="font-normal normal-case">(optional)</span></label><textarea value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="What does this service include?" rows={3} className="w-full px-3.5 py-3 rounded-xl border border-border bg-surface-2/40 text-sm resize-none focus:outline-none focus:border-primary" /></div>
              {['laundry','cleaning','car_wash','tailoring','repair'].includes(String(store.storeType)) && <div className="space-y-1"><label className="block text-[11px] text-muted-foreground uppercase font-bold">Turnaround / completion</label><div className="grid grid-cols-3 gap-1.5">{TURNAROUND_OPTIONS.map(t => <button key={t} type="button" onClick={() => setDraft({ ...draft, turnaround: t })} className={`py-2 rounded-lg border text-xs font-display font-semibold ${draft.turnaround === t ? 'bg-primary/10 border-primary text-foreground' : 'bg-surface-2/40 border-border text-muted-foreground'}`}>{t}</button>)}</div></div>}
            </div>

            <button onClick={save} className="w-full mt-5 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm">{editingId ? 'Save Changes' : 'Add Service'}</button>
          </div>
        </div>
      )}

      {confirmDeleteId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in px-5" onClick={() => setConfirmDeleteId(null)}><div className="w-full max-w-sm bg-background rounded-2xl p-5" onClick={e => e.stopPropagation()}><p className="font-display font-bold text-sm text-foreground">Remove this service?</p><p className="text-xs text-muted-foreground mt-1">Customers won't be able to book it anymore.</p><div className="flex gap-3 mt-4"><button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border font-display font-semibold text-sm">Cancel</button><button onClick={() => remove(confirmDeleteId)} className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground font-display font-bold text-sm">Remove</button></div></div></div>}
    </div>
  );
}
