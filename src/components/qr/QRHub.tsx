import { useMemo, useState } from 'react';
import { Camera, Copy, ExternalLink, Package, QrCode, ScanLine, Store, X } from 'lucide-react';
import { StoreData } from '@/types/store';
import { decodeQRData, generateProductUrl, generateStoreUrl, parseScannedQRText, QRData } from '@/lib/qr-code';
import { logScanEvent } from '@/lib/store-data';
import QRDisplayCard from './QRDisplayCard';
import QRScannerPage from './QRScannerPage';
import { showToast } from '@/components/Toast';

interface QRHubProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  currentUser?: any;
  orders?: any[];
}

type Mode = 'store' | 'product';

/**
 * QR is deliberately small and task-focused:
 * 1. Publish/share the storefront QR.
 * 2. Create a QR for an individual product when needed.
 * 3. Scan a StoreFlow QR.
 *
 * Analytics, shelf tags, loyalty codes, payment requests, staff badges,
 * receipt markers and other experimental generators are intentionally not
 * exposed here. They either belong in their owning feature or are not ready
 * enough to be presented as production functionality.
 */
export default function QRHub({ store, onUpdate, currentUser: _currentUser }: QRHubProps) {
  const [mode, setMode] = useState<Mode>('store');
  const [productId, setProductId] = useState('');
  const [generated, setGenerated] = useState<{ data: string; label: string; type: string } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResult, setScanResult] = useState<QRData | null>(null);

  const storeId = store.storeId || store.accessCode || store.profile?.uniqueCode || '';
  const activeProducts = useMemo(
    () => (store.products || []).filter(product => !product.discontinued),
    [store.products]
  );

  const storefrontUrl = storeId ? generateStoreUrl(storeId) : '';

  const generateStoreQR = () => {
    if (!storeId || !storefrontUrl) {
      showToast('Your store code is not available yet. Connect your store to the cloud first.', 'warning');
      return;
    }
    setGenerated({ data: storefrontUrl, label: store.storeName, type: 'store' });
  };

  const generateProductQR = () => {
    const product = activeProducts.find(item => item.id === productId);
    if (!product) {
      showToast('Choose a product first.', 'warning');
      return;
    }
    if (!storeId) {
      showToast('Your store code is not available yet.', 'warning');
      return;
    }
    setGenerated({
      data: generateProductUrl(storeId, product.id),
      label: product.name,
      type: 'product',
    });
  };

  const handleScan = (decodedText: string) => {
    setScannerOpen(false);

    const encoded = decodeQRData(decodedText);
    if (encoded) {
      setScanResult(encoded);
      onUpdate(logScanEvent(store, {
        kind: 'qr',
        purpose: encoded.type || 'unknown',
        productId: encoded.payload?.id,
        productName: encoded.payload?.name,
        matched: true,
      }));
      return;
    }

    const parsed = parseScannedQRText(decodedText);
    if (parsed) {
      const result: QRData = {
        version: 1,
        uuid: 'url-scan',
        token: parsed.source,
        storeId: parsed.storeId,
        timestamp: Date.now(),
        type: parsed.productId ? 'product' : 'store',
        payload: {
          scannedUrl: decodedText,
          ...(parsed.productId ? { productId: parsed.productId } : {}),
        },
      };
      setScanResult(result);
      onUpdate(logScanEvent(store, {
        kind: 'qr',
        purpose: parsed.productId ? 'product' : 'store',
        productId: parsed.productId,
        matched: true,
      }));
      showToast('StoreFlow code recognized.', 'success');
      return;
    }

    setScanResult(null);
    onUpdate(logScanEvent(store, { kind: 'qr', purpose: 'unrecognized', matched: false }));
    showToast('This code is not a recognized StoreFlow QR.', 'warning');
  };

  const copyStoreCode = async () => {
    if (!storeId) return showToast('Store code is not available yet.', 'warning');
    try {
      await navigator.clipboard.writeText(storeId);
      showToast('Store code copied.', 'success');
    } catch {
      showToast(`Your Store Code is ${storeId}`, 'info');
    }
  };

  if (scannerOpen) {
    return (
      <QRScannerPage
        onScanSuccess={handleScan}
        onClose={() => setScannerOpen(false)}
      />
    );
  }

  const selectedProduct = activeProducts.find(item => item.id === productId);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5 animate-fade-in">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <QrCode className="w-6 h-6 text-primary" />
          <h1 className="font-display text-2xl font-bold text-foreground">QR & Storefront</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Let customers find your store with one scan or your Store Code.
        </p>
      </header>

      <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Store Code</p>
            <p className="font-mono text-lg font-bold text-foreground truncate">{storeId || 'Not available'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Customers can enter this code in the customer app instead of scanning.
            </p>
          </div>
          <button
            type="button"
            onClick={copyStoreCode}
            disabled={!storeId}
            className="p-2.5 rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            aria-label="Copy store code"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={generateStoreQR}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
          >
            <QrCode className="w-4 h-4" /> Show Store QR
          </button>
          {storefrontUrl && (
            <button
              type="button"
              onClick={() => window.open(storefrontUrl, '_blank', 'noopener,noreferrer')}
              className="px-4 rounded-xl bg-card border border-border text-foreground font-semibold text-sm"
              aria-label="Open customer storefront"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl bg-card border border-border p-4 space-y-4">
        <div className="flex gap-2 p-1 rounded-xl bg-surface-2">
          <button
            type="button"
            onClick={() => { setMode('store'); setGenerated(null); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${mode === 'store' ? 'bg-surface-1 shadow-sm text-foreground' : 'text-muted-foreground'}`}
          >
            <Store className="w-4 h-4" /> Store QR
          </button>
          <button
            type="button"
            onClick={() => { setMode('product'); setGenerated(null); }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${mode === 'product' ? 'bg-surface-1 shadow-sm text-foreground' : 'text-muted-foreground'}`}
          >
            <Package className="w-4 h-4" /> Product QR
          </button>
        </div>

        {mode === 'store' ? (
          <div className="space-y-3">
            <div>
              <h2 className="font-display font-bold text-base">Customer storefront</h2>
              <p className="text-xs text-muted-foreground mt-1">Use this QR on your counter, signboard, receipt or WhatsApp.</p>
            </div>
            <button
              type="button"
              onClick={generateStoreQR}
              className="w-full py-3 rounded-xl border border-primary/30 bg-primary/5 text-primary font-semibold text-sm"
            >
              Generate / Refresh Store QR
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <h2 className="font-display font-bold text-base">Product QR</h2>
              <p className="text-xs text-muted-foreground mt-1">Create a customer link for one product. Product barcodes remain part of inventory/POS.</p>
            </div>
            <select
              value={productId}
              onChange={event => { setProductId(event.target.value); setGenerated(null); }}
              className="w-full p-3 rounded-xl bg-surface-2 border border-border text-foreground text-sm"
            >
              <option value="">Choose a product</option>
              {activeProducts.map(product => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={generateProductQR}
              disabled={!selectedProduct}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-40"
            >
              Generate Product QR
            </button>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => { setScanResult(null); setScannerOpen(true); }}
        className="w-full rounded-2xl border border-border bg-card p-4 flex items-center gap-3 text-left hover:border-primary/40 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center text-primary">
          <ScanLine className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm text-foreground">Scan a StoreFlow QR</p>
          <p className="text-xs text-muted-foreground">Scan a store or product code and verify what it points to.</p>
        </div>
        <Camera className="w-5 h-5 text-muted-foreground" />
      </button>

      {generated && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-bold text-base">Ready to share</h2>
              <p className="text-xs text-muted-foreground">Download, print or share the QR below.</p>
            </div>
            <button type="button" onClick={() => setGenerated(null)} className="p-2 rounded-lg hover:bg-surface-2" aria-label="Close QR">
              <X className="w-4 h-4" />
            </button>
          </div>
          <QRDisplayCard
            encodedData={generated.data}
            storeName={store.storeName}
            storeId={storeId}
            type={generated.type}
            payloadLabel={generated.label}
          />
        </section>
      )}

      {scanResult && (
        <section className="rounded-2xl border border-success/30 bg-success/5 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">Code recognized</p>
          <p className="font-semibold text-foreground">{scanResult.type === 'product' ? 'Product QR' : 'Store QR'}</p>
          <p className="text-xs text-muted-foreground font-mono break-all">Store: {scanResult.storeId}</p>
          {scanResult.payload?.productId && (
            <p className="text-xs text-muted-foreground font-mono break-all">Product: {scanResult.payload.productId}</p>
          )}
        </section>
      )}
    </div>
  );
}
