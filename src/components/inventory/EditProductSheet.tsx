import { showToast } from '@/components/Toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { downscaleImageToDataUrl } from '@/lib/downscale-image';
import { Camera, Image as ImageIcon } from 'lucide-react';
import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * Editing a product, from its card or from a piece of advice.
 */
export default function EditProductSheet({ s }: { s: InventoryState }) {
  const {
    store, editProduct, setEditProduct, editDraft, setEditDraft, editCustomCategoryActive,
    setEditCustomCategoryActive, editCustomCategoryVal, setEditCustomCategoryVal,
    autoDetectCartonSingle, productPhotoRef, setScanForEditProduct, handleEdit, inputClass,
  } = s;
  const cost = Number(editDraft.costPrice) || 0;
  const settings = store.managerSettings;
  const showSmart = !settings || settings.smartPricing;
  const margins = [20, 30, 40, 50];
  const defaultMargin = settings?.defaultMargin ?? 30;
  return (
  <Modal title="Edit Product" onClose={() => { setEditProduct(null); setEditDraft(null); }}>
    <div className="space-y-3">
      <input
        value={editDraft.name}
        onChange={e => {
          const name = e.target.value;
          const autoCtn = autoDetectCartonSingle(name, Number(editDraft.sellingPrice) || 0);
          setEditDraft(prev => prev ? ({
            ...prev,
            name,
            isCartonSingleEnabled: autoCtn.isCartonSingleEnabled || prev.isCartonSingleEnabled,
            singlesPerCarton: autoCtn.isCartonSingleEnabled ? String(autoCtn.singlesPerCarton) : prev.singlesPerCarton,
            singleSellingPrice: autoCtn.isCartonSingleEnabled ? String(autoCtn.singleSellingPrice) : prev.singleSellingPrice,
            sellAsSinglesByDefault: autoCtn.isCartonSingleEnabled ? autoCtn.sellAsSinglesByDefault : prev.sellAsSinglesByDefault
          }) : null);
        }}
        className={inputClass}
      />
      <div className="grid grid-cols-2 gap-3">
        <input value={editDraft.costPrice} onChange={e => setEditDraft({ ...editDraft, costPrice: e.target.value })} type="number" placeholder="Cost (₦)" className={inputClass} />
        <input
          value={editDraft.sellingPrice}
          onChange={e => {
            const val = e.target.value;
            const numCarton = Number(val) || 0;
            const autoCtn = autoDetectCartonSingle(editDraft.name, numCarton);
            const numSingles = autoCtn.isCartonSingleEnabled ? autoCtn.singlesPerCarton : (Number(editDraft.singlesPerCarton) || 12);
            const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
            setEditDraft(prev => prev ? ({
              ...prev,
              sellingPrice: val,
              isCartonSingleEnabled: autoCtn.isCartonSingleEnabled || prev.isCartonSingleEnabled,
              singlesPerCarton: autoCtn.isCartonSingleEnabled ? String(autoCtn.singlesPerCarton) : prev.singlesPerCarton,
              singleSellingPrice: prev.isCartonSingleEnabled || autoCtn.isCartonSingleEnabled ? calculatedSingle : prev.singleSellingPrice,
              sellAsSinglesByDefault: autoCtn.isCartonSingleEnabled ? autoCtn.sellAsSinglesByDefault : prev.sellAsSinglesByDefault
            }) : null);
          }}
          type="number"
          placeholder="Selling (₦)"
          className={inputClass}
        />
      </div>
      {showSmart && cost > 0 && (
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
          <p className="text-xs font-display font-bold text-primary">✨ Smart Pricing</p>
          <div className="grid grid-cols-2 gap-1.5">
            {margins.map(m => {
              const price = Math.round((cost * (1 + m / 100)) / 5) * 5;
              const selected = Number(editDraft.sellingPrice) === price;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    const priceStr = String(price);
                    const numCarton = price;
                    const numSingles = Number(editDraft.singlesPerCarton) || 12;
                    const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
                    setEditDraft(prev => prev ? ({
                      ...prev,
                      sellingPrice: priceStr,
                      singleSellingPrice: prev.isCartonSingleEnabled ? calculatedSingle : prev.singleSellingPrice
                    }) : null);
                  }}
                  className={`p-2 rounded-lg border text-xs font-display font-semibold ${
                    selected || m === defaultMargin && !editDraft.sellingPrice
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-surface-2 border-border text-foreground hover:border-primary/30'
                  }`}
                >
                  {m}% → ₦{price.toLocaleString()}
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
            checked={editDraft.isCartonSingleEnabled}
            onChange={e => setEditDraft(prev => prev ? ({ ...prev, isCartonSingleEnabled: e.target.checked }) : null)}
            className="rounded border-border text-primary focus:ring-primary w-4 h-4"
          />
          📦 Enable Carton & Single sales
        </label>

        {editDraft.isCartonSingleEnabled && (
          <div className="space-y-3 pt-2 border-t border-border/20">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold text-muted-foreground">Singles per Carton</label>
                <input
                  type="number"
                  value={editDraft.singlesPerCarton}
                  onChange={e => {
                    const val = e.target.value;
                    const numCarton = Number(editDraft.sellingPrice) || 0;
                    const numSingles = Number(val) || 12;
                    const calculatedSingle = numSingles > 0 ? String(Math.round(numCarton / numSingles)) : '';
                    setEditDraft(prev => prev ? ({ ...prev, singlesPerCarton: val, singleSellingPrice: calculatedSingle }) : null);
                  }}
                  placeholder="e.g. 12"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-semibold text-muted-foreground">Single Selling Price (₦)</label>
                <input
                  type="number"
                  value={editDraft.singleSellingPrice}
                  onChange={e => setEditDraft(prev => prev ? ({ ...prev, singleSellingPrice: e.target.value }) : null)}
                  placeholder="Auto-calculated"
                  className={inputClass}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={editDraft.sellAsSinglesByDefault}
                onChange={e => setEditDraft(prev => prev ? ({ ...prev, sellAsSinglesByDefault: e.target.checked }) : null)}
                className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5"
              />
              Sell as singles by default at checkout
            </label>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <input value={editDraft.quantity} onChange={e => setEditDraft({ ...editDraft, quantity: e.target.value })} type="number" placeholder="Quantity" className={inputClass} />
        <div className="space-y-2 text-left">
          <select
            value={['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'].includes(editDraft.category) ? editDraft.category : 'Others'}
            onChange={e => {
              const val = e.target.value;
              if (val === 'Others') {
                setEditCustomCategoryActive(true);
                setEditDraft({ ...editDraft, category: editCustomCategoryVal || 'Others' });
              } else {
                setEditCustomCategoryActive(false);
                setEditDraft({ ...editDraft, category: val });
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
          {editCustomCategoryActive && (
            <input
              value={editCustomCategoryVal}
              onChange={e => {
                setEditCustomCategoryVal(e.target.value);
                setEditDraft({ ...editDraft, category: e.target.value });
              }}
              placeholder="Enter custom category..."
              className={inputClass}
            />
           )}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          value={editDraft.barcode || ''}
          onChange={e => setEditDraft(prev => prev ? ({ ...prev, barcode: e.target.value }) : null)}
          placeholder="Barcode (Optional)"
          className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
        />
        <button
          type="button"
          onClick={() => setScanForEditProduct(true)}
          className="px-3 rounded-lg bg-surface-2 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
          title="Scan barcode"
        >
          <Camera className="w-4 h-4" />
        </button>
      </div>
      {/* Photo and description. Both fields were read all over the app —
          these rows, the detail sheet, the services catalogue and the
          published storefront — but were not on Product and nothing
          could set them, so a product photo never appeared anywhere.
          The picture goes through the same downscaler as the store
          logo, so a camera photo is stored at a few tens of kB rather
          than several megabytes. */}
      <div className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-2 border border-border">
        <div className="w-14 h-14 rounded-xl bg-surface-3 border border-border/60 overflow-hidden flex items-center justify-center shrink-0">
          {editDraft.image
            ? <img src={editDraft.image} alt="" className="w-full h-full object-cover" />
            : <ImageIcon className="w-5 h-5 text-muted-foreground" />}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => productPhotoRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-surface-3 border border-border text-[11px] font-display font-bold"
            >
              {editDraft.image ? 'Change photo' : 'Add photo'}
            </button>
            {editDraft.image && (
              <button
                type="button"
                onClick={() => setEditDraft(prev => (prev ? { ...prev, image: undefined } : prev))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-display font-bold text-destructive"
              >
                Remove
              </button>
            )}
          </div>
          <input
            value={editDraft.description || ''}
            onChange={e => setEditDraft(prev => (prev ? { ...prev, description: e.target.value } : prev))}
            placeholder="Short description (optional)"
            className={inputClass}
          />
        </div>
        <input
          ref={productPhotoRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async e => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) return showToast('Image must be under 8 MB', 'error');
            try {
              const image = await downscaleImageToDataUrl(file, { maxEdge: 320 });
              setEditDraft(prev => (prev ? { ...prev, image } : prev));
            } catch {
              showToast('That image could not be read', 'error');
            }
          }}
        />
      </div>

      <button onClick={handleEdit} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Save Changes</button>

      {/* Price History Section */}
      {(() => {
        const priceHistory = editProduct.priceHistory || [];
        if (priceHistory.length === 0) return null;
        return (
          <div className="pt-3 border-t border-border/60 space-y-2 mt-3 text-left">
            <p className="text-xs font-display font-bold text-primary flex items-center gap-1.5">
              📈 Cost Price History
            </p>
            {priceHistory.length >= 2 && (
              <div className="h-28 w-full bg-surface-2 p-1.5 rounded-lg border border-border">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={priceHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(str) => {
                        try {
                          return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                        } catch {
                          return '';
                        }
                      }}
                      tick={{ fill: '#94a3b8', fontSize: 8 }}
                    />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 8 }}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', borderColor: '#d97706', borderRadius: '6px', padding: '6px' }}
                      labelStyle={{ color: '#f59e0b', fontSize: 9, fontWeight: 'bold' }}
                      itemStyle={{ color: '#f8fafc', fontSize: 9 }}
                      labelFormatter={(lbl) => {
                        try {
                          return new Date(lbl).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
                        } catch {
                          return String(lbl);
                        }
                      }}
                    />
                    <Line type="monotone" dataKey="costPrice" stroke="#d97706" strokeWidth={1.5} dot={{ fill: '#d97706', r: 2 }} name="Cost" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="max-h-24 overflow-y-auto space-y-1 text-[10px]">
              {priceHistory.slice().reverse().map((h, idx) => (
                <div key={idx} className="flex justify-between items-center bg-surface-2 p-1.5 rounded border border-border">
                  <span className="text-muted-foreground">
                    {new Date(h.date).toLocaleDateString('en-GB')} {new Date(h.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="font-semibold text-primary">₦{h.costPrice.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  </Modal>
  );
}
