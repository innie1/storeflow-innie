import { StoreData, ScanEvent } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';

// ─── Scan Analytics ─────────────────────────────────────────────────────────
// Every QR/barcode scan surface in the app (QR Hub, checkout scanning,
// quick lookup) calls this so there's finally a real record of what's
// being scanned, instead of the QR/Barcode page being a pure
// generate/scan utility with no visibility into how it's actually used.
// Capped at the most recent 500 events so this can't grow unbounded.
export function logScanEvent(
  store: StoreData,
  event: { kind: 'qr' | 'barcode'; purpose: string; productId?: string; productName?: string; matched: boolean }
): StoreData {
  const newEvent: ScanEvent = {
    id: generateId(),
    date: new Date().toISOString(),
    ...event,
  };
  const updated = {
    ...store,
    scanEvents: [newEvent, ...(store.scanEvents || [])].slice(0, 500),
  };
  saveStore(updated);
  return updated;
}
