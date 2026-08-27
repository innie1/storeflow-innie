import { useEffect, useMemo, useState } from 'react';
import type { StoreData } from '@/types/store';
import { supabase } from '@/integrations/supabase/client';
import { addCustomer } from '@/lib/store-data';
import { getServicePricingLabel, getStoredServicePricing } from '@/lib/service-pricing';
import {
  DEFAULT_LAUNDRY_GARMENTS,
  buildLaundryOrderItems,
  countLaundryPieces,
  expandLaundryGarments,
  generateLaundryReceiptNumber,
  sanitizeGarmentSelections,
  suggestedLaundryTotal,
  summarizeLaundryGarments,
  type LaundryGarmentSelection,
} from '@/lib/laundry-intake';
import { showToast } from '@/components/Toast';
import { Check, ClipboardCopy, Minus, Plus, ReceiptText, Shirt, X } from 'lucide-react';

interface Props {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

interface CreatedRecord {
  receiptNumber: string;
  tags: string[];
  customerName: string;
  serviceName: string;
  total: number;
}

function emptyCounts(): Record<string, number> {
  return Object.fromEntries(DEFAULT_LAUNDRY_GARMENTS.map(name => [name, 0]));
}

export default function LaundryWalkInIntake({ store, onUpdate }: Props) {
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

  const close = () => {
    setOpen(false);
    reset();
  };

  const openIntake = () => {
    reset();
    setOpen(true);
  };

  const selectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    const customer = customers.find(item => item.id === id);
    if (customer) {
      setCustomerName(customer.name);
      setCustomerPhone(customer.phone || '');
    } else {
      setCustomerName('');
      setCustomerPhone('');
    }
  };

  const changeCount = (garment: string, delta: number) => {
    setGarmentCounts(current => ({
      ...current,
      [garment]: Math.max(0, (current[garment] || 0) + delta),
    }));
  };

  const addCustomGarment = () => {
    const name = customGarment.trim();
    if (!name) return;
    const existingKey = Object.keys(garmentCounts).find(key => key.toLowerCase() === name.toLowerCase());
    const key = existingKey || name;
    setGarmentCounts(current => ({ ...current, [key]: (current[key] || 0) + 1 }));
    setCustomGarment('');
  };

  const makeUniqueReceiptNumber = async (storeId: string): Promise<string> => {
    const client = supabase as any;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateLaundryReceiptNumber();
      const { data, error } = await client
        .from('orders')
        .select('id')
        .eq('store_id', storeId)
        .eq('order_number', candidate)
        .limit(1);
      if (error) throw error;
      if (!data?.length) return candidate;
    }
    return `${generateLaundryReceiptNumber()}-${Date.now().toString().slice(-3)}`;
  };

  const saveIntake = async () => {
    const storeId = String((store as any).id || '');
    const name = customerName.trim();
    const phone = customerPhone.trim();
    const cleanSelections = sanitizeGarmentSelections(selections);
    const agreedTotal = Number(totalPrice);
    const billingQty = Number(billingQuantity) || 0;

    if (!storeId) return showToast('Store is still syncing. Try again in a moment.', 'error');
    if (!name) return showToast('Enter the customer name', 'error');
    if (!selectedService) return showToast('Add and select a laundry service first', 'error');
    if (cleanSelections.length === 0) return showToast('Record at least one item of clothing', 'error');
    if ((pricing === 'per_kg' || pricing === 'per_load') && !(billingQty > 0)) {
      return showToast(`Enter the ${pricing === 'per_kg' ? 'KG' : 'load'} quantity`, 'error');
    }
    if (!Number.isFinite(agreedTotal) || agreedTotal < 0) return showToast('Enter a valid total price', 'error');

    setSaving(true);
    const client = supabase as any;
    let createdOrderId: string | null = null;

    try {
      const receiptNumber = await makeUniqueReceiptNumber(storeId);
      const expandedGarments = expandLaundryGarments(receiptNumber, cleanSelections);
      const garmentSummary = summarizeLaundryGarments(cleanSelections);
      const serviceName = selectedService.name;
      const orderItems = buildLaundryOrderItems(selectedService, cleanSelections, agreedTotal, billingQty);
      const intakeNotes = {
        source: 'walk_in_laundry',
        intake_type: 'physical_store',
        service_id: String(selectedService.id),
        service_name: serviceName,
        pricing,
        billing_quantity: pricing === 'per_kg' || pricing === 'per_load' ? billingQty : undefined,
        garment_count: expandedGarments.length,
        garment_summary: garmentSummary,
        receipt_number: receiptNumber,
        tag_prefix: receiptNumber,
        instructions: notes.trim() || `Walk-in laundry: ${garmentSummary}`,
      };

      const { data: order, error: orderError } = await client
        .from('orders')
        .insert({
          store_id: storeId,
          customer_name: name,
          customer_phone: phone || null,
          order_number: receiptNumber,
          status: 'Accepted',
          subtotal: agreedTotal,
          discount: 0,
          total: agreedTotal,
          notes: JSON.stringify(intakeNotes),
          business_type: 'laundry',
          order_kind: 'service',
          workflow_stage: 'received',
          service_metadata: intakeNotes,
        })
        .select('id')
        .single();
      if (orderError || !order?.id) throw orderError || new Error('Could not create laundry record');
      createdOrderId = order.id;

      const { data: insertedItems, error: itemError } = await client
        .from('order_items')
        .insert(orderItems.map(item => ({ ...item, order_id: order.id })))
        .select('id, product_id, item_name');
      if (itemError) throw itemError;

      const firstOrderItemId = insertedItems?.[0]?.id || null;
      const { error: laundryError } = await client
        .from('laundry_order_items')
        .insert(expandedGarments.map(garment => ({
          order_id: order.id,
          order_item_id: firstOrderItemId,
          store_id: storeId,
          garment_type: garment.garmentType,
          tag_code: garment.tagCode,
          quantity: 1,
          special_instructions: notes.trim() || null,
          workflow_stage: 'received',
          metadata: {
            source: 'walk_in_laundry',
            sequence: garment.sequence,
            service_id: String(selectedService.id),
            service_name: serviceName,
          },
        })));
      if (laundryError) throw laundryError;

      if (phone && !customers.some(customer => customer.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''))) {
        try {
          const updatedStore = addCustomer(store, { name, phone });
          onUpdate(updatedStore);
        } catch (customerError) {
          console.warn('[Laundry Intake] Customer book update failed:', customerError);
        }
      }

      window.dispatchEvent(new CustomEvent('storeflow:order-created', { detail: { orderId: order.id } }));
      setCreated({
        receiptNumber,
        tags: expandedGarments.map(garment => garment.tagCode),
        customerName: name,
        serviceName,
        total: agreedTotal,
      });
      showToast(`Laundry recorded — ${receiptNumber}`, 'success');
    } catch (error: any) {
      console.error('[Laundry Intake] Failed:', error);
      if (createdOrderId) {
        try { await client.from('orders').delete().eq('id', createdOrderId); } catch { /* best effort rollback */ }
      }
      showToast(error?.message || 'Could not save laundry record', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyReceipt = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.receiptNumber);
      showToast('Receipt number copied');
    } catch {
      showToast(created.receiptNumber, 'info');
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 flex items-center justify-between gap-3">
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"><Shirt className="w-4.5 h-4.5 text-primary" /></div>
            <div>
              <p className="font-display font-black text-sm text-foreground">Walk-in Laundry</p>
              <p className="text-[11px] text-muted-foreground">Record clothes brought physically to the shop.</p>
            </div>
          </div>
        </div>
        <button onClick={openIntake} className="shrink-0 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-display font-black text-xs active:scale-95">
          Record Laundry
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-end sm:items-center justify-center" onClick={close}>
          <div className="w-full sm:max-w-lg max-h-[94vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-background border border-border p-4 sm:p-5" onClick={event => event.stopPropagation()}>
            {created ? (
              <div className="space-y-5 py-2">
                <div className="flex justify-between items-start gap-3">
                  <div className="text-left"><p className="text-xs text-success font-bold uppercase">Laundry recorded</p><h3 className="font-display font-black text-xl mt-1">Receipt &amp; Tag Number</h3></div>
                  <button onClick={close} className="p-2 rounded-xl bg-surface-2"><X className="w-4 h-4" /></button>
                </div>
                <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 text-center">
                  <ReceiptText className="w-7 h-7 text-primary mx-auto mb-2" />
                  <p className="font-mono font-black text-xl tracking-wide break-all">{created.receiptNumber}</p>
                  <p className="text-xs text-muted-foreground mt-2">Search this number later to find the complete job.</p>
                  <button onClick={copyReceipt} className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/30 text-primary text-xs font-bold"><ClipboardCopy className="w-3.5 h-3.5" /> Copy number</button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-left">
                  <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Customer</p><p className="text-sm font-bold mt-1 truncate">{created.customerName}</p></div>
                  <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Service</p><p className="text-sm font-bold mt-1 truncate">{created.serviceName}</p></div>
                  <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Pieces</p><p className="text-sm font-bold mt-1">{created.tags.length}</p></div>
                  <div className="p-3 rounded-xl bg-surface-2 border border-border"><p className="text-[10px] uppercase text-muted-foreground font-bold">Total</p><p className="text-sm font-bold mt-1">₦{created.total.toLocaleString()}</p></div>
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold mb-2">Individual cloth tags</p>
                  <div className="max-h-44 overflow-y-auto grid grid-cols-2 gap-2">
                    {created.tags.map(tag => <div key={tag} className="font-mono text-[11px] p-2.5 rounded-lg border border-border bg-surface-2 break-all">{tag}</div>)}
                  </div>
                </div>
                <button onClick={close} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm flex items-center justify-center gap-2"><Check className="w-4 h-4" /> Done</button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-left"><p className="text-xs uppercase text-primary font-black">Physical store intake</p><h3 className="font-display font-black text-xl mt-0.5">Record Laundry</h3><p className="text-xs text-muted-foreground mt-1">Create one searchable receipt and tag every piece under it.</p></div>
                  <button onClick={close} className="p-2 rounded-xl bg-surface-2"><X className="w-4 h-4" /></button>
                </div>

                <section className="space-y-2.5 text-left">
                  <p className="text-[11px] uppercase font-black text-muted-foreground">1. Customer</p>
                  {customers.length > 0 && (
                    <select value={selectedCustomerId} onChange={event => selectCustomer(event.target.value)} className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm">
                      <option value="">New / walk-in customer</option>
                      {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}
                    </select>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input value={customerName} onChange={event => { setCustomerName(event.target.value); setSelectedCustomerId(''); }} placeholder="Customer name" className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm" />
                    <input value={customerPhone} onChange={event => { setCustomerPhone(event.target.value); setSelectedCustomerId(''); }} placeholder="Phone (optional)" inputMode="tel" className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm" />
                  </div>
                </section>

                <section className="space-y-2.5 text-left">
                  <p className="text-[11px] uppercase font-black text-muted-foreground">2. Service</p>
                  {services.length === 0 ? (
                    <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5 text-xs text-muted-foreground">No active laundry service exists yet. Open <b>Services</b> and add Full Service, Wash Only, Ironing, or another service first.</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {services.map(service => {
                        const servicePricing = getStoredServicePricing(service);
                        const active = String(service.id) === String(selectedService?.id);
                        return <button key={service.id} type="button" onClick={() => { setSelectedServiceId(String(service.id)); setPriceTouched(false); }} className={`p-3 rounded-xl border text-left ${active ? 'border-primary bg-primary/10 ring-1 ring-primary/20' : 'border-border bg-surface-2'}`}><p className="text-xs font-black">{service.name}</p><p className="text-[10px] text-muted-foreground mt-1">₦{Number(service.sellingPrice || 0).toLocaleString()} {getServicePricingLabel(servicePricing).unitLabel}</p></button>;
                      })}
                    </div>
                  )}
                </section>

                <section className="space-y-2.5 text-left">
                  <div className="flex items-end justify-between gap-2"><p className="text-[11px] uppercase font-black text-muted-foreground">3. Clothes brought</p><p className="text-xs font-black text-primary">{pieceCount} piece{pieceCount === 1 ? '' : 's'}</p></div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.keys(garmentCounts).map(garment => {
                      const quantity = garmentCounts[garment] || 0;
                      return <div key={garment} className={`p-2.5 rounded-xl border ${quantity > 0 ? 'border-primary/35 bg-primary/5' : 'border-border bg-surface-2/60'}`}><p className="text-xs font-bold truncate mb-2">{garment}</p><div className="flex items-center justify-between"><button type="button" onClick={() => changeCount(garment, -1)} disabled={quantity === 0} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center disabled:opacity-30"><Minus className="w-3.5 h-3.5" /></button><span className="font-display font-black text-base">{quantity}</span><button type="button" onClick={() => changeCount(garment, 1)} className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button></div></div>;
                    })}
                  </div>
                  <div className="flex gap-2"><input value={customGarment} onChange={event => setCustomGarment(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustomGarment(); } }} placeholder="Other clothing type" className="flex-1 min-w-0 p-3 rounded-xl bg-surface-2 border border-border text-sm" /><button type="button" onClick={addCustomGarment} className="px-4 rounded-xl border border-primary/30 text-primary text-xs font-bold">Add</button></div>
                </section>

                <section className="space-y-2.5 text-left">
                  <p className="text-[11px] uppercase font-black text-muted-foreground">4. Price &amp; notes</p>
                  {(pricing === 'per_kg' || pricing === 'per_load') && (
                    <div><label className="text-[10px] uppercase font-bold text-muted-foreground">{pricing === 'per_kg' ? 'Weight (KG)' : 'Number of loads'}</label><input value={billingQuantity} onChange={event => { setBillingQuantity(event.target.value.replace(/[^0-9.]/g, '')); setPriceTouched(false); }} inputMode="decimal" className="w-full mt-1 p-3 rounded-xl bg-surface-2 border border-border text-sm" /></div>
                  )}
                  <div><label className="text-[10px] uppercase font-bold text-muted-foreground">Agreed total {pricingLabel.unitLabel && <span className="normal-case">· {pricingLabel.label}</span>}</label><div className="relative mt-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">₦</span><input value={totalPrice} onChange={event => { setTotalPrice(event.target.value.replace(/[^0-9.]/g, '')); setPriceTouched(true); }} inputMode="decimal" placeholder="0" className="w-full pl-8 pr-3 py-3 rounded-xl bg-surface-2 border border-border text-sm font-bold" /></div></div>
                  <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} placeholder="Stains, damage, special instruction, colour note…" className="w-full p-3 rounded-xl bg-surface-2 border border-border text-sm resize-none" />
                </section>

                <div className="rounded-xl bg-surface-2 border border-border p-3 text-xs text-left"><span className="font-black">What happens next:</span> StoreFlow generates one receipt number for the job and a separate tag code for every physical piece. The receipt stays searchable in Orders.</div>
                <button onClick={saveIntake} disabled={saving || services.length === 0} className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-display font-black text-sm disabled:opacity-50 active:scale-[0.99]">{saving ? 'Recording…' : `Record ${pieceCount || ''} Laundry Item${pieceCount === 1 ? '' : 's'}`}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
