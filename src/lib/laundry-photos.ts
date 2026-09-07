/**
 * Photographs of a bundle at drop-off.
 *
 * Garment disputes are the thing that costs a laundry most — an item comes
 * back claimed as stained, torn or missing, and there is nothing to say what
 * it looked like when it arrived. A photo taken at the counter settles almost
 * all of them, which is why every laundry system in the market has one.
 *
 * They live in IndexedDB, not on the record. localStorage holds the whole
 * store in a few megabytes shared across the origin, and one photo would eat a
 * meaningful share of it; a dozen bundles would push the shop's actual data
 * out. The record keeps only the ids.
 */

const DB_NAME = 'storeflow_laundry_photos';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

export interface LaundryPhoto {
  id: string;
  clientRef: string;
  accessCode: string;
  /** Downscaled JPEG, as a data URL. */
  dataUrl: string;
  takenAt: string;
  bytes: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // Every read is "the photos for this bundle", so that is the index.
        store.createIndex('clientRef', 'clientRef', { unique: false });
      }
    };
  });
}

export function laundryPhotoId(): string {
  return `ph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Keep a photo against a bundle.
 *
 * Failure is swallowed on purpose: a camera that cannot save must never stop
 * the bundle being recorded. The job matters more than the picture of it.
 */
export async function saveLaundryPhoto(photo: LaundryPhoto): Promise<boolean> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(photo);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function getLaundryPhotos(clientRef: string): Promise<LaundryPhoto[]> {
  if (!clientRef) return [];
  try {
    const db = await openDB();
    const rows = await new Promise<LaundryPhoto[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).index('clientRef').getAll(clientRef);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  } catch {
    return [];
  }
}

export async function deleteLaundryPhoto(id: string): Promise<boolean> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** How many bundles have photos, and how much room they take. */
export async function laundryPhotoUsage(): Promise<{ photos: number; bytes: number }> {
  try {
    const db = await openDB();
    const rows = await new Promise<LaundryPhoto[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return {
      photos: rows.length,
      bytes: rows.reduce((sum, row) => sum + (Number(row.bytes) || 0), 0),
    };
  } catch {
    return { photos: 0, bytes: 0 };
  }
}

/** What a bundle may hold. Enough to show a dispute, not enough to fill a phone. */
export const MAX_PHOTOS_PER_BUNDLE = 4;

/**
 * Move photos from the draft key onto the bundle once it is saved.
 *
 * Photos are taken while the sheet is still open, before the bundle has a
 * client ref of its own. Without this they would stay filed under a draft id
 * nothing ever looks up again — taken, stored, and invisible.
 */
export async function reassignLaundryPhotos(fromRef: string, toRef: string): Promise<number> {
  if (!fromRef || !toRef || fromRef === toRef) return 0;
  const rows = await getLaundryPhotos(fromRef);
  let moved = 0;
  for (const row of rows) {
    const ok = await saveLaundryPhoto({ ...row, clientRef: toRef });
    if (ok) moved += 1;
  }
  return moved;
}
