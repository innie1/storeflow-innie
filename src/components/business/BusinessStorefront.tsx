import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, Minus, Plus, ShoppingBag, Truck } from 'lucide-react';
import type { Product, StoreData } from '@/types/store';
import { getBusinessTemplate } from '@/lib/business-templates';
import { getServicePricingLabel, getStoredServicePricing } from '@/lib/service-pricing';
import { placeStorefrontOrder } from '@/lib/public-storefront';

interface BusinessStorefrontProps {
  store: StoreData;
}

function activePrice(item: Product): number {
  const promoIsCurrent = Number(item.promoPrice) >= 0
    && (!item.promoUntil || new Date(item.promoUntil).getTime() >= new Date().setHours(0, 0, 0, 0));
  return Math.max(0, Number(promoIsCurrent ? item.promoPrice : item.sellingPrice) || 0);
}

function priceLabel(item: Product): string {
  if (item.isService && getStoredServicePricing(item) === 'quote') return 'Get a quote';
  const suffix = item.isService ? getServicePricingLabel(getStoredServicePricing(item)).unitLabel : '';
  return `₦${activePrice(item).toLocaleString()}${suffix ? ` ${suffix}` : ''}`;
}

export default function BusinessStorefront({ store }: BusinessStorefrontProps) {
  const template = getBusinessTemplate(store.storeType);
  const catalogue = useMemo(
    () => (store.products || []).filter(item => !item.discontinued),
    [store.products],
  );
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{ orderNumber: string; total: number } | null>(null);

  const selectedItems = catalogue.filter(item => (cart[item.id] || 0) > 0);
  const totalQuantity = selectedItems.reduce((sum, item) => sum + (cart[item.id] || 0), 0);
  const total = selectedItems.reduce((sum, item) => sum + activePrice(item) * (cart[item.id] || 0), 0);
  const settings = store.marketplaceSettings || {};
  const acceptsOrders = settings.onlineOrdersEnabled !== false && settings.temporarilyHidden !== true;
  const deliveryEnabled = settings.deliveryEnabled !== false;
  const pickupEnabled = settings.pickupEnabled !== false;

  const changeQuantity = (item: Product, delta: number) => {
    setCart(current => {
      const currentQty = current[item.id] || 0;
      const stockLimit = item.isService ? 10_000 : Math.max(0, Number(item.quantity) || 0);
      const next = Math.max(0, Math.min(stockLimit, currentQty + delta));
      return { ...current, [item.id]: next };
    });
  };

  const submitOrder = async () => {
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Enter your name and phone number.');
      return;
    }
    if (!selectedItems.length) {
      setError('Choose at least one item or service.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await placeStorefrontOrder({
        storeKey: store.id || store.storeId || store.accessCode,
        customerName,
        customerPhone,
        notes,
        fulfillment,
        items: selectedItems.map(item => ({
          offeringId: item.id,
          quantity: cart[item.id],
          isService: Boolean(item.isService),
        })),
      });
      setReceipt({ orderNumber: result.order_number, total: Number(result.total) || 0 });
      setShowCheckout(false);
      setCart({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place the order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl">{template.icon}</div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-bold text-lg truncate">{store.storeName}</h1>
            <p className="text-xs text-muted-foreground">{store.profile?.location || template.name}</p>
          </div>
          {totalQuantity > 0 && <span className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">{totalQuantity}</span>}
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 pb-32 space-y-5">
        <section className="pt-3">
          <p className="text-sm text-muted-foreground">{settings.description || `Browse what ${store.storeName} currently offers.`}</p>
          <h2 className="font-display font-bold text-2xl mt-1">{template.customerExperience.primaryAction}</h2>
        </section>

        {!acceptsOrders && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm">This store is currently not accepting online orders.</div>
        )}

        {catalogue.length === 0 ? (
          <section className="rounded-2xl border border-border bg-card p-8 text-center">
            <ShoppingBag className="w-8 h-8 text-muted-foreground mx-auto" />
            <h3 className="font-display font-bold mt-3">Nothing has been published yet</h3>
            <p className="text-sm text-muted-foreground mt-1">This store has not added any available products or services.</p>
          </section>
        ) : (
          <section className="space-y-3">
            <h3 className="font-display font-bold">Available from this store</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {catalogue.map(item => {
                const quantity = cart[item.id] || 0;
                const unavailable = !item.isService && Number(item.quantity || 0) <= 0;
                return (
                  <article key={item.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="min-h-16">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-display font-bold">{item.name}</h4>
                          <p className="text-xs text-muted-foreground mt-1">{(item as any).description || item.category || (item.isService ? 'Service' : 'Product')}</p>
                        </div>
                        {item.isService && <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">SERVICE</span>}
                      </div>
                      {item.turnaround && <p className="text-xs text-muted-foreground mt-2">Ready: {item.turnaround}</p>}
                    </div>
                    <div className="flex items-end justify-between gap-3 mt-4">
                      <div>
                        <p className="font-display font-black text-primary">{priceLabel(item)}</p>
                        {unavailable && <p className="text-[11px] text-destructive mt-1">Out of stock</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        {quantity > 0 && <button aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item, -1)} className="w-9 h-9 rounded-full border border-border flex items-center justify-center"><Minus className="w-4 h-4" /></button>}
                        {quantity > 0 && <span className="font-bold min-w-5 text-center">{quantity}</span>}
                        <button aria-label={`Add one ${item.name}`} disabled={unavailable || !acceptsOrders} onClick={() => changeQuantity(item, 1)} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"><Plus className="w-4 h-4" /></button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {receipt && (
          <section className="rounded-2xl border border-success/30 bg-success/10 p-5 text-center">
            <CheckCircle2 className="w-9 h-9 text-success mx-auto" />
            <h3 className="font-display font-bold mt-2">Order sent to {store.storeName}</h3>
            <p className="text-sm mt-1">Order number: <b>{receipt.orderNumber}</b></p>
            <p className="text-sm text-muted-foreground">Total: ₦{receipt.total.toLocaleString()}</p>
          </section>
        )}
      </main>

      {totalQuantity > 0 && acceptsOrders && (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur p-4">
          <button onClick={() => setShowCheckout(true)} className="max-w-xl mx-auto w-full p-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold flex items-center justify-between">
            <span>Checkout · {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}</span>
            <span>₦{total.toLocaleString()}</span>
          </button>
        </div>
      )}

      {showCheckout && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={() => !submitting && setShowCheckout(false)}>
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-background p-5 space-y-4" onClick={event => event.stopPropagation()}>
            <div><h3 className="font-display font-bold text-lg">Complete your order</h3><p className="text-xs text-muted-foreground">No account is required.</p></div>
            <input value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Your name" className="w-full p-3 rounded-xl border border-border bg-card" />
            <input value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="Phone number" inputMode="tel" className="w-full p-3 rounded-xl border border-border bg-card" />
            <textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Notes (optional)" className="w-full min-h-20 p-3 rounded-xl border border-border bg-card resize-none" />
            {(pickupEnabled || deliveryEnabled) && <div className="grid grid-cols-2 gap-2">
              {pickupEnabled && <button onClick={() => setFulfillment('pickup')} className={`p-3 rounded-xl border text-left ${fulfillment === 'pickup' ? 'border-primary bg-primary/10' : 'border-border'}`}><MapPin className="w-4 h-4 mb-1" /><b className="text-sm">Pickup</b></button>}
              {deliveryEnabled && <button onClick={() => setFulfillment('delivery')} className={`p-3 rounded-xl border text-left ${fulfillment === 'delivery' ? 'border-primary bg-primary/10' : 'border-border'}`}><Truck className="w-4 h-4 mb-1" /><b className="text-sm">Delivery</b></button>}
            </div>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button disabled={submitting} onClick={submitOrder} className="w-full p-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Place order · ₦{total.toLocaleString()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
