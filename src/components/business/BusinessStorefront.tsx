import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Camera, FileUp, MapPin, MessageSquare, Minus, Plus, ShoppingBag, Truck, Upload, Clock3 } from 'lucide-react';
import type { StoreData } from '@/types/store';
import { getBusinessTemplate } from '@/lib/business-templates';

interface BusinessStorefrontProps {
  store: StoreData;
  onContinue?: () => void;
}

export default function BusinessStorefront({ store, onContinue }: BusinessStorefrontProps) {
  const template = getBusinessTemplate(store.storeType);
  const [quantity, setQuantity] = useState(1);
  const [selectedOffering, setSelectedOffering] = useState(template.offerings[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [showDetails, setShowDetails] = useState(false);

  const selected = useMemo(() => template.offerings.find(o => o.id === selectedOffering), [selectedOffering, template.offerings]);
  const isLaundry = template.type === 'laundry';
  const isGaming = template.type === 'games';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-4">
        <div className="max-w-xl mx-auto flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl">{template.icon}</div>
          <div className="min-w-0">
            <h1 className="font-display font-bold text-lg truncate">{store.storeName}</h1>
            <p className="text-xs text-muted-foreground">{template.name}</p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 pb-10 space-y-5">
        <section className="pt-3">
          <p className="text-sm text-muted-foreground">{template.customerExperience.intro}</p>
          <h2 className="font-display font-bold text-2xl mt-1">{template.customerExperience.primaryAction}</h2>
        </section>

        {template.offerings.length > 0 && (
          <section className="space-y-2">
            <h3 className="font-display font-bold">Choose what you need</h3>
            <div className="grid grid-cols-2 gap-2">
              {template.offerings.map(item => (
                <button key={item.id} onClick={() => setSelectedOffering(item.id)} className={`rounded-2xl border p-4 text-left transition ${selectedOffering === item.id ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
                  <div className="text-2xl">{item.icon}</div>
                  <div className="font-semibold mt-2">{item.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{item.pricing === 'time' ? 'Charged by time' : item.pricing === 'weight' ? 'Charged by KG' : item.pricing === 'item' ? 'Charged per item' : 'Price shown by store'}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {(isLaundry || template.customerFeatures.quantity || template.customerFeatures.metering) && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold">{template.customerExperience.simpleChoiceLabel || (template.customerFeatures.metering ? 'How much?' : 'Quantity')}</h3>
                <p className="text-xs text-muted-foreground mt-1">{template.customerExperience.simpleChoiceHint || 'Choose how many you need.'}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-9 h-9 rounded-full border border-border flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                <span className="font-bold text-lg min-w-6 text-center">{quantity}</span>
                <button onClick={() => setQuantity(quantity + 1)} className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
            {isLaundry && <p className="text-xs text-primary mt-3">You can continue with just the total number of clothes.</p>}
          </section>
        )}

        {isLaundry && (
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between"><div><h3 className="font-display font-bold">Want to specify the clothes?</h3><p className="text-xs text-muted-foreground">Optional — trousers, shorts, shirts, native, etc.</p></div><button onClick={() => setShowDetails(!showDetails)} className="text-sm font-semibold text-primary">{showDetails ? 'Hide' : 'Add details'}</button></div>
            {showDetails && <div className="grid grid-cols-2 gap-2 text-sm">
              {['Trousers', 'Shorts', 'Shirts', 'Native', 'Dresses', 'Jackets', 'Duvets', 'Bedsheets'].map(type => <button key={type} className="p-3 rounded-xl border border-border text-left hover:border-primary">{type}</button>)}
            </div>}
          </section>
        )}

        {template.customerFeatures.photos || template.customerFeatures.files ? (
          <section className="grid grid-cols-2 gap-2">
            {template.customerFeatures.photos && <button className="p-4 rounded-2xl border border-dashed border-border bg-card flex items-center gap-3 text-left"><Camera className="w-5 h-5 text-primary" /><span><b className="block text-sm">Add photo</b><small className="text-muted-foreground">Reference image</small></span></button>}
            {template.customerFeatures.files && <button className="p-4 rounded-2xl border border-dashed border-border bg-card flex items-center gap-3 text-left"><FileUp className="w-5 h-5 text-primary" /><span><b className="block text-sm">Add file</b><small className="text-muted-foreground">PDF or document</small></span></button>}
          </section>
        ) : null}

        {template.customerFeatures.notes && <section className="rounded-2xl border border-border bg-card p-4"><div className="flex gap-2 items-center mb-2"><MessageSquare className="w-4 h-4 text-primary" /><h3 className="font-display font-bold">Special instructions</h3></div><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything we should know?" className="w-full min-h-24 bg-transparent resize-none outline-none text-sm" /></section>}

        {(template.customerFeatures.pickup || template.customerFeatures.delivery) && <section className="space-y-2"><h3 className="font-display font-bold">How do you want to receive it?</h3><div className="grid grid-cols-2 gap-2">{template.customerFeatures.pickup && <button onClick={() => setFulfillment('pickup')} className={`p-4 rounded-2xl border text-left ${fulfillment === 'pickup' ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}><MapPin className="w-5 h-5 mb-2" /><b className="block">Pickup</b><span className="text-xs text-muted-foreground">I'll bring/collect it</span></button>}{template.customerFeatures.delivery && <button onClick={() => setFulfillment('delivery')} className={`p-4 rounded-2xl border text-left ${fulfillment === 'delivery' ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}><Truck className="w-5 h-5 mb-2" /><b className="block">Delivery</b><span className="text-xs text-muted-foreground">Bring it to me</span></button>}</div></section>}

        {isGaming && <section className="rounded-2xl border border-border bg-card p-4 grid grid-cols-2 gap-2"><div className="p-3 rounded-xl bg-background"><Clock3 className="w-5 h-5 text-primary mb-2" /><b className="block">Choose duration</b><span className="text-xs text-muted-foreground">30 min, 1 hour or more</span></div><div className="p-3 rounded-xl bg-background"><CalendarDays className="w-5 h-5 text-primary mb-2" /><b className="block">Reserve time</b><span className="text-xs text-muted-foreground">Pick a convenient time</span></div></section>}

        <button onClick={onContinue} className="w-full p-4 rounded-2xl bg-primary text-primary-foreground font-display font-bold flex items-center justify-center gap-2"><ShoppingBag className="w-5 h-5" /> Continue <ArrowRight className="w-5 h-5" /></button>
      </main>
    </div>
  );
}
