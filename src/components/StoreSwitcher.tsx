import { useState } from 'react';
import { StoreData } from '@/types/store';
import { getStoreIndex, loadStore, createStore, removeStoreFromIndex } from '@/lib/store-data';
import { saveSession } from '@/components/Settings';
import { showToast } from '@/components/Toast';

interface StoreSwitcherProps {
  currentCode: string;
  onSwitch: (store: StoreData) => void;
  onClose: () => void;
}

export default function StoreSwitcher({ currentCode, onSwitch, onClose }: StoreSwitcherProps) {
  const [mode, setMode] = useState<'list' | 'add' | 'create'>('list');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [stores, setStores] = useState(getStoreIndex());

  const switchTo = (storeCode: string) => {
    const store = loadStore(storeCode);
    if (!store) return showToast('Store not found on this device', 'error');
    saveSession(store.accessCode);
    showToast(`Switched to ${store.storeName}`);
    onSwitch(store);
    onClose();
  };

  const handleAddByCode = () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return showToast('Code must be 6 characters', 'error');
    const store = loadStore(c);
    if (!store) return showToast('No store found with that code on this device', 'error');
    switchTo(c);
  };

  const handleCreate = () => {
    if (!name.trim()) return showToast('Enter a store name', 'error');
    const store = createStore(name.trim());
    saveSession(store.accessCode);
    showToast(`Created "${store.storeName}" — code ${store.accessCode}`);
    onSwitch(store);
    onClose();
  };

  const handleRemove = (storeCode: string) => {
    if (storeCode === currentCode) return showToast('Cannot remove the active store', 'error');
    if (!confirm('Remove this store from this device? Its data will be deleted.')) return;
    removeStoreFromIndex(storeCode);
    setStores(getStoreIndex());
    showToast('Store removed');
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-lg">Switch Store</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>

        {mode === 'list' && (
          <>
            <div className="space-y-2 mb-4">
              {stores.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">No stores saved on this device.</p>
              )}
              {stores.map(s => (
                <div
                  key={s.code}
                  className={`p-3 rounded-xl border flex items-center gap-3 ${
                    s.code === currentCode ? 'bg-primary/10 border-primary/40' : 'bg-surface-2 border-border'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg">🏪</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-sm truncate">{s.name}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{s.code}</p>
                  </div>
                  {s.code === currentCode ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground font-display font-bold">ACTIVE</span>
                  ) : (
                    <>
                      <button onClick={() => switchTo(s.code)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold">
                        Switch
                      </button>
                      <button onClick={() => handleRemove(s.code)} className="w-7 h-7 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20">✕</button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMode('create')} className="p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:opacity-90">
                + New Store
              </button>
              <button onClick={() => setMode('add')} className="p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold hover:border-primary/30">
                Add by Code
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">Store Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Side Shop" className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm" autoFocus />
            <div className="flex gap-2">
              <button onClick={() => setMode('list')} className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold">Cancel</button>
              <button onClick={handleCreate} className="flex-1 p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold">Create & Switch</button>
            </div>
          </div>
        )}

        {mode === 'add' && (
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">Existing Access Code</label>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} className="w-full p-3 rounded-lg bg-surface-2 border border-border text-foreground text-center font-mono text-xl tracking-widest focus:outline-none focus:border-primary" autoFocus />
            <p className="text-[11px] text-muted-foreground">Only finds stores already created on this device. Stores from other devices can't be loaded — data is kept locally.</p>
            <div className="flex gap-2">
              <button onClick={() => setMode('list')} className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold">Cancel</button>
              <button onClick={handleAddByCode} className="flex-1 p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold">Switch</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
