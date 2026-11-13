import { showToast } from '@/components/Toast';
import Modal from './Modal';
import type { InventoryState } from './useInventory';

/**
 * Bringing products in from a file or a pasted list.
 */
export default function ImportProductsSheet({ s }: { s: InventoryState }) {
  const {
    store, setShowImportModal, importText, setImportText, importPreview, setImportPreview,
    importMode, setImportMode, purchaseCodeInput, setPurchaseCodeInput, isOcrLoading, ocrError,
    ocrFileRef, handleOcrScan, handleImportParse, handleImportApprove, handlePurchaseCodeImport,
    inputClass,
  } = s;
  return (
    <Modal title={importPreview ? `Review (${importPreview.length})` : 'Bulk Import'} onClose={() => { setShowImportModal(false); setImportPreview(null); }}>
      {!importPreview ? (
        <div className="space-y-4">
          {/* Tab Switcher */}
          <div className="flex gap-2 p-1 bg-surface-2 border border-border rounded-xl">
            <button
              type="button"
              onClick={() => setImportMode('text')}
              className={`flex-1 py-2 rounded-lg text-xs font-display font-bold transition-all ${
                importMode === 'text' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📝 Text Import (CSV)
            </button>
            <button
              type="button"
              onClick={() => setImportMode('image')}
              className={`flex-1 py-2 rounded-lg text-xs font-display font-bold transition-all ${
                importMode === 'image' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              📷 Receipt Scan (OCR)
            </button>
            <button
              type="button"
              onClick={() => setImportMode('code')}
              className={`flex-1 py-2 rounded-lg text-xs font-display font-bold transition-all ${
                importMode === 'code' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              🔑 Purchase Code
            </button>
          </div>

          {importMode === 'code' ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Already bought goods from a Buy List you approved? Enter its code here to add those exact items to stock. Each code works once.
              </p>
              <input
                value={purchaseCodeInput}
                onChange={e => setPurchaseCodeInput(e.target.value.toUpperCase())}
                placeholder="PO-XXXXXX"
                autoCapitalize="characters"
                className={`${inputClass} text-center font-mono font-bold tracking-widest`}
              />
              <button
                onClick={handlePurchaseCodeImport}
                disabled={!purchaseCodeInput.trim()}
                className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 font-display font-semibold hover:opacity-90"
              >
                Import Stock
              </button>
              <p className="text-[11px] text-muted-foreground text-center">
                Codes are generated when you Approve &amp; Share a Buy List. Check Purchase Orders history if you've lost one.
              </p>
            </div>
          ) : importMode === 'text' ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Format: Name, Cost, Selling Price, Quantity, Category (one per line)</p>
              <textarea value={importText} onChange={e => setImportText(e.target.value)}
                placeholder={"Rice 5kg, 3000, 4500, 20, Groceries\nSugar 1kg, 500, 700, 30, Groceries"}
                rows={6} className={`${inputClass} resize-none`} />
              <button onClick={handleImportParse} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Preview Items →</button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground text-center">
                Upload or snap a receipt image. Our offline scanner will extract products, prices, and quantities automatically.
              </p>

              {isOcrLoading ? (
                <div className="p-8 text-center bg-surface-2 border border-border rounded-xl space-y-3">
                  <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin mx-auto" />
                  <p className="text-sm font-display font-semibold text-primary">Scanning receipt offline...</p>
                  <p className="text-[10px] text-muted-foreground">Processing receipt text details inside browser</p>
                </div>
              ) : (
                <div
                  onClick={() => ocrFileRef.current?.click()}
                  className="border-2 border-dashed border-border hover:border-primary/40 rounded-xl p-8 text-center cursor-pointer transition-colors space-y-2 bg-surface-2"
                >
                  <span className="text-4xl block">📷</span>
                  <p className="text-sm font-display font-bold">Upload or Take Photo</p>
                  <p className="text-xs text-muted-foreground">Supports JPG, PNG, HEIC</p>
                </div>
              )}

              <input
                ref={ocrFileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleOcrScan}
                className="hidden"
              />

              {ocrError && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs text-center leading-normal">
                  {ocrError}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center bg-surface-2 p-2.5 rounded-xl border border-border/50">
            <p className="text-xs text-muted-foreground">
              Review and edit each item before saving.
            </p>
            {/* AA Button (Apply margin to all matching items) */}
            {(() => {
              const defaultMargin = store.managerSettings?.defaultMargin ?? 20;
              const hasSamePrice = importPreview.some(it => {
                const cp = Number(it.costPrice) || 0;
                const sp = Number(it.sellingPrice) || 0;
                return cp > 0 && cp === sp;
              });
              if (!hasSamePrice) return null;
              return (
                <button
                  onClick={() => {
                    const next = importPreview.map(it => {
                      const cp = Number(it.costPrice) || 0;
                      const sp = Number(it.sellingPrice) || 0;
                      if (cp > 0 && cp === sp) {
                        const suggested = Math.round(cp * (1 + defaultMargin / 100));
                        return { ...it, sellingPrice: String(suggested) };
                      }
                      return it;
                    });
                    setImportPreview(next);
                    showToast(`✓ Applied ${defaultMargin}% margin to all same-price items!`, 'success');
                  }}
                  className="px-2.5 py-1 bg-yellow-500 hover:brightness-110 text-black text-[10px] font-display font-bold rounded-lg transition-all cursor-pointer shrink-0"
                >
                  ⚡ AA (Apply Margin to All)
                </button>
              );
            })()}
          </div>

          {/* Items List */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {importPreview.map((it, i) => {
              const cp = Number(it.costPrice) || 0;
              const sp = Number(it.sellingPrice) || 0;
              const isPriceSame = cp > 0 && cp === sp;
              const defaultMargin = store.managerSettings?.defaultMargin ?? 20;
              const markupSuggested = cp * (1 + defaultMargin / 100);

               // Carton detection
              const n = it.name.toLowerCase();
              const cartonWords = ['carton', 'ctn', 'pack', 'box', 'case', 'crate', 'bundle', 'dozen', 'roll', 'rolls'];
              const matchesCarton = cartonWords.some(w => n.includes(w));
              let singlesCount = n.includes('roll') ? 10 : 12;
              if (it.singlesPerCarton) {
                singlesCount = parseInt(it.singlesPerCarton) || (n.includes('roll') ? 10 : 12);
              } else if (matchesCarton) {
                const rx = /(?:x|qty|size|of|pack|ctn|carton|roll|\b)\s*(\d+)\b/i;
                const matches = n.match(rx);
                if (matches && matches[1]) {
                  const val = parseInt(matches[1]);
                  if (val > 1 && val <= 200) singlesCount = val;
                }
              }

              return (
                <div key={i} className="p-3.5 rounded-xl bg-surface-2 border border-border/85 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      value={it.name}
                      onChange={e => {
                        const next = [...importPreview];
                        next[i] = { ...it, name: e.target.value };
                        setImportPreview(next);
                      }}
                      placeholder="Product Name"
                      className="flex-1 text-xs font-display font-semibold bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white placeholder:text-muted-foreground"
                    />
                    <button
                      onClick={() => setImportPreview(importPreview.filter((_, k) => k !== i))}
                      className="w-8 h-8 rounded-lg text-destructive bg-destructive/10 hover:bg-destructive/20 text-xs flex items-center justify-center cursor-pointer transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">Cost (₦)</label>
                      <input
                        value={it.costPrice}
                        onChange={e => {
                          const n = [...importPreview];
                          n[i] = { ...it, costPrice: e.target.value };
                          setImportPreview(n);
                        }}
                        type="number"
                        placeholder="Cost"
                        className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">Selling (₦)</label>
                      <input
                        value={it.sellingPrice}
                        onChange={e => {
                          const n = [...importPreview];
                          n[i] = { ...it, sellingPrice: e.target.value };
                          setImportPreview(n);
                        }}
                        type="number"
                        placeholder="Sell"
                        className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">Quantity</label>
                      <input
                        value={it.quantity}
                        onChange={e => {
                          const n = [...importPreview];
                          n[i] = { ...it, quantity: e.target.value };
                          setImportPreview(n);
                        }}
                        type="number"
                        placeholder="Qty"
                        className="w-full text-xs font-mono bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-0.5">Category</label>
                      <input
                        value={it.category}
                        onChange={e => {
                          const n = [...importPreview];
                          n[i] = { ...it, category: e.target.value };
                          setImportPreview(n);
                        }}
                        placeholder="Cat"
                        className="w-full text-xs bg-surface-3 border border-border rounded-lg p-2 focus:outline-none focus:border-primary text-white"
                      />
                    </div>
                  </div>

                  {/* Same Price alert message */}
                  {isPriceSame && (
                    <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-[11px] text-yellow-500 leading-snug">
                      <span>Apply suggestions (₦{Math.round(markupSuggested)})?</span>
                      <button
                        onClick={() => {
                          const next = [...importPreview];
                          next[i] = { ...it, sellingPrice: String(Math.round(markupSuggested)) };
                          setImportPreview(next);
                          showToast(`Suggested selling price applied!`, 'success');
                        }}
                        className="px-2.5 py-1 bg-yellow-500 text-black text-[10px] font-display font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer shrink-0"
                      >
                        OK
                      </button>
                    </div>
                  )}

                  {/* Carton details feedback */}
                  {matchesCarton && (
                    (() => {
                      const isRoll = it.name.toLowerCase().includes('roll');
                      const splitOptions = isRoll ? [10, 8, 12] : [12, 24, 40];
                      return (
                        <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 text-xs text-primary space-y-2.5 font-display font-semibold text-left">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <span>{isRoll ? '🌀 Roll' : '📦 Carton'} Product detected: will auto-split into <strong>{singlesCount}</strong> units.</span>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mr-1">Split count:</span>
                            {splitOptions.map(val => (
                              <button
                                key={val}
                                onClick={() => {
                                  const next = [...importPreview];
                                  next[i] = { ...it, singlesPerCarton: String(val) };
                                  setImportPreview(next);
                                  showToast(`Auto-split set to ${val} units`, 'success');
                                }}
                                className={`px-2 py-1 rounded text-[10px] border transition cursor-pointer font-bold ${
                                  singlesCount === val
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-surface-3 text-foreground hover:bg-surface-2 border-border'
                                }`}
                              >
                                {val}
                              </button>
                            ))}

                            <div className="flex items-center gap-1 bg-surface-3 rounded border border-border px-1.5 py-0.5">
                              <span className="text-[9px] text-muted-foreground uppercase font-bold">Edit:</span>
                              <input
                                type="number"
                                value={it.singlesPerCarton || String(singlesCount)}
                                onChange={e => {
                                  const next = [...importPreview];
                                  next[i] = { ...it, singlesPerCarton: e.target.value };
                                  setImportPreview(next);
                                }}
                                className="w-10 bg-transparent text-foreground text-[10px] font-mono font-bold focus:outline-none text-center"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => setImportPreview(null)}
              className="p-3 rounded-xl bg-surface-2 border border-border text-xs font-display font-semibold hover:bg-surface-3 transition"
            >
              ← Back
            </button>
            <button
              onClick={handleImportApprove}
              className="p-3 rounded-xl bg-success text-white text-xs font-display font-bold hover:opacity-95 shadow-md"
            >
              ✓ Approve & Save
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
