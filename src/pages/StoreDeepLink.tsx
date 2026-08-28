import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { loadStore, logScanEvent } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { StoreData } from '@/types/store';
import { Loader2, QrCode, AlertCircle } from 'lucide-react';
import BusinessStorefront from '@/components/business/BusinessStorefront';
import { getPublicStorefront } from '@/lib/public-storefront';

function shouldLogStorefrontScan(storeKey: string): boolean {
  try {
    const flag = `sf_storefront_scan_${storeKey}`;
    if (sessionStorage.getItem(flag)) return false;
    sessionStorage.setItem(flag, '1');
    return true;
  } catch {
    return true;
  }
}

export default function StoreDeepLink() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'not-found' | 'found'>('loading');
  const [store, setStore] = useState<StoreData | null>(null);

  useEffect(() => {
    if (!storeId) {
      setStatus('not-found');
      return;
    }

    const lookup = async () => {
      // Keep the fast local path for the merchant's own device, but never write a
      // public/sanitized storefront result back into the merchant store cache.
      const localByCode = loadStore(storeId.toUpperCase());
      if (localByCode) {
        activateStore(localByCode);
        return;
      }

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('storeflow_store_')) continue;
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const data = JSON.parse(raw) as StoreData;
          if (data.storeId === storeId || data.accessCode === storeId.toUpperCase()) {
            activateStore(data);
            return;
          }
        } catch {
          // Ignore malformed local stores.
        }
      }

      try {
        const storeData = await getPublicStorefront(storeId);
        if (storeData) {
          activateStore(storeData);
          return;
        }

        // Access codes are historically uppercase; retry once for old QR codes.
        if (storeId !== storeId.toUpperCase()) {
          const upperStoreData = await getPublicStorefront(storeId.toUpperCase());
          if (upperStoreData) {
            activateStore(upperStoreData);
            return;
          }
        }
      } catch (err) {
        console.error('StoreDeepLink: scoped cloud lookup failed', err);
      }

      setStatus('not-found');
      showToast('Store not found. Please check the QR code.', 'error');
    };

    lookup();
  }, [storeId]);

  const activateStore = (nextStore: StoreData) => {
    setStore(nextStore);
    setStatus('found');
    if (shouldLogStorefrontScan(nextStore.accessCode)) {
      logScanEvent(nextStore, { kind: 'qr', purpose: 'storefront_visit', matched: true });
    }
  };

  if (status === 'found' && store) {
    return <BusinessStorefront store={store} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm text-center space-y-6 animate-fade-in">
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <QrCode className="w-8 h-8" />
          </div>
          <h1 className="font-display text-3xl font-bold"><span className="text-foreground">Store</span><span className="text-primary">Flow</span></h1>
        </div>

        {status === 'loading' && (
          <div className="space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Opening store...</p>
          </div>
        )}

        {status === 'not-found' && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mx-auto"><AlertCircle className="w-6 h-6" /></div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Store Not Found</p>
              <p className="text-xs text-muted-foreground">No store matched this QR code. It may not exist yet or hasn't been synced to the cloud.</p>
            </div>
            <button onClick={() => navigate('/', { replace: true })} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity cursor-pointer">Go to StoreFlow Home</button>
          </div>
        )}
      </div>
    </div>
  );
}
