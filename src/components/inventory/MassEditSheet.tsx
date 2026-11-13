import { showToast } from '@/components/Toast';
import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * Changing many products at once.
 */
export default function MassEditSheet({ s }: { s: InventoryState }) {
  const {
    setPendingMassEditDelete, massEditItems, setMassEditItems, batchBuy, setBatchBuy, batchSell,
    setBatchSell, batchContains, setBatchContains, handleSaveMassEdit,
  } = s;
  return (
    <Modal title={`Mass Edit Inventory (${massEditItems.length})`} onClose={() => setMassEditItems(null)}>
      <div className="space-y-4 text-left">
        <p className="text-xs text-muted-foreground">
          Configure your products simply. Fill the 6 main fields, or expand "More Options" for custom prices, margins, and deletion.
        </p>

        {/* Batch Editing Panel */}
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={massEditItems.length > 0 && massEditItems.every(it => it.selected)}
                onChange={e => {
                  const active = e.target.checked;
                  setMassEditItems(massEditItems.map(it => ({ ...it, selected: active })));
                }}
                className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
              <span className="text-xs font-display font-bold text-foreground">
                Select All ({massEditItems.filter(it => it.selected).length} selected)
              </span>
            </div>
            {massEditItems.some(it => it.selected) && (
              <button
                onClick={() => {
                  const count = massEditItems.filter(it => it.selected).length;
                  const updated = massEditItems.map(it => {
                    if (it.selected) {
                      const nextContains = Number(batchContains) || it.unitsPerPurchase;
                      const nextBuy = batchBuy || it.purchaseUnit;
                      const nextSell = batchSell || it.sellingUnit;
                      const cp = nextContains > 1 ? (it.purchasePrice / nextContains) : it.purchasePrice;
                      const sp = it.sellingPrice;
                      let psp = it.purchaseSellingPrice;
                      if (it.pricingMode === 'auto') {
                        psp = sp * nextContains;
                      }
                      return {
                        ...it,
                        purchaseUnit: nextBuy,
                        sellingUnit: nextSell,
                        unitsPerPurchase: nextContains,
                        unitCostPrice: cp,
                        sellingPrice: sp,
                        purchaseSellingPrice: psp
                      };
                    }
                    return it;
                  });
                  setMassEditItems(updated);
                  showToast(`✓ Applied structure to ${count} products`, 'success');
                }}
                className="px-2.5 py-1 bg-primary text-primary-foreground text-[10px] font-display font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                ⚡ Apply to Selected
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Buy As</label>
              <select
                value={batchBuy}
                onChange={e => setBatchBuy(e.target.value)}
                className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
              >
                <option value="">-- No Change --</option>
                {['Carton', 'Pack', 'Roll', 'Piece', 'Other'].map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Sell As</label>
              <select
                value={batchSell}
                onChange={e => setBatchSell(e.target.value)}
                className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
              >
                <option value="">-- No Change --</option>
                {['Bottle', 'Piece', 'Sachet', 'Pack', 'Other'].map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Contains Qty</label>
              <input
                value={batchContains}
                onChange={e => setBatchContains(e.target.value)}
                type="number"
                placeholder="e.g. 12"
                className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
              />
            </div>
          </div>
        </div>

        {/* List of Products */}
        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
          {massEditItems.map((it, i) => {
            const isAuto = it.pricingMode === 'auto';

            // Profit margin calculations
            const profitAmount = it.purchaseSellingPrice - it.purchasePrice;
            const marginPercent = it.purchasePrice > 0 ? (profitAmount / it.purchasePrice) * 100 : 0;

            // Quick Profit Handler
            const applyProfit = (percent: number) => {
              const next = [...massEditItems];
              let sp = it.sellingPrice;
              let psp = it.purchaseSellingPrice;

              if (isAuto) {
                psp = Math.round(it.purchasePrice * (1 + percent / 100));
                sp = it.unitsPerPurchase > 0 ? Math.round(psp / it.unitsPerPurchase) : psp;
              } else {
                sp = Math.round(it.unitCostPrice * (1 + percent / 100));
                psp = sp * it.unitsPerPurchase;
              }

              next[i] = {
                ...it,
                sellingPrice: sp,
                purchaseSellingPrice: psp
              };
              setMassEditItems(next);
              showToast(`✓ Applied ${percent}% markup`, 'success');
            };

            return (
              <div key={it.id} className="p-3.5 rounded-xl bg-surface-2 border border-border/85 space-y-2.5 relative">
                {/* Header: Name checkbox & toggle */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!it.selected}
                    onChange={() => {
                      const next = [...massEditItems];
                      next[i] = { ...it, selected: !it.selected };
                      setMassEditItems(next);
                    }}
                    className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
                  />
                  <input
                    value={it.name}
                    onChange={e => {
                      const next = [...massEditItems];
                      next[i] = { ...it, name: e.target.value };
                      setMassEditItems(next);
                    }}
                    placeholder="Product Name"
                    className="flex-1 text-xs font-display font-bold bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      const next = [...massEditItems];
                      next[i] = { ...it, showMore: !it.showMore };
                      setMassEditItems(next);
                    }}
                    className="px-2.5 py-1 text-[10px] font-display font-semibold rounded bg-surface-3 hover:bg-surface-4 border border-border text-muted-foreground transition cursor-pointer shrink-0"
                  >
                    {it.showMore ? '收 Less' : '⚙️ More Options'}
                  </button>
                </div>

                {/* Six Main Fields Grid */}
                <div className="grid grid-cols-5 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Buy As</label>
                    <select
                      value={it.purchaseUnit}
                      onChange={e => {
                        const next = [...massEditItems];
                        next[i] = { ...it, purchaseUnit: e.target.value };
                        setMassEditItems(next);
                      }}
                      className="w-full text-xs bg-surface-3 border border-border rounded-lg p-1.5 focus:outline-none focus:border-primary text-white"
                    >
                      {['Carton', 'Pack', 'Roll', 'Piece', 'Other'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Sell As</label>
                    <select
                      value={it.sellingUnit}
                      onChange={e => {
                        const next = [...massEditItems];
                        next[i] = { ...it, sellingUnit: e.target.value };
                        setMassEditItems(next);
                      }}
                      className="w-full text-xs bg-surface-3 border border-border rounded-lg p-1.5 focus:outline-none focus:border-primary text-white"
                    >
                      {['Bottle', 'Piece', 'Sachet', 'Pack', 'Other'].map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Contains</label>
                    <input
                      value={it.unitsPerPurchase}
                      onChange={e => {
                        const next = [...massEditItems];
                        const val = Math.max(1, Number(e.target.value) || 1);
                        const cp = it.purchasePrice / val;
                        let psp = it.purchaseSellingPrice;
                        const sp = it.sellingPrice;
                        if (isAuto) {
                          psp = sp * val;
                        }
                        next[i] = {
                          ...it,
                          unitsPerPurchase: val,
                          unitCostPrice: cp,
                          purchaseSellingPrice: psp
                        };
                        setMassEditItems(next);
                      }}
                      type="number"
                      placeholder="Qty"
                      className="w-full text-xs bg-surface-3 border border-border rounded-lg p-1.5 focus:outline-none focus:border-primary text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Buy Price (₦)</label>
                    <input
                      value={it.purchasePrice}
                      onChange={e => {
                        const next = [...massEditItems];
                        const val = Number(e.target.value) || 0;
                        const cp = it.unitsPerPurchase > 0 ? (val / it.unitsPerPurchase) : val;
                        next[i] = {
                          ...it,
                          purchasePrice: val,
                          unitCostPrice: cp
                        };
                        setMassEditItems(next);
                      }}
                      type="number"
                      placeholder="Buy Price"
                      className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-1.5 focus:outline-none focus:border-primary text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Sell Price (₦)</label>
                    <input
                      value={it.sellingPrice}
                      onChange={e => {
                        const next = [...massEditItems];
                        const val = Number(e.target.value) || 0;
                        let psp = it.purchaseSellingPrice;
                        if (isAuto) {
                          psp = val * it.unitsPerPurchase;
                        }
                        next[i] = {
                          ...it,
                          sellingPrice: val,
                          purchaseSellingPrice: psp
                        };
                        setMassEditItems(next);
                      }}
                      type="number"
                      placeholder="Sell Price"
                      className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-1.5 focus:outline-none focus:border-primary text-white"
                    />
                  </div>
                </div>

                {/* More Options drawer */}
                {it.showMore && (
                  <div className="p-3.5 rounded-lg bg-surface-3 border border-border/80 space-y-3 animate-slide-in">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Sell Price per Carton/Pack */}
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Sell Price Per Carton/Pack (₦)</label>
                        <input
                          value={it.purchaseSellingPrice}
                          onChange={e => {
                            const next = [...massEditItems];
                            const val = Number(e.target.value) || 0;
                            let sp = it.sellingPrice;
                            if (isAuto) {
                              sp = it.unitsPerPurchase > 0 ? Math.round(val / it.unitsPerPurchase) : val;
                            }
                            next[i] = {
                              ...it,
                              purchaseSellingPrice: val,
                              sellingPrice: sp
                            };
                            setMassEditItems(next);
                          }}
                          type="number"
                          placeholder="Carton Sell"
                          className="w-full text-xs font-mono bg-surface-2 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                        />
                      </div>

                      {/* Category select dropdown */}
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Category</label>
                        <select
                          value={it.category}
                          onChange={e => {
                            const next = [...massEditItems];
                            next[i] = { ...it, category: e.target.value };
                            setMassEditItems(next);
                          }}
                          className="w-full text-xs bg-surface-2 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                        >
                          {['Groceries', 'Beverages', 'Detergents', 'Soap', 'Bread', 'Milk', 'Noodles', 'Biscuit', 'Beer', 'Wine', 'Others'].map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Auto Calculate toggle */}
                    <div className="flex items-center justify-between border-t border-border/40 pt-2 text-[11px]">
                      <span className="text-muted-foreground font-display font-semibold">Smart Pricing Rules:</span>
                      <label className="flex items-center gap-1.5 cursor-pointer font-display font-bold text-white">
                        <input
                          type="checkbox"
                          checked={isAuto}
                          onChange={e => {
                            const next = [...massEditItems];
                            next[i] = { ...it, pricingMode: e.target.checked ? 'auto' : 'manual' };
                            setMassEditItems(next);
                            showToast(e.target.checked ? 'Auto-sync active' : 'Independent manual pricing active', 'info');
                          }}
                          className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 cursor-pointer"
                        />
                        Auto-Calculate Carton & Piece Price
                      </label>
                    </div>

                    {/* Profit percentage & expected profit display */}
                    <div className="bg-surface-2 p-2 rounded-lg border border-border flex items-center justify-between text-[10px] leading-snug">
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground">Expected Profit: <strong className="text-success">₦{profitAmount.toLocaleString()}</strong></p>
                        <p className="text-muted-foreground">Profit Margin: <strong className="text-primary">{marginPercent.toFixed(1)}%</strong></p>
                      </div>

                      {/* Markup helper tags */}
                      <div className="flex gap-1">
                        {[10, 15, 20, 25, 30].map(pct => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => applyProfit(pct)}
                            className="px-1.5 py-0.5 bg-surface-3 hover:bg-surface-4 border border-border text-[9px] font-display font-bold rounded text-white"
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Delete Product */}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setPendingMassEditDelete(it)}
                        className="px-3 py-1.5 bg-destructive/10 hover:bg-destructive/20 border border-destructive/25 text-destructive rounded-lg text-xs font-display font-bold cursor-pointer transition-colors"
                      >
                        🗑️ Delete Product
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => setMassEditItems(null)}
            className="p-3 rounded-xl bg-surface-2 border border-border text-xs font-display font-semibold hover:bg-surface-3 transition cursor-pointer text-center text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveMassEdit}
            className="p-3 rounded-xl bg-success text-white text-xs font-display font-bold hover:opacity-95 shadow-md cursor-pointer text-center"
          >
            ✓ Save Changes
          </button>
        </div>
      </div>
    </Modal>
  );
}
