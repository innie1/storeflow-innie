import { StoreData, Product, Sale, Expense, PendingPayment, DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import { saveLocalBackup, getLocalBackups, deleteLocalBackup } from './backup-db';

const BACKUP_PREFIX = 'storeflow_';

export interface BackupPayload {
  version: string;
  timestamp: string;
  deviceMemory: any;
  stores: Record<string, string>; // maps 'storeflow_ABCDEF' to raw JSON string
  index: string; // raw JSON string of storeflow_index
  lowStock?: string;
  lockTimer?: string;
  theme?: string;
}

/** Collects all localStorage StoreFlow items into a single backup payload object */
export function compileBackupPayload(): BackupPayload {
  const stores: Record<string, string> = {};
  let index = '[]';
  let deviceMemory = null;
  let lowStock = undefined;
  let lockTimer = undefined;
  let theme = undefined;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    // The shop's own records. A device secret never goes in, and the keys with
    // a field of their own are picked up by the branches below - they used to
    // be swallowed here, which is why theme, low stock and the lock timer were
    // never actually filled in.
    if (key.startsWith('storeflow_') && !isDeviceSecretKey(key) && !KEYS_WITH_OWN_FIELD.has(key)) {
      stores[key] = localStorage.getItem(key) || '';
    } else if (key === 'storeflow_index') {
      index = localStorage.getItem(key) || '[]';
    } else if (key === 'storeflow_flow_memory') {
      try {
        deviceMemory = JSON.parse(localStorage.getItem(key) || 'null');
      } catch {
        deviceMemory = null;
      }
    } else if (key === 'storeflow_low_stock') {
      lowStock = localStorage.getItem(key) || undefined;
    } else if (key === 'storeflow_lock_timer') {
      lockTimer = localStorage.getItem(key) || undefined;
    } else if (key === 'storeflow_theme') {
      theme = localStorage.getItem(key) || undefined;
    }
  }

  return {
    version: '1.0',
    timestamp: new Date().toISOString(),
    deviceMemory,
    stores,
    index,
    lowStock,
    lockTimer,
    theme,
  };
}

// ─── What never leaves this phone ────────────────────────────────────────────

/**
 * The keys that guard this device rather than record the shop.
 *
 * A backup is made to be copied off the phone - to a laptop, a chat, a drive.
 * The app-lock PIN, the fingerprint credential, the count of failed attempts
 * and whoever is signed in right now are none of the shop's business records,
 * and a file carrying them hands somebody the lock along with the books. They
 * are left out of every backup, and refused on the way back in.
 */
const DEVICE_SECRET_KEYS = new Set([
  'storeflow_lock_pin',
  'storeflow_lock_attempts',
  'storeflow_lock_credential',
  'storeflow_active_user',
  'storeflow_session',
  'storeflow_active_session',
]);

/**
 * And anything that reads like one, for whatever gets added next.
 *
 * Whole words only: "storeflow_low_stock" is not a lock, and a shop's records
 * must never go missing from its own backup because of a careless match.
 */
const SECRET_WORDS = /(^|_)(pin|lock|session|credential|token|password|secret)(_|$)/i;

export function isDeviceSecretKey(key: string): boolean {
  if (DEVICE_SECRET_KEYS.has(key)) return true;
  return SECRET_WORDS.test(key.replace(/^storeflow_/, ''));
}

/** Keys the payload carries in a field of their own, so they are not swept in twice. */
const KEYS_WITH_OWN_FIELD = new Set([
  'storeflow_index',
  'storeflow_flow_memory',
  'storeflow_low_stock',
  'storeflow_lock_timer',
  'storeflow_theme',
  'storeflow_backups_list',
]);

// ─── Encryption ──────────────────────────────────────────────────────────────

/*
 * A backup is sealed with AES-GCM, under a key derived from the owner's
 * password with PBKDF2.
 *
 * What was here before was a XOR against the password: anybody can undo it in
 * a few lines, and it cannot tell a tampered file from a real one. A backup
 * holds every customer, debt and payment a shop has. Files written the old way
 * still open - see decryptBackup - but nothing writes that format any more.
 */
const PBKDF2_ITERATIONS = 210_000;
const ENCRYPTED_VERSION = '2.0-encrypted';

interface SealedKey { salt: string; iv: string; ciphertext: string; }

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function subtle(): SubtleCrypto {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle) throw new Error('This browser cannot encrypt backups. Save an unencrypted backup instead.');
  return webCrypto.subtle;
}

async function keyFromSecret(secret: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Seals the file's own key, so either the password or the recovery key opens it. */
async function sealKey(dataKey: Uint8Array, secret: string): Promise<SealedKey> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const sealed = await subtle().encrypt({ name: 'AES-GCM', iv }, await keyFromSecret(secret, salt), dataKey);
  return { salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(sealed)) };
}

async function openKey(sealed: SealedKey, secret: string): Promise<Uint8Array> {
  const key = await keyFromSecret(secret, base64ToBytes(sealed.salt));
  const opened = await subtle().decrypt({ name: 'AES-GCM', iv: base64ToBytes(sealed.iv) }, key, base64ToBytes(sealed.ciphertext));
  return new Uint8Array(opened);
}

export async function encryptBackup(
  payload: BackupPayload,
  ownerPassword: string,
  emergencyRecoveryKey?: string,
): Promise<Record<string, unknown>> {
  const dataKeyBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const dataKey = await subtle().importKey('raw', dataKeyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv }, dataKey, new TextEncoder().encode(JSON.stringify(payload)));

  return {
    version: ENCRYPTED_VERSION,
    timestamp: payload.timestamp,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
    cipher: 'AES-GCM',
    data: { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) },
    keys: {
      password: await sealKey(dataKeyBytes, ownerPassword),
      ...(emergencyRecoveryKey ? { recovery: await sealKey(dataKeyBytes, emergencyRecoveryKey) } : {}),
    },
  };
}

/** Kept so a backup written before AES still opens. Nothing writes this format now. */
export function xorDecrypt(base64: string, key: string): string {
  const text = decodeURIComponent(escape(atob(base64)));
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return result;
}

/** Triggers a browser download of the full backup payload as a JSON file, optionally encrypted */
export async function triggerBackupExport(ownerPassword?: string, emergencyRecoveryKey?: string): Promise<void> {
  const payload = compileBackupPayload();
  let fileContent = '';

  if (ownerPassword) {
    fileContent = JSON.stringify(await encryptBackup(payload, ownerPassword, emergencyRecoveryKey), null, 2);
  } else {
    fileContent = JSON.stringify(payload, null, 2);
  }

  const blob = new Blob([fileContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `storeflow_backup_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Safely restores a backup payload. It merges store records to prevent data loss or duplicates */
export function restoreBackupPayload(payload: BackupPayload): {
  storesRestoredCount: number;
  productsMerged: number;
  salesMerged: number;
  expensesMerged: number;
  /** Bundles, day records and the rest of what a shop owns beside its store record. */
  domainsRestored: number;
} {
  let storesRestoredCount = 0;
  let productsMerged = 0;
  let salesMerged = 0;
  let expensesMerged = 0;
  let domainsRestored = 0;

  // Restore non-store global configurations
  if (payload.lowStock) localStorage.setItem('storeflow_low_stock', payload.lowStock);
  if (payload.lockTimer) localStorage.setItem('storeflow_lock_timer', payload.lockTimer);
  if (payload.theme) localStorage.setItem('storeflow_theme', payload.theme);
  
  if (payload.deviceMemory) {
    const localMemoryRaw = localStorage.getItem('storeflow_flow_memory');
    if (localMemoryRaw) {
      try {
        const localMemory = JSON.parse(localMemoryRaw);
        // Merge memory coins and suppliers
        const mergedMemory = {
          ...localMemory,
          coins: Math.max(localMemory.coins || 0, payload.deviceMemory.coins || 0),
          streak: Math.max(localMemory.streak || 0, payload.deviceMemory.streak || 0),
          suppliers: mergeArrays(localMemory.suppliers || [], payload.deviceMemory.suppliers || [], 'id'),
        };
        localStorage.setItem('storeflow_flow_memory', JSON.stringify(mergedMemory));
      } catch {
        localStorage.setItem('storeflow_flow_memory', JSON.stringify(payload.deviceMemory));
      }
    } else {
      localStorage.setItem('storeflow_flow_memory', JSON.stringify(payload.deviceMemory));
    }
  }

  // Restore and Merge Stores
  let backupIndexList: any[] = [];
  try {
    backupIndexList = JSON.parse(payload.index || '[]');
  } catch {
    backupIndexList = [];
  }

  const localIndexListRaw = localStorage.getItem('storeflow_index');
  let localIndexList: any[] = [];
  try {
    localIndexList = JSON.parse(localIndexListRaw || '[]');
  } catch {
    localIndexList = [];
  }

  // Loop through all stores in the backup
  for (const entry of backupIndexList) {
    const storeKey = `storeflow_${entry.code}`;
    const backupStoreRaw = payload.stores[storeKey];
    if (!backupStoreRaw) continue;

    let backupStore: StoreData;
    try {
      backupStore = JSON.parse(backupStoreRaw);
    } catch {
      continue;
    }

    const localStoreRaw = localStorage.getItem(storeKey);
    if (!localStoreRaw) {
      // The store does not exist locally. We import it fully as-is!
      localStorage.setItem(storeKey, JSON.stringify(backupStore));
      
      // Calculate imported stats
      productsMerged += backupStore.products?.length || 0;
      salesMerged += backupStore.sales?.length || 0;
      expensesMerged += backupStore.expenses?.length || 0;
      storesRestoredCount++;
      
      // Add to index list if not present
      if (!localIndexList.some(x => x.code === entry.code)) {
        localIndexList.push(entry);
      }
    } else {
      // The store ALREADY exists. We must merge details to prevent overriding newer local data or duplicating records
      let localStore: StoreData;
      try {
        localStore = JSON.parse(localStoreRaw);
      } catch {
        localStore = backupStore;
      }

      // Merge Products: Match by id (if exists) or by exact name
      const mergedProducts = [...localStore.products];
      let pCount = 0;
      for (const p of backupStore.products || []) {
        const match = mergedProducts.find(x => x.id === p.id || x.name.toLowerCase() === p.name.toLowerCase());
        if (!match) {
          mergedProducts.push(p);
          pCount++;
        } else {
          // Update details only if target is more complete or has positive quantity
          if (match.quantity === 0 && p.quantity > 0) {
            match.quantity = p.quantity;
          }
          if (p.barcode && !match.barcode) match.barcode = p.barcode;
        }
      }
      productsMerged += pCount;

      // Merge Sales: Match by ID
      const mergedSales = [...localStore.sales];
      let sCount = 0;
      for (const s of backupStore.sales || []) {
        const match = mergedSales.find(x => x.id === s.id);
        if (!match) {
          mergedSales.push(s);
          sCount++;
        }
      }
      salesMerged += sCount;

      // Merge Expenses: Match by ID
      const mergedExpenses = [...(localStore.expenses || [])];
      let eCount = 0;
      for (const e of backupStore.expenses || []) {
        const match = mergedExpenses.find(x => x.id === e.id);
        if (!match) {
          mergedExpenses.push(e);
          eCount++;
        }
      }
      expensesMerged += eCount;

      // Merge Investments
      const mergedInvestments = mergeArrays(localStore.investments || [], backupStore.investments || [], 'id');
      
      // Merge Pending Payments
      const mergedPending = mergeArrays(localStore.pendingPayments || [], backupStore.pendingPayments || [], 'id');
      
      // Merge Product Requests
      const mergedRequests = mergeArrays(localStore.customerRequests || [], backupStore.customerRequests || [], 'id');
      
      // Merge Notifications
      const mergedNotifications = mergeArrays(localStore.flowNotifications || [], backupStore.flowNotifications || [], 'id');

      // Update local store
      const updatedStore: StoreData = {
        ...localStore,
        products: mergedProducts,
        sales: mergedSales,
        expenses: mergedExpenses,
        investments: mergedInvestments,
        pendingPayments: mergedPending,
        customerRequests: mergedRequests,
        flowNotifications: mergedNotifications,
        coins: Math.max(localStore.coins || 0, backupStore.coins || 0),
        savingsGoal: localStore.savingsGoal || backupStore.savingsGoal,
        /*
         * Merged onto a base, not onto nothing.
         *
         * A restore of a store that had never filled in its profile produced
         * `{}` - and `{}` is truthy, so every `store.managerSettings ||
         * DEFAULT_MANAGER_SETTINGS` fallback in the app stopped falling back
         * and read undefined off an empty object instead. Restoring a backup
         * quietly switched the Manager's features off. Starting from the
         * defaults keeps a restore from being a downgrade.
         */
        profile: { location: '', phone: '', email: '', ...(backupStore.profile || {}), ...(localStore.profile || {}) },
        managerSettings: { ...DEFAULT_MANAGER_SETTINGS, ...(backupStore.managerSettings || {}), ...(localStore.managerSettings || {}) },
      };

      localStorage.setItem(storeKey, JSON.stringify(updatedStore));
      storesRestoredCount++;
    }
  }

  /*
   * And everything else the shops own on this device.
   *
   * The backup carried these all along - laundry bundles, day records, month
   * reports, due defaults - but restore only ever wrote the store record
   * itself, so a new phone got the shop with none of its bundles. They are
   * written only where this device has nothing under that key: a restore must
   * never write over work that is already here. A secret in an old file is
   * refused outright.
   */
  const restoredCodes = new Set(
    backupIndexList.map(entry => String(entry?.code || '').toUpperCase()).filter(Boolean),
  );
  for (const [key, value] of Object.entries(payload.stores || {})) {
    if (isDeviceSecretKey(key)) continue;
    const bare = key.replace(/^storeflow_(store_)?/, '').toUpperCase();
    if (restoredCodes.has(bare)) continue; // the store record itself, merged above
    if (localStorage.getItem(key) !== null) continue;
    try {
      localStorage.setItem(key, value);
      domainsRestored++;
    } catch { /* storage full */ }
  }

  // Update index list in localStorage
  localStorage.setItem('storeflow_index', JSON.stringify(localIndexList));
  return {
    storesRestoredCount,
    productsMerged,
    salesMerged,
    expensesMerged,
    domainsRestored,
  };
}

export async function decryptBackup(encryptedPayload: any, decryptionKey: string): Promise<BackupPayload> {
  if (encryptedPayload?.version === ENCRYPTED_VERSION) {
    const sealedKeys = encryptedPayload.keys || {};
    let dataKeyBytes: Uint8Array | null = null;
    // The password and the recovery key each open the same file.
    for (const sealed of [sealedKeys.password, sealedKeys.recovery]) {
      if (!sealed) continue;
      try {
        dataKeyBytes = await openKey(sealed, decryptionKey);
        break;
      } catch { /* try the other one */ }
    }
    if (!dataKeyBytes) throw new Error('Incorrect decryption key');

    const dataKey = await subtle().importKey('raw', dataKeyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    let opened: ArrayBuffer;
    try {
      opened = await subtle().decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(encryptedPayload.data.iv) },
        dataKey,
        base64ToBytes(encryptedPayload.data.ciphertext),
      );
    } catch {
      // AES-GCM checks the file as well as opening it.
      throw new Error('This backup file has been changed since it was made');
    }
    return JSON.parse(new TextDecoder().decode(opened)) as BackupPayload;
  }

  if (encryptedPayload.version !== '1.0-encrypted') {
    return encryptedPayload as BackupPayload;
  }
  
  const { encryptedData, pwHeader, rkHeader } = encryptedPayload;
  let decryptedDataKey = '';
  
  // Try pwHeader
  try {
    decryptedDataKey = xorDecrypt(pwHeader, decryptionKey);
  } catch {}
  
  let decryptedJson = '';
  let parsed: any = null;
  
  if (decryptedDataKey) {
    try {
      decryptedJson = xorDecrypt(encryptedData, decryptedDataKey);
      parsed = JSON.parse(decryptedJson);
    } catch {}
  }
  
  // Try rkHeader
  if (!parsed || !parsed.stores) {
    try {
      decryptedDataKey = xorDecrypt(rkHeader, decryptionKey);
      decryptedJson = xorDecrypt(encryptedData, decryptedDataKey);
      parsed = JSON.parse(decryptedJson);
    } catch {}
  }
  
  if (!parsed || !parsed.stores) {
    throw new Error('Incorrect decryption key');
  }
  
  return parsed as BackupPayload;
}

/** Utility function to merge lists of objects by a key (like id) */
function mergeArrays<T>(local: T[], backup: T[], key: keyof T): T[] {
  const merged = [...local];
  for (const b of backup) {
    if (!merged.some(l => l[key] === b[key])) {
      merged.push(b);
    }
  }
  return merged;
}

/** Creates an automatic restore point snapshot in IndexedDB */
export async function createAutoBackupSnapshot(): Promise<void> {
  const fullBackup = compileBackupPayload();
  // Map payload data to a flat Record<string, string> for IndexedDB
  const dbData: Record<string, string> = {
    index: fullBackup.index,
    deviceMemory: JSON.stringify(fullBackup.deviceMemory),
    lowStock: fullBackup.lowStock || '',
    lockTimer: fullBackup.lockTimer || '',
    theme: fullBackup.theme || '',
  };
  for (const [k, v] of Object.entries(fullBackup.stores)) {
    dbData[k] = v;
  }
  await saveLocalBackup('auto_save', dbData);

  // Auto-prune old auto-save snapshots, keep last 10
  try {
    const list = await getLocalBackups();
    const autoSaves = list.filter(b => b.type === 'auto_save');
    if (autoSaves.length > 10) {
      const toDelete = autoSaves.slice(10);
      for (const b of toDelete) {
        await deleteLocalBackup(b.id);
      }
    }
  } catch (err) {
    // Ignore pruning errors
  }
}
