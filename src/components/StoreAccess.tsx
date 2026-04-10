import { useState } from 'react';
import { createStore, loadStore } from '@/lib/store-data';
import { StoreData } from '@/types/store';
import { showToast } from '@/components/Toast';

interface StoreAccessProps {
  onStoreLoaded: (store: StoreData) => void;
}

export default function StoreAccess({ onStoreLoaded }: StoreAccessProps) {
  const [mode, setMode] = useState<'choose' | 'create' | 'access'>('choose');
  const [storeName, setStoreName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [newCode, setNewCode] = useState('');

  const handleCreate = () => {
    if (!storeName.trim()) return showToast('Enter a store name', 'error');
    const store = createStore(storeName.trim());
    setNewCode(store.accessCode);
  };

  const handleAccess = () => {
    const store = loadStore(accessCode.trim());
    if (!store) return showToast('Invalid access code', 'error');
    showToast(`Welcome back to ${store.storeName}!`);
    onStoreLoaded(store);
  };

  const handleContinue = () => {
    const store = loadStore(newCode);
    if (store) onStoreLoaded(store);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold text-primary mb-2">StoreFlow</h1>
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
                onChange={e => setStoreName(e.target.value)}
                placeholder="e.g. Blessed Nnamdi Store"
                className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
              />
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
            <p className="text-success text-sm">✓ Store created successfully!</p>
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
                onChange={e => setAccessCode(e.target.value.toUpperCase())}
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
