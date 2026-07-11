import React, { useState, useEffect, useMemo } from 'react';
import { StoreData, Product } from '@/types/store';
import { showToast } from '@/components/Toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Store, Eye, Percent, Clock, CreditCard, MapPin, 
  Calendar, Bell, UserCheck, ShieldAlert, Check, X,
  ExternalLink, ChevronRight, Phone
} from 'lucide-react';

interface MarketplaceSettingsProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

export default function MarketplaceSettings({ store, onUpdate }: MarketplaceSettingsProps) {
  // Load initial settings or fallback to defaults
  const settings = useMemo(() => {
    const defaultSettings = {
      // 1. Store Visibility
      marketplaceListingEnabled: true,
      onlineOrdersEnabled: true,
      scanBuyEnabled: true,
      inStoreScanEnabled: true,
      temporarilyHidden: false,
      storeOpen: true,

      // 2. Preview settings
      description: store.profile?.address || 'Premium Nigerian marketplace store',
      coverImage: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80',
      rating: 4.8,
      deliveryTime: '20-30 mins',
      isFeatured: true,

      // 3. Pricing
      pricingMode: 'both' as 'retail' | 'wholesale' | 'both',

      // 4. Promotions & Rewards
      scanBuyRewardType: 'percentage' as 'none' | 'flat' | 'percentage' | 'points',
      scanBuyRewardValue: 10,
      onlineOrderRewardType: 'percentage' as 'none' | 'flat' | 'percentage' | 'points',
      onlineOrderRewardValue: 5,
      deliveryRewardType: 'free' as 'none' | 'free' | 'flat' | 'percentage',
      deliveryRewardValue: 0,
      deliveryMinSpend: 5000,
      deliveryExpiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],

      // 5. Order Workflow
      orderWorkflowMode: 'approval' as 'approval' | 'auto',
      defaultPrepTime: '20' as string,
      customPrepTime: 25,

      // 6. Payment Settings
      paymentCashEnabled: true,
      paymentPosEnabled: true,
      paymentCardEnabled: false,
      paymentTransferEnabled: true,
      paymentWalletEnabled: true,
      paymentTiming: 'after' as 'before' | 'after' | 'pickup' | 'delivery',
      bankName: 'Access Bank',
      bankAccountName: store.storeName,
      bankAccountNumber: '1234567890',
      paymentQr: '',

      // 7. Delivery Settings
      deliveryRadius: 10,
      deliveryFee: 1500,
      freeDeliveryThreshold: 20000,
      deliveryMinOrder: 2000,
      deliveryMaxDistance: 25,
      pickupEnabled: true,
      deliveryEnabled: true,

      // 8. Business Hours
      openingTime: '08:00',
      closingTime: '21:00',
      businessDays: [1, 2, 3, 4, 5, 6] as number[],
      holidaysEnabled: false,
      temporaryClosure: false,

      // 9. Notification Settings
      notifNewOrders: true,
      notifPayments: true,
      notifMessages: true,
      notifDelivery: true,
      notifStock: true,
      alertSound: true,
      alertVibration: true,
      alertPopup: true,
      alertBadge: true,

      // 10. Checkout requirements
      reqCustomerName: true,
      reqCustomerPhone: true,
      reqCustomerEmail: false,
      reqCustomerAddress: true,
      reqCustomerLandmark: true,
      reqCustomerNotes: false,
    };

    return {
      ...defaultSettings,
      ...(store.marketplaceSettings || {})
    };
  }, [store.marketplaceSettings, store.storeName, store.profile]);

  // Form states matching variables
  const [form, setForm] = useState(settings);
  const [activeSection, setActiveSection] = useState<string>('visibility');
  const [saving, setSaving] = useState(false);

  // Sync pricing settings with store.managerSettings pricing toggles
  const updatePricingModes = (pricingMode: 'retail' | 'wholesale' | 'both') => {
    let retailEnabled = true;
    let wholesaleEnabled = true;

    if (pricingMode === 'retail') {
      wholesaleEnabled = false;
    } else if (pricingMode === 'wholesale') {
      retailEnabled = false;
    }

    const updatedSettings = {
      ...form,
      pricingMode
    };

    setForm(updatedSettings);

    const updatedStore = {
      ...store,
      marketplaceSettings: updatedSettings,
      managerSettings: {
        ...(store.managerSettings || {}),
        retailPricingEnabled: retailEnabled,
        wholesalePricingEnabled: wholesaleEnabled,
      }
    };

    onUpdate(updatedStore);
  };

  const handleChange = (key: keyof typeof settings, val: any) => {
    const updated = { ...form, [key]: val };
    setForm(updated);

    // Auto-update standard managerSettings properties if they map
    let extraMgr: any = {};
    if (key === 'alertSound') {
      extraMgr.orderAlertSoundsEnabled = val;
    }

    const updatedStore: StoreData = {
      ...store,
      marketplaceSettings: updated,
      managerSettings: {
        ...(store.managerSettings || {}),
        ...extraMgr
      }
    };

    // Save locally and trigger background Supabase sync
    onUpdate(updatedStore);
  };

  // Explicit Save trigger to immediately push changes to Supabase and update customer application in real time
  const handleSaveToCloud = async () => {
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        showToast('Local settings updated. Sign in to synchronize changes with customer application.', 'info');
        setSaving(false);
        return;
      }

      const storeId = store.storeId || store.accessCode;
      const storeUrl = `https://customer.storeflow.app/s/${storeId}`;

      const { error } = await supabase
        .from('stores')
        .update({
          data: store as any,
          updated_at: new Date().toISOString()
        })
        .eq('access_code', store.accessCode);

      if (error) throw error;
      showToast('Marketplace settings updated live in customer application! ⚡', 'success');
    } catch (err: any) {
      console.error("Failed to update marketplace settings live in database:", err);
      showToast(err.message || 'Failed to update settings in the cloud.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Order Workflow Simulation States ───
  const [simulateWorkflowStep, setSimulateWorkflowStep] = useState<'received' | 'preparing' | 'ready' | 'delivery' | 'completed'>('received');
  const [prepTimeRemaining, setPrepTimeRemaining] = useState<number>(0);
  const [prepTimeSelected, setPrepTimeSelected] = useState<string>('20');
  const [customTimeInput, setCustomTimeInput] = useState<string>('25');

  useEffect(() => {
    if (simulateWorkflowStep !== 'preparing') return;
    const interval = setInterval(() => {
      setPrepTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setSimulateWorkflowStep('ready');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [simulateWorkflowStep]);

  const handleStartPrep = (mins: number) => {
    setPrepTimeRemaining(mins * 60);
    setSimulateWorkflowStep('preparing');
  };

  // Cover images presets
  const COVER_PRESETS = [
    { name: 'Supermarket', url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80' },
    { name: 'Grocery', url: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80' },
    { name: 'Bake Shop', url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&auto=format&fit=crop&q=80' },
    { name: 'Pharmacy', url: 'https://images.unsplash.com/photo-1586015555751-63bb77f4322a?w=800&auto=format&fit=crop&q=80' },
  ];

  // ─── Promo/Rewards Badge Text ───
  const promoBadgeText = useMemo(() => {
    let parts = [];
    if (form.scanBuyRewardType !== 'none') {
      const val = form.scanBuyRewardType === 'percentage' ? `${form.scanBuyRewardValue}%` : `₦${form.scanBuyRewardValue}`;
      parts.push(`Scan & Buy: ${val} ${form.scanBuyRewardType === 'points' ? 'Points' : 'Off'}`);
    }
    if (form.onlineOrderRewardType !== 'none') {
      const val = form.onlineOrderRewardType === 'percentage' ? `${form.onlineOrderRewardValue}%` : `₦${form.onlineOrderRewardValue}`;
      parts.push(`Online Orders: ${val} ${form.onlineOrderRewardType === 'points' ? 'Points' : 'Off'}`);
    }
    if (form.deliveryRewardType === 'free') {
      parts.push(`Free Delivery on orders over ₦${form.deliveryMinSpend.toLocaleString()}`);
    } else if (form.deliveryRewardType !== 'none') {
      const val = form.deliveryRewardType === 'percentage' ? `${form.deliveryRewardValue}%` : `₦${form.deliveryRewardValue}`;
      parts.push(`Delivery Promo: ${val} off on orders over ₦${form.deliveryMinSpend.toLocaleString()}`);
    }
    return parts.join(' | ') || 'No active promotions';
  }, [form]);

  // Phone normalization logic
  const [phoneNumberInput, setPhoneNumberInput] = useState('');
  const [normalizedPhoneOutput, setNormalizedPhoneOutput] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState<boolean | null>(null);

  const testPhoneNormalization = (input: string) => {
    setPhoneNumberInput(input);
    const cleaned = input.replace(/\D/g, '');
    let normalized = '';
    let valid = false;

    if (cleaned.startsWith('234') && cleaned.length === 13) {
      normalized = '+' + cleaned;
      valid = true;
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
      normalized = '+234' + cleaned.substring(1);
      valid = true;
    } else if (cleaned.length === 10) {
      normalized = '+234' + cleaned;
      valid = true;
    } else if (cleaned.startsWith('8') || cleaned.startsWith('7') || cleaned.startsWith('9')) {
      if (cleaned.length === 10) {
        normalized = '+234' + cleaned;
        valid = true;
      }
    }

    setNormalizedPhoneOutput(normalized);
    setIsPhoneValid(input ? valid : null);
  };

  const sections = [
    { id: 'visibility', label: 'Store Visibility', icon: <Store className="w-4 h-4" /> },
    { id: 'preview', label: 'Storefront Preview', icon: <Eye className="w-4 h-4" /> },
    { id: 'pricing', label: 'Pricing Settings', icon: <Percent className="w-4 h-4" /> },
    { id: 'promotions', label: 'Promotions & Rewards', icon: <Percent className="w-4 h-4" /> },
    { id: 'workflow', label: 'Order Workflow', icon: <Clock className="w-4 h-4" /> },
    { id: 'payment', label: 'Payment Settings', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'delivery', label: 'Delivery Settings', icon: <MapPin className="w-4 h-4" /> },
    { id: 'hours', label: 'Business Hours', icon: <Calendar className="w-4 h-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
    { id: 'requirements', label: 'Customer Requirements', icon: <UserCheck className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-12 md:gap-6 items-start pb-20">
      {/* Save Button for Cloud Sync */}
      <div className="w-full md:col-span-12 flex justify-between items-center bg-card p-4 rounded-2xl shadow-card">
        <div>
          <h2 className="font-display font-bold text-lg">Marketplace Control Center</h2>
          <p className="text-xs text-muted-foreground">Sync controls instantly with the customer web application.</p>
        </div>
        <button
          onClick={handleSaveToCloud}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {saving ? 'Publishing...' : 'Publish Live Settings'}
        </button>
      </div>

      {/* Navigation list */}
      <div className="w-full md:col-span-4 flex md:flex-col gap-2 overflow-x-auto no-scrollbar md:overflow-x-visible pb-2 md:pb-0">
        {sections.map(sec => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all shrink-0 md:shrink ${
              activeSection === sec.id 
                ? 'bg-primary text-primary-foreground shadow-md' 
                : 'bg-card text-foreground hover:bg-surface-2 hover:ring-1 hover:ring-primary/20'
            }`}
          >
            {sec.icon}
            <span>{sec.label}</span>
          </button>
        ))}
      </div>

      {/* Section Content Area */}
      <div className="w-full md:col-span-8 space-y-6">
        <div className="bg-card shadow-card rounded-3xl p-5 border border-border/80">
          
          {/* 1. Store Visibility */}
          {activeSection === 'visibility' && (
            <div className="space-y-5">
              <h3 className="font-display font-bold text-base flex items-center gap-2 border-b border-border pb-3">
                <Store className="w-5 h-5 text-primary" />
                <span>Store Visibility Controls</span>
              </h3>
              
              <div className="space-y-4">
                <ToggleRow
                  label="Enable Marketplace Listing"
                  description="List your store on the public customer directory."
                  checked={form.marketplaceListingEnabled}
                  onChange={v => handleChange('marketplaceListingEnabled', v)}
                />
                <ToggleRow
                  label="Accept Online Orders"
                  description="Allow customers to place order deliveries or pickups remotely."
                  checked={form.onlineOrdersEnabled}
                  onChange={v => handleChange('onlineOrdersEnabled', v)}
                />
                <ToggleRow
                  label="Accept Scan & Buy Orders"
                  description="Allow in-store customer checkout by scanning product barcodes."
                  checked={form.scanBuyEnabled}
                  onChange={v => handleChange('scanBuyEnabled', v)}
                />
                <ToggleRow
                  label="Accept In-Store Scan Orders"
                  description="Allow customers to scan a QR code at their table/counter to order."
                  checked={form.inStoreScanEnabled}
                  onChange={v => handleChange('inStoreScanEnabled', v)}
                />
                <ToggleRow
                  label="Temporarily Hide Store"
                  description="Delist the store immediately from all public search lists."
                  checked={form.temporarilyHidden}
                  onChange={v => handleChange('temporarilyHidden', v)}
                />
                <ToggleRow
                  label="Store Open Status"
                  description="Manually toggle if the store is open for ordering right now."
                  checked={form.storeOpen}
                  onChange={v => handleChange('storeOpen', v)}
                />
              </div>
            </div>
          )}

          {/* 2. Customer Store Preview */}
          {activeSection === 'preview' && (
            <div className="space-y-5">
              <h3 className="font-display font-bold text-base flex items-center gap-2 border-b border-border pb-3">
                <Eye className="w-5 h-5 text-primary" />
                <span>Live Customer Storefront Preview</span>
              </h3>

              {/* Editable configurations */}
              <div className="space-y-4 bg-surface-2 p-4 rounded-2xl border border-border">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-1">Store Description</label>
                  <input
                    value={form.description}
                    onChange={e => handleChange('description', e.target.value)}
                    className="w-full p-2 rounded bg-card border border-border text-foreground text-sm"
                    placeholder="Short description of your store"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase mb-2">Cover Image Preset</label>
                  <div className="grid grid-cols-2 gap-2">
                    {COVER_PRESETS.map(img => (
                      <button
                        key={img.name}
                        onClick={() => handleChange('coverImage', img.url)}
                        className={`p-2 rounded-xl text-xs border font-semibold flex flex-col gap-1 items-start ${
                          form.coverImage === img.url ? 'border-primary bg-primary/10' : 'border-border bg-card'
                        }`}
                      >
                        <img src={img.url} alt="" className="w-full h-12 object-cover rounded-lg" />
                        <span>{img.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <ToggleRow
                  label="Show Featured Badge"
                  description="Display a premium 'Featured' badge on your storefront header."
                  checked={form.isFeatured}
                  onChange={v => handleChange('isFeatured', v)}
                />
              </div>

              {/* Customer view simulation */}
              <div className="border border-border/80 rounded-3xl overflow-hidden bg-[#121214] text-white shadow-xl max-w-sm mx-auto">
                {/* Cover & Logo */}
                <div className="relative h-32 w-full">
                  <img src={form.coverImage} alt="" className="w-full h-full object-cover opacity-80" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute bottom-3 left-4 flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center text-xl shadow-lg border border-white/20">
                      🏪
                    </div>
                    <div>
                      <h4 className="font-display font-bold text-md leading-tight">{store.storeName}</h4>
                      {form.isFeatured && (
                        <span className="inline-block bg-yellow-500 text-black text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider mt-0.5">⭐ Featured</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="p-4 space-y-3">
                  <p className="text-[11px] text-zinc-400 leading-normal">{form.description}</p>
                  
                  <div className="flex gap-4 text-[10px] text-zinc-300 bg-zinc-900/50 p-2 rounded-xl border border-zinc-800">
                    <div>⭐ {form.rating} Rating</div>
                    <div>🕒 {form.deliveryTime} Delivery</div>
                    <div>🇳🇬 {form.storeOpen ? '🟢 Open Now' : '🔴 Closed'}</div>
                  </div>

                  {/* Promo Banner preview if exists */}
                  {promoBadgeText !== 'No active promotions' && (
                    <div className="bg-primary/10 border border-primary/20 text-primary text-[10px] p-2 rounded-xl flex items-center gap-1.5 animate-pulse">
                      <span>🏷️</span>
                      <span className="font-semibold line-clamp-1">{promoBadgeText}</span>
                    </div>
                  )}

                  {/* Categories list */}
                  <div>
                    <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-1.5">Categories</p>
                    <div className="flex gap-1 overflow-x-auto no-scrollbar">
                      {['All', store.category || 'Retail', 'Fast Sellers'].map((cat, idx) => (
                        <span key={idx} className={`px-2.5 py-1 rounded-full text-[9px] font-semibold ${idx === 0 ? 'bg-primary text-white' : 'bg-zinc-800 text-zinc-400'}`}>
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Product Cards preview */}
                  <div>
                    <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-2">Featured Products</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(store.products || []).slice(0, 2).map((p: Product) => {
                        const whPrice = p.sellingPrice ?? p.selling_price ?? 0;
                        const rtPrice = p.isCartonSingleEnabled ? (p.singleSellingPrice ?? whPrice) : whPrice;
                        return (
                          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 space-y-1.5 text-left">
                            <div className="w-full h-16 bg-zinc-800 rounded-lg flex items-center justify-center text-lg">📦</div>
                            <h5 className="text-[11px] font-semibold truncate leading-tight">{p.name || p.productName}</h5>
                            <div className="flex justify-between items-center">
                              <div>
                                {form.pricingMode !== 'wholesale' && (
                                  <p className="text-[9px] text-zinc-400">Retail: ₦{(rtPrice || 0).toLocaleString()}</p>
                                )}
                                {form.pricingMode !== 'retail' && (
                                  <p className="text-[9px] text-zinc-400">Wholesale: ₦{(whPrice || 0).toLocaleString()}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. Pricing Settings */}
          {activeSection === 'pricing' && (
            <div className="space-y-5">
              <h3 className="font-display font-bold text-base flex items-center gap-2 border-b border-border pb-3">
                <Percent className="w-5 h-5 text-primary" />
                <span>Pricing Model & Mode Settings</span>
              </h3>

              <p className="text-xs text-muted-foreground">Select what pricing models are displayed on the storefront to customers.</p>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'retail', label: 'Retail Only', desc: 'Customers only see Retail Prices.' },
                  { id: 'wholesale', label: 'Wholesale Only', desc: 'Customers only see Wholesale Prices.' },
                  { id: 'both', label: 'Retail + Wholesale', desc: 'Customers toggle pricing modes.' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => updatePricingModes(opt.id as any)}
                    className={`p-4 rounded-2xl border text-left flex flex-col gap-2 transition-all cursor-pointer ${
                      form.pricingMode === opt.id 
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                        : 'border-border bg-surface-2 hover:border-primary/20'
                    }`}
                  >
                    <span className="text-lg font-headline-sm">{opt.id === 'retail' ? '🥛' : opt.id === 'wholesale' ? '📦' : '🥛+📦'}</span>
                    <span className="font-display font-bold text-sm text-foreground leading-snug">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-snug">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Promotions & Rewards */}
          {activeSection === 'promotions' && (
            <div className="space-y-5">
              <h3 className="font-display font-bold text-base flex items-center gap-2 border-b border-border pb-3">
                <Percent className="w-5 h-5 text-primary" />
                <span>Promotions & Loyalty Rewards</span>
              </h3>

              {/* Scan & Buy */}
              <div className="space-y-3 bg-surface-2 p-4 rounded-2xl border border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Scan & Buy Rewards</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Reward Type</label>
                    <select
                      value={form.scanBuyRewardType}
                      onChange={e => handleChange('scanBuyRewardType', e.target.value)}
                      className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                    >
                      <option value="none">No Reward</option>
                      <option value="flat">Flat Cash Discount (₦)</option>
                      <option value="percentage">Percentage Discount (%)</option>
                      <option value="points">Bonus Loyalty Points</option>
                    </select>
                  </div>
                  {form.scanBuyRewardType !== 'none' && (
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Reward Value</label>
                      <input
                        type="number"
                        value={form.scanBuyRewardValue}
                        onChange={e => handleChange('scanBuyRewardValue', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Online Orders */}
              <div className="space-y-3 bg-surface-2 p-4 rounded-2xl border border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Online Order Rewards</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Reward Type</label>
                    <select
                      value={form.onlineOrderRewardType}
                      onChange={e => handleChange('onlineOrderRewardType', e.target.value)}
                      className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                    >
                      <option value="none">No Reward</option>
                      <option value="flat">Flat Cash Discount (₦)</option>
                      <option value="percentage">Percentage Discount (%)</option>
                      <option value="points">Bonus Loyalty Points</option>
                    </select>
                  </div>
                  {form.onlineOrderRewardType !== 'none' && (
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Reward Value</label>
                      <input
                        type="number"
                        value={form.onlineOrderRewardValue}
                        onChange={e => handleChange('onlineOrderRewardValue', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery Promotion */}
              <div className="space-y-3 bg-surface-2 p-4 rounded-2xl border border-border">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Delivery Promotions</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Promotion Type</label>
                    <select
                      value={form.deliveryRewardType}
                      onChange={e => handleChange('deliveryRewardType', e.target.value)}
                      className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                    >
                      <option value="none">No Promotion</option>
                      <option value="free">Free Delivery</option>
                      <option value="flat">Flat Delivery Discount (₦)</option>
                      <option value="percentage">Percentage Delivery Discount (%)</option>
                    </select>
                  </div>
                  {form.deliveryRewardType !== 'none' && form.deliveryRewardType !== 'free' && (
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Promo Value</label>
                      <input
                        type="number"
                        value={form.deliveryRewardValue}
                        onChange={e => handleChange('deliveryRewardValue', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Minimum Spend (₦)</label>
                    <input
                      type="number"
                      value={form.deliveryMinSpend}
                      onChange={e => handleChange('deliveryMinSpend', parseFloat(e.target.value) || 0)}
                      className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={form.deliveryExpiryDate}
                      onChange={e => handleChange('deliveryExpiryDate', e.target.value)}
                      className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Promo badge preview */}
              <div className="bg-primary/5 p-3 rounded-2xl border border-primary/20 flex flex-col items-center justify-center text-center">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Active Store Reward Banner</span>
                <p className="font-display font-bold text-sm text-primary mt-1">{promoBadgeText}</p>
              </div>
            </div>
          )}

          {/* 5. Order Workflow */}
          {activeSection === 'workflow' && (
            <div className="space-y-5">
              <h3 className="font-display font-bold text-base flex items-center gap-2 border-b border-border pb-3">
                <Clock className="w-5 h-5 text-primary" />
                <span>Customer Order Workflow Settings</span>
              </h3>

              <div className="space-y-4">
                <ToggleRow
                  label="Acceptance Policy"
                  description="When enabled, orders wait for approval. Unchecked auto-accepts orders."
                  checked={form.orderWorkflowMode === 'approval'}
                  onChange={v => handleChange('orderWorkflowMode', v ? 'approval' : 'auto')}
                />
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Default Prep Time (Mins)</label>
                    <select
                      value={form.defaultPrepTime}
                      onChange={e => handleChange('defaultPrepTime', e.target.value)}
                      className="w-full p-2 bg-surface-2 border border-border rounded text-xs text-foreground"
                    >
                      <option value="5">5 minutes</option>
                      <option value="10">10 minutes</option>
                      <option value="15">15 minutes</option>
                      <option value="20">20 minutes</option>
                      <option value="30">30 minutes</option>
                      <option value="45">45 minutes</option>
                      <option value="60">60 minutes</option>
                      <option value="custom">Custom time</option>
                    </select>
                  </div>
                  {form.defaultPrepTime === 'custom' && (
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Custom Time (Mins)</label>
                      <input
                        type="number"
                        value={form.customPrepTime}
                        onChange={e => handleChange('customPrepTime', parseInt(e.target.value) || 0)}
                        className="w-full p-2 bg-surface-2 border border-border rounded text-xs text-foreground"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Order Workflow Simulation */}
              <div className="border border-border/80 rounded-2xl p-4 bg-surface-2 space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Simulation: Live Order Workflow</h4>
                  <button 
                    onClick={() => { setSimulateWorkflowStep('received'); setPrepTimeRemaining(0); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground font-semibold"
                  >
                    Reset
                  </button>
                </div>

                {simulateWorkflowStep === 'received' && (
                  <div className="space-y-3">
                    <div className="bg-yellow-500/10 p-3 rounded-xl border border-yellow-500/25">
                      <p className="text-xs font-semibold text-yellow-500">🛒 New Storefront Order Received</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Order #SF-55318 • Customer: John Doe • Subtotal: ₦4,500</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleStartPrep(form.defaultPrepTime === 'custom' ? form.customPrepTime : parseInt(form.defaultPrepTime))}
                        className="flex-1 py-2 rounded-xl bg-success text-white text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" /> Accept Order
                      </button>
                      <button 
                        onClick={() => showToast('Order rejected', 'info')}
                        className="px-3 py-2 rounded-xl bg-destructive/15 text-destructive text-xs font-bold hover:bg-destructive/20 transition-colors cursor-pointer"
                      >
                        Reject
                      </button>
                      <button 
                        onClick={() => showToast('Changes requested', 'info')}
                        className="px-3 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        Request Changes
                      </button>
                    </div>
                  </div>
                )}

                {simulateWorkflowStep === 'preparing' && (
                  <div className="space-y-3">
                    <div className="bg-primary/10 p-3 rounded-xl border border-primary/20 text-center space-y-1">
                      <p className="text-xs font-semibold text-primary">👨‍🍳 Order is being Prepared</p>
                      <p className="text-sm font-display font-bold text-foreground">
                        Estimated Ready In: {Math.floor(prepTimeRemaining / 60)}:{(prepTimeRemaining % 60).toString().padStart(2, '0')}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Preparing countdown simulated on customer app in real-time.</p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSimulateWorkflowStep('ready')}
                        className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        Mark Ready for Pickup
                      </button>
                      <button 
                        onClick={() => setSimulateWorkflowStep('delivery')}
                        className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold hover:bg-zinc-700 transition-colors cursor-pointer"
                      >
                        Ship out for Delivery
                      </button>
                    </div>
                  </div>
                )}

                {(simulateWorkflowStep === 'ready' || simulateWorkflowStep === 'delivery') && (
                  <div className="space-y-3">
                    <div className="bg-success/10 p-3 rounded-xl border border-success/20 text-center">
                      <p className="text-xs font-semibold text-success">
                        {simulateWorkflowStep === 'ready' ? '📦 Order is Ready for Pickup!' : '🚴 Out for Delivery!'}
                      </p>
                    </div>
                    <button 
                      onClick={() => setSimulateWorkflowStep('completed')}
                      className="w-full py-2 rounded-xl bg-success text-white text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Complete Order
                    </button>
                  </div>
                )}

                {simulateWorkflowStep === 'completed' && (
                  <div className="bg-success/15 p-3 rounded-xl border border-success/20 text-center">
                    <p className="text-xs font-semibold text-success">🎉 Simulation Completed Successfully!</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 6. Payment Settings */}
          {activeSection === 'payment' && (
            <div className="space-y-5">
              <h3 className="font-display font-bold text-base flex items-center gap-2 border-b border-border pb-3">
                <CreditCard className="w-5 h-5 text-primary" />
                <span>Storefront Payment Channels</span>
              </h3>

              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Acceptable Methods</h4>
                <div className="grid grid-cols-2 gap-3">
                  <ToggleRow label="Cash on Delivery/Pickup" checked={form.paymentCashEnabled} onChange={v => handleChange('paymentCashEnabled', v)} />
                  <ToggleRow label="POS Payment" checked={form.paymentPosEnabled} onChange={v => handleChange('paymentPosEnabled', v)} />
                  <ToggleRow label="Debit/Credit Card" checked={form.paymentCardEnabled} onChange={v => handleChange('paymentCardEnabled', v)} />
                  <ToggleRow label="Bank Transfer" checked={form.paymentTransferEnabled} onChange={v => handleChange('paymentTransferEnabled', v)} />
                  <ToggleRow label="Digital Wallet (OPay/Paga)" checked={form.paymentWalletEnabled} onChange={v => handleChange('paymentWalletEnabled', v)} />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Payment Timing</h4>
                <select
                  value={form.paymentTiming}
                  onChange={e => handleChange('paymentTiming', e.target.value)}
                  className="w-full p-2 bg-surface-2 border border-border rounded text-xs text-foreground"
                >
                  <option value="before">Pay Before Merchant Accepts Order</option>
                  <option value="after">Pay After Merchant Accepts Order</option>
                  <option value="pickup">Pay On Pickup</option>
                  <option value="delivery">Pay On Delivery</option>
                </select>
              </div>

              {form.paymentTransferEnabled && (
                <div className="space-y-3 bg-surface-2 p-4 rounded-2xl border border-border">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Bank Account Configuration</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Bank Name</label>
                      <input
                        value={form.bankName}
                        onChange={e => handleChange('bankName', e.target.value)}
                        className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Account Name</label>
                      <input
                        value={form.bankAccountName}
                        onChange={e => handleChange('bankAccountName', e.target.value)}
                        className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted-foreground uppercase font-bold mb-1">Account Number</label>
                      <input
                        value={form.bankAccountNumber}
                        onChange={e => handleChange('bankAccountNumber', e.target.value)}
                        className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 7. Delivery Settings */}
          {activeSection === 'delivery' && (
            <div className="space-y-5">
              <h3 className="font-display font-bold text-base flex items-center gap-2 border-b border-border pb-3">
                <MapPin className="w-5 h-5 text-primary" />
                <span>Delivery and Pickup Configurations</span>
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <ToggleRow label="Enable Store Pickup" checked={form.pickupEnabled} onChange={v => handleChange('pickupEnabled', v)} />
                <ToggleRow label="Enable Home Delivery" checked={form.deliveryEnabled} onChange={v => handleChange('deliveryEnabled', v)} />
              </div>

              {form.deliveryEnabled && (
                <div className="space-y-4 bg-surface-2 p-4 rounded-2xl border border-border">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Delivery Limits & Fees</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Delivery Radius (km)</label>
                      <input
                        type="number"
                        value={form.deliveryRadius}
                        onChange={e => handleChange('deliveryRadius', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Delivery Fee (₦)</label>
                      <input
                        type="number"
                        value={form.deliveryFee}
                        onChange={e => handleChange('deliveryFee', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Free Delivery Threshold (₦)</label>
                      <input
                        type="number"
                        value={form.freeDeliveryThreshold}
                        onChange={e => handleChange('freeDeliveryThreshold', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Minimum Order Amount (₦)</label>
                      <input
                        type="number"
                        value={form.deliveryMinOrder}
                        onChange={e => handleChange('deliveryMinOrder', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 8. Business Hours */}
          {activeSection === 'hours' && (
            <div className="space-y-5">
              <h3 className="font-display font-bold text-base flex items-center gap-2 border-b border-border pb-3">
                <Calendar className="w-5 h-5 text-primary" />
                <span>Operating Hours Schedule</span>
              </h3>

              <div className="grid grid-cols-2 gap-4 bg-surface-2 p-4 rounded-2xl border border-border">
                <div>
                  <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Opening Time</label>
                  <input
                    type="time"
                    value={form.openingTime}
                    onChange={e => handleChange('openingTime', e.target.value)}
                    className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Closing Time</label>
                  <input
                    type="time"
                    value={form.closingTime}
                    onChange={e => handleChange('closingTime', e.target.value)}
                    className="w-full p-2 bg-card border border-border rounded text-xs text-foreground"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground uppercase font-bold mb-2">Operating Business Days</label>
                <div className="flex gap-1.5 justify-between">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
                    const active = form.businessDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          const list = active 
                            ? form.businessDays.filter(d => d !== idx)
                            : [...form.businessDays, idx];
                          handleChange('businessDays', list);
                        }}
                        className={`w-10 h-10 rounded-xl font-display font-bold text-xs flex items-center justify-center transition-all cursor-pointer ${
                          active ? 'bg-primary text-primary-foreground shadow-md' : 'bg-surface-2 border border-border text-muted-foreground'
                        }`}
                      >
                        {day[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <ToggleRow
                  label="Observe Holidays"
                  description="Automatically show store as closed on public holidays."
                  checked={form.holidaysEnabled}
                  onChange={v => handleChange('holidaysEnabled', v)}
                />
                <ToggleRow
                  label="Temporary Closure"
                  description="Force closed storefront layout instantly (e.g. for emergencies)."
                  checked={form.temporaryClosure}
                  onChange={v => handleChange('temporaryClosure', v)}
                />
              </div>
            </div>
          )}

          {/* 9. Notification Settings */}
          {activeSection === 'notifications' && (
            <div className="space-y-5">
              <h3 className="font-display font-bold text-base flex items-center gap-2 border-b border-border pb-3">
                <Bell className="w-5 h-5 text-primary" />
                <span>Store Alert Chimes & Push Notifications</span>
              </h3>

              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Notification Triggers</h4>
                <div className="grid grid-cols-2 gap-3">
                  <ToggleRow label="New Customer Orders" checked={form.notifNewOrders} onChange={v => handleChange('notifNewOrders', v)} />
                  <ToggleRow label="Payment Receipts" checked={form.notifPayments} onChange={v => handleChange('notifPayments', v)} />
                  <ToggleRow label="Customer Inbox Messages" checked={form.notifMessages} onChange={v => handleChange('notifMessages', v)} />
                  <ToggleRow label="Delivery Driver Updates" checked={form.notifDelivery} onChange={v => handleChange('notifDelivery', v)} />
                  <ToggleRow label="Low Stock Warnings" checked={form.notifStock} onChange={v => handleChange('notifStock', v)} />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Alert Methods</h4>
                <div className="grid grid-cols-2 gap-3">
                  <ToggleRow label="Synthesized Sound Chime" checked={form.alertSound} onChange={v => handleChange('alertSound', v)} />
                  <ToggleRow label="Device Vibration Pulse" checked={form.alertVibration} onChange={v => handleChange('alertVibration', v)} />
                  <ToggleRow label="Interactive Header Popups" checked={form.alertPopup} onChange={v => handleChange('alertPopup', v)} />
                  <ToggleRow label="Tab Badge Notification Counter" checked={form.alertBadge} onChange={v => handleChange('alertBadge', v)} />
                </div>
              </div>
            </div>
          )}

          {/* 10. Customer Information Requirements */}
          {activeSection === 'requirements' && (
            <div className="space-y-5">
              <h3 className="font-display font-bold text-base flex items-center gap-2 border-b border-border pb-3">
                <UserCheck className="w-5 h-5 text-primary" />
                <span>Customer Checkout Information Requirements</span>
              </h3>

              <p className="text-xs text-muted-foreground">Select what fields are mandatory for customers during the storefront checkout checkout.</p>

              <div className="grid grid-cols-2 gap-4">
                <ToggleRow label="Require Customer Name" checked={form.reqCustomerName} onChange={v => handleChange('reqCustomerName', v)} />
                <ToggleRow label="Require Phone Number" checked={form.reqCustomerPhone} onChange={v => handleChange('reqCustomerPhone', v)} />
                <ToggleRow label="Require Email Address" checked={form.reqCustomerEmail} onChange={v => handleChange('reqCustomerEmail', v)} />
                <ToggleRow label="Require Street Address" checked={form.reqCustomerAddress} onChange={v => handleChange('reqCustomerAddress', v)} />
                <ToggleRow label="Require Landmark / Nearest Bus Stop" checked={form.reqCustomerLandmark} onChange={v => handleChange('reqCustomerLandmark', v)} />
                <ToggleRow label="Require Delivery / Custom Notes" checked={form.reqCustomerNotes} onChange={v => handleChange('reqCustomerNotes', v)} />
              </div>

              {/* Nigerian phone validation test */}
              <div className="bg-surface-2 p-4 rounded-2xl border border-border space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Phone className="w-4 h-4" />
                  <span>Interactive Nigerian Phone Normalizer Check</span>
                </h4>
                
                <div className="space-y-2">
                  <input
                    value={phoneNumberInput}
                    onChange={e => testPhoneNormalization(e.target.value)}
                    placeholder="Enter phone: 08012345678 or +234..."
                    className="w-full p-2.5 bg-card border border-border rounded text-sm text-foreground"
                  />
                  
                  {isPhoneValid !== null && (
                    <div className="flex justify-between items-center text-xs mt-1 px-1">
                      <span className="text-muted-foreground">Normalized Format:</span>
                      <span className={`font-mono font-bold ${isPhoneValid ? 'text-success' : 'text-destructive'}`}>
                        {isPhoneValid ? normalizedPhoneOutput : '⚠️ Invalid Nigerian Phone'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Reusable Helper Toggle Switch Row ───
function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-2 text-left">
      <div className="flex-1 pr-4">
        <p className="text-sm font-semibold text-foreground leading-snug">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5 leading-normal">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer outline-none shrink-0 ${
          checked ? 'bg-primary' : 'bg-surface-3 border border-border'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-all shadow ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
    </div>
  );
}
