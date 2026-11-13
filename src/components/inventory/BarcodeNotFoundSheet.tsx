import type { InventoryState } from './useInventory';

/**
 * A scanned barcode that matches no product: add it or link it.
 */
export default function BarcodeNotFoundSheet({ s }: { s: InventoryState }) {
  const {
    setShowAddModal, setNewProduct, setCustomCategoryActive, setCustomCategoryVal,
    setShowAddConfirm, setGlobalScannerOpen, notFoundBarcode, setNotFoundBarcode,
  } = s;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setNotFoundBarcode(null)}>
      <div className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm animate-scale-up space-y-4 text-center" onClick={e => e.stopPropagation()}>
        <span className="text-4xl">🔍</span>
        <div>
          <h3 className="font-display font-bold text-base text-foreground">Product Not Found</h3>
          <p className="text-xs text-muted-foreground mt-1">No product matched barcode: <span className="font-mono text-yellow-500 font-bold">{notFoundBarcode}</span></p>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={() => {
              setNewProduct({
                name: '',
                costPrice: '',
                sellingPrice: '',
                quantity: '',
                category: 'Groceries',
                unit: 'pcs',
                isCartonSingleEnabled: false,
                singlesPerCarton: '12',
                singleSellingPrice: '',
                sellAsSinglesByDefault: false,
                barcode: notFoundBarcode
              });
              setCustomCategoryActive(false);
              setCustomCategoryVal('');
              setShowAddModal(true);
              setShowAddConfirm(false);
              setNotFoundBarcode(null);
            }}
            className="w-full py-2.5 rounded-xl bg-yellow-500 hover:brightness-110 text-black font-display font-bold text-xs cursor-pointer transition active:scale-95"
          >
            Create New Product
          </button>
          <button
            onClick={() => {
              setNotFoundBarcode(null);
              setGlobalScannerOpen(true);
            }}
            className="w-full py-2.5 rounded-xl bg-surface-2 border border-border text-foreground hover:bg-surface-3 font-display font-bold text-xs cursor-pointer transition active:scale-95"
          >
            Scan Again
          </button>
          <button
            onClick={() => setNotFoundBarcode(null)}
            className="w-full py-2.5 rounded-xl bg-surface-2 border border-destructive/30 text-destructive hover:bg-destructive/10 font-display font-bold text-xs cursor-pointer transition active:scale-95"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
