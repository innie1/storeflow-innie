import { StoreData } from '@/types/store';
import { transferStock, getStoreIndex, loadStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * Moving a product's stock to another branch.
 */
export default function TransferStockSheet({ s }: { s: InventoryState }) {
  const {
    store, onUpdate, selectedTransferProduct, setSelectedTransferProduct, transferQty,
    setTransferQty, transferDestCode, setTransferDestCode, inputClass,
  } = s;
  return (
    <Modal title={`Transfer: ${selectedTransferProduct.name}`} onClose={() => setSelectedTransferProduct(null)}>
      <div className="space-y-4 text-left">
        <p className="text-xs text-muted-foreground">
          Move stock directly to another store. This adjusts quantities in both stores immediately.
        </p>

        <div className="p-3 rounded-lg bg-surface-2 border border-border flex justify-between items-center text-xs">
          <span>Current Stock:</span>
          <span className="font-bold text-primary">{selectedTransferProduct.quantity} units</span>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase">Destination Store</label>
          {(() => {
            const sisterStores = getStoreIndex().filter(s => s.code !== store.accessCode);
            return (
              <div className="space-y-2">
                {sisterStores.length > 0 ? (
                  <select
                    value={transferDestCode}
                    onChange={e => setTransferDestCode(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select sister store...</option>
                    {sisterStores.map(s => (
                      <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                    ))}
                    <option value="MANUAL">Enter Code Manually...</option>
                  </select>
                ) : null}

                {(sisterStores.length === 0 || transferDestCode === 'MANUAL') && (
                  <input
                    value={transferDestCode === 'MANUAL' ? '' : transferDestCode}
                    onChange={e => setTransferDestCode(e.target.value)}
                    placeholder="Enter destination store access code (e.g. ABCXYZ)"
                    className={inputClass}
                  />
                )}
              </div>
            );
          })()}
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground uppercase">Transfer Quantity</label>
          <input
            type="number"
            min="1"
            max={selectedTransferProduct.quantity}
            value={transferQty}
            onChange={e => setTransferQty(e.target.value)}
            placeholder={`Max: ${selectedTransferProduct.quantity}`}
            className={inputClass}
          />
        </div>

        <button
          onClick={() => {
            const qty = Number(transferQty);
            if (!transferDestCode || qty <= 0 || qty > selectedTransferProduct.quantity) {
              return showToast('Invalid destination store or transfer quantity', 'error');
            }
            const destCode = transferDestCode.trim().toUpperCase();
            if (destCode === 'MANUAL') {
              return showToast('Please enter store code', 'error');
            }
            if (destCode === store.accessCode) {
              return showToast('Cannot transfer to current store', 'error');
            }

            const targetStore = loadStore(destCode);
            if (!targetStore) {
              return showToast(`Store code "${destCode}" not found in system`, 'error');
            }

            let updated: StoreData;
            try { updated = transferStock(store, selectedTransferProduct.id, qty, destCode); }
            catch (error) { return showToast(error instanceof Error ? error.message : 'Transfer failed', 'error'); }
            onUpdate(updated);
            setSelectedTransferProduct(null);
            setTransferQty('');
            setTransferDestCode('');
            showToast(`✓ Transferred ${qty} unit(s) of ${selectedTransferProduct.name} to store ${destCode}`);
          }}
          className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 text-sm"
        >
          🚚 Complete Transfer
        </button>
      </div>
    </Modal>
  );
}
