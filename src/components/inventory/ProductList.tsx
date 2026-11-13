import { syncBackorder } from '@/lib/store-data';
import ProductIcon from '@/components/ProductIcon';
import { Camera, BarChart3, ShoppingCart, ArrowUp, Truck, Pencil, X } from 'lucide-react';
import type { InventoryState } from './useInventory';

/**
 * The products, one card each, as the search and filters leave them.
 */
export default function ProductList({ s }: { s: InventoryState }) {
  const {
    store, onUpdate, setSelectedDetailProduct, setPendingBackorderClear, selectedProductIds,
    setSelectedProductIds, setRestockProduct, setRestockQty, shoppingList, setScanForProduct,
    setSingleRestockFunding, countMode, auditCounts, setAuditCounts, setShowRestockConfirm,
    setSelectedBarcodeProduct, setSelectedTransferProduct, setTransferQty, setTransferDestCode,
    products, openEditFor, handleDelete, addToShoppingList,
  } = s;
  return (
    <div className="grid grid-cols-1 gap-3">
      {products.map(p => {
        const inList = shoppingList.find(i => i.productId === p.id);
        const isSelected = selectedProductIds.includes(p.id);
        return (
          <div
            key={p.id}
            onClick={() => { if (!countMode) setSelectedDetailProduct(p); }}
            className={`p-3 rounded-2xl bg-card border flex items-center gap-2 transition-all duration-200 cursor-pointer ${
              p.discontinued
                ? 'opacity-60 border-dashed border-destructive/40 bg-surface-1/40'
                : isSelected
                ? 'border-emerald-500 ring-1 ring-emerald-500/30 bg-emerald-500/5'
                : p.barcode
                ? 'border-success/40 ring-1 ring-success/20 hover:border-success/60'
                : 'border-border hover:border-primary/20'
            }`}
          >
            {/* Left Column: Product Image / Icon */}
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-surface-2 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border border-border/40">
              {p.image ? (
                <img src={p.image} alt={p.name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display='none'; }} />
              ) : (
                <ProductIcon product={p} className="w-6 h-6" />
              )}
            </div>

            {/* Middle Column: Details & Checkbox */}
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className={`font-display font-semibold text-sm tracking-tight text-foreground truncate ${p.discontinued ? 'text-muted-foreground line-through' : ''}`}>
                  {p.name}
                </p>
                {p.discontinued && (
                  <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20 font-bold">Discontinued</span>
                )}
                {p.addedAt && !p.discontinued && (Date.now() - new Date(p.addedAt).getTime()) < 7 * 24 * 60 * 60 * 1000 && (
                  <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-bold">New</span>
                )}
                {p.needsStockSetup && (
                  <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 border border-yellow-500/30 font-bold">🟡 Pending Inventory</span>
                )}
                {store.autoPriceLog?.some(e => !e.undone && e.productId === p.id && e.newPrice === p.sellingPrice) && (
                  <span className="text-[8px] uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 font-bold">🤖 Auto-Priced</span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate font-medium mt-0.5">{p.category}</p>
              <p className="text-yellow-500 font-display font-bold text-sm mt-1">₦{p.sellingPrice.toLocaleString()}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Cost: ₦{p.costPrice.toLocaleString()}</p>

              {!!p.backorderedQty && (
                <div
                  className="flex items-center gap-1.5 mt-1.5 flex-wrap"
                  onClick={e => e.stopPropagation()}
                >
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 border border-orange-500/30 font-bold">
                    {p.backorderedQty} owed (sold before restock)
                  </span>
                  <button
                    onClick={() => onUpdate(syncBackorder(store, p.id))}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 font-bold"
                  >
                    Sync
                  </button>
                  <button
                    onClick={() => setPendingBackorderClear(p)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30 font-bold"
                  >
                    Delete
                  </button>
                </div>
              )}

              {!countMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedProductIds(prev =>
                      prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                    );
                  }}
                  className={`w-5 h-5 rounded-md flex items-center justify-center transition-all mt-2 ${
                    isSelected
                      ? 'bg-emerald-500 border border-emerald-500 text-white'
                      : 'border border-border/80 hover:border-emerald-500/50 bg-surface-2/45'
                  }`}
                >
                  {isSelected && <span className="text-[10px] font-black">✓</span>}
                </button>
              )}
            </div>

            {/* Stock Column */}
            <div className="w-10 shrink-0 text-center flex flex-col items-center justify-center select-none">
              <span className={`text-lg font-display font-black leading-none ${
                p.quantity <= 2
                  ? 'text-red-500'
                  : p.quantity <= 5
                  ? 'text-yellow-500'
                  : 'text-emerald-500'
              }`}>
                {p.quantity}
              </span>
              <span className="text-[9px] text-muted-foreground font-bold tracking-wide mt-0.5 uppercase">stock</span>
            </div>

            {/* Buttons Column */}
            {countMode ? (
              <div className="flex items-center gap-3 bg-surface-2/45 p-2 rounded-lg border border-border/40 shrink-0" onClick={e => e.stopPropagation()}>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Expected</p>
                  <p className="font-bold text-sm text-foreground">{p.quantity}</p>
                </div>
                <div className="w-16">
                  <p className="text-[10px] text-muted-foreground">Actual</p>
                  <input
                    type="number"
                    value={auditCounts[p.id] ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '') {
                        const next = { ...auditCounts };
                        delete next[p.id];
                        setAuditCounts(next);
                      } else {
                        setAuditCounts({ ...auditCounts, [p.id]: Number(val) });
                      }
                    }}
                    placeholder="--"
                    className="w-full p-1 text-center text-xs font-semibold rounded bg-surface-3 border border-border text-foreground focus:outline-none focus:border-warning"
                  />
                </div>
                <div className="text-center min-w-[48px]">
                  <p className="text-[10px] text-muted-foreground">Variance</p>
                  {auditCounts[p.id] !== undefined ? (
                    (() => {
                      const expected = p.quantity;
                      const actual = auditCounts[p.id];
                      const diff = actual - expected;
                      const color = diff === 0 ? 'text-success' : diff > 0 ? 'text-blue-400' : 'text-destructive';
                      const sign = diff > 0 ? '+' : '';
                      return <p className={`font-bold text-xs ${color}`}>{sign}{diff}</p>;
                    })()
                  ) : (
                    <p className="text-xs text-muted-foreground font-semibold">--</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setScanForProduct(p)}
                    title={p.barcode ? 'Re-scan barcode' : 'Scan barcode to save'}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
                      p.barcode
                        ? 'bg-success/10 border-success/30 text-success hover:bg-success/20'
                        : 'bg-surface-2 border-border/80 text-muted-foreground hover:text-foreground hover:bg-surface-3'
                    }`}
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedBarcodeProduct(p)}
                    title="View / Generate barcode labels"
                    className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${
                      p.barcode
                        ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20'
                        : 'bg-surface-2 border-border/80 text-muted-foreground hover:text-foreground hover:bg-surface-3'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => addToShoppingList(p)}
                    title="Add to shopping list"
                    className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all relative ${
                      inList
                        ? 'bg-primary/20 border-primary/30 text-primary hover:bg-primary/30'
                        : 'bg-surface-2 border-border/80 text-muted-foreground hover:text-foreground hover:bg-surface-3'
                    }`}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    {inList && (
                      <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] font-black rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 shadow-sm border border-background">
                        {inList.quantity}
                      </span>
                    )}
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setRestockProduct(p); setRestockQty(''); setSingleRestockFunding('balance'); setShowRestockConfirm(false); }}
                    className="w-9 h-9 rounded-xl bg-surface-2 border border-border/80 flex items-center justify-center text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all"
                    title="Restock"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { setSelectedTransferProduct(p); setTransferQty(''); setTransferDestCode(''); }}
                    className="w-9 h-9 rounded-xl bg-surface-2 border border-border/80 flex items-center justify-center text-yellow-500 hover:bg-yellow-500/10 hover:border-yellow-500/30 transition-all"
                    title="Transfer stock to sister store"
                  >
                    <Truck className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditFor(p)}
                    className="w-9 h-9 rounded-xl bg-surface-2 border border-border/80 flex items-center justify-center text-yellow-500 hover:bg-yellow-500/10 hover:border-yellow-500/30 transition-all"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    className="w-9 h-9 rounded-xl bg-surface-2 border border-border/80 flex items-center justify-center text-red-500 hover:bg-red-500/10 hover:border-red-500/30 transition-all"
                    title="Delete"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {products.length === 0 && (
        <p className="text-center text-muted-foreground py-8">No products found</p>
      )}
    </div>
  );
}
