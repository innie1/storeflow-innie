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
  getLocalLaundryRecords,
  LAUNDRY_SYNC_CHANGED_EVENT,
  localLaundryRecordToOrder,
  syncLaundryRecord,
  type LocalLaundryRecord,
} from '@/lib/laundry-offline';
import { openLaundryWhatsApp } from '@/lib/laundry-whatsapp';
import { showToast } from '@/components/Toast';
import { CalendarClock, Check, ChevronDown, ChevronUp, ClipboardCopy, MessageCircle, Minus, Plus, Shirt, X } from 'lucide-react';

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

const OPEN_SIGNAL = 'storeflow:open-laundry-intake';
const OPEN_STORAGE = 'storeflow-open-laundry-intake';

function emptyCounts(garments: string[]): Record<string, number> {
  return Object.fromEntries(garments.map(name => [name, 0]));
}

/**
 * Put the clothing this shop actually handles most at the top of the picker,
 * based on everything it has recorded before. Ties keep the merchant's own
 * price-list order, so an untouched shop still sees a predictable list.
 *
 * The ranking is captured when the sheet opens rather than recomputed live, so
 * tiles never reshuffle under the counter's finger mid-entry.
 */
export function rankGarmentsByUsage(accessCode: string, garmentTypes: string[]): string[] {
  const used = new Map<string, number>();
  for (const record of getLocalLaundryRecords(accessCode)) {
    for (const garment of record.garments || []) {
      const name = String(garment.garmentType || '');
      if (!name) continue;
      used.set(name, (used.get(name) || 0) + (Number(garment.quantity) || 0));
    }
  }

  return [...garmentTypes].sort((a, b) => {
    const byUsage = (used.get(b) || 0) - (used.get(a) || 0);
    if (byUsage !== 0) return byUsage;
    return garmentTypes.indexOf(a) - garmentTypes.indexOf(b);
  });
}

function validPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length >= 7;
}

function suggestedPromisedLocal(turnaround?: string): string {
  const value = String(turnaround || '24 hours').toLowerCase();
  const date = new Date();
  const hours = value.includes('same day') ? 8 : Number(value.match(/(\d+)\s*hour/)?.[1] || 0);
  const days = Number(value.match(/(\d+)\s*day/)?.[1] || 0);
  const weeks = Number(value.match(/(\d+)\s*week/)?.[1] || 0);
  date.setTime(date.getTime() + (hours || days * 24 || weeks * 7 * 24 || 24) * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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
  const [customerAddress, setCustomerAddress] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [garmentCounts, setGarmentCounts] = useState<Record<string, number>>(() => emptyCounts(garmentTypes));
  const [customGarment, setCustomGarment] = useState('');
  const [billingQuantity, setBillingQuantity] = useState('1');
  const [totalPrice, setTotalPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [promisedFor, setPromisedFor] = useState('');
  const [promisedTouched, setPromisedTouched] = useState(false);
  const [washMethodId, setWashMethodId] = useState('manual:hand-wash');
  const [dryMethodId, setDryMethodId] = useState('manual:sun-dry');
  const [created, setCreated] = useState<LocalLaundryRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  // Address, processing methods and notes are needed on a minority of jobs, so
  // they stay folded away and out of the counter's fastest path.
  const [showMore, setShowMore] = useState(false);
  // Frozen for the life of one entry -- see rankGarmentsByUsage.
  const [garmentOrder, setGarmentOrder] = useState<string[]>(garmentTypes);

  const selectedService = services.find(service => String(service.id) === selectedServiceId) || services[0] || null;
  const equipment = (store.laundryEquipment || []).filter(item => item.active);
  const washOptions = [{ id: 'manual:hand-wash', name: 'Hand wash' }, ...equipment.filter(item => ['washer', 'washer_dryer'].includes(item.kind)).map(item => ({ id: item.id, name: item.name }))];
  const dryOptions = [{ id: 'manual:sun-dry', name: 'Sun dry' }, ...equipment.filter(item => ['dryer', 'washer_dryer'].includes(item.kind)).map(item => ({ id: item.id, name: item.name }))];
  const pricing = selectedService ? getStoredServicePricing(selectedService) : 'per_piece';
  const pricingLabel = getServicePricingLabel(pricing);
  const selections = useMemo<LaundryGarmentSelection[]>(
    () => Object.entries(garmentCounts).map(([garmentType, quantity]) => ({ garmentType, quantity })).filter(item => item.quantity > 0),
    [garmentCounts],
  );
  const pieceCount = countLaundryPieces(selections);
  // Most-used clothing first, then anything typed into "Other clothing type"
  // during this entry. Order is stable while tapping because garmentOrder is
  // only recalculated when the sheet opens.
  const displayGarments = useMemo(() => {
    const ranked = garmentOrder.filter(name => name in garmentCounts);
    const extras = Object.keys(garmentCounts).filter(name => !ranked.includes(name));
    return [...ranked, ...extras];
  }, [garmentOrder, garmentCounts]);
  const calculated = useMemo(
    () => selectedService ? calculateLaundryPriceLines(store, selectedService, selections, Number(billingQuantity) || 0) : { lines: [], total: 0 },
    [store, selectedService, selections, billingQuantity],
  );

  useEffect(() => {
    if (!selectedServiceId && services[0]) setSelectedServiceId(String(services[0].id));
  }, [selectedServiceId, services]);

  useEffect(() => {
    if (!selectedService || promisedTouched) return;
    setPromisedFor(suggestedPromisedLocal(selectedService.turnaround));
  }, [selectedService, promisedTouched]);

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
    setCustomerAddress('');
    setSelectedCustomerId('');
    setSelectedServiceId(services[0] ? String(services[0].id) : '');
    setGarmentCounts(emptyCounts(garmentTypes));
    setCustomGarment('');
    setBillingQuantity('1');
    setTotalPrice('');
    setPriceTouched(false);
    setNotes('');
    setPromisedFor(services[0] ? suggestedPromisedLocal(services[0].turnaround) : suggestedPromisedLocal());
    setPromisedTouched(false);
    setWashMethodId('manual:hand-wash');
    setDryMethodId('manual:sun-dry');
    setCreated(null);
    setQrDataUrl('');
    setSaving(false);
    setShowMore(false);
  };

  const openIntake = () => {
    sessionStorage.removeItem(OPEN_STORAGE);
    reset();
    setGarmentOrder(rankGarmentsByUsage(String((store as any).accessCode || ''), garmentTypes));
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
    setCustomerAddress(customer?.address || '');
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
        customerAddress: customerAddress.trim(),
        promisedFor,
        washMethodId,
        washMethodName: washOptions.find(item => item.id === washMethodId)?.name || 'Hand wash',
        dryMethodId,
        dryMethodName: dryOptions.find(item => item.id === dryMethodId)?.name || 'Sun dry',
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
          onUpdate(addCustomer(store, { name, phone, address: customerAddress.trim() || undefined }));
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
      <button onClick={openIntake} className="w-full rounded-2xl border border-primary/25 bg-primary/5 p-3.5 flex items-center justify-between gap-3 text-left active:scale-[.99] transition-transform">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Shirt className="w-4 h-4 text-primary" /></span>
          <span className="font-display font-black text-sm">New walk-in bundle</span>
        </span>
        <span className="shrink-0 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-display font-black text-xs">Record</span>
      </button>

      {open && <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center" onClick={close}>
        <div className="w-full sm:max-w-lg max-h-[94vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-background border border-border overflow-hidden" onClick={event => event.stopPropagation()}>
          {created ? <>
            <div className="shrink-0 flex justify-between items-start gap-3 border-b border-border p-4 pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-success font-bold uppercase">Laundry recorded</p>
                  {created.syncStatus === 'synced' ? (
                    <span className="px-2 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-[10px] font-black">Synced</span>
                  ) : (
                    <span className="px-2 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-[10px] font-black">Not synced</span>
                  )}
                </div>
                <h3 className="font-display font-black text-lg mt-0.5">Receipt / Tag Code</h3>
              </div>
              <button onClick={close} className="p-2 rounded-xl bg-surface-2"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 text-center">
              {qrDataUrl && <img src={qrDataUrl} alt={`Laundry ${created.tagCode} QR code`} className="w-28 h-28 mx-auto rounded-xl bg-white p-2" />}
              <p className="font-mono font-black text-4xl tracking-[0.18em] mt-3">{created.tagCode}</p>
              <p className="text-[11px] text-muted-foreground mt-2">Write this code on every cloth tag in this bundle.</p>
              <button onClick={copyTag} className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 text-primary text-xs font-bold"><ClipboardCopy className="w-3.5 h-3.5" /> Copy code</button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-left">
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Customer</p><p className="text-sm font-bold mt-1 truncate">{created.customerName}</p><p className="text-[11px] text-muted-foreground mt-0.5 truncate">{created.customerPhone}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Service</p><p className="text-sm font-bold mt-1 truncate">{created.serviceName}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Pieces</p><p className="text-sm font-bold mt-1">{created.pieceCount}</p></div>
              <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Total</p><p className="text-sm font-bold mt-1">₦{created.total.toLocaleString()}</p></div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 text-left text-xs">
              {created.customerAddress && <p><b>Address:</b> {created.customerAddress}</p>}
              {created.promisedFor && <p className="mt-1"><b>Promised:</b> {new Date(created.promisedFor).toLocaleString()}</p>}
              <p className="mt-1"><b>Methods:</b> {created.washMethodName || 'Hand wash'} · {created.dryMethodName || 'Sun dry'}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 text-left">
              <p className="text-[10px] uppercase font-black text-muted-foreground">Items</p>
              <p className="text-xs font-bold mt-1">{created.garmentSummary}</p>
            </div>

            {created.syncStatus !== 'synced' && <p className="text-[11px] text-primary text-center font-semibold">Safe on this device. StoreFlow syncs it automatically when Supabase is reachable.</p>}
            </div>

            <div className="shrink-0 border-t border-border p-4 flex gap-2">
              <button onClick={sendWhatsApp} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-display font-black text-sm flex items-center justify-center gap-2"><MessageCircle className="w-4 h-4" /> WhatsApp</button>
              <button onClick={close} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Done</button>
            </div>
          </> : <>
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border p-4 pb-3">
              <div>
                <p className="text-[10px] uppercase text-primary font-black">Physical store</p>
                <h3 className="font-display font-black text-lg mt-0.5">Record Laundry</h3>
              </div>
              <button onClick={close} className="p-2 rounded-xl bg-surface-2 shrink-0"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <section className="space-y-2 text-left">
              <p className="text-[11px] uppercase font-black text-muted-foreground">1. Customer</p>
              {customers.length > 0 && <select value={selectedCustomerId} onChange={event => selectCustomer(event.target.value)} className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-border text-sm"><option value="">New customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}</select>}
              <input value={customerName} onChange={event => { setCustomerName(event.target.value); setSelectedCustomerId(''); }} placeholder="Customer name *" className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-border text-sm" />
              <input value={customerPhone} onChange={event => { setCustomerPhone(event.target.value); setSelectedCustomerId(''); }} placeholder="Phone number * — e.g. 08012345678" inputMode="tel" className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-border text-sm" />
            </section>

            <section className="space-y-2 text-left">
              <p className="text-[11px] uppercase font-black text-muted-foreground">2. Service</p>
              {services.length === 0 ? <div className="p-3 rounded-xl border border-primary/25 bg-primary/5 text-xs text-muted-foreground">No laundry service yet. Open Price List and set your treatments and clothing prices first.</div> : <div className="grid grid-cols-2 gap-2">{services.map(service => { const active = String(service.id) === String(selectedService?.id); const servicePricing = getStoredServicePricing(service); return <button key={service.id} type="button" onClick={() => { setSelectedServiceId(String(service.id)); setPriceTouched(false); }} className={`px-3 py-2.5 rounded-xl border text-left ${active ? 'border-primary bg-primary/10' : 'border-border bg-surface-2'}`}><p className="text-xs font-black truncate">{service.name}</p><p className="text-[10px] text-muted-foreground mt-0.5 truncate">{servicePricing === 'per_piece' ? 'By clothing item' : `₦${Number(service.sellingPrice || 0).toLocaleString()} ${getServicePricingLabel(servicePricing).unitLabel}`}</p></button>; })}</div>}
            </section>

            <section className="space-y-2 text-left">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[11px] uppercase font-black text-muted-foreground">3. Clothes</p>
                <span className="text-xs font-black text-primary">{pieceCount} {pieceCount === 1 ? 'piece' : 'pieces'}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">{displayGarments.map(garment => {
                const quantity = garmentCounts[garment] || 0;
                const unitPrice = selectedService && pricing === 'per_piece' ? getLaundryGarmentPrice(store, selectedService, garment) : 0;
                return (
                  <div key={garment} className={`rounded-xl border px-2 pt-1.5 pb-1.5 ${quantity > 0 ? 'border-primary bg-primary/5' : 'border-border bg-surface-2'}`}>
                    <div className="flex items-baseline justify-between gap-1.5 leading-tight">
                      <p className="text-xs font-bold truncate">{garment}</p>
                      {selectedService && pricing === 'per_piece' && <span className="text-[10px] text-primary font-bold shrink-0">₦{unitPrice.toLocaleString()}</span>}
                    </div>
                    <div className="flex items-center justify-between gap-1 mt-1.5">
                      <button type="button" onClick={() => changeCount(garment, -1)} disabled={quantity === 0} className="w-8 h-8 shrink-0 rounded-lg border border-border bg-card flex items-center justify-center disabled:opacity-30" aria-label={`Remove one ${garment}`}><Minus className="w-3.5 h-3.5" /></button>
                      <span className="text-sm font-black tabular-nums">{quantity}</span>
                      <button type="button" onClick={() => changeCount(garment, 1)} className="w-8 h-8 shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center" aria-label={`Add one ${garment}`}><Plus className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}</div>
              <div className="flex gap-2"><input value={customGarment} onChange={event => setCustomGarment(event.target.value)} onKeyDown={event => event.key === 'Enter' && addCustomGarment()} placeholder="Other clothing type" className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-surface-2 border border-border text-sm" /><button onClick={addCustomGarment} type="button" className="px-4 h-11 rounded-xl border border-primary text-primary font-black text-xs shrink-0">Add</button></div>
            </section>

            {(pricing === 'per_kg' || pricing === 'per_load') && <section className="text-left space-y-1"><label className="text-[10px] uppercase font-black text-muted-foreground">Quantity {pricingLabel.unitLabel}</label><input value={billingQuantity} onChange={event => { setBillingQuantity(event.target.value.replace(/[^0-9.]/g, '')); setPriceTouched(false); }} inputMode="decimal" className="w-full h-11 px-3 rounded-xl bg-surface-2 border border-border text-sm" /></section>}

            <section className="space-y-2 text-left">
              <p className="text-[11px] uppercase font-black text-muted-foreground">4. Due &amp; price</p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3"><CalendarClock className="h-4 w-4 text-primary shrink-0" /><input type="datetime-local" value={promisedFor} onChange={event => { setPromisedFor(event.target.value); setPromisedTouched(true); }} className="w-full bg-transparent py-3 text-sm outline-none" /></div>
              {pricing === 'per_piece' && calculated.lines.length > 0 && <div className="rounded-xl border border-border bg-card divide-y divide-border/60">{calculated.lines.map(line => <div key={line.garmentType} className="flex justify-between gap-3 px-3 py-1.5 text-xs"><span className="truncate">{line.quantity} × {line.garmentType} @ ₦{line.unitPrice.toLocaleString()}</span><span className="font-black shrink-0">₦{line.subtotal.toLocaleString()}</span></div>)}</div>}
              <div className="flex items-center gap-2 h-11 px-3 rounded-xl bg-surface-2 border border-border"><span className="font-black">₦</span><input value={totalPrice} onChange={event => { setTotalPrice(event.target.value.replace(/[^0-9.]/g, '')); setPriceTouched(true); }} inputMode="decimal" className="w-full bg-transparent outline-none font-black" placeholder="Total price" /></div>
              {priceTouched && calculated.total !== Number(totalPrice) && <p className="text-[10px] text-muted-foreground">Manually adjusted. Calculated price is ₦{calculated.total.toLocaleString()}.</p>}
            </section>

            <section className="text-left border-t border-border/60 pt-1">
              <button type="button" onClick={() => setShowMore(current => !current)} className="w-full flex items-center justify-between gap-3 py-2">
                <span className="text-[11px] uppercase font-black text-muted-foreground">Address, processing &amp; notes</span>
                {showMore ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showMore && <div className="space-y-2 pt-1">
                <textarea value={customerAddress} onChange={event => setCustomerAddress(event.target.value)} placeholder="Pickup or delivery address" rows={2} className="w-full resize-none p-3 rounded-xl bg-surface-2 border border-border text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-[10px] uppercase font-black text-muted-foreground">Washing</label><select value={washMethodId} onChange={event => setWashMethodId(event.target.value)} className="mt-1 w-full h-11 rounded-xl border border-border bg-surface-2 px-3 text-sm">{washOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                  <div><label className="text-[10px] uppercase font-black text-muted-foreground">Drying</label><select value={dryMethodId} onChange={event => setDryMethodId(event.target.value)} className="mt-1 w-full h-11 rounded-xl border border-border bg-surface-2 px-3 text-sm">{dryOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                </div>
                {equipment.length === 0 && <p className="text-[10px] text-muted-foreground">Add washers and dryers from Records → Machines &amp; methods to assign exact equipment.</p>}
                <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Stains, damage, special instructions..." rows={2} className="w-full resize-none p-3 rounded-xl bg-surface-2 border border-border text-sm" />
              </div>}
            </section>
            </div>

            <div className="shrink-0 border-t border-border p-4 flex items-center gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-black text-muted-foreground">{pieceCount} {pieceCount === 1 ? 'piece' : 'pieces'}</p>
                <p className="font-display font-black text-lg leading-tight">₦{(Number(totalPrice) || 0).toLocaleString()}</p>
              </div>
              <button disabled={!canSave || saving} onClick={saveIntake} className="flex-1 py-3.5 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm disabled:opacity-40">{saving ? 'Saving…' : 'Record Laundry'}</button>
            </div>
          </>}
        </div>
      </div>}
    </>
  );
}
