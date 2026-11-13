import { showToast } from '@/components/Toast';
import StoreLogo, { LOGO_STYLES } from '@/components/StoreLogo';
import CreateFlowProgress from './CreateFlowProgress';
import type { StoreAccessState } from './useStoreAccess';

/**
 * Making a shop on this phone: its name and kind of business.
 */
export default function CreateStoreStep({ s }: { s: StoreAccessState }) {
  const {
    setMode, storeName, setStoreName, setCategory, setRetailType, businessType, setBusinessType,
    selectedLogoStyle, setSelectedLogoStyle, setAccessMood, createStep, setCreateStep,
    setPickedType, setPickedLogo, BUSINESS_CHOICES, businessCategory, handleCreate,
  } = s;
  return (
    <div className="space-y-4 text-left">
      <CreateFlowProgress step={createStep === 'name' ? 1 : createStep === 'type' ? 2 : 3} of={5} />

      {createStep === 'name' && (
        <>
          <div>
            <label className="block text-xs text-muted-foreground uppercase font-bold mb-1">What is your shop called?</label>
            <input
              value={storeName}
              autoFocus
              onChange={e => { setStoreName(e.target.value); setAccessMood('thinking'); }}
              onKeyDown={e => { if (e.key === 'Enter' && storeName.trim()) setCreateStep('type'); }}
              placeholder="e.g. Blessed Nnamdi Store"
              className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={() => storeName.trim() ? setCreateStep('type') : showToast('Give your shop a name first', 'error')}
            disabled={!storeName.trim()}
            className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold disabled:opacity-40 transition-opacity cursor-pointer"
          >
            Continue
          </button>
          <button onClick={() => setMode('create-choice')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground cursor-pointer">
            ← Back
          </button>
        </>
      )}

      {createStep === 'type' && (
        <>
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground uppercase font-bold">What kind of business is {storeName.trim() || 'it'}?</label>
            <div className="grid grid-cols-2 gap-2">
              {BUSINESS_CHOICES.map(([id,label,icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setBusinessType(id);
                    setCategory(businessCategory(id));
                    setRetailType(id);
                    setPickedType(true);
                    // Answering the question is what moves it on. A
                    // separate Continue tap after every choice is the
                    // sort of thing that makes a short flow feel long.
                    setCreateStep('logo');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    businessType === id ? 'bg-primary/10 border-primary ring-1 ring-primary/30' : 'bg-surface-2 border-border hover:border-primary/30'
                  }`}
                >
                  <span className="text-lg">{icon}</span>
                  <span className="block text-xs font-bold mt-1 leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setCreateStep('name')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground cursor-pointer">
            ← Back
          </button>
        </>
      )}

      {createStep === 'logo' && (
        <>
          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground uppercase font-bold">Pick a look for {storeName.trim() || 'your shop'}</label>
            <div className="grid grid-cols-3 gap-2">
              {LOGO_STYLES.map(style => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => { setSelectedLogoStyle(style.id); setPickedLogo(true); }}
                  className={`p-2 rounded-xl border flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                    selectedLogoStyle === style.id ? 'bg-primary/10 border-primary ring-1 ring-primary/30' : 'bg-surface-2 border-border hover:border-primary/30'
                  }`}
                >
                  <StoreLogo storeName={storeName || 'Store'} selectedStyle={style.id} businessType={businessType} className="w-10 h-10" />
                  <span className="text-[9px] text-center text-muted-foreground font-bold leading-tight">{style.label}</span>
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleCreate} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity cursor-pointer">
            Create Store
          </button>
          <button onClick={() => setCreateStep('type')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground cursor-pointer">
            ← Back
          </button>
        </>
      )}
    </div>
  );
}
