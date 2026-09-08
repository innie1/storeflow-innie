import { useState } from 'react';
import { StoreData, StoreCategory } from '@/types/store';
import { getStoreIndex, backfillStoreIndexTypes, loadStore, createStore, removeStoreFromIndex } from '@/lib/store-data';
import { getBusinessTemplate } from '@/lib/business-runtime';
import { saveSession } from '@/components/Settings';
import { showToast } from '@/components/Toast';
import { useBodyScrollLock } from '@/hooks/use-body-scroll-lock';

import ConfirmModal from '@/components/ConfirmModal';

const CATEGORIES: { id: StoreCategory; label: string; icon: string }[] = [
  { id: 'retail', label: 'Retail', icon: '🛒' },
  { id: 'restaurant', label: 'Restaurant', icon: '🍽️' },
  { id: 'games', label: 'Games', icon: '🎮' },
  { id: 'other', label: 'Other', icon: '🏪' },
];

interface StoreSwitcherProps {
  currentCode: string;
  onSwitch: (store: StoreData) => void;
  onClose: () => void;
}

export default function StoreSwitcher({ currentCode, onSwitch, onClose }: StoreSwitcherProps) {
  useBodyScrollLock();
  const [mode, setMode] = useState<'list' | 'add' | 'create'>('list');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<StoreCategory>('retail');
  const [retailType, setRetailType] = useState('provision_retail');
  // Entries written before the trade was recorded are filled in from the
  // stores already on this device, so an existing merchant sees what each shop
  // is without having to re-add it.
  const [stores, setStores] = useState(backfillStoreIndexTypes());
  const [pendingRemoveCode, setPendingRemoveCode] = useState<string | null>(null);

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
    const store = createStore(name.trim(), category, category === 'retail' ? retailType : undefined);
    saveSession(store.accessCode);
    showToast(`Created "${store.storeName}" — code ${store.accessCode}`);
    onSwitch(store);
    onClose();
  };

  const handleRemove = (storeCode: string) => {
    if (storeCode === currentCode) return showToast('Cannot remove the active store', 'error');
    setPendingRemoveCode(storeCode);
  };

  const confirmRemoveStore = () => {
    if (!pendingRemoveCode) return;
    removeStoreFromIndex(pendingRemoveCode);
    setStores(getStoreIndex());
    showToast('Store removed');
    setPendingRemoveCode(null);
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
                  /*
                    Every row the same height, whatever it is showing.
                    The active one carried a badge where the others carry a
                    Switch button and a remove button, so it sat taller than
                    the rest and the list stepped in and out down the side. A
                    fixed row height and a fixed-width slot on the right keeps
                    them in one line.
                  */
                  className={`h-[68px] px-3 rounded-xl border flex items-center gap-3 ${
                    s.code === currentCode ? 'bg-surface-2 border-success/30' : 'bg-surface-2 border-border'
                  }`}
                >
                  {/*
                    The trade, not a generic shop.
                    Every store showed the same 🏪 and its name, so somebody
                    running a laundry, a barber shop and a restaurant off one
                    phone had nothing to tell them apart but memory.
                  */}
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg shrink-0">
                    {getBusinessTemplate({ storeType: s.businessType } as any).icon || '🏪'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-semibold text-sm truncate">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {getBusinessTemplate({ storeType: s.businessType } as any).name}
                      <span className="font-mono"> · {s.code}</span>
                    </p>
                  </div>
                  {/*
                    One slot on the right, laid out the same either way.
                    ACTIVE sits in the column the Switch buttons occupy, with
                    an empty space where the remove button would be, so the
                    word lines up with them down the list instead of sitting
                    further right on its own.
                  */}
                  <div className="flex items-center gap-2 shrink-0">
                    {s.code === currentCode ? (
                      <>
                        <span className="h-8 px-3 text-[10px] font-display font-black tracking-wide text-success flex items-center justify-center">
                          ACTIVE
                        </span>
                        {/* The remove button's width, held open. The active
                            store cannot be removed while it is in use. */}
                        <span className="w-8 h-8" aria-hidden="true" />
                      </>
                    ) : (
                      <>
                        <button onClick={() => switchTo(s.code)} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold">
                          Switch
                        </button>
                        <button onClick={() => handleRemove(s.code)} className="w-8 h-8 rounded-lg bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 flex items-center justify-center">✕</button>
                      </>
                    )}
                  </div>
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
            <label className="block text-xs text-muted-foreground">Business Category</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    category === c.id ? 'bg-primary/10 border-primary/40' : 'bg-surface-2 border-border hover:border-primary/30'
                  }`}
                >
                  <div className="text-lg">{c.icon}</div>
                  <p className="font-display font-semibold text-xs mt-0.5">{c.label}</p>
                </button>
              ))}
            </div>
            {category === 'retail' && (
              <div className="space-y-1 text-left">
                <label className="block text-xs text-muted-foreground uppercase font-bold">Select Retail Type</label>
                <select
                  value={retailType}
                  onChange={e => setRetailType(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground text-sm focus:outline-none focus:border-primary focus:bg-surface-2 [&>option]:bg-card"
                >
                  <option value="provision_retail">Sales of Provision (Retail Provision)</option>
                  <option value="provision_wholesale">Wholesale for Provision</option>
                  <option value="pharmacy">Pharmacy / Chemist</option>
                  <option value="electronics">Electronics Store</option>
                  <option value="gasoline">Gasoline / Gas Filling Station</option>
                  <option value="other">Other / General Retail</option>
                </select>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  * Provision retail/wholesale loads preloaded goods. Other types start empty.
                </p>
              </div>
            )}
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

      <ConfirmModal
        isOpen={Boolean(pendingRemoveCode)}
        title="Remove Store?"
        description="Are you sure you want to remove this store from this device? Its data will be deleted."
        confirmText="Remove Store"
        cancelText="Cancel"
        variant="danger"
        icon="🏪"
        onConfirm={confirmRemoveStore}
        onCancel={() => setPendingRemoveCode(null)}
      />
    </div>
  );
}
