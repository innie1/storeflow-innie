import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { StoreData } from '@/types/store';
import { addCustomer } from '@/lib/store-data';
import { getServicePricingLabel, getStoredServicePricing } from '@/lib/service-pricing';
import { countLaundryPieces, sanitizeGarmentSelections, type LaundryGarmentSelection } from '@/lib/laundry-intake';
import {
  calculateLaundryPriceLines,
  getLaundryGarmentPrice,
  getLaundryPricingConfig,
} from '@/lib/laundry-pricing';
import {
  createLocalLaundryRecord,
  LAUNDRY_SYNC_CHANGED_EVENT,
  localLaundryRecordToOrder,
  syncLaundryRecord,
  type LocalLaundryRecord,
} from '@/lib/laundry-offline';
import { openLaundryWhatsApp } from '@/lib/laundry-whatsapp';
import { showToast } from '@/components/Toast';
import { Check, ClipboardCopy, MessageCircle, Minus, Plus, Shirt, X } from 'lucide-react';

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

const OPEN_SIGNAL = 'storeflow:open-laundry-intake';
const OPEN_STORAGE = 'storeflow-open-laundry-intake';

function emptyCounts(garments: string[]): Record<string, number> {
  return Object.fromEntries(garments.map(name => [name, 0]));
}

function validPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length >= 7;
}

export default function LaundryWalkInIntakeV2({ store, onUpdate }: Props) {
  const services = useMemo(
    () => (store.products || []).filter(service => service.isService && !service.discontinued),
    [store.products],
  );
  const customers = store.customers || [];
  const garmentTypes = useMemo(() => getLaundryPricingConfig(store).garmentTypes, [store]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [garmentCounts, setGarmentCounts] = useState<Record<string, number>>(() => emptyCounts(garmentTypes));
  const [customGarment, setCustomGarment] = useState('');
  const [billingQuantity, setBillingQuantity] = useState('1');
  const [totalPrice, setTotalPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [created, setCreated] = useState<LocalLaundryRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const selectedService = services.find(service => String(service.id) === selectedServiceId) || services[0] || null;
  const pricing = selectedService ? getStoredServicePricing(selectedService) : 'per_piece';
  const pricingLabel = getServicePricingLabel(pricing);
  const selections = useMemo<LaundryGarmentSelection[]>(
    () => Object.entries(garmentCounts).map(([garmentType, quantity]) => ({ garmentType, quantity })).filter(item => item.quantity > 0),
    [garmentCounts],
  );
  const pieceCount = countLaundryPieces(selections);
  const calculated = useMemo(
    () => selectedService ? calculateLaundryPriceLines(store, selectedService, selections, Number(billingQuantity) || 0) : { lines: [], total: 0 },
    [store, selectedService, selections, billingQuantity],
  );

  useEffect(() => {
    if (!selectedServiceId && services[0]) setSelectedServiceId(String(services[0].id));
  }, [selectedServiceId, services]);

  useEffect(() => {
    setGarmentCounts(current => {
      const next = { ...emptyCounts(garmentTypes), ...current };
      return next;
    });
  }, [garmentTypes]);

  useEffect(() => {
    if (!selectedService || priceTouched) return;
    setTotalPrice(calculated.total > 0 ? String(calculated.total) : '');
  }, [selectedService, calculated.total, priceTouched]);

  useEffect(() => {
    const handleSync = (event: Event) => {
      const record = (event as CustomEvent).detail?.record as LocalLaundryRecord | undefined;
      if (!record?.clientRef) return;
      setCreated(current => current && current.clientRef === record.clientRef ? record : current);
    };
    window.addEventListener(LAUNDRY_SYNC_CHANGED_EVENT, handleSync);
    return () => window.removeEventListener(LAUNDRY_SYNC_CHANGED_EVENT, handleSync);
  }, []);

  useEffect(() => {
    if (!created) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(`STORE:${store.accessCode}|LAUNDRY:${created.tagCode}`, { width: 320, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [created, store.accessCode]);

  const reset = () => {
    setCustomerName('');
    setCustomerPhone('');
    setSelectedCustomerId('');
    setSelectedServiceId(services[0] ? String(services[0].id) : '');
    setGarmentCounts(emptyCounts(garmentTypes));
    setCustomGarment('');
    setBillingQuantity('1');
    setTotalPrice('');
    setPriceTouched(false);
    setNotes('');
    setCreated(null);
    setQrDataUrl('');
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
    setPriceTouched(false);
  };

  const addCustomGarment = () => {
    const name = customGarment.trim();
    if (!name) return;
    const existing = Object.keys(garmentCounts).find(key => key.toLowerCase() === name.toLowerCase()) || name;
    setGarmentCounts(current => ({ ...current, [existing]: (current[existing] || 0) + 1 }));
    setCustomGarment('');
    setPriceTouched(false);
  };

  const saveIntake = async () => {
    const accessCode = String((store as any).accessCode || '');
    const name = customerName.trim();
    const phone = customerPhone.trim();
    const clean = sanitizeGarmentSelections(selections);
    const total = Number(totalPrice);
    const billingQty = Number(billingQuantity) || 0;

    if (!accessCode) return showToast('Store access code is missing', 'error');
    if (!name) return showToast('Customer name is required', 'error');
    if (!phone) return showToast('Customer phone number is required', 'error');
    if (!validPhone(phone)) return showToast('Enter a valid customer phone number', 'error');
    if (!selectedService) return showToast('Add and select a laundry service first', 'error');
    if (clean.length === 0) return showToast('Record at least one item of clothing', 'error');
    if ((pricing === 'per_kg' || pricing === 'per_load') && !(billingQty > 0)) return showToast('Enter the laundry quantity', 'error');
    if (!Number.isFinite(total) || total < 0) return showToast('Enter a valid total price', 'error');

    const pricedGarments = pricing === 'per_piece'
      ? clean.map(item => {
          const unitPrice = getLaundryGarmentPrice(store, selectedService, item.garmentType);
          return { ...item, unitPrice, subtotal: unitPrice * item.quantity };
        })
      : clean;

    setSaving(true);
    try {
      const localRecord = createLocalLaundryRecord({
        accessCode,
        customerName: name,
        customerPhone: phone,
        serviceId: String(selectedService.id),
        serviceName: selectedService.name,
        pricing,
        billingQuantity: pricing === 'per_kg' || pricing === 'per_load' ? billingQty : 1,
        total,
        notes: notes.trim(),
        garments: pricedGarments,
      });

      if (!customers.some(customer => customer.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''))) {
        try {
          onUpdate(addCustomer(store, { name, phone }));
        } catch (customerError) {
          console.warn('[Laundry Intake] Customer book update failed:', customerError);
        }
      }

      setCreated(localRecord);
      showToast(`Laundry saved locally — ${localRecord.tagCode}`, 'success');
      syncLaundryRecord(accessCode, localRecord.clientRef).catch(() => {});
    } catch (error: any) {
      console.error('[Laundry Intake] Local save failed:', error);
      showToast(error?.message || 'Could not save laundry record on this device', 'error');
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

  const sendWhatsApp = () => {
    if (!created) return;
    if (!openLaundryWhatsApp(store, localLaundryRecordToOrder(created))) {
      showToast('Customer phone number is missing or invalid', 'error');
    }
  };

  const canSave = Boolean(customerName.trim() && validPhone(customerPhone) && selectedService && pieceCount > 0 && Number.isFinite(Number(totalPrice)));

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
            <div className="flex justify-between items-start gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-success font-bold uppercase">Laundry recorded</p>
                  {created.syncStatus === 'synced' ? (
                    <span className="px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10px] font-black">Synced</span>
                  ) : (
                    <span className="px-2 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-black">Not synced</span>
                  )}
                </div>
                <h3 className="font-display font-black text-xl mt-1">Receipt / Tag Code</h3>
              </div>
              <button onClick={close} className="p-2 rounded-xl bg-surface-2"><X className="w-4 h-4" /></button>
            </div>

            <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 text-center">
              {qrDataUrl && <img src={qrDataUrl} alt={`Laundry ${created.tagCode} QR code`} className="w-36 h-36 mx-auto rounded-xl bg-white p-2" />}
              <p className="font-mono font-black text-4xl tracking-[0.18em] mt-4">{created.tagCode}</p>
              <p className="text-xs text-muted-foreground mt-3">Write this same 6-character code on every cloth tag in this bundle. The QR and written code identify the same laundry record.</p>
              <button onClick={copyTag} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 text-primary text-xs font-bold"><ClipboardCopy className="w-3.5 h-3.5" /> Copy code</button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Customer</p><p className="text-sm font-bold mt-1 truncate">{created.customerName}</p><p className="text-[11px] text-muted-foreground mt-0.5 truncate">{created.customerPhone}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Service</p><p className="text-sm font-bold mt-1 truncate">{created.serviceName}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Pieces</p><p className="text-sm font-bold mt-1">{created.pieceCount}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Total</p><p className="text-sm font-bold mt-1">₦{created.total.toLocaleString()}</p></div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 text-left">
              <p className="text-[10px] uppercase font-black text-muted-foreground">Items</p>
              <p className="text-xs font-bold mt-1">{created.garmentSummary}</p>
            </div>

            <button onClick={sendWhatsApp} className="w-full py-3 rounded-xl bg-emerald-600 text-white font-display font-black text-sm flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" /> Send Receipt on WhatsApp</button>
            {created.syncStatus !== 'synced' && <p className="text-[11px] text-primary text-center font-semibold">Safe on this device. StoreFlow will sync it automatically when Supabase is reachable.</p>}
            <button onClick={close} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Done</button>
          </div> : <div className="space-y-5">
            <div className="flex items-start justify-between"><div><p className="text-xs uppercase text-primary font-black">Physical store</p><h3 className="font-display font-black text-xl mt-0.5">Record Laundry</h3><p className="text-xs text-muted-foreground mt-1">Name and phone number are required for every laundry record.</p></div><button onClick={close} className="p-2 rounded-xl bg-surface-2"><X className="w-4 h-4" /></button></div>

            <section className="space-y-2.5 text-left">
              <p className="text-[11px] uppercase font-black text-muted-foreground">1. Customer</p>
              {customers.length > 0 && <select value={selectedCustomerId} onChange={event => selectCustomer(event.target.value)} className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm"><option value="">New customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}</select>}
              <div className="space-y-2">
                <div><label className="text-[10px] uppercase font-black text-muted-foreground">Customer name *</label><input value={customerName} onChange={event => { setCustomerName(event.target.value); setSelectedCustomerId(''); }} placeholder="Customer name" className="mt-1 w-full p-3 rounded-xl bg-surface-2 border border-border text-sm" /></div>
                <div><label className="text-[10px] uppercase font-black text-muted-foreground">Phone number *</label><input value={customerPhone} onChange={event => { setCustomerPhone(event.target.value); setSelectedCustomerId(''); }} placeholder="e.g. 08012345678" inputMode="tel" className="mt-1 w-full p-3 rounded-xl bg-surface-2 border border-border text-sm" /></div>
              </div>
            </section>

            <section className="space-y-2.5 text-left">
              <div><p className="text-[11px] uppercase font-black text-muted-foreground">2. Service</p><p className="text-[10px] text-muted-foreground mt-1">Service means the treatment: Full Service, Wash & Iron, Wash Only, Iron Only, Dry Cleaning, etc.</p></div>
              {services.length === 0 ? <div className="p-4 rounded-xl border border-primary/25 bg-primary/5 text-xs text-muted-foreground">No laundry service yet. Open Services and set your laundry treatments and clothing prices first.</div> : <div className="grid grid-cols-2 gap-2">{services.map(service => { const active = String(service.id) === String(selectedService?.id); const servicePricing = getStoredServicePricing(service); return <button key={service.id} type="button" onClick={() => { setSelectedServiceId(String(service.id)); setPriceTouched(false); }} className={`p-3 rounded-xl border text-left ${active ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'}`}><p className="text-xs font-black">{service.name}</p><p className="text-[10px] text-muted-foreground mt-1">{servicePricing === 'per_piece' ? 'Price depends on clothing item' : `₦${Number(service.sellingPrice || 0).toLocaleString()} ${getServicePricingLabel(servicePricing).unitLabel}`}</p></button>; })}</div>}
            </section>

            <section className="space-y-2.5 text-left">
              <div className="flex justify-between gap-3"><div><p className="text-[11px] uppercase font-black text-muted-foreground">3. Clothes</p><p className="text-[10px] text-muted-foreground mt-1">Tap + for every item the customer brings.</p></div><span className="text-xs font-black text-primary">{pieceCount} pieces</span></div>
              <div className="grid grid-cols-2 gap-2">{Object.keys(garmentCounts).map(garment => {
                const quantity = garmentCounts[garment] || 0;
                const unitPrice = selectedService && pricing === 'per_piece' ? getLaundryGarmentPrice(store, selectedService, garment) : 0;
                return <div key={garment} className={`rounded-xl border p-3 ${quantity > 0 ? 'border-primary bg-primary/5' : 'border-border bg-surface-2'}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-bold break-words">{garment}</p>{selectedService && pricing === 'per_piece' && <p className="text-[10px] text-primary font-bold mt-1">₦{unitPrice.toLocaleString()} each</p>}</div><span className="text-sm font-black">{quantity}</span></div><div className="flex items-center justify-between mt-3"><button type="button" onClick={() => changeCount(garment, -1)} className="w-9 h-9 rounded-full border border-border flex items-center justify-center"><Minus className="w-4 h-4" /></button><button type="button" onClick={() => changeCount(garment, 1)} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Plus className="w-4 h-4" /></button></div></div>; })}</div>
              <div className="flex gap-2"><input value={customGarment} onChange={event => setCustomGarment(event.target.value)} onKeyDown={event => event.key === 'Enter' && addCustomGarment()} placeholder="Other clothing type" className="flex-1 min-w-0 p-3 rounded-xl bg-surface-2 border border-border text-sm" /><button onClick={addCustomGarment} type="button" className="px-4 rounded-xl border border-primary text-primary font-black text-xs">Add</button></div>
            </section>

            {(pricing === 'per_kg' || pricing === 'per_load') && <section className="text-left space-y-1"><label className="text-[10px] uppercase font-black text-muted-foreground">Quantity {pricingLabel.unitLabel}</label><input value={billingQuantity} onChange={event => { setBillingQuantity(event.target.value.replace(/[^0-9.]/g, '')); setPriceTouched(false); }} inputMode="decimal" className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm" /></section>}

            <section className="space-y-2.5 text-left">
              <p className="text-[11px] uppercase font-black text-muted-foreground">4. Price & notes</p>
              {pricing === 'per_piece' && calculated.lines.length > 0 && <div className="rounded-xl border border-border bg-card divide-y divide-border/60">{calculated.lines.map(line => <div key={line.garmentType} className="flex justify-between gap-3 px-3 py-2 text-xs"><span>{line.quantity} × {line.garmentType} @ ₦{line.unitPrice.toLocaleString()}</span><span className="font-black">₦{line.subtotal.toLocaleString()}</span></div>)}</div>}
              <div><label className="text-[10px] uppercase font-black text-muted-foreground">Total price</label><div className="mt-1 flex items-center gap-2 p-3 rounded-xl bg-surface-2 border border-border"><span className="font-black">₦</span><input value={totalPrice} onChange={event => { setTotalPrice(event.target.value.replace(/[^0-9.]/g, '')); setPriceTouched(true); }} inputMode="decimal" className="w-full bg-transparent outline-none font-black" placeholder="0" /></div>{priceTouched && calculated.total !== Number(totalPrice) && <p className="text-[10px] text-muted-foreground mt-1">Price manually adjusted. Calculated price is ₦{calculated.total.toLocaleString()}.</p>}</div>
              <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Stains, damage, special instructions..." className="w-full min-h-24 p-3 rounded-xl bg-surface-2 border border-border text-sm resize-none" />
            </section>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">After saving, StoreFlow creates one shared 6-character tag/receipt code, shows its QR code, saves locally first, then syncs in the background.</div>
            <button disabled={!canSave || saving} onClick={saveIntake} className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm disabled:opacity-40">{saving ? 'Saving locally…' : 'Record Laundry'}</button>
          </div>}
        </div>
      </div>}
    </>
  );
}
