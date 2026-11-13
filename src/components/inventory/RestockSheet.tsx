import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * Recording stock that came in for one product.
 */
export default function RestockSheet({ s }: { s: InventoryState }) {
  const {
    restockProduct, setRestockProduct, restockQty, setRestockQty, singleRestockFunding,
    setSingleRestockFunding, showRestockConfirm, setShowRestockConfirm, handleRestock,
    handleActualRestock, handleSavePlannedRestock, inputClass,
  } = s;
  return (
    <Modal title={showRestockConfirm ? "Confirm Restock" : `Restock: ${restockProduct.name}`} onClose={() => { setRestockProduct(null); setShowRestockConfirm(false); }}>
      {showRestockConfirm ? (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm text-center font-display font-bold">
            ⚠️ Confirm Action
          </div>
          <p className="text-sm text-foreground leading-snug">
            Are you sure you have this inventory to restock now for this item to restock now before?
          </p>
          <div className="p-3.5 rounded-lg bg-surface-2 border border-border space-y-1.5 text-xs text-left">
            <p><span className="text-muted-foreground">Product:</span> <strong className="text-foreground">{restockProduct.name}</strong></p>
            <p><span className="text-muted-foreground">Restock Qty:</span> <strong className="text-foreground">{restockQty} units</strong></p>
            <p><span className="text-muted-foreground">Funding:</span> <strong className="text-foreground">{singleRestockFunding === 'new_money' ? '💵 New Money' : '🏦 From Balance'}</strong></p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleActualRestock}
              className="w-full p-3 rounded-lg bg-success text-white font-display font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              Yes, restock now
            </button>
            <button
              type="button"
              onClick={handleSavePlannedRestock}
              className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer border border-primary/20"
            >
              Not yet (Save as Planned)
            </button>
            <button
              type="button"
              onClick={() => setShowRestockConfirm(false)}
              className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              No / Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Current stock: <span className="text-foreground">{restockProduct.quantity}</span></p>
          <input value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="Quantity to add" type="number" className={inputClass} />
          <div>
            <label className="text-[10px] text-muted-foreground uppercase">Funding</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => setSingleRestockFunding('balance')}
                className={`p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                  singleRestockFunding === 'balance' ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-foreground border-border'
                }`}
              >
                💰 From Balance
              </button>
              <button
                onClick={() => setSingleRestockFunding('new_money')}
                className={`p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                  singleRestockFunding === 'new_money' ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-foreground border-border'
                }`}
              >
                💵 New Money
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {singleRestockFunding === 'new_money'
                ? 'Recorded as expense + new investment (ROI base grows, cash neutral).'
                : 'Recorded as expense only — net income / available cash drops.'}
            </p>
          </div>
          <button onClick={handleRestock} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Restock</button>
        </div>
      )}
    </Modal>
  );
}
