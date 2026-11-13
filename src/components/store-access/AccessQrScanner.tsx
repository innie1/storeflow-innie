import { loadStore } from '@/lib/store-data';
import { StoreData } from '@/types/store';
import { showToast } from '@/components/Toast';
import { generateStoreUrl, parseScannedQRText } from '@/lib/qr-code';
import QRScannerPage from '@/components/qr/QRScannerPage';
import { getPublicStorefront } from '@/lib/public-storefront';
import type { StoreAccessState } from './useStoreAccess';

/**
 * The camera, for scanning a shop's access code.
 */
export default function AccessQrScanner({ s }: { s: StoreAccessState }) {
  const { sayRandom, FLOW_WRONG_LINES, setAccessCode, setAccessMood, setShowQRScanner, proceedWithStore } = s;
  return (
    <QRScannerPage
      onScanSuccess={(decodedText: string) => {
        setShowQRScanner(false);

        // Try to extract a store ID from the scanned QR
        const parsed = parseScannedQRText(decodedText);
        if (parsed && parsed.storeId) {
          setAccessCode(parsed.storeId.toUpperCase());
          setAccessMood('happy');
          showToast('Store QR code scanned! Accessing store...', 'success');

          // Auto-trigger access with the extracted code
          setTimeout(() => {
            const code = parsed.storeId.toUpperCase();
            // Try local first
            const localStore = loadStore(code);
            if (localStore) {
              proceedWithStore(localStore);
              return;
            }

            // Also try scanning all local stores by storeId field
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith('storeflow_store_')) {
                try {
                  const raw = localStorage.getItem(key);
                  if (raw) {
                    const data = JSON.parse(raw) as StoreData;
                    if (data.storeId === parsed.storeId || data.accessCode === code) {
                      proceedWithStore(data);
                      return;
                    }
                  }
                } catch { /* skip */ }
              }
            }

            // Try cloud lookup
            (async () => {
              setAccessMood('thinking' as any);
              try {
                const remoteStore = await getPublicStorefront(parsed.storeId);

                if (remoteStore) {
                  setAccessMood('happy' as any);
                  showToast('Cloud store loaded!', 'success');
                  // QR scanning is a customer action. Open the public
                  // storefront and never cache its sanitized payload as a
                  // merchant store.
                  window.location.assign(generateStoreUrl(remoteStore.storeId || remoteStore.accessCode));
                  return;
                }

                setAccessMood('angry');
                sayRandom(FLOW_WRONG_LINES);
                showToast('Store not found. Try entering the access code manually.', 'error');
              } catch {
                setAccessMood('angry');
                sayRandom(FLOW_WRONG_LINES);
                showToast('Failed to look up store. Check your connection.', 'error');
              }
            })();
          }, 300);
        } else {
          setAccessMood('worried');
          showToast('Could not identify a store from this QR code', 'error');
        }
      }}
      onClose={() => setShowQRScanner(false)}
    />
  );
}
