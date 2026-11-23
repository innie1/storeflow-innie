import { generateStoreUrl } from '@/lib/qr-code';
import { showToast } from '@/components/Toast';
import StoreLogo from '@/components/StoreLogo';
import BarcodeScanner from '@/components/BarcodeScanner';
import {
  Search,
  Download,
  Share2,
  Printer,
  Link2,
  Shield,
  Camera,
  CheckCircle2,
  Copy,
  Plus,
} from 'lucide-react';
import ScrollLock from '@/components/ScrollLock';
import { SubPage } from '../ui';
import { hasBusinessModule } from '@/lib/business-runtime';
import ProductQRRow from '../ProductQRRow';
import type { SettingsState } from '../useSettings';

export default function BarcodeView({ s }: { s: SettingsState }) {
  const {
    store, serviceBusiness, barcodeQrCanvasRef, storeBarcodeCanvasRef, showAllProductsQR,
    setShowAllProductsQR, productSearchQuery, setProductSearchQuery, showUrl, setShowUrl,
    scannedProduct, setScannedProduct, scannerOpen, setScannerOpen, storeExistsInCloud,
    checkingCloudStatus, cloudStatusError, cachedQR, setView,
  } = s;
  const storeId = store.storeId || store.accessCode;
  const keepsStock = hasBusinessModule(store, 'inventory');
  const storeUrl = generateStoreUrl(storeId);
  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Could not open print window. Please allow popups.', 'error');
      return;
    }

    const qrDataUrl = barcodeQrCanvasRef.current ? barcodeQrCanvasRef.current.toDataURL('image/png') : '';
    const barcodeDataUrl = storeBarcodeCanvasRef.current ? storeBarcodeCanvasRef.current.toDataURL('image/png') : '';

    const logoHtml = store.profile?.photo
      ? `<img class="store-logo" src="${store.profile.photo}" alt="" />`
      : `<div class="store-icon-placeholder">🏪</div>`;

    printWindow.document.write(`
      <html>
        <head>
          <title>Store Details - ${store.storeName}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              text-align: center;
              padding: 40px;
              background: #ffffff;
              color: #0f172a;
            }
            .container {
              max-width: 500px;
              margin: 0 auto;
              border: 2px solid #e2e8f0;
              border-radius: 24px;
              padding: 32px;
              box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
            }
            .store-logo {
              width: 64px;
              height: 64px;
              object-fit: cover;
              border-radius: 50%;
              margin: 0 auto 12px;
              border: 2px solid #FFC72C;
            }
            .store-icon-placeholder {
              font-size: 48px;
              margin-bottom: 12px;
            }
            h1 {
              font-size: 24px;
              font-weight: 800;
              margin: 0 0 4px 0;
            }
            .store-id {
              font-family: monospace;
              font-size: 14px;
              color: #FFC72C;
              font-weight: bold;
              margin-bottom: 24px;
            }
            .qr-box, .barcode-box {
              margin: 20px auto;
            }
            .qr-img {
              width: 180px;
              height: 180px;
            }
            .barcode-img {
              max-width: 100%;
              height: 80px;
              object-fit: contain;
            }
            .url-text {
              font-size: 11px;
              color: #64748b;
              word-break: break-all;
              margin-top: 12px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            ${logoHtml}
            <h1>${store.storeName}</h1>
            <div class="store-id">Store ID: ${storeId}</div>

            <div class="qr-box">
              <img class="qr-img" src="${qrDataUrl}" alt="QR" />
            </div>
            <div class="barcode-box">
              <img class="barcode-img" src="${barcodeDataUrl}" alt="Barcode" />
            </div>
            <div class="url-text">${storeUrl}</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };
  const handlePrintQR = () => {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Could not open print window. Please allow popups.', 'error');
      return;
    }
    const qrDataUrl = cachedQR?.qrDataUrl || (barcodeQrCanvasRef.current ? barcodeQrCanvasRef.current.toDataURL('image/png') : '');
    printWindow.document.write(`
      <html>
        <head>
          <title>Store QR Code - ${store.storeName}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              text-align: center;
              padding: 40px;
              background: #ffffff;
              color: #0f172a;
            }
            .qr-img {
              width: 250px;
              height: 250px;
              object-fit: contain;
              margin: 20px auto;
            }
            .url-text {
              font-size: 12px;
              color: #64748b;
              word-break: break-all;
            }
          </style>
        </head>
        <body>
          <h2>${store.storeName} Store QR Code</h2>
          <p>Scan to Browse and Shop</p>
          <img class="qr-img" src="${qrDataUrl}" />
          <div class="url-text">${storeUrl}</div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };
  const handlePrintBarcode = () => {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Could not open print window. Please allow popups.', 'error');
      return;
    }
    const barcodeDataUrl = storeBarcodeCanvasRef.current ? storeBarcodeCanvasRef.current.toDataURL('image/png') : '';
    printWindow.document.write(`
      <html>
        <head>
          <title>Store Barcode - ${store.storeName}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              text-align: center;
              padding: 40px;
              background: #ffffff;
              color: #0f172a;
            }
            .barcode-img {
              max-width: 100%;
              height: 100px;
              object-fit: contain;
              margin: 20px auto;
            }
          </style>
        </head>
        <body>
          <h2>${store.storeName} Barcode</h2>
          <img class="barcode-img" src="${barcodeDataUrl}" />
          <p>Store ID: ${storeId}</p>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };
  const handleShareBarcode = () => {
    if (navigator.share) {
      navigator.share({
        title: `${store.storeName} Barcode`,
        text: `Identify store using Barcode: ${storeId}`,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(storeId);
      showToast('Store ID copied to clipboard!', 'success');
    }
  };
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: store.storeName,
        text: `Scan to shop at ${store.storeName}!`,
        url: storeUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(storeUrl);
      showToast('Store URL copied to clipboard!', 'success');
    }
  };
  const handleCopy = () => {
    navigator.clipboard.writeText(storeUrl);
    showToast('Store URL copied!', 'success');
  };
  const handleDownloadQR = () => {
    const url = cachedQR?.qrDataUrl || (barcodeQrCanvasRef.current ? barcodeQrCanvasRef.current.toDataURL('image/png') : '');
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${store.storeName.replace(/\s+/g, '_')}_qr.png`;
      a.click();
      showToast('Store QR Code downloaded!', 'success');
    }
  };
  const handleDownloadBarcode = () => {
    if (storeBarcodeCanvasRef.current) {
      const url = storeBarcodeCanvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${store.storeName.replace(/\s+/g, '_')}_barcode.png`;
      a.click();
      showToast('Store Barcode downloaded!', 'success');
    }
  };
  const handleScanDetected = (code: string) => {
    let targetId = code;
    if (code.includes('/product/')) {
      const parts = code.split('/product/');
      targetId = parts[parts.length - 1];
    } else if (code.includes('/p/')) {
      const parts = code.split('/p/');
      targetId = parts[parts.length - 1];
    }

    const isStoreMatch =
      code === storeId ||
      code === storeUrl ||
      code.endsWith(`/s/${storeId}`) ||
      code.endsWith(`/store/${storeId}`);

    if (isStoreMatch) {
      showToast(`✓ Scanned Store QR: Verified ${store.storeName}`, 'success');
      setScannerOpen(false);
      return;
    }

    const prod = store.products.find(p => p.barcode === targetId || p.id === targetId);
    if (prod) {
      setScannedProduct(prod);
      setScannerOpen(false);
      showToast(`✓ Found product: ${prod.name}`, 'success');
    } else {
      showToast(`Code not found in inventory: ${code}`, 'error');
      setScannerOpen(false);
    }
  };
  return (
    <SubPage
      title="QR & Barcodes"
      onBack={() => setView('home')}
    >
      <div className="space-y-6 pb-20 select-none text-left">
        {/* Store Information Card (Premium Identity Card style) */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col gap-4">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border overflow-hidden shrink-0 flex items-center justify-center text-3xl shadow-sm">
              {store.profile?.photo ? (
                <img src={store.profile.photo} alt="" className="w-full h-full object-cover" />
              ) : (
                // styleName and size were not props on StoreLogo, so this
                // quietly drew the default style rather than the merchant's.
                <StoreLogo selectedStyle={store.profile?.logoStyle} storeName={store.storeName} businessType={store.storeType} className="w-12 h-12" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1.5">
                <h4 className="font-display font-black text-base text-foreground truncate">{store.storeName}</h4>
                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-success/15 border border-success/30 text-[9px] font-display font-bold text-success">
                  ✓ Verified
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-mono">Store ID: <span className="text-yellow-500 font-bold">{storeId}</span></p>
              <p className="text-[10px] text-muted-foreground leading-none">Registered: {new Date(store.createdAt).toLocaleDateString('en-GB')}</p>
            </div>
          </div>

          <div className="border-t border-border/40 pt-3 flex gap-2">
            <button
              onClick={handleShare}
              className="flex-1 py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
            >
              <Share2 className="w-3.5 h-3.5" /> Share Store
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" /> Print Details
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(storeId);
                showToast('✓ Store ID copied to clipboard', 'success');
              }}
              className="flex-1 py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
            >
              <Copy className="w-3.5 h-3.5" /> Copy ID
            </button>
          </div>
        </div>

        {/* Store QR Card (Large center-branded QR) */}
        <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col gap-4 text-center">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <h3 className="font-display font-bold text-sm text-foreground">Official Store QR Code</h3>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 text-[9px] font-display font-bold flex items-center gap-1">
                <Shield className="w-3 h-3" /> Permanent
              </span>
            </div>
          </div>

          {checkingCloudStatus && !cachedQR ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-3">
              <span className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin" />
              <p className="text-xs text-muted-foreground">Verifying Cloud Status...</p>
            </div>
          ) : (cloudStatusError || !storeExistsInCloud) && !cachedQR ? (
            <div className="flex flex-col items-center justify-center p-6 space-y-4 border border-destructive/20 bg-destructive/5 rounded-3xl text-center">
              <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center text-xl">⚠️</div>
              <div className="space-y-1">
                <h4 className="font-display font-black text-sm text-foreground">Cloud Sync Required</h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs">{cloudStatusError || "This store is not published to the cloud."}</p>
              </div>
              <button
                onClick={() => setView('security')}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-display font-bold text-xs hover:opacity-90 active:scale-95 transition"
              >
                Enable Cloud Sync
              </button>
            </div>
          ) : (
            <>
              {/* QR Image or Canvas */}
              <div className="relative flex flex-col items-center justify-center p-5 bg-white rounded-3xl max-w-[200px] w-full mx-auto border border-border/30 shadow-md">
                {cachedQR ? (
                  <img
                    src={cachedQR.qrDataUrl}
                    alt="Store QR Code"
                    className="w-40 h-40 object-contain transition-all duration-300 hover:scale-105"
                  />
                ) : (
                  <canvas ref={barcodeQrCanvasRef} className="w-40 h-40" />
                )}

                {/* Store ID Display below QR */}
                <div className="mt-3.5 w-full flex flex-col items-center gap-1 select-all">
                  <span className="text-[8px] font-display font-black uppercase tracking-widest text-neutral-400">Store ID</span>
                  <span className="font-mono text-sm font-black text-primary-foreground bg-neutral-100 px-3 py-0.5 rounded border border-neutral-200 tracking-wider">
                    {store.storeId || store.accessCode}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <h4 className="font-display font-black text-base text-foreground">Scan to Shop</h4>
                <p className="text-[10px] text-muted-foreground max-w-xs mx-auto">Scan with a mobile camera to open this store in the customer app.</p>
              </div>

              {/* Benefit Grid */}
              <div className="grid grid-cols-2 gap-3 max-w-xs mx-auto text-left text-[11px] text-muted-foreground font-display font-semibold py-2.5 border-t border-b border-border/40">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📦</span>
                  <span>{serviceBusiness ? 'View Services' : 'Browse Products'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">⚡</span>
                  <span>{serviceBusiness ? 'Request a Service' : 'Order Instantly'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">💳</span>
                  <span>Pay Securely</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">🚚</span>
                  <span>{serviceBusiness ? 'Choose Pickup / Delivery' : 'Pickup or Delivery'}</span>
                </div>
              </div>

              {/* View Link Toggle */}
              <div className="space-y-2">
                <button
                  onClick={() => setShowUrl(!showUrl)}
                  className="text-xs text-primary font-semibold hover:underline flex items-center justify-center gap-1 mx-auto"
                >
                  {showUrl ? 'Hide Store URL' : 'View Store URL'}
                </button>
                {showUrl && (
                  <div className="p-2.5 rounded-xl bg-surface-2 border border-border text-[10px] font-mono text-muted-foreground break-all select-all/80 animate-scale-up">
                    {storeUrl}
                  </div>
                )}
              </div>

              {/* Equal Buttons Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={handleDownloadQR}
                  className="py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
                <button
                  onClick={handlePrintQR}
                  className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <Printer className="w-4 h-4" /> Print
                </button>
                <button
                  onClick={handleShare}
                  className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <Share2 className="w-4 h-4" /> Share
                </button>
                <button
                  onClick={handleCopy}
                  className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <Link2 className="w-4 h-4" /> Copy Link
                </button>
              </div>
            </>
          )}
        </div>

        {/* Store Barcode Card (Breathing room layout) */}
        <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col gap-4 text-center">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <h3 className="font-display font-bold text-sm text-foreground">Official Store Barcode</h3>
            <span className="px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 text-[9px] font-display font-bold flex items-center gap-1">
              <Shield className="w-3 h-3" /> Permanent
            </span>
          </div>

          {/* Barcode Canvas with breathing room padding */}
          <div className="p-6 bg-white rounded-3xl border border-border/30 max-w-sm w-full mx-auto flex items-center justify-center shadow-md">
            <canvas ref={storeBarcodeCanvasRef} className="max-w-full h-16 object-contain" />
          </div>

          <p className="text-xs text-muted-foreground font-display font-bold">Store ID: <span className="font-mono text-yellow-500 font-black">{storeId}</span></p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={handleDownloadBarcode}
              className="py-2 rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
            >
              <Download className="w-4 h-4" /> Download
            </button>
            <button
              onClick={handlePrintBarcode}
              className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
            <button
              onClick={handleShareBarcode}
              className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(storeId);
                showToast('✓ Barcode ID copied to clipboard', 'success');
              }}
              className="py-2 rounded-xl bg-surface-2 border border-border hover:bg-surface-3 hover:text-primary text-foreground text-xs font-display font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
            >
              <Copy className="w-4 h-4" /> Copy Bar
            </button>
          </div>
        </div>

        {/* Store Information Summary */}
        <div className="p-5 rounded-2xl bg-card border border-border/80 shadow-sm space-y-4">
          <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-2 border-b border-border/40 pb-3">
            🏪 Store Profile & Metadata
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Left col */}
            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Description</span>
                <p className="mt-1 text-foreground font-medium transition-all duration-500 animate-fade-in">
                  {store.marketplaceSettings?.storeDescription || 'No description provided.'}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Business Categories</span>
                <p className="mt-1 text-foreground font-semibold transition-all duration-500 animate-fade-in">
                  {(() => {
                    const cats = Array.from(new Set(store.products.map(p => p.category || 'General')));
                    return cats.length > 0 ? cats.join(', ') : 'None';
                  })()}
                </p>
              </div>
            </div>

            {/* Right col */}
            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Business Hours</span>
                <p className="mt-1 text-foreground font-semibold transition-all duration-500 animate-fade-in">
                  {store.profile?.openingTime && store.profile?.closingTime
                    ? `${store.profile.openingTime} - ${store.profile.closingTime}`
                    : 'Not Set'}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Delivery Status</span>
                <p className="mt-1 text-foreground font-semibold transition-all duration-500 animate-fade-in">
                  {store.marketplaceSettings?.deliveryEnabled ? '✅ Delivery Available' : '❌ Store Pickup Only'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Product QR Codes Section.
            A shop with no stock - a laundry - has no products to put a code
            on, and its Add Product sent the owner to a Stock tab it does not
            have. The shop's own code above is the one its customers scan. */}
        {(keepsStock || store.products.length > 0) && <div className="space-y-4 pt-2 text-left">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sm text-foreground">{serviceBusiness ? 'Product & Service QR Codes' : 'Product QR Codes'}</h3>
            {store.products.length > 0 && (
              <button
                onClick={() => setShowAllProductsQR(true)}
                className="text-xs text-yellow-500 hover:text-yellow-600 font-display font-bold cursor-pointer"
              >
                View all ({store.products.length})
              </button>
            )}
          </div>

          {store.products.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {store.products.slice(0, 4).map(prod => (
                <ProductQRRow key={prod.id} product={prod} store={store} />
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-2xl border border-dashed border-border/80 text-center flex flex-col items-center justify-center gap-3 bg-surface-1">
              <span className="text-4xl animate-breathe">📦</span>
              <div>
                <h4 className="font-display font-bold text-sm text-foreground">No products yet</h4>
                <p className="text-[11px] text-muted-foreground max-w-xs mx-auto leading-relaxed mt-1">Products and named services can receive a customer QR after creation.</p>
              </div>
              <button
                onClick={() => {
                  setView('home');
                  showToast('Navigate to the Stock tab to add products', 'info');
                }}
                className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-display font-bold text-xs rounded-xl cursor-pointer transition active:scale-95 shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 font-bold" /> Add Product
              </button>
            </div>
          )}
        </div>}
      </div>

      {/* View All Modal */}
      {showAllProductsQR && (
        <div className="fixed inset-0 z-[80] bg-background/95 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setShowAllProductsQR(false)}><ScrollLock />
          <div className="w-full max-w-md bg-card border border-border rounded-3xl p-5 animate-slide-up space-y-4 max-h-[85vh] flex flex-col shadow-[0_0_30px_rgba(0,0,0,0.3)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-foreground">All Product QR Codes</h3>
                <p className="text-[10px] text-muted-foreground">Print a customer QR for a product or service.</p>
              </div>
              <button
                onClick={() => { setShowAllProductsQR(false); setProductSearchQuery(''); }}
                className="w-8 h-8 rounded-full bg-surface-2 border border-border flex items-center justify-center text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Search bar inside View All Modal */}
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search products..."
                value={productSearchQuery}
                onChange={e => setProductSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-surface-2 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            {/* Scrollable Products List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 select-none no-scrollbar">
              <div className="grid grid-cols-1 gap-3">
                {store.products
                  .filter(p => p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) || (p.barcode && p.barcode.includes(productSearchQuery)))
                  .map(prod => (
                    <ProductQRRow key={prod.id} product={prod} store={store} />
                  ))
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Scan Button */}
      <button
        onClick={() => setScannerOpen(true)}
        className="fixed bottom-24 right-5 sm:right-10 z-40 bg-yellow-500 hover:bg-yellow-400 text-black w-14 h-14 rounded-full flex items-center justify-center shadow-lg cursor-pointer transition active:scale-95 border border-yellow-400/20"
        title="Open Scanner Console"
      >
        <Camera className="w-6 h-6" />
      </button>

      {/* Scanner Modal */}
      {scannerOpen && (
        <BarcodeScanner
          title="Scan Store/Product Code"
          subtitle="Point at any Store QR, Barcode, or Product Tag"
          onClose={() => setScannerOpen(false)}
          onDetected={handleScanDetected}
        />
      )}

      {/* Scanned Product Details Modal */}
      {scannedProduct && (
        <div className="fixed inset-0 z-[90] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setScannedProduct(null)}><ScrollLock />
          <div className="w-full max-w-sm bg-card border border-border rounded-3xl p-5 animate-scale-up space-y-4 text-left" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-success" /> Scanned Product Found
              </h3>
              <button
                onClick={() => setScannedProduct(null)}
                className="w-7 h-7 rounded-full bg-surface-2 border border-border flex items-center justify-center text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-3xl overflow-hidden shrink-0">
                {scannedProduct.image ? (
                  <img src={scannedProduct.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  '📦'
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-display font-bold text-sm text-foreground truncate">{scannedProduct.name}</h4>
                <p className="text-xs font-display font-black text-yellow-500 mt-1">₦{(scannedProduct.sellingPrice || 0).toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Quantity: {scannedProduct.quantity} units</p>
              </div>
            </div>

            <div className="pt-2 border-t border-border flex gap-2">
              <button
                onClick={() => {
                  setScannedProduct(null);
                  setProductSearchQuery(scannedProduct.name);
                  setShowAllProductsQR(true);
                }}
                className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-display font-bold text-xs rounded-xl cursor-pointer text-center"
              >
                Manage Product
              </button>
              <button
                onClick={() => setScannedProduct(null)}
                className="flex-1 py-2 bg-surface-2 border border-border text-foreground font-display font-bold text-xs rounded-xl cursor-pointer text-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <div id="temp-qr-scanner-element" style={{ display: 'none' }} />
    </SubPage>
  );
}
