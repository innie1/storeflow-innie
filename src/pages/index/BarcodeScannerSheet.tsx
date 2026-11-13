import { Suspense } from 'react';
import { Screens } from '../screens';
import type { IndexScreenReady } from './useIndexScreen';

const { BarcodeScanner } = Screens;

/**
 * The camera scanner opened from the header, for finding a product by its barcode.
 */
export default function BarcodeScannerSheet({ s }: { s: IndexScreenReady }) {
  const { setShowBarcodeScanner, scanCart, setScanCart, handleBarcodeDetected, handleCheckoutScanCart } = s;
  return (
    <>
      <Suspense fallback={null}>
        <BarcodeScanner
          title={scanCart.length > 0 ? `Scan more · ${scanCart.length} item${scanCart.length === 1 ? '' : 's'} in cart` : 'Scan to Save or Sell'}
          subtitle="Existing barcodes are added to cart · new ones open a save form"
          onClose={() => setShowBarcodeScanner(false)}
          onDetected={handleBarcodeDetected}
        />
      </Suspense>
      {scanCart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] bg-card border-t border-success/40 p-3 space-y-2 max-h-[40vh] overflow-y-auto shadow-card">
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-sm text-success">
              🛒 Scan Cart · ₦{scanCart.reduce((s, c) => s + c.product.sellingPrice * c.qty, 0).toLocaleString()}
            </span>
            <button onClick={() => setScanCart([])} className="text-xs text-destructive hover:underline">Clear</button>
          </div>
          <div className="space-y-1">
            {scanCart.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs p-1.5 rounded bg-surface-2">
                <span className="truncate">{c.product.name} × {c.qty}</span>
                <span className="text-primary font-semibold">₦{(c.product.sellingPrice * c.qty).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handleCheckoutScanCart}
            className="w-full p-2.5 rounded-lg bg-success text-white font-display font-bold text-sm hover:opacity-90"
          >
            ✓ Complete Sale
          </button>
        </div>
      )}
    </>
  );
}
