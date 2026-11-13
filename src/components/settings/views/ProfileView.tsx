import { RentFrequency } from '@/types/store';
import { showToast } from '@/components/Toast';
import StoreLogo, { LOGO_STYLES } from '@/components/StoreLogo';
import StoreAvatar from '@/components/StoreAvatar';
import ContactPickButton from '@/components/ContactPickButton';
import { Eye, EyeOff } from 'lucide-react';
import { getBusinessTemplate } from '@/lib/business-runtime';
import { monthlyRent, rentFrequency } from '@/lib/rent';
import { card, inputClass, SubPage, Field } from '../ui';
import type { SettingsState } from '../useSettings';

export default function ProfileView({ s }: { s: SettingsState }) {
  const {
    store, setView, photoInputRef, profile, setProfile, profilePassword, setProfilePassword,
    revealProfilePass, setRevealProfilePass, rent, rentSaved, updateMgr, persistProfile, updateRent,
    handlePhotoPick, removePhoto,
  } = s;
  /*
   * The trade, not the internal grouping.
   *
   * This fell back to `store.category`, which is one of four buckets the app
   * sorts shops into - retail, restaurant, games, other - so a laundry's own
   * profile told it that it was Retail. It is not; retail is only the bucket
   * a laundry happens to fall in. The template knows what the shop actually
   * is, and that is what its owner should be reading.
   */
  const tradeTemplate = getBusinessTemplate(store);
  const displayStoreType = store.retailType
    ? store.retailType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : tradeTemplate.name;
  return (
    <SubPage title="Edit Profile" onBack={() => setView('home')}>
      {/* Store Identity Header Card */}
      <div className={`${card} p-5 space-y-4`}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => photoInputRef.current?.click()}
            className="relative w-20 h-20 rounded-2xl overflow-hidden bg-primary/15 border border-primary/30 flex items-center justify-center text-3xl shrink-0 group cursor-pointer hover:border-primary transition-all"
          >
            {/* Whatever the menu tile shows, so tapping it does not change
                the picture. Reads the draft profile so a photo picked a
                moment ago appears before it is saved. */}
            <StoreAvatar
              store={{ ...store, profile } as typeof store}
              className="w-full h-full"
            />
            <span className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center shadow-md">📷</span>
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoPick} />
          <div className="flex-1 space-y-1.5 min-w-0">
            <button onClick={() => photoInputRef.current?.click()} className="text-xs font-display font-bold text-primary hover:underline cursor-pointer">Change photo</button>
            {profile.photo && <button onClick={removePhoto} className="block text-xs text-destructive hover:underline cursor-pointer">Remove</button>}
            <div className="text-[11px] text-muted-foreground font-mono">Store ID: {store.accessCode}</div>
            {store.managerSettings?.multiDeviceSync ? (
              <div className="text-[10px] text-success font-bold flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                ✓ Cloud Synced
              </div>
            ) : (
              <div className="text-[10px] text-muted-foreground/60 font-semibold flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                Local Device
              </div>
            )}
          </div>
        </div>

        <Field label="Owner Name" value={profile.ownerName || ''} onChange={v => setProfile({ ...profile, ownerName: v })} placeholder="Your full name" />

        {/* Read-Only Store Type Display Badge */}
        <div className="p-3.5 rounded-xl bg-surface-2 border border-border/70 flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Store Category & Type</span>
            <span className="text-sm font-display font-black text-foreground capitalize mt-0.5 block">{displayStoreType}</span>
          </div>
          <span className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-xs font-display font-bold text-primary flex items-center gap-1">
            <span>{tradeTemplate.icon}</span> <span>{tradeTemplate.name}</span>
          </span>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs text-muted-foreground font-bold">Store Logo Concept</label>
          <div className="grid grid-cols-5 gap-1.5">
            {LOGO_STYLES.map(style => (
              <button
                key={style.id}
                type="button"
                onClick={() => setProfile({ ...profile, logoStyle: style.id })}
                className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  profile.logoStyle === style.id ? 'bg-primary/10 border-primary ring-1 ring-primary/20' : 'bg-surface-2 border-border hover:border-border-hover'
                }`}
              >
                <StoreLogo storeName={store.storeName} selectedStyle={style.id} businessType={store.storeType} className="w-8 h-8" />
                <span className="text-[8px] text-center text-muted-foreground font-bold leading-tight">{style.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Field label="Business Address" value={profile.location} onChange={v => setProfile({ ...profile, location: v })} placeholder="12 Market Road, Lagos" />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Phone"
            value={profile.phone}
            onChange={v => setProfile({ ...profile, phone: v })}
            placeholder="08012345678"
            type="tel"
            trailing={<ContactPickButton onPick={(picked, pickedName) => setProfile(current => ({
              ...current,
              phone: picked,
              ownerName: current.ownerName?.trim() ? current.ownerName : pickedName,
            }))} />}
          />
          <Field label="Email" value={profile.email} onChange={v => setProfile({ ...profile, email: v })} placeholder="store@email.com" type="email" />
        </div>
        <Field label="Website" value={profile.website || ''} onChange={v => setProfile({ ...profile, website: v })} placeholder="www.mystore.com" />

        <div className="space-y-1 text-left">
          <label className="block text-xs text-muted-foreground font-bold">Owner Password</label>
          <div className="relative flex items-center">
            <input
              type={revealProfilePass ? "text" : "password"}
              value={profilePassword}
              onChange={e => setProfilePassword(e.target.value)}
              placeholder="Enter password"
              className={`${inputClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setRevealProfilePass(!revealProfilePass)}
              className="absolute right-3 p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              title={revealProfilePass ? "Hide Password" : "Show Password"}
            >
              {revealProfilePass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Opening Time" value={profile.openingTime || ''} onChange={v => setProfile({ ...profile, openingTime: v })} type="time" />
          <Field label="Closing Time" value={profile.closingTime || ''} onChange={v => setProfile({ ...profile, closingTime: v })} type="time" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Business Opened" value={profile.openingDate || ''} onChange={v => setProfile({ ...profile, openingDate: v })} type="date" />
          <Field label="Employees" value={String(profile.employees ?? '')} onChange={v => setProfile({ ...profile, employees: Number(v) || undefined })} type="number" placeholder="0" />
        </div>
      </div>

      {/* Rent Card */}
      <div className={`${card} p-5 space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display font-bold text-base text-foreground">Store Rent</h3>
          <span role="status" aria-live="polite" className={`text-[11px] font-display font-bold text-success transition-opacity ${rentSaved ? 'opacity-100' : 'opacity-0'}`}>
            {rentSaved ? '✓ Saved' : ''}
          </span>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">Is your store property rented?</p>
        <div className="flex gap-2">
          {[{v:true,l:'Yes'},{v:false,l:'No · Property Owned'}].map(o => (
            <button key={o.l} onClick={() => updateRent({ isRented: o.v })}
              className={`flex-1 py-2.5 rounded-xl border text-xs font-display font-bold transition-all cursor-pointer ${rent.isRented===o.v ? 'bg-primary/15 border-primary/40 text-primary shadow-xs' : 'bg-surface-2 border-border text-muted-foreground'}`}>
              {o.l}
            </button>
          ))}
        </div>
        {rent.isRented && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rent Amount (₦)" value={String(rent.amount ?? '')} onChange={v => updateRent({ amount: Number(v) || 0 })} type="number" />
              <div>
                <label className="block text-xs text-muted-foreground font-bold mb-1">Frequency</label>
                <select value={rentFrequency(rent)} onChange={e => updateRent({ frequency: e.target.value as RentFrequency })} className={inputClass}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <Field label="Next Due Date" value={rent.dueDate || ''} onChange={v => updateRent({ dueDate: v })} type="date" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Landlord (optional)" value={rent.landlordName || ''} onChange={v => updateRent({ landlordName: v })} />
              <Field label="Landlord Contact" value={rent.landlordContact || ''} onChange={v => updateRent({ landlordContact: v })} />
            </div>
            {rent.amount ? (
              <div className="p-3 rounded-xl bg-success/10 border border-success/30 text-xs text-success font-semibold space-y-1">
                {/* What the month's target actually uses, so a wrong period shows at once. */}
                <p>Counted as ₦{Math.round(monthlyRent(rent)).toLocaleString()} a month in your monthly target.</p>
                <p className="font-normal">Flow will plan for a 10% buffer → target ₦{Math.round((rent.amount || 0) * 1.1).toLocaleString()}</p>
              </div>
            ) : null}
            <p className="text-[10px] text-muted-foreground">Changes here save as you make them.</p>
          </div>
        )}
        {!rent.isRented && (
          <div className="p-3 rounded-xl bg-success/10 border border-success/30 text-xs text-success font-semibold">
            ✓ Property Owned · Flow will track maintenance & emergency reserves.
          </div>
        )}
      </div>

      <button onClick={() => {
        persistProfile(profile);
        if (profilePassword.trim() && profilePassword.trim() !== store.managerSettings?.ownerPassword) {
          updateMgr({ ownerPassword: profilePassword.trim() });
        }
        setView('home');
        showToast('Profile saved');
      }}
        className="w-full p-3.5 rounded-xl bg-primary text-primary-foreground font-display font-bold hover:opacity-90 active:scale-98 transition-all cursor-pointer shadow-md">
        Save Profile
      </button>
    </SubPage>
  );
}
