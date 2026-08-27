import { useEffect, useMemo, useState } from 'react';
import type { StoreData } from '@/types/store';
import { supabase } from '@/integrations/supabase/client';
import { addCustomer } from '@/lib/store-data';
import { getServicePricingLabel, getStoredServicePricing } from '@/lib/service-pricing';
import {
  DEFAULT_LAUNDRY_GARMENTS,
  countLaundryPieces,
  sanitizeGarmentSelections,
  suggestedLaundryTotal,
  type LaundryGarmentSelection,
} from '@/lib/laundry-intake';
import { showToast } from '@/components/Toast';
import { Check, ClipboardCopy, Minus, Plus, Shirt, X } from 'lucide-react';

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

interface CreatedRecord {
  tagCode: string;
  pieceCount: number;
  customerName: string;
  serviceName: string;
  total: number;
}

const OPEN_SIGNAL = 'storeflow:open-laundry-intake';
const OPEN_STORAGE = 'storeflow-open-laundry-intake';

function emptyCounts(): Record<string, number> {
  return Object.fromEntries(DEFAULT_LAUNDRY_GARMENTS.map(name => [name, 0]));
}

export default function LaundryWalkInIntakeV2({ store, onUpdate }: Props) {
  const services = useMemo(
    () => (store.products || []).filter(service => service.isService && !service.discontinued),
    [store.products],
  );
  const customers = store.customers || [];
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [garmentCounts, setGarmentCounts] = useState<Record<string, number>>(emptyCounts);
  const [customGarment, setCustomGarment] = useState('');
  const [billingQuantity, setBillingQuantity] = useState('1');
  const [totalPrice, setTotalPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [created, setCreated] = useState<CreatedRecord | null>(null);

  const selectedService = services.find(service => String(service.id) === selectedServiceId) || services[0] || null;
  const pricing = selectedService ? getStoredServicePricing(selectedService) : 'fixed';
  const pricingLabel = getServicePricingLabel(pricing);
  const selections = useMemo<LaundryGarmentSelection[]>(
    () => Object.entries(garmentCounts).map(([garmentType, quantity]) => ({ garmentType, quantity })).filter(item => item.quantity > 0),
    [garmentCounts],
  );
  const pieceCount = countLaundryPieces(selections);

  useEffect(() => {
    if (!selectedServiceId && services[0]) setSelectedServiceId(String(services[0].id));
  }, [selectedServiceId, services]);

  useEffect(() => {
    if (!selectedService || priceTouched) return;
    const suggested = suggestedLaundryTotal(selectedService, pieceCount, Number(billingQuantity) || 0);
    setTotalPrice(suggested > 0 ? String(suggested) : '');
  }, [selectedService, pieceCount, billingQuantity, priceTouched]);

  const reset = () => {
    setCustomerName('');
    setCustomerPhone('');
    setSelectedCustomerId('');
    setSelectedServiceId(services[0] ? String(services[0].id) : '');
    setGarmentCounts(emptyCounts());
    setCustomGarment('');
    setBillingQuantity('1');
    setTotalPrice('');
    setPriceTouched(false);
    setNotes('');
    setCreated(null);
    setSaving(false);
  };

  const openIntake = () => {
    sessionStorage.removeItem(OPEN_STORAGE);
    reset();
    setOpen(true);
  };

  useEffect(() => {
    const handler = () => openIntake();
    window.addEventListener(OPEN_SIGNAL, handler);
    if (sessionStorage.getItem(OPEN_STORAGE) === '1') handler();
    return () => window.removeEventListener(OPEN_SIGNAL, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setOpen(false);
    reset();
  };

  const selectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    const customer = customers.find(item => item.id === id);
    setCustomerName(customer?.name || '');
    setCustomerPhone(customer?.phone || '');
  };

  const changeCount = (garment: string, delta: number) => {
    setGarmentCounts(current => ({ ...current, [garment]: Math.max(0, (current[garment] || 0) + delta) }));
  };

  const addCustomGarment = () => {
    const name = customGarment.trim();
    if (!name) return;
    const existing = Object.keys(garmentCounts).find(key => key.toLowerCase() === name.toLowerCase()) || name;
    setGarmentCounts(current => ({ ...current, [existing]: (current[existing] || 0) + 1 }));
    setCustomGarment('');
  };

  const saveIntake = async () => {
    const storeId = String((store as any).id || '');
    const accessCode = String((store as any).accessCode || '');
    const name = customerName.trim();
    const phone = customerPhone.trim();
    const clean = sanitizeGarmentSelections(selections);
    const total = Number(totalPrice);
    const billingQty = Number(billingQuantity) || 0;

    if (!storeId) return showToast('Store is still syncing. Try again in a moment.', 'error');
    if (!name) return showToast('Enter the customer name', 'error');
    if (!selectedService) return showToast('Add and select a laundry service first', 'error');
    if (clean.length === 0) return showToast('Record at least one item of clothing', 'error');
    if ((pricing === 'per_kg' || pricing === 'per_load') && !(billingQty > 0)) return showToast('Enter the laundry quantity', 'error');
    if (!Number.isFinite(total) || total < 0) return showToast('Enter a valid total price', 'error');

    setSaving(true);
    try {
      const garments = clean.map(item => ({ garment_type: item.garmentType, quantity: item.quantity }));
      const { data, error } = await (supabase as any).rpc('create_laundry_walkin', {
        p_store_id: storeId,
        p_access_code: accessCode,
        p_customer_name: name,
        p_customer_phone: phone,
        p_service_id: String(selectedService.id),
        p_service_name: selectedService.name,
        p_pricing: pricing,
        p_billing_quantity: pricing === 'per_kg' || pricing === 'per_load' ? billingQty : 1,
        p_total: total,
        p_notes: notes.trim(),
        p_garments: garments,
      });
      if (error) throw error;

      const tagCode = String(data?.tag_code || data?.receipt_number || '');
      if (!tagCode) throw new Error('Laundry tag was not generated');

      if (phone && !customers.some(customer => customer.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''))) {
        try {
          onUpdate(addCustomer(store, { name, phone }));
        } catch (customerError) {
          console.warn('[Laundry Intake] Customer book update failed:', customerError);
        }
      }

      setCreated({ tagCode, pieceCount: Number(data?.piece_count || pieceCount), customerName: name, serviceName: selectedService.name, total });
      window.dispatchEvent(new CustomEvent('storeflow:order-created', { detail: { orderId: data?.order_id } }));
      showToast(`Laundry recorded — ${tagCode}`, 'success');
    } catch (error: any) {
      console.error('[Laundry Intake] Failed:', error);
      showToast(error?.message || 'Could not save laundry record', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyTag = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.tagCode);
      showToast('Tag code copied');
    } catch {
      showToast(created.tagCode, 'info');
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Shirt className="w-4 h-4 text-primary" /></div>
          <div className="text-left"><p className="font-display font-black text-sm">Walk-in Laundry</p><p className="text-[11px] text-muted-foreground">Record clothes brought to the shop.</p></div>
        </div>
        <button onClick={openIntake} className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-display font-black text-xs">Record Laundry</button>
      </div>

      {open && <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center" onClick={close}>
        <div className="w-full sm:max-w-lg max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-background border border-border p-4 sm:p-5" onClick={event => event.stopPropagation()}>
          {created ? <div className="space-y-5 py-2">
            <div className="flex justify-between items-start"><div><p className="text-xs text-success font-bold uppercase">Laundry recorded</p><h3 className="font-display font-black text-xl mt-1">Receipt / Tag Code</h3></div><button onClick={close} className="p-2 rounded-xl bg-surface-2"><X className="w-4 h-4" /></button></div>
            <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-6 text-center">
              <p className="font-mono font-black text-4xl tracking-[0.18em]">{created.tagCode}</p>
              <p className="text-xs text-muted-foreground mt-3">Write this same code on the tags for every cloth in this bundle. Search the same code later to find the receipt.</p>
              <button onClick={copyTag} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 text-primary text-xs font-bold"><ClipboardCopy className="w-3.5 h-3.5" /> Copy code</button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Customer</p><p className="text-sm font-bold mt-1 truncate">{created.customerName}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Service</p><p className="text-sm font-bold mt-1 truncate">{created.serviceName}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Pieces</p><p className="text-sm font-bold mt-1">{created.pieceCount}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Total</p><p className="text-sm font-bold mt-1">₦{created.total.toLocaleString()}</p></div>
            </div>
            <button onClick={close} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Done</button>
          </div> : <div className="space-y-5">
            <div className="flex items-start justify-between"><div><p className="text-xs uppercase text-primary font-black">Physical store</p><h3 className="font-display font-black text-xl mt-0.5">Record Laundry</h3><p className="text-xs text-muted-foreground mt-1">Record the customer, service and clothes brought in.</p></div><button onClick={close} className="p-2 rounded-xl bg-surface-2"><X className="w-4 h-4" /></button></div>

            <section className="space-y-2.5 text-left"><p className="text-[11px] uppercase font-black text-muted-foreground">1. Customer</p>
              {customers.length > 0 && <select value={selectedCustomerId} onChange={event => selectCustomer(event.target.value)} className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm"><option value="">New / walk-in customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}</select>}
              <div className="grid grid-cols-2 gap-2"><input value={customerName} onChange={event => { setCustomerName(event.target.value); setSelectedCustomerId(''); }} placeholder="Customer name" className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm" /><input value={customerPhone} onChange={event => { setCustomerPhone(event.target.value); setSelectedCustomerId(''); }} placeholder="Phone (optional)" className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm" /></div>
            </section>

            <section className="space-y-2.5 text-left"><p className="text-[11px] uppercase font-black text-muted-foreground">2. Service</p>
              {services.length === 0 ? <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5 text-xs text-muted-foreground">No laundry service yet. Open Services and add Full Service, Wash Only, Ironing, or another service.</div> : <div className="grid grid-cols-2 gap-2">{services.map(service => { const active = String(service.id) === String(selectedService?.id); return <button key={service.id} type="button" onClick={() => { setSelectedServiceId(String(service.id)); setPriceTouched(false); }} className={`p-3 rounded-xl border text-left ${active ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'}`}><p className="text-xs font-black">{service.name}</p><p className="text-[10px] text-muted-foreground mt-1">₦{Number(service.sellingPrice || 0).toLocaleString()} {getServicePricingLabel(getStoredServicePricing(service)).unitLabel}</p></button>; })}</div>}
            </section>

            <section className="space-y-2.5 text-left"><div className="flex justify-between"><p className="text-[11px] uppercase font-black text-muted-foreground">3. Clothes</p><p className="text-xs font-black text-primary">{pieceCount} pieces</p></div>
              <div className="grid grid-cols-2 gap-2">{Object.keys(garmentCounts).map(garment => { const quantity = garmentCounts[garment] || 0; return <div key={garment} className={`p-2.5 rounded-xl border ${quantity ? 'border-primary/35 bg-primary/5' : 'border-border bg-surface-2/60'}`}><p className="text-xs font-bold truncate mb-2">{garment}</p><div className="flex items-center justify-between"><button type="button" onClick={() => changeCount(garment,-1)} disabled={!quantity} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-30"><Minus className="w-3.5 h-3.5" /></button><span className="font-display font-black">{quantity}</span><button type="button" onClick={() => changeCount(garment,1)} className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button></div></div>; })}</div>
              <div className="flex gap-2"><input value={customGarment} onChange={event => setCustomGarment(event.target.value)} placeholder="Other clothing type" className="flex-1 min-w-0 p-3 rounded-xl bg-surface-2 border border-border text-sm" /><button type="button" onClick={addCustomGarment} className="px-4 rounded-xl border border-primary/30 text-primary text-xs font-bold">Add</button></div>
            </section>

            <section className="space-y-2.5 text-left"><p className="text-[11px] uppercase font-black text-muted-foreground">4. Price & notes</p>
              {(pricing === 'per_kg' || pricing === 'per_load') && <input value={billingQuantity} onChange={event => { setBillingQuantity(event.target.value.replace(/[^0-9.]/g,'')); setPriceTouched(false); }} placeholder={pricing === 'per_kg' ? 'Weight (KG)' : 'Number of loads'} className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm" />}
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₦</span><input value={totalPrice} onChange={event => { setTotalPrice(event.target.value.replace(/[^0-9.]/g,'')); setPriceTouched(true); }} placeholder={`Agreed total · ${pricingLabel.label}`} className="w-full pl-8 pr-3 py-3 rounded-xl bg-surface-2 border border-border text-sm font-bold" /></div>
              <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} placeholder="Stains, damage, special instructions…" className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm resize-none" />
            </section>

            <div className="rounded-xl bg-surface-2 border border-border p-3 text-xs text-left"><b>After saving:</b> StoreFlow creates one 6-character code. Write that same code on every tag for this customer bundle.</div>
            <button onClick={saveIntake} disabled={saving || services.length === 0} className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm disabled:opacity-50">{saving ? 'Recording…' : 'Record Laundry'}</button>
          </div>}
        </div>
      </div>}
    </>
  );
}
