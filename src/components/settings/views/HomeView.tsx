import { showToast } from '@/components/Toast';
import { THEMES } from '@/lib/theme';
import RecentlyDeleted from '@/components/RecentlyDeleted';
import StoreSwitcher from '@/components/StoreSwitcher';
import Mascot from '@/components/Mascot';
import StoreAvatar from '@/components/StoreAvatar';
import {
  Package,
  Tag,
  Download,
  PiggyBank,
  ShieldCheck,
  Printer,
  Store,
  Palette,
  Bell,
  Database,
  FileText,
  Headphones,
  QrCode,
  Star,
  Upload,
  Cloud,
  MoreHorizontal,
  Bluetooth,
  Wifi,
} from 'lucide-react';
import { card, ProgressRing, SettingTile } from '../ui';
import SavingsModal from '../SavingsModal';
import ContactOptionsSheet from '../ContactOptionsSheet';
import type { SettingsState } from '../useSettings';

export default function HomeView({ s }: { s: SettingsState }) {
  const {
    store, onUpdate, currentUser, serviceBusiness, keepsStock, setView, timer, theme, showTrash,
    setShowTrash, showSwitcher, setShowSwitcher, showSavingsModal, setShowSavingsModal,
    showContactPopup, setShowContactPopup, profile, mgr, savings, latestInsight, profileCompletion,
    lowStockCount, activeNotifTypes, savingsPct, updateSavings,
  } = s;
  // ============ HOME ============
  return (
    <div className="animate-fade-in space-y-4 md:space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-start">
        {/* Left column — profile + Flow */}
        <div className="md:col-span-5 space-y-4">
          {/* Store Profile */}
          <button onClick={() => setView('profile')} className={`${card} w-full p-4 text-left hover:ring-1 hover:ring-primary/30 transition-all`}>
            <div className="flex items-start gap-3">
              <div className="relative">
                <StoreAvatar store={store} className="w-20 h-20 rounded-2xl" />
                <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">📷</span>
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <h3 className="font-display font-bold text-lg leading-tight truncate">{store.storeName}</h3>
                {profile.location && <p className="text-xs text-muted-foreground flex items-start gap-1"><span>📍</span><span className="line-clamp-2">{profile.location}</span></p>}
                {profile.phone && <p className="text-xs text-muted-foreground flex items-center gap-1">📞 {profile.phone}</p>}
                {profile.email && <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">✉️ {profile.email}</p>}
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-primary">✏️</div>
                <span className="text-[10px] text-muted-foreground font-display font-semibold">Edit</span>
              </div>
            </div>
          </button>


          {/* Flow Card */}
          <button onClick={() => setView('flow')} className={`${card} w-full p-4 text-left hover:ring-1 hover:ring-primary/30 transition-all border ${mgr.enabled ? 'border-success/30 bg-gradient-to-br from-success/10 to-transparent' : 'border-border'}`}>
            <div className="flex items-start gap-3">
              <div className="shrink-0">
                <Mascot size={64} mood={mgr.enabled ? 'happy' : 'sleeping'} animate={mgr.mascotAnimations} store={store} />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <h3 className="font-display font-bold text-xl">Flow</h3>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-display font-bold ${mgr.enabled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${mgr.enabled ? 'bg-success' : 'bg-muted-foreground'}`} />
                    {mgr.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                {mgr.enabled ? (
                  <>
                    <p className="text-xs text-muted-foreground leading-snug">Your business companion for forecasts, advice and insights.</p>
                    <div className="flex items-center gap-2 pt-1">
                      <ProgressRing pct={profileCompletion} size={40} />
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Business Profile</p>
                        <p className="text-xs font-display font-semibold">{profileCompletion}% Complete</p>
                      </div>
                    </div>
                    {latestInsight && (
                      <p className="text-[11px] text-success mt-1 line-clamp-2">{latestInsight.icon} {latestInsight.text}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Turn on Flow to unlock forecasts, recommendations and business insights.</p>
                )}
              </div>
              <div className="shrink-0 self-center w-12 h-12 rounded-xl bg-surface-2 border border-border flex flex-col items-center justify-center text-primary text-xs">
                <span>›</span>
              </div>
            </div>
          </button>
        </div>

        {/* Right column — settings tiles */}
        <div className="md:col-span-7 space-y-3">
          <SettingTile
            icon={<Tag className="w-5 h-5" />}
            color="#F2C94C"
            title="Pricing & Discounts"
            desc={keepsStock ? 'Margins, pricing rules & discounts.' : 'Checkout discounts and promotions.'}
            right={
              <div>
                {/* The margin figure is cost-price arithmetic, so it is as
                    meaningless on this tile for a laundry as the section it
                    summarises is inside. */}
                {keepsStock && <>
                  <p className="text-[10px] text-muted-foreground">Default Margin</p>
                  <p className="text-sm font-display font-bold text-primary">{mgr.defaultMargin}%</p>
                </>}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Discount: {mgr.autoDiscountEnabled ? (mgr.autoDiscountType === 'percentage' ? `${mgr.autoDiscountValue}%` : `₦${(mgr.autoDiscountValue || 0).toLocaleString()}`) : 'Off'}
                </p>
              </div>
            }
            onClick={() => setView('pricing')}
          />
          {keepsStock && <SettingTile icon={<Package className="w-5 h-5" />} color="#27AE60" title="Inventory" desc="Stock alerts and restock preferences." right={<><p className="text-[10px] text-muted-foreground">Low Stock</p><p className="text-base font-display font-bold text-success">{lowStockCount} Items</p></>} onClick={() => setView('inventory')} />}
          {keepsStock && <SettingTile icon={<Star className="w-5 h-5" />} color="#FFD700" title="Wishlist" desc="Track products you want to add or stock." right={<><p className="text-[10px] text-muted-foreground">Wishlist</p><p className="text-base font-display font-bold text-yellow-500">{(store.wishlist || []).length} Items</p></>} onClick={() => setView('wishlist')} />}
          <SettingTile icon={<PiggyBank className="w-5 h-5" />} color="#9B6BFB" title="Savings Plan" desc="Set goals and automation rules." onClick={() => setView('savings')}
            right={<div className="text-right space-y-1">
              <p className="text-[10px] text-muted-foreground">Goal</p>
              <p className="text-sm font-display font-bold" style={{ color: '#9B6BFB' }}>₦{savings.amount.toLocaleString()}</p>
              <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden ml-auto">
                <div className="h-full rounded-full" style={{ width: `${savingsPct}%`, background: '#9B6BFB' }} />
              </div>
              <p className="text-[10px] text-muted-foreground">{Math.round(savingsPct)}%</p>
            </div>} />

          <SettingTile icon={<Palette className="w-5 h-5" />} color="#5B8FF9" title="Appearance" desc="Theme and app experience." onClick={() => setView('appearance')}
            right={<div className="flex gap-1.5">
              {THEMES.map(t => (
                <div key={t.id} className={`w-10 h-10 rounded-xl flex items-center justify-center text-base border ${theme===t.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`} style={{ background: t.swatch + '22' }}>
                  {t.emoji}
                </div>
              ))}
            </div>} />

          <SettingTile icon={<Bell className="w-5 h-5" />} color="#FF8A3D" title="Notifications" desc="Manage alerts and reminders." onClick={() => setView('notifications')}
            right={<><p className="text-[10px] font-display font-semibold text-warning">{activeNotifTypes} Types Active</p>
              <div className="flex gap-1 mt-1">{['📊','⭐','⚠️','📘','💰'].map((e,i)=><span key={i} className="w-6 h-6 rounded bg-surface-2 border border-border flex items-center justify-center text-[10px]">{e}</span>)}</div></> } />

          <SettingTile icon={<ShieldCheck className="w-5 h-5" />} color="#2EBFB1" title="Security" desc="App lock, access code & password." right={<><p className="text-[10px] text-muted-foreground">Lock Timer</p><p className="text-base font-display font-bold" style={{color:'#2EBFB1'}}>{timer==='1h'?'1 Hour':timer==='4h'?'4 Hours':timer==='8h'?'8 Hours':timer==='12h'?'12 Hours':'Always Open'}</p></>} onClick={() => setView('security')} />

          <SettingTile icon={<QrCode className="w-5 h-5" />} color="#FFC72C" title={serviceBusiness ? 'QR & Storefront' : 'QR & Barcodes'} desc={serviceBusiness ? 'Your storefront QR code & service page.' : 'Branded QR codes & analytics.'} onClick={() => setView('barcode')} />

          <SettingTile icon={<Store className="w-5 h-5" />} color="#EC4899" title="Marketplace & Loyalty" desc="Storefront, pricing, rewards & delivery." onClick={() => setView('marketplace-settings')} />

          <SettingTile icon={<Printer className="w-5 h-5" />} color="#22C55E" title="Printer Settings" desc="Receipt printing method."
            right={<p className="text-[10px] font-display font-semibold flex items-center gap-1" style={{color:'#22C55E'}}>{(store.managerSettings?.printMethod || 'system') === 'bluetooth' ? <><Bluetooth className="w-3 h-3" /> Bluetooth</> : <><Wifi className="w-3 h-3" /> System/Wi-Fi</>}</p>}
            onClick={() => setView('printer-settings')} />

          <SettingTile icon={<Database className="w-5 h-5" />} color="#3B82F6" title="Data & Storage" desc="Backups & transfers." onClick={() => setView('data')}
            right={<div className="flex gap-1">
              {[
                { e: <Download className="w-3.5 h-3.5 text-emerald-500" />, l: 'Export' },
                { e: <Upload className="w-3.5 h-3.5 text-primary" />, l: 'Import' },
                { e: <Cloud className="w-3.5 h-3.5 text-sky-400" />, l: 'Backup' },
                { e: <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />, l: 'More' }
              ].map(o => (
                <div key={o.l} title={o.l} className="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center">
                  {o.e}
                </div>
              ))}
            </div>} />

          {currentUser?.role === 'owner' && (
            <SettingTile icon={<FileText className="w-5 h-5" />} color="#2F80ED" title="Audit Activity Logs" desc="Secure logs of store activity." onClick={() => setView('activity-log')} />
          )}
          <SettingTile icon={<Headphones className="w-5 h-5" />} color="#F2C94C" title="Support" desc="Help, FAQs and contact." onClick={() => setView('support')} />
        </div>
      </div>

      {showTrash && <RecentlyDeleted store={store} onUpdate={onUpdate} onClose={() => setShowTrash(false)} />}
      {showSwitcher && <StoreSwitcher currentCode={store.accessCode} onSwitch={onUpdate} onClose={() => setShowSwitcher(false)} />}
      {showSavingsModal && (
        <SavingsModal initial={savings} onClose={() => setShowSavingsModal(false)} onSave={(g) => { updateSavings(g); setShowSavingsModal(false); showToast('Savings plan saved'); }} animate={mgr.mascotAnimations} store={store} />
      )}
      {showContactPopup && (
        <ContactOptionsSheet storeName={store.storeName} onClose={() => setShowContactPopup(false)} />
      )}
    </div>
  );
}
