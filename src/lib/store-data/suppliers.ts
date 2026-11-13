import { StoreData, Supplier } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';

// ─── Supplier Helpers ─────────────────────────────────────────────────────────
export function addSupplier(store: StoreData, supplier: Omit<Supplier, 'id'>): StoreData {
  const newSup: Supplier = {
    ...supplier,
    id: generateId()
  };
  const updated = {
    ...store,
    suppliers: [newSup, ...(store.suppliers || [])]
  };
  saveStore(updated);
  return updated;
}

export function updateSupplier(store: StoreData, id: string, updates: Partial<Supplier>): StoreData {
  const updated = {
    ...store,
    suppliers: (store.suppliers || []).map(s => s.id === id ? { ...s, ...updates } : s)
  };
  saveStore(updated);
  return updated;
}

export function deleteSupplier(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    suppliers: (store.suppliers || []).filter(s => s.id !== id)
  };
  saveStore(updated);
  return updated;
}
