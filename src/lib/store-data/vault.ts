import { StoreData, VaultDocument } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';

// ─── Business Document Vault Helpers ──────────────────────────────────────────
export function addVaultDocument(store: StoreData, name: string, category: string, fileContent: string, fileSizeKB: number): StoreData {
  const newDoc: VaultDocument = {
    id: generateId(),
    name,
    category,
    dateAdded: new Date().toISOString(),
    fileContent,
    fileSize: fileSizeKB
  };
  const updated = {
    ...store,
    documents: [newDoc, ...(store.documents || [])]
  };
  saveStore(updated);
  return updated;
}

export function deleteVaultDocument(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    documents: (store.documents || []).filter(d => d.id !== id)
  };
  saveStore(updated);
  return updated;
}
