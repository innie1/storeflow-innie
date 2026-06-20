import { useState, useEffect } from 'react';
import { createStore, loadStore } from '@/lib/store-data';
import { StoreData, StoreCategory } from '@/types/store';
import { showToast } from '@/components/Toast';
import Mascot, { MascotMood } from '@/components/Mascot';

interface StoreAccessProps {
  onStoreLoaded: (store: StoreData) => void;
}

const CATEGORIES: { id: StoreCategory; label: string; icon: string; desc: string }[] = [
  { id: 'retail', label: 'Retail Store', icon: '🛒', desc: 'Products, inventory and sales' },
  { id: 'restaurant', label: 'Restaurant', icon: '🍽️', desc: 'Menu items and orders' },
  { id: 'games', label: 'Games & Entertainment', icon: '🎮', desc: 'PlayStation, Snooker, etc.' },
  { id: 'other', label: 'Other', icon: '🏪', desc: 'Custom setup' },
];

export default function StoreAccess({ onStoreLoaded }: StoreAccessProps) {
  const [mode, setMode] = useState<'choose' | 'create' | 'access'>('choose');
  const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState<StoreCategory>('retail');
  const [accessCode, setAccessCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [accessMood, setAccessMood] = useState<MascotMood>('idle');

  // Change mood on mode switches
  useEffect(() => {
    if (mode === 'create') {
      setAccessMood('thinking');
      const t = setTimeout(() => setAccessMood('idle'), 1500);
      return () => clearTimeout(t);
    } else if (mode === 'access') {
      setAccessMood('confident');
      const t = setTimeout(() => setAccessMood('idle'), 1500);
      return () => clearTimeout(t);
    } else {
      setAccessMood('idle');
    }
  }, [mode]);

  // Revert back to idle after typing pause
  useEffect(() => {
    if (!storeName && !accessCode) return;
    const t = setTimeout(() => {
      setAccessMood('idle');
    }, 1500);
    return () => clearTimeout(t);
  }, [storeName, accessCode]);

  const handleCreate = () => {
    if (!storeName.trim()) {
      setAccessMood('worried');
      return showToast('Enter a store name', 'error');
    }
    const store = createStore(storeName.trim(), category);
    setNewCode(store.accessCode);
    setAccessMood('celebrating');
  };

  const handleAccess = () => {
    const store = loadStore(accessCode.trim());
    if (!store) {
      setAccessMood('angry');
      return showToast('Invalid access code', 'error');
    }
    setAccessMood('happy');
    showToast(`Welcome back to ${store.storeName}!`);
    setTimeout(() => {
      onStoreLoaded(store);
    }, 1000);
  };

  const handleContinue = () => {
    const store = loadStore(newCode);
    if (store) onStoreLoaded(store);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center text-center mb-8">
          <Mascot size={80} mood={accessMood} className="mb-3" />
          <h1 className="font-display text-4xl font-bold text-primary mb-2 select-none">StoreFlow</h1>
          <p className="text-muted-foreground text-sm">Offline-first store management</p>
        </div>

        {mode === 'choose' && (
          <div className="space-y-3">
            <button
              onClick={() => setMode('create')}
              className="w-full p-4 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-lg hover:opacity-90 transition-opacity"
            >
              Create New Store
            </button>
            <button
              onClick={() => setMode('access')}
              className="w-full p-4 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-lg hover:bg-surface-3 transition-colors border border-border"
            >
              Access Existing Store
            </button>
          </div>
        )}

        {mode === 'create' && !newCode && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Store Name</label>
              <input
                value={storeName}
                onChange={e => {
                  setStoreName(e.target.value);
                  setAccessMood('thinking');
                }}
                placeholder="e.g. Blessed Nnamdi Store"
                className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Business Category</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCategory(c.id);
                      setAccessMood('thinking');
                    }}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      category === c.id
                        ? 'bg-primary/10 border-primary/40'
                        : 'bg-surface-2 border-border hover:border-primary/30'
                    }`}
                  >
                    <div className="text-xl mb-1">{c.icon}</div>
                    <p className="font-display font-semibold text-xs">{c.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{c.desc}</p>
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleCreate} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 transition-opacity">
              Create Store
            </button>
            <button onClick={() => setMode('choose')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground">
              ← Back
            </button>
          </div>
        )}

        {mode === 'create' && newCode && (
          <div className="space-y-4 text-center">
            <p className="text-success text-sm font-semibold">✓ Store created successfully!</p>
            <div>
              <p className="text-muted-foreground text-sm mb-2">Your access code:</p>
              <div className="p-4 rounded-lg bg-surface-2 border border-primary/30 gold-glow">
                <span className="font-mono text-3xl tracking-widest text-primary font-bold">{newCode}</span>
              </div>
              <p className="text-muted-foreground text-xs mt-2">Save this code! You'll need it to access your store from any device.</p>
            </div>
            <button onClick={handleContinue} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 transition-opacity">
              Continue to Store →
            </button>
          </div>
        )}

        {mode === 'access' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Access Code</label>
              <input
                value={accessCode}
                onChange={e => {
                  setAccessCode(e.target.value.toUpperCase());
                  setAccessMood('thinking');
                }}
                placeholder="Enter 6-character code"
                maxLength={6}
                className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground text-center font-mono text-2xl tracking-widest placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:border-primary"
              />
            </div>
            <button onClick={handleAccess} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 transition-opacity">
              Access Store
            </button>
            <button onClick={() => setMode('choose')} className="w-full p-2 text-muted-foreground text-sm hover:text-foreground">
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

