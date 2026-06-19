import { StoreData, Product, Sale, Expense, PendingPayment } from '@/types/store';
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

    if (key.startsWith('storeflow_') && key !== 'storeflow_index' && key !== 'storeflow_flow_memory' && key !== 'storeflow_session' && key !== 'storeflow_backups_list') {
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

/** Triggers a browser download of the full backup payload as a JSON file */
export function triggerBackupExport(): void {
  const payload = compileBackupPayload();
  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
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
} {
  let storesRestoredCount = 0;
  let productsMerged = 0;
  let salesMerged = 0;
  let expensesMerged = 0;

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
        profile: { ...(backupStore.profile || {}), ...(localStore.profile || {}) },
        managerSettings: { ...(backupStore.managerSettings || {}), ...(localStore.managerSettings || {}) },
      };

      localStorage.setItem(storeKey, JSON.stringify(updatedStore));
      storesRestoredCount++;
    }
  }

  // Update index list in localStorage
  localStorage.setItem('storeflow_index', JSON.stringify(localIndexList));
  return {
    storesRestoredCount,
    productsMerged,
    salesMerged,
    expensesMerged,
  };
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
