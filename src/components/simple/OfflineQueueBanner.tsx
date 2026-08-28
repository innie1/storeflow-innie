import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';

const queueKey = (accessCode: string) => `storeflow_simple_offline_queue_${accessCode}`;

// Called from SimpleModeHome right after a sale is recorded, so the banner
// knows a sale happened while offline and hasn't been confirmed synced yet.
export function markSaleQueuedIfOffline(accessCode: string) {
  if (typeof navigator === 'undefined' || navigator.onLine) return;
  try {
    const key = queueKey(accessCode);
    const count = Number(localStorage.getItem(key) || '0');
    localStorage.setItem(key, String(count + 1));
  } catch { /* ok */ }
}

interface OfflineQueueBannerProps {
  store: StoreData;
  setStore: (store: StoreData) => void;
}

export default function OfflineQueueBanner({ store, setStore }: OfflineQueueBannerProps) {
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const key = queueKey(store.accessCode);

  useEffect(() => {
    const read = () => {
      try { setPending(Number(localStorage.getItem(key) || '0')); } catch { setPending(0); }
    };
    read();

    const handleOffline = () => { setIsOnline(false); read(); };
    const handleOnline = () => {
      setIsOnline(true);
      const count = Number(localStorage.getItem(key) || '0');
      if (count > 0) {
        setSyncing(true);
        // Best-effort resync — re-triggers the same cloud push saveStore already
        // attempts. There's no per-sale acknowledgment from the backend yet, so
        // this clears the counter optimistically once the app is back online.
        saveStore(store);
        setTimeout(() => {
          try { localStorage.removeItem(key); } catch { /* ok */ }
          setPending(0);
          setSyncing(false);
        }, 1500);
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [key, store]);

  if (isOnline && !syncing && pending === 0) return null;

  return (
    <div className="w-full max-w-sm mx-auto mb-4 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-warning/15 border border-warning/30">
      {syncing ? (
        <RefreshCw className="w-4 h-4 text-warning shrink-0 animate-spin" />
      ) : (
        <WifiOff className="w-4 h-4 text-warning shrink-0" />
      )}
      <p className="text-xs font-display font-medium text-foreground">
        {syncing
          ? 'Back online — syncing your sales…'
          : pending > 0
          ? `Offline — ${pending} sale${pending === 1 ? '' : 's'} waiting to sync`
          : "You're offline. Sales are still being saved."}
      </p>
    </div>
  );
}
