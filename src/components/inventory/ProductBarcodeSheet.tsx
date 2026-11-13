import { CODE39_MAP } from './model';
import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * One product's barcode: view, print or share it.
 */
export default function ProductBarcodeSheet({ s }: { s: InventoryState }) {
  const {
    selectedBarcodeProduct, setSelectedBarcodeProduct, handlePrintBarcode,
    handleAutoGenerateBarcode,
  } = s;
  return (
    <Modal title="Barcode Label Generator" onClose={() => setSelectedBarcodeProduct(null)}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground text-left">
          Visual representation of the product's barcode for label scanning.
        </p>

        {selectedBarcodeProduct.barcode ? (
          <div className="space-y-4">
            <div className="flex justify-center p-4 bg-white rounded-lg border border-border" id={`barcode-container-${selectedBarcodeProduct.id}`}>
              {(() => {
                const value = selectedBarcodeProduct.barcode || '';
                const cleanValue = value.toUpperCase().replace(/[^0-9A-Z\-.\s$/+%*]/g, '');
                const fullText = `*${cleanValue}*`;
                const narrowWidth = 1.5;
                const wideWidth = narrowWidth * 3;
                const interSpace = narrowWidth;
                const height = 60;

                let currentX = 0;
                const bars: JSX.Element[] = [];

                for (let i = 0; i < fullText.length; i++) {
                  const char = fullText[i];
                  const pattern = CODE39_MAP[char];
                  if (!pattern) continue;

                  for (let j = 0; j < 9; j++) {
                    const isBar = j % 2 === 0;
                    const isWide = pattern[j] === '1';
                    const width = isWide ? wideWidth : narrowWidth;

                    if (isBar) {
                      bars.push(
                        <rect
                          key={`${i}-${j}`}
                          x={currentX}
                          y={0}
                          width={width}
                          height={height}
                          fill="black"
                        />
                      );
                    }
                    currentX += width;
                  }
                  currentX += interSpace;
                }

                return (
                  <div className="flex flex-col items-center">
                    <svg
                      id={`barcode-svg-${selectedBarcodeProduct.id}`}
                      width={Math.max(200, currentX)}
                      height={height}
                      viewBox={`0 0 ${currentX} ${height}`}
                    >
                      {bars}
                    </svg>
                    <span className="mt-2 text-xs font-mono font-bold text-black tracking-widest">{value}</span>
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePrintBarcode(selectedBarcodeProduct)}
                className="p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90"
              >
                🖨️ Print Label
              </button>
              <button
                onClick={() => {
                  handleAutoGenerateBarcode(selectedBarcodeProduct);
                }}
                className="p-2.5 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-sm hover:bg-surface-3 border border-border"
              >
                🔄 Regenerate
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-surface-2 border border-border text-center text-xs text-muted-foreground">
              No barcode code linked to this product yet.
            </div>
            <button
              onClick={() => handleAutoGenerateBarcode(selectedBarcodeProduct)}
              className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90"
            >
              ✨ Auto-Generate Barcode SKU
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
