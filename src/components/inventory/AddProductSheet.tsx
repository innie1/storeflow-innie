import { Camera } from 'lucide-react';
import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * Adding a product.
 */
export default function AddProductSheet({ s }: { s: InventoryState }) {
  const {
    store, setShowAddModal, newProduct, setNewProduct, customCategoryActive,
    setCustomCategoryActive, customCategoryVal, setCustomCategoryVal, showAddConfirm,
    setShowAddConfirm, autoCategory, autoDetectCartonSingle, setScanForNewProduct, handleAdd,
    handleActualAdd, inputClass,
  } = s;
  const settings = store.managerSettings;
  const showSmartPricing = !settings || settings.smartPricing;
  const cost = Number(newProduct.costPrice) || 0;
  const margins = [20, 30, 40, 50];
  const defaultMargin = settings?.defaultMargin ?? 30;
  return (
  <Modal title={showAddConfirm ? "Confirm Product Addition" : "Add Product"} onClose={() => { setShowAddModal(false); setShowAddConfirm(false); }}>
    {showAddConfirm ? (
      <div className="space-y-4">
        <div className="p-3.5 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm text-center font-display font-bold">
          ⚠️ Confirm Action
        </div>
        <p className="text-sm text-foreground leading-snug text-center">
          Are you sure you want to add this product to your inventory?
        </p>
        <div className="p-3.5 rounded-lg bg-surface-2 border border-border space-y-1.5 text-xs text-left">
          <p><span className="text-muted-foreground">Product Name:</span> <strong className="text-foreground">{newProduct.name}</strong></p>
          <p><span className="text-muted-foreground">Cost Price:</span> <strong className="text-foreground">₦{Number(newProduct.costPrice).toLocaleString()}</strong></p>
          <p><span className="text-muted-foreground">Selling Price:</span> <strong className="text-foreground">₦{Number(newProduct.sellingPrice).toLocaleString()}</strong></p>
          <p><span className="text-muted-foreground">Quantity:</span> <strong className="text-foreground">{newProduct.quantity} units</strong></p>
          <p><span className="text-muted-foreground">Category:</span> <strong className="text-foreground">{newProduct.category}</strong></p>
          {newProduct.isCartonSingleEnabled && (
            <>
              <p><span className="text-muted-foreground">Carton & Single:</span> <strong className="text-foreground">Enabled</strong></p>
              <p><span className="text-muted-foreground">Singles per Carton:</span> <strong className="text-foreground">{newProduct.singlesPerCarton}</strong></p>
              <p><span className="text-muted-foreground">Single Price:</span> <strong className="text-foreground">₦{Number(newProduct.singleSellingPrice || 0).toLocaleString()}</strong></p>
            </>
          )}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={handleActualAdd}
            className="w-full p-3 rounded-lg bg-success text-white font-display font-bold text-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            Yes, add product
          </button>
          <button
            type="button"
            onClick={() => setShowAddConfirm(false)}
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-sm font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
          >
            No / Cancel
          </button>
        </div>
      </div>
    ) : (
      <div className="space-y-3">
        <input
          value={newProduct.name}
          onChange={e => {
            const name = e.target.value;
            const guessed = autoCategory(name);
            const autoCtn = autoDetectCartonSingle(name, Number(newProduct.sellingPrice) || 0);
            setNewProduct(prev => ({
              ...prev,
              name,
              category: guessed,
              isCartonSingleEnabled: autoCtn.isCartonSingleEnabled || prev.isCartonSingleEnabled,
              singlesPerCarton: autoCtn.isCartonSingleEnabled ? String(autoCtn.singlesPerCarton) : prev.singlesPerCarton,
              singleSellingPrice: autoCtn.isCartonSingleEnabled ? String(autoCtn.singleSellingPrice) : prev.singleSellingPrice,
              sellAsSinglesByDefault: autoCtn.isCartonSingleEnabled ? autoCtn.sellAsSinglesByDefault : prev.sellAsSinglesByDefault
            }));
            if (guessed === 'Others') {
              setCustomCategoryActive(true);
              setCustomCategoryVal('');
            } else {
              setCustomCategoryActive(false);
            }
          }}
          placeholder="Product name"
          className={inputClass}
        />
        {store.storeType && store.storeType !== 'provision' && (
          <div className="space-y-1">
            <label className="block text-[11px] text-muted-foreground uppercase font-bold">Sold By</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['pcs', 'kg', 'liter', 'load'] as const).map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setNewProduct({ ...newProduct, unit: u })}
                  className={`py-1.5 rounded-lg border text-xs font-display font-semibold capitalize ${
                    newProduct.unit === u ? 'bg-primary/10 border-primary text-foreground' : 'bg-surface-2/40 border-border text-muted-foreground'
                  }`}
                >
                  {u === 'pcs' ? 'Piece' : u}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <input value={newProduct.costPrice} onChange={e => setNewProduct({ ...newProduct, costPrice: e.target.value })} placeholder="Cost price (₦)" type="number" className={inputClass} />
          <input
            value={newProduct.sellingPrice}
            onChange={e => {
              const val = e.target.value;
              const numCarton = Number(val) || 0;
              const autoCtn = autoDetectCartonSingle(newProduct.name, numCarton);
              const numSingles = autoCtn.isCartonSingleEnabled ? autoCtn.singlesPerCarton : (Number(newProduct.singlesPerCarton) || 12);
              const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
              setNewProduct(prev => ({
                ...prev,
                sellingPrice: val,
                isCartonSingleEnabled: autoCtn.isCartonSingleEnabled || prev.isCartonSingleEnabled,
                singlesPerCarton: autoCtn.isCartonSingleEnabled ? String(autoCtn.singlesPerCarton) : prev.singlesPerCarton,
                singleSellingPrice: prev.isCartonSingleEnabled || autoCtn.isCartonSingleEnabled ? calculatedSingle : prev.singleSellingPrice,
                sellAsSinglesByDefault: autoCtn.isCartonSingleEnabled ? autoCtn.sellAsSinglesByDefault : prev.sellAsSinglesByDefault
              }));
            }}
            placeholder="Selling price (₦)"
            type="number"
            className={inputClass}
          />
        </div>
        {showSmartPricing && cost > 0 && (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-display font-bold text-primary">✨ Smart Pricing <span className="text-muted-foreground font-normal">(Recommended)</span></p>
            </div>
            <p className="text-[10px] text-muted-foreground">Based on your {defaultMargin}% default profit margin</p>
            <div className="space-y-1.5">
              {margins.map(m => {
                const price = Math.round((cost * (1 + m / 100)) / 5) * 5;
                const profit = price - cost;
                const isDefault = m === defaultMargin;
                const isSelected = Number(newProduct.sellingPrice) === price;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      const priceStr = String(price);
                      const numCarton = price;
                      const numSingles = Number(newProduct.singlesPerCarton) || 12;
                      const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
                      setNewProduct(prev => ({
                        ...prev,
                        sellingPrice: priceStr,
                        singleSellingPrice: prev.isCartonSingleEnabled ? calculatedSingle : prev.singleSellingPrice
                      }));
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs font-display font-semibold transition-colors ${
                      isSelected || (isDefault && !newProduct.sellingPrice)
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'bg-surface-2 border-border text-foreground hover:border-primary/30'
                    }`}
                  >
                    <span>{m}% Margin</span>
                    <span>₦{price.toLocaleString()}</span>
                    <span className="text-success">Profit: ₦{profit.toLocaleString()}{isSelected ? ' ✓' : ''}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Carton & Single Sales Configuration */}
        <div className="p-3 rounded-xl bg-surface-2 border border-border/40 space-y-2 text-left">
          <label className="flex items-center gap-2 text-xs font-display font-semibold text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newProduct.isCartonSingleEnabled}
              onChange={e => setNewProduct(prev => ({ ...prev, isCartonSingleEnabled: e.target.checked }))}
              className="rounded border-border text-primary focus:ring-primary w-4 h-4"
            />
            📦 Enable Carton & Single sales
          </label>

          {newProduct.isCartonSingleEnabled && (
            <div className="space-y-3 pt-2 border-t border-border/20">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold text-muted-foreground">Singles per Carton</label>
                  <input
                    type="number"
                    value={newProduct.singlesPerCarton}
                    onChange={e => {
                      const val = e.target.value;
                      const numCarton = Number(newProduct.sellingPrice) || 0;
                      const numSingles = Number(val) || 12;
                      const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
                      setNewProduct(prev => ({ ...prev, singlesPerCarton: val, singleSellingPrice: calculatedSingle }));
                    }}
                    placeholder="e.g. 12"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold text-muted-foreground">Single Selling Price (₦)</label>
                  <input
                    type="number"
                    value={newProduct.singleSellingPrice}
                    onChange={e => setNewProduct(prev => ({ ...prev, singleSellingPrice: e.target.value }))}
                    placeholder="Auto-calculated"
                    className={inputClass}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newProduct.sellAsSinglesByDefault}
                  onChange={e => setNewProduct(prev => ({ ...prev, sellAsSinglesByDefault: e.target.checked }))}
                  className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
                />
                Sell as singles by default at checkout
              </label>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <input value={newProduct.quantity} onChange={e => setNewProduct({ ...newProduct, quantity: e.target.value })} placeholder="Quantity" type="number" className={inputClass} />
          <div className="space-y-2 text-left">
            <select
              value={['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'].includes(newProduct.category) ? newProduct.category : 'Others'}
              onChange={e => {
                const val = e.target.value;
                if (val === 'Others') {
                  setCustomCategoryActive(true);
                  setNewProduct({ ...newProduct, category: customCategoryVal || 'Others' });
                } else {
                  setCustomCategoryActive(false);
                  setNewProduct({ ...newProduct, category: val });
                }
              }}
              className={inputClass}
            >
              <option value="Groceries">Groceries</option>
              <option value="Beverages">Beverages</option>
              <option value="Detergents">Detergents</option>
              <option value="Soap">Soap</option>
              <option value="Others">Others / Custom</option>
            </select>
            {customCategoryActive && (
              <input
                value={customCategoryVal}
                onChange={e => {
                  setCustomCategoryVal(e.target.value);
                  setNewProduct({ ...newProduct, category: e.target.value });
                }}
                placeholder="Enter custom category..."
                className={inputClass}
              />
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <input
            value={newProduct.barcode || ''}
            onChange={e => setNewProduct({ ...newProduct, barcode: e.target.value })}
            placeholder="Barcode (Optional)"
            className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
          />
          <button
            type="button"
            onClick={() => setScanForNewProduct(true)}
            className="px-3 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
            title="Scan barcode"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>
        <button onClick={handleAdd} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Save Item</button>
      </div>
    )}
  </Modal>
  );
}
