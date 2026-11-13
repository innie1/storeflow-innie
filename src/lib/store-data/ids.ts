import { StoreData } from '@/types/store';
import { STORE_PREFIX } from './keys';

export function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function generateStoreUniqueCode(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Generates a permanent short Store ID (e.g. SF-A8K29M). Never changes after creation. */
export function generatePermanentStoreId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Highly legible characters (avoiding O, 0, I, 1)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SF-${code}`;
}

/**
 * Ensures a store has a permanent storeId in the correct short format (SF-[A-Z0-9]{6}).
 * If one doesn't exist or is in the old format, it generates a new short one and persists it immediately.
 * Call this at app load.
 */
export function ensureStoreId(store: StoreData): StoreData {
  const hasValidFormat = store.storeId && /^SF-[A-Z0-9]{6}$/.test(store.storeId);
  if (hasValidFormat) return store; // Already has a valid short format — never overwrite
  const storeId = generatePermanentStoreId();
  const updated = { ...store, storeId };
  // Persist immediately to localStorage
  try {
    localStorage.setItem(STORE_PREFIX + store.accessCode, JSON.stringify(updated));
  } catch (_) { /* storage quota — non-fatal */ }
  return updated;
}

// ---------- Investments ----------

export function generateId2(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
