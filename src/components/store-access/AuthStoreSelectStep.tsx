import { Plus, Building } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CATEGORIES } from './model';
import type { StoreAccessState } from './useStoreAccess';

/**
 * Choosing which of the account's shops to open.
 */
export default function AuthStoreSelectStep({ s }: { s: StoreAccessState }) {
  const { setMode, loadingAuth, userStores, activeProfile, setActiveProfile, handleLoadCloudStore } = s;
  return (
    <div className="space-y-4 text-left p-5 rounded-2xl bg-surface-2 border border-border/80 shadow-md">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-bold text-base text-foreground flex items-center gap-2">
          <Building className="w-5 h-5 text-primary" />
          <span>Your Cloud Stores</span>
        </h3>
        <button
          onClick={() => setMode('auth-store-create')}
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" /> Create New
        </button>
      </div>
      
      <p className="text-xs text-muted-foreground">Select a store from your account to synchronize and launch.</p>

      <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
        {userStores.map((s) => {
          const icon = CATEGORIES.find(cat => cat.id === s.business_type)?.icon || '🏪';
          return (
            <button
              key={s.id}
              onClick={() => handleLoadCloudStore(s)}
              disabled={loadingAuth}
              className="w-full p-3.5 rounded-xl bg-surface-3 hover:bg-surface-4 border border-border/80 flex items-center justify-between text-sm text-left transition-all active:scale-95 disabled:opacity-50 cursor-pointer animate-fade-in"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{icon}</span>
                <div>
                  <p className="font-display font-bold text-foreground leading-snug">{s.business_name}</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mt-0.5">{s.business_type}</p>
                </div>
              </div>
              <span className="text-primary text-xs font-semibold flex items-center gap-1">Load Store</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => {
          supabase.auth.signOut();
          setActiveProfile(null);
          setMode('auth-login');
        }}
        className="w-full text-center text-xs text-destructive hover:underline mt-4 cursor-pointer"
      >
        Sign Out from {activeProfile?.email}
      </button>
    </div>
  );
}
