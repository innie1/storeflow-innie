import StoreLogo, { LOGO_STYLES } from '@/components/StoreLogo';
import { Building } from 'lucide-react';
import type { StoreAccessState } from './useStoreAccess';

/**
 * Making a new shop on a cloud account.
 */
export default function AuthStoreCreateStep({ s }: { s: StoreAccessState }) {
  const {
    setMode, loadingAuth, userStores, storeName, setStoreName, setCategory, setRetailType,
    businessType, setBusinessType, selectedLogoStyle, setSelectedLogoStyle, setAccessMood,
    ownerPassword, setOwnerPassword, BUSINESS_CHOICES, businessCategory, handleCreateCloudStore,
  } = s;
  return (
    <div className="space-y-4 text-left p-5 rounded-2xl bg-surface-2 border border-border/80 shadow-md">
      <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
        <Building className="w-5 h-5 text-primary" />
        <span>Create Cloud Store</span>
      </h3>

      <div>
        <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Store Name</label>
        <input
          value={storeName}
          onChange={e => {
            setStoreName(e.target.value);
            setAccessMood('thinking');
          }}
          placeholder="e.g. Blessed Nnamdi Store"
          className="w-full p-2.5 rounded-lg bg-surface-3 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
        />
      </div>
      
      <div className="space-y-2">
        <label className="block text-xs text-muted-foreground uppercase font-bold">What kind of business do you run?</label>
        <p className="text-[10px] text-muted-foreground">Choose the closest match. This controls your dashboard, settings and customer experience.</p>
        <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
          {BUSINESS_CHOICES.map(([id,label,icon]) => <button key={id} type="button" onClick={() => { setBusinessType(id); setCategory(businessCategory(id)); setRetailType(id); setAccessMood('thinking'); }} className={`p-2.5 rounded-xl border text-left transition-all ${businessType === id ? 'bg-primary/10 border-primary ring-1 ring-primary/20' : 'bg-surface-2 border-border hover:border-primary/30'}`}><span className="text-lg">{icon}</span><p className="font-display font-semibold text-xs mt-1">{label}</p></button>)}
        </div>
      </div>
      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Select Store Logo Concept</label>
        <div className="grid grid-cols-5 gap-2">
          {LOGO_STYLES.map(style => (
            <button
              key={style.id}
              type="button"
              onClick={() => setSelectedLogoStyle(style.id)}
              className={`p-1.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                selectedLogoStyle === style.id ? 'bg-primary/10 border-primary ring-1 ring-primary/30' : 'bg-surface-3 border-border hover:border-primary/30'
              }`}
            >
              <StoreLogo storeName={storeName || 'Store'} selectedStyle={style.id} businessType={businessType} className="w-8 h-8" />
              <span className="text-[7px] text-center text-muted-foreground font-bold leading-tight">{style.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">Owner Password (Optional)</label>
        <input
          type="password"
          value={ownerPassword}
          onChange={e => setOwnerPassword(e.target.value)}
          placeholder="Leave blank for 'owner'"
          className="w-full p-2.5 rounded-lg bg-surface-3 border border-border text-foreground text-sm focus:outline-none focus:border-primary"
        />
      </div>

      <button
        onClick={handleCreateCloudStore}
        disabled={loadingAuth}
        className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {loadingAuth ? 'Creating Cloud Store...' : 'Create Cloud Store'}
      </button>

      {userStores.length > 0 && (
        <button
          onClick={() => setMode('auth-store-select')}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground mt-2 animate-fade-in"
        >
          ← Back to Store List
        </button>
      )}
    </div>
  );
}
