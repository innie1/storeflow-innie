import { useEffect } from 'react';
import type { StoreData } from '@/types/store';
import { LAUNDRY_LOCAL_CHANGED_EVENT, syncPendingLaundryRecords } from '@/lib/laundry-offline';

interface Props {
  store: StoreData;
}

/**
 * Invisible local-first sync worker for laundry stores.
 * Records are already safe in localStorage before this runs. This component
 * only mirrors pending records to Supabase when connectivity is available.
 */
export default function LaundrySyncAgent({ store }: Props) {
  useEffect(() => {
    const accessCode = String(store.accessCode || '').trim();
    const type = String((store as any).businessType || store.storeType || '').toLowerCase();
    if (!accessCode || type !== 'laundry') return;

    let active = true;
    const sync = () => {
      if (!active) return;
      syncPendingLaundryRecords(accessCode).catch(error => {
        console.warn('[Laundry Sync] Background sync failed; local records are safe.', error);
      });
    };

    sync();
    const onOnline = () => sync();
    const onLocalChange = () => sync();
    window.addEventListener('online', onOnline);
    window.addEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, onLocalChange);
    const interval = window.setInterval(sync, 30_000);

    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener(LAUNDRY_LOCAL_CHANGED_EVENT, onLocalChange);
      window.clearInterval(interval);
    };
  }, [store.accessCode, store.storeType, (store as any).businessType]);

  return null;
}