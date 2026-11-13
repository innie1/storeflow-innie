import { useState, useEffect, useRef } from 'react';
import { StoreData, Product } from '@/types/store';
import { drawSimpleQR, drawBarcode, generateProductUrl } from '@/lib/qr-code';
import { showToast } from '@/components/Toast';
import { Download, Share2, Printer, Copy } from 'lucide-react';

export default function ProductQRRow({ product, store }: { product: Product; store: StoreData }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const barcodeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [showFullBarcode, setShowFullBarcode] = useState(false);

  // Cache/Store generated dataURLs to prevent redrawing on scroll
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [barcodeDataUrl, setBarcodeDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.05 });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  const storeId = store.storeId || store.accessCode;
  const productUrl = generateProductUrl(storeId, product.id);

  useEffect(() => {
    if (!isVisible) return;

    if (qrCanvasRef.current && !qrDataUrl) {
      drawSimpleQR(productUrl, qrCanvasRef.current).then(() => {
        if (qrCanvasRef.current) {
          setQrDataUrl(qrCanvasRef.current.toDataURL('image/png'));
        }
      }).catch(() => {});
    }

    if (barcodeCanvasRef.current && product.barcode && !barcodeDataUrl) {
      const drawn = drawBarcode(product.barcode, barcodeCanvasRef.current, {
        barColor: '#000000',
        bgColor: '#FFFFFF',
        barWidth: 1.5,
        height: 50,
        showText: true
      });
      if (drawn && barcodeCanvasRef.current) {
        setBarcodeDataUrl(barcodeCanvasRef.current.toDataURL('image/png'));
      }
    }
  }, [isVisible, productUrl, product.barcode]);

  const handlePrintShelfLabel = () => {
    if (typeof window === 'undefined') return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Could not open print window. Please allow popups.', 'error');
      return;
    }

    const qrImgData = qrCanvasRef.current ? qrCanvasRef.current.toDataURL('image/png') : (qrDataUrl || '');
    const barcodeImgData = (barcodeCanvasRef.current && product.barcode)
      ? barcodeCanvasRef.current.toDataURL('image/png')
      : (barcodeDataUrl || '');

    const storeLogoHtml = store.profile?.photo
      ? `<img class="store-logo" src="${store.profile.photo}" alt="" />`
      : `<div class="store-icon-placeholder">🏪</div>`;

    printWindow.document.write(`
      <html>
        <head>
          <title>Shelf Label - ${product.name}</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              margin: 0;
              padding: 20px;
              background: #f8fafc;
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .label-card {
              width: 320px;
              border: 2px solid #000;
              border-radius: 12px;
              background: #ffffff;
              padding: 16px;
              box-sizing: border-box;
              box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
            }
            .header {
              display: flex;
              align-items: center;
              gap: 8px;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 8px;
              margin-bottom: 10px;
            }
            .store-logo {
              width: 24px;
              height: 24px;
              object-fit: cover;
              border-radius: 4px;
            }
            .store-icon-placeholder {
              font-size: 18px;
            }
            .store-name {
              font-size: 12px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #1e293b;
            }
            .product-name {
              font-size: 16px;
              font-weight: 700;
              color: #0f172a;
              margin: 0 0 4px 0;
              word-break: break-word;
              line-height: 1.25;
            }
            .price-tag {
              font-size: 24px;
              font-weight: 900;
              color: #000000;
              margin: 6px 0 12px 0;
            }
            .codes-container {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              margin-top: 10px;
              border-top: 1px dashed #cbd5e1;
              padding-top: 10px;
            }
            .barcode-wrap {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
            }
            .barcode-img {
              max-width: 100%;
              height: 40px;
              object-fit: contain;
            }
            .qr-wrap {
              width: 60px;
              height: 60px;
              background: #fff;
              padding: 4px;
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .qr-img {
              width: 100%;
              height: 100%;
            }
            .scan-text {
              font-size: 8px;
              font-weight: bold;
              color: #64748b;
              text-align: center;
              margin-top: 2px;
            }
            @media print {
              body {
                background: none;
                padding: 0;
              }
              .label-card {
                box-shadow: none;
                border: 2px solid #000;
              }
            }
          </style>
        </head>
        <body>
          <div class="label-card">
            <div class="header">
              ${storeLogoHtml}
              <span class="store-name">${store.storeName}</span>
            </div>
            <h1 class="product-name">${product.name}</h1>
            <div class="price-tag">₦${(product.sellingPrice || 0).toLocaleString()}</div>
            <div class="codes-container">
              <div class="barcode-wrap">
                ${barcodeImgData ? `<img class="barcode-img" src="${barcodeImgData}" alt="barcode" />` : `<div style="font-size:10px;color:#94a3b8;font-style:italic;">No Barcode</div>`}
              </div>
              <div style="display: flex; flex-direction: column; align-items: center;">
                <div class="qr-wrap">
                  <img class="qr-img" src="${qrImgData}" alt="QR" />
                </div>
                <span class="scan-text">SCAN TO BUY</span>
              </div>
            </div>
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

  const handleDownload = () => {
    const dataUrl = qrCanvasRef.current?.toDataURL('image/png') || qrDataUrl;
    if (!dataUrl) {
      showToast('QR Code not fully loaded yet. Please wait.', 'error');
      return;
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('✓ Product QR downloaded successfully', 'success');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: product.name,
          text: `Shop ${product.name} on ${store.storeName}:`,
          url: productUrl
        });
      } catch {}
    } else {
      await navigator.clipboard.writeText(productUrl);
      showToast('✓ Product store link copied to clipboard', 'success');
    }
  };

  const handleCopyBarcode = () => {
    if (product.barcode) {
      navigator.clipboard.writeText(product.barcode);
      showToast('✓ Barcode copied to clipboard', 'success');
    } else {
      showToast('No barcode available for this product', 'error');
    }
  };

  const isOutOfStock = (product.quantity || 0) <= 0;

  return (
    <div
      ref={containerRef}
      className="bg-card border border-border/40 hover:border-primary/20 rounded-2xl p-4 flex flex-col justify-between gap-3 min-h-[140px] relative overflow-hidden transition-all shadow-sm select-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Product Thumbnail */}
          <div className="w-14 h-14 rounded-xl bg-surface-2 border border-border overflow-hidden shrink-0 flex items-center justify-center text-2xl font-display font-black text-primary">
            {product.image ? (
              <img src={product.image} alt="" className="w-full h-full object-cover" />
            ) : (
              '📦'
            )}
          </div>
          {/* Product Details */}
          <div className="text-left min-w-0 flex-1">
            <h4 className="font-display font-bold text-sm text-foreground truncate">{product.name}</h4>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {product.isService ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-display font-bold bg-primary/10 text-primary border border-primary/20">
                  🛠️ Service
                </span>
              ) : (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-display font-bold ${
                  isOutOfStock
                    ? 'bg-destructive/10 text-destructive border border-destructive/20'
                    : 'bg-success/10 text-success border border-success/20'
                }`}>
                  {isOutOfStock ? '🔴 Out of Stock' : `🟢 In Stock (${product.quantity})`}
                </span>
              )}
            </div>
            <p className="text-xs font-display font-black text-yellow-500 mt-1">₦{(product.sellingPrice || 0).toLocaleString()}</p>
            {product.barcode && (
              <p className="text-[9px] text-muted-foreground font-mono mt-0.5 truncate">🏷️ {product.barcode}</p>
            )}
          </div>
        </div>

        {/* Small Barcode Thumbnail (top-right) — tap to expand */}
        {product.barcode && barcodeDataUrl ? (
          <button
            onClick={() => setShowFullBarcode(!showFullBarcode)}
            className="w-16 h-14 bg-white p-1.5 rounded-xl border border-border flex items-center justify-center shrink-0 shadow-inner cursor-pointer hover:border-primary/30 transition-all active:scale-95 relative"
            title="Tap to view full barcode"
          >
            <img src={barcodeDataUrl} alt="barcode" className="w-full h-full object-contain" />
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] font-display font-bold text-muted-foreground bg-card px-1 rounded">SCAN</span>
          </button>
        ) : (
          <div className="w-16 h-14 bg-surface-2 p-1.5 rounded-xl border border-border/60 flex items-center justify-center shrink-0 relative">
            {!isVisible ? (
              <div className="absolute inset-0 bg-surface-2 animate-pulse rounded-lg" />
            ) : (
              <span className="text-[8px] text-muted-foreground/60 font-display font-bold text-center leading-tight">No<br/>Barcode</span>
            )}
          </div>
        )}
      </div>

      {/* Hidden canvases for generation */}
      <canvas ref={qrCanvasRef} className="hidden" />
      <canvas ref={barcodeCanvasRef} className="hidden" />

      {/* Expanded Full Barcode (shown when tapped) */}
      {showFullBarcode && barcodeDataUrl && (
        <div className="animate-scale-up">
          <div
            className="p-4 bg-white rounded-2xl border border-border/40 flex flex-col items-center gap-2 shadow-md cursor-pointer"
            onClick={() => setShowFullBarcode(false)}
          >
            <img src={barcodeDataUrl} alt="Full Barcode" className="w-full max-w-[260px] h-14 object-contain" />
            <span className="text-[10px] font-mono text-muted-foreground">{product.barcode}</span>
            <span className="text-[9px] text-primary font-display font-bold">Scan to buy · Tap to close</span>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="border-t border-border/40 my-0.5" />
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={handlePrintShelfLabel}
          className="py-1.5 rounded-lg bg-surface-2 border border-border hover:bg-surface-3 text-foreground hover:text-primary font-display font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition active:scale-95"
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <button
          onClick={handleDownload}
          className="py-1.5 rounded-lg bg-surface-2 border border-border hover:bg-surface-3 text-foreground hover:text-primary font-display font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition active:scale-95"
        >
          <Download className="w-3.5 h-3.5" /> Get QR
        </button>
        <button
          onClick={handleShare}
          className="py-1.5 rounded-lg bg-surface-2 border border-border hover:bg-surface-3 text-foreground hover:text-primary font-display font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition active:scale-95"
        >
          <Share2 className="w-3.5 h-3.5" /> Share
        </button>
        <button
          onClick={handleCopyBarcode}
          disabled={!product.barcode}
          className={`py-1.5 rounded-lg border font-display font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition active:scale-95 ${
            product.barcode
              ? 'bg-surface-2 border-border hover:bg-surface-3 text-foreground hover:text-primary'
              : 'bg-surface-2/40 border-border/40 text-muted-foreground/40 cursor-not-allowed'
          }`}
        >
          <Copy className="w-3.5 h-3.5" /> Copy Bar
        </button>
      </div>
    </div>
  );
}
