import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { loadStore, logScanEvent } from '@/lib/store-data';
import { supabase } from '@/integrations/supabase/client';
import { showToast } from '@/components/Toast';
import { saveSession } from '@/components/Settings';
import { StoreData } from '@/types/store';
import { Loader2, QrCode, Store, AlertCircle } from 'lucide-react';

// Log at most once per browser session per store. This is a real, previously
// missing signal (customers opening the storefront via QR was invisible to
// analytics), but scan events live inside the same `stores.data` JSONB blob
// that's expensive to rewrite on every mutation (see Orders performance
// fix) -- so this intentionally does NOT log on every open/refresh, only
// once per unique visit.
function shouldLogStorefrontScan(storeKey: string): boolean {
  try {
    const flag = `sf_storefront_scan_${storeKey}`;
    if (sessionStorage.getItem(flag)) return false;
    sessionStorage.setItem(flag, '1');
    return true;
  } catch {
    return true; // if sessionStorage is unavailable, don't block the scan from logging
  }
}

/**
 * Deep-link page: handles /s/:storeId routes.
 * When a store QR code is scanned with an external camera, it opens this page.
 * This page looks up the store by storeId (or accessCode) and redirects to the main app.
 */
export default function StoreDeepLink() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'not-found' | 'found'>('loading');
  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    if (!storeId) {
      setStatus('not-found');
      return;
    }

    const lookup = async () => {
      // 1. Try loading from localStorage by access code
      const localByCode = loadStore(storeId.toUpperCase());
      if (localByCode) {
        setStoreName(localByCode.storeName);
        setStatus('found');
        activateStore(localByCode);
        return;
      }

      // 2. Try scanning all local stores to find one with matching storeId field
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('storeflow_store_')) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const data = JSON.parse(raw) as StoreData;
              if (data.storeId === storeId || data.accessCode === storeId.toUpperCase()) {
                setStoreName(data.storeName);
                setStatus('found');
                activateStore(data);
                return;
              }
            }
          } catch { /* skip malformed */ }
        }
      }

      // 3. Try cloud lookup by store_id or access_code
      try {
        // Try by store_id first
        let { data: cloudStore } = await supabase
          .from('stores')
          .select('*')
          .eq('store_id', storeId)
          .maybeSingle();

        // Fallback: try by access_code
        if (!cloudStore) {
          const { data: codeStore } = await supabase
            .from('stores')
            .select('*')
            .eq('access_code', storeId.toUpperCase())
            .maybeSingle();
          cloudStore = codeStore;
        }

        if (cloudStore && cloudStore.data) {
          const storeData = cloudStore.data as StoreData;
          // Save to local storage
          localStorage.setItem(`storeflow_store_${storeData.accessCode}`, JSON.stringify(storeData));
          setStoreName(storeData.storeName);
          setStatus('found');
          activateStore(storeData);
          return;
        }
      } catch (err) {
        console.error('StoreDeepLink: Cloud lookup failed', err);
      }

      // 4. Not found
      setStatus('not-found');
      showToast('Store not found. Please check the QR code.', 'error');
    };

    lookup();
  }, [storeId]);

  const activateStore = (store: StoreData) => {
    // Save the session so the main app picks it up
    saveSession(store.accessCode);

    // Record that a customer opened the storefront via QR -- throttled to
    // once per session so it doesn't add a full-store cloud write on every
    // page open.
    if (shouldLogStorefrontScan(store.accessCode)) {
      logScanEvent(store, { kind: 'qr', purpose: 'storefront_visit', matched: true });
    }

    showToast(`Opening ${store.storeName}...`, 'success');

    // Navigate to the main page — the Index component will pick up the session
    setTimeout(() => {
      navigate('/', { replace: true });
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm text-center space-y-6 animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <QrCode className="w-8 h-8" />
          </div>
          <h1 className="font-display text-3xl font-bold">
            <span className="text-foreground">Store</span>
            <span className="text-primary">Flow</span>
          </h1>
        </div>

        {status === 'loading' && (
          <div className="space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Looking up store...</p>
            <p className="text-xs text-muted-foreground font-mono">{storeId}</p>
          </div>
        )}

        {status === 'found' && (
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 mx-auto">
              <Store className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {storeName}
            </p>
            <p className="text-xs text-muted-foreground">Redirecting to store...</p>
          </div>
        )}

        {status === 'not-found' && (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Store Not Found</p>
              <p className="text-xs text-muted-foreground">
                No store matched this QR code. It may not exist yet or hasn't been synced to the cloud.
              </p>
            </div>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity cursor-pointer"
            >
              Go to StoreFlow Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
