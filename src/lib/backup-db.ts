const DB_NAME = 'storeflow_backup_db';
const DB_VERSION = 1;
const STORE_NAME = 'backups';

export interface LocalBackup {
  id: string;
  timestamp: string;
  type: 'manual' | 'auto_migration' | 'auto_save';
  size: number;
  data: Record<string, string>;
}

export function initBackupDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function saveLocalBackup(
  type: LocalBackup['type'],
  data: Record<string, string>
): Promise<LocalBackup> {
  const db = await initBackupDB();
  const id = Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  const timestamp = new Date().toISOString();
  
  // Calculate size in bytes approximately
  const stringData = JSON.stringify(data);
  const size = new Blob([stringData]).size;

  const backup: LocalBackup = {
    id,
    timestamp,
    type,
    size,
    data,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(transaction.objectStoreNames[0]);
    const request = store.put(backup);

    request.onsuccess = () => resolve(backup);
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalBackups(): Promise<LocalBackup[]> {
  const db = await initBackupDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort backups by timestamp descending (newest first)
      const backups = request.result as LocalBackup[];
      backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      resolve(backups);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteLocalBackup(id: string): Promise<void> {
  const db = await initBackupDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
