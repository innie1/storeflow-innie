import { useEffect, useMemo, useState } from 'react';
import type { Product, StoreData } from '@/types/store';
import { addProduct, deleteProduct, saveStore, updateProduct } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import {
  addLaundryGarmentType,
  getExplicitLaundryGarmentPrice,
  getLaundryGarmentPrice,
  getLaundryPricingConfig,
  publishLaundryPricingToTemplate,
  seedLaundryGarmentPrices,
  setLaundryGarmentPrice,
} from '@/lib/laundry-pricing';
import { getStoredServicePricing, type ServicePricing } from '@/lib/service-pricing';
import { Check, Pencil, Plus, Power, Shirt, Trash2, X } from 'lucide-react';

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  currentUser?: { name?: string; role?: string };
}

const TURNAROUND_OPTIONS = ['Same day', '24 hours', '48 hours', '3 days', '1 week'];

interface ServiceDraft {
  name: string;
  turnaround: string;
  pricing: ServicePricing;
  defaultPrice: string;
}

const emptyDraft = (): ServiceDraft => ({
  name: '',
  turnaround: '24 hours',
  pricing: 'per_piece',
  defaultPrice: '',
});

export default function LaundryPricingSetup({ store, onUpdate, currentUser }: Props) {
  const allServices = useMemo(() => (store.products || []).filter(product => product.isService), [store.products]);
  const config = getLaundryPricingConfig(store);
  const [selectedServiceId, setSelectedServiceId] = useState(() => String(allServices.find(service => !service.discontinued)?.id || allServices[0]?.id || ''));
  const [customGarment, setCustomGarment] = useState('');
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ServiceDraft>(emptyDraft);

  const selectedService = allServices.find(service => String(service.id) === selectedServiceId) || allServices[0] || null;
  const selectedPricing = selectedService ? getStoredServicePricing(selectedService) : 'per_piece';

  const persist = (next: StoreData) => {
    const published = publishLaundryPricingToTemplate(next);
    saveStore(published);
    onUpdate(published);
    return published;
  };

  useEffect(() => {
    const seeded = seedLaundryGarmentPrices(store);
    const published = publishLaundryPricingToTemplate(seeded);
    if (JSON.stringify((published as any).laundryPricing) !== JSON.stringify((store as any).laundryPricing) ||
        JSON.stringify((published as any).businessTemplate?.laundryPricing) !== JSON.stringify((store as any).businessTemplate?.laundryPricing)) {
      saveStore(published);
      onUpdate(published);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.products]);

  useEffect(() => {
    if (!selectedServiceId && allServices[0]) setSelectedServiceId(String(allServices[0].id));
    if (selectedServiceId && !allServices.some(service => String(service.id) === selectedServiceId) && allServices[0]) {
      setSelectedServiceId(String(allServices[0].id));
    }
  }, [allServices, selectedServiceId]);

  const saveGarmentPrice = (garment: string, raw: string) => {
    if (!selectedService) return;
    const value = Number(raw.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(value) || value < 0) return showToast('Enter a valid price', 'error');
    persist(setLaundryGarmentPrice(store, String(selectedService.id), garment, value));
    showToast(`${garment} price saved`);
  };

  const addGarment = () => {
    const clean = customGarment.trim();
    if (!clean) return;
    let next = addLaundryGarmentType(store, clean);
    for (const service of allServices) {
      next = setLaundryGarmentPrice(next, String(service.id), clean, Math.max(0, Number(service.sellingPrice) || 0));
    }
    persist(next);
    setCustomGarment('');
    showToast(`${clean} added`);
  };

  const openNewService = () => {
    setEditingServiceId(null);
    setDraft(emptyDraft());
    setShowServiceForm(true);
  };

  const openEditService = (service: Product) => {
    setEditingServiceId(String(service.id));
    setDraft({
      name: service.name,
      turnaround: service.turnaround || '24 hours',
      pricing: getStoredServicePricing(service),
      defaultPrice: String(Math.max(0, Number(service.sellingPrice) || 0)),
    });
    setShowServiceForm(true);
  };

  const saveService = () => {
    const name = draft.name.trim();
    const defaultPrice = Number(draft.defaultPrice);
    if (!name) return showToast('Enter the service name', 'error');
    if (!Number.isFinite(defaultPrice) || defaultPrice < 0) return showToast('Enter a valid starting price', 'error');

    const serviceData: any = {
      name,
      description: draft.pricing === 'per_piece'
        ? 'Laundry treatment. Final price is calculated from each clothing item selected.'
        : 'Laundry service',
      costPrice: 0,
      sellingPrice: defaultPrice,
      quantity: 999999,
      category: 'Service',
      unit: draft.pricing === 'per_kg' ? 'kg' : draft.pricing === 'per_load' ? 'load' : 'pcs',
      isService: true,
      discontinued: false,
      turnaround: draft.turnaround,
      servicePricing: draft.pricing,
      serviceWorkflow: { mode: 'job', requiresStart: true, timer: false, allowPause: false, allowAddTime: false },
    };

    let next: StoreData;
    if (editingServiceId) {
      next = updateProduct(store, editingServiceId, serviceData, currentUser?.name, currentUser?.role);
    } else {
      next = addProduct(store, serviceData, currentUser?.name, currentUser?.role);
    }

    next = seedLaundryGarmentPrices(next);
    persist(next);
    const refreshedServices = (next.products || []).filter(product => product.isService);
    const target = editingServiceId
      ? refreshedServices.find(service => String(service.id) === editingServiceId)
      : refreshedServices[refreshedServices.length - 1];
    if (target) setSelectedServiceId(String(target.id));
    setShowServiceForm(false);
    showToast(editingServiceId ? 'Service updated' : 'Service added');
  };

  const toggleService = (service: Product) => {
    const next = updateProduct(store, service.id, { discontinued: !service.discontinued }, currentUser?.name, currentUser?.role);
    persist(next);
  };

  const removeService = (service: Product) => {
    if (!window.confirm(`Remove ${service.name}? Existing laundry records will not be changed.`)) return;
    persist(deleteProduct(store, service.id, currentUser?.name, currentUser?.role));
    showToast('Service removed');
  };

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto pb-24 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display font-black text-xl text-foreground">Laundry Price List</h2>
          <p className="text-xs text-muted-foreground mt-1">Set the real price of each clothing item for each type of laundry treatment.</p>
        </div>
        <button onClick={openNewService} className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs">
          <Plus className="w-4 h-4" /> Service
        </button>
      </div>

      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-left">
        <p className="font-display font-black text-sm">What does “Service” mean?</p>
        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
          A service is <b>what you do to the clothes</b> — for example Full Service, Wash & Iron, Wash Only, Iron Only or Dry Cleaning. The clothing item then has its own price under that service. Example: Shirt + Iron Only can have a different price from Trouser + Iron Only.
        </p>
      </div>

      {allServices.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Shirt className="w-7 h-7 text-primary mx-auto" />
          <p className="font-display font-black mt-3">Add your first laundry service</p>
          <p className="text-xs text-muted-foreground mt-1">Start with Full Service, Wash & Iron, Wash Only, Iron Only or Dry Cleaning.</p>
          <button onClick={openNewService} className="mt-4 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black">Add Service</button>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase font-black text-muted-foreground">Processing type</p>
              <p className="text-[10px] text-muted-foreground">Choose one to edit its prices</p>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {allServices.map(service => {
                const active = String(service.id) === String(selectedService?.id);
                return (
                  <button
                    key={service.id}
                    onClick={() => setSelectedServiceId(String(service.id))}
                    className={`shrink-0 px-3 py-2.5 rounded-xl border text-left ${active ? 'border-primary bg-primary/10' : 'border-border bg-card'} ${service.discontinued ? 'opacity-50' : ''}`}
                  >
                    <p className="text-xs font-black">{service.name}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{service.discontinued ? 'Disabled' : service.turnaround || 'Normal turnaround'}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {selectedService && (
            <section className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="p-4 border-b border-border flex items-start justify-between gap-3">
                <div>
                  <p className="font-display font-black">{selectedService.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedPricing === 'per_piece'
                      ? 'Each clothing type below has its own price.'
                      : selectedPricing === 'per_kg'
                        ? `This service is charged by KG at ₦${Number(selectedService.sellingPrice || 0).toLocaleString()} per KG.`
                        : selectedPricing === 'per_load'
                          ? `This service is charged by load at ₦${Number(selectedService.sellingPrice || 0).toLocaleString()} per load.`
                          : 'This service uses one fixed price.'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleService(selectedService)} title={selectedService.discontinued ? 'Enable' : 'Disable'} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground"><Power className="w-4 h-4" /></button>
                  <button onClick={() => openEditService(selectedService)} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => removeService(selectedService)} className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-destructive"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>

              {selectedPricing === 'per_piece' ? (
                <div className="divide-y divide-border/70">
                  {config.garmentTypes.map(garment => {
                    const explicit = getExplicitLaundryGarmentPrice(store, String(selectedService.id), garment);
                    const value = getLaundryGarmentPrice(store, selectedService, garment);
                    return (
                      <div key={garment} className="p-3.5 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate">{garment}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{explicit === null ? 'Using old service price as starting price' : 'Price per item'}</p>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 h-10 w-36">
                          <span className="text-xs text-muted-foreground">₦</span>
                          <input
                            key={`${selectedService.id}:${garment}:${value}`}
                            defaultValue={String(value || '')}
                            onBlur={event => saveGarmentPrice(garment, event.target.value)}
                            inputMode="decimal"
                            className="min-w-0 w-full bg-transparent outline-none text-sm font-black text-right"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-xs text-muted-foreground">
                  For KG, load or fixed-price services, edit the service and set its base price. Clothing counts are still recorded for identification, but the total comes from the KG/load/fixed price.
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="font-display font-black text-sm">Add another clothing type</p>
            <p className="text-[11px] text-muted-foreground mt-1">For example Agbada, Suit, Duvet, Blouse, Jeans or School Uniform.</p>
            <div className="flex gap-2 mt-3">
              <input value={customGarment} onChange={event => setCustomGarment(event.target.value)} onKeyDown={event => event.key === 'Enter' && addGarment()} placeholder="Clothing type" className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-border bg-surface-2 text-sm outline-none focus:border-primary" />
              <button onClick={addGarment} className="px-4 rounded-xl border border-primary text-primary text-xs font-black">Add</button>
            </div>
          </section>
        </>
      )}

      {showServiceForm && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center" onClick={() => setShowServiceForm(false)}>
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-background border border-border p-5" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase text-primary font-black">Laundry treatment</p>
                <h3 className="font-display font-black text-lg mt-0.5">{editingServiceId ? 'Edit Service' : 'Add Service'}</h3>
              </div>
              <button onClick={() => setShowServiceForm(false)} className="p-2 rounded-xl bg-surface-2"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3 mt-4 text-left">
              <div>
                <label className="text-[10px] uppercase font-black text-muted-foreground">Service name</label>
                <input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} placeholder="e.g. Full Service" className="mt-1 w-full px-3.5 py-3 rounded-xl border border-border bg-surface-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-black text-muted-foreground">How is this service charged?</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {([['per_piece', 'Per item'], ['per_kg', 'Per KG'], ['per_load', 'Per load']] as const).map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setDraft(current => ({ ...current, pricing: id }))} className={`p-2.5 rounded-xl border text-xs font-bold ${draft.pricing === id ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-black text-muted-foreground">{draft.pricing === 'per_piece' ? 'Starting price' : draft.pricing === 'per_kg' ? 'Price per KG' : 'Price per load'}</label>
                <div className="mt-1 flex items-center gap-2 px-3.5 py-3 rounded-xl border border-border bg-surface-2"><span className="text-sm text-muted-foreground">₦</span><input value={draft.defaultPrice} onChange={event => setDraft(current => ({ ...current, defaultPrice: event.target.value.replace(/[^0-9.]/g, '') }))} inputMode="decimal" placeholder="0" className="w-full bg-transparent outline-none text-sm font-black" /></div>
                {draft.pricing === 'per_piece' && <p className="text-[10px] text-muted-foreground mt-1">For a new service this becomes the starting price for each clothing type; you can then change Shirt, Trouser, T-shirt, etc. individually.</p>}
              </div>
              <div>
                <label className="text-[10px] uppercase font-black text-muted-foreground">Turnaround</label>
                <select value={draft.turnaround} onChange={event => setDraft(current => ({ ...current, turnaround: event.target.value }))} className="mt-1 w-full px-3.5 py-3 rounded-xl border border-border bg-surface-2 text-sm">{TURNAROUND_OPTIONS.map(option => <option key={option}>{option}</option>)}</select>
              </div>
            </div>

            <button onClick={saveService} className="mt-5 w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Save Service</button>
          </div>
        </div>
      )}
    </div>
  );
}
