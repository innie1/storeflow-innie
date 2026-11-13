import { updateProduct, clearBackorder } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';
import ConfirmModal from '@/components/ConfirmModal';
import BarcodeScanner from '@/components/BarcodeScanner';
import SmartRestockEngine from '@/components/SmartRestockEngine';
import MyBuyLists from '@/components/MyBuyLists';
import { Search, Camera, ShoppingCart, ClipboardList } from 'lucide-react';
import { InventoryProps } from './inventory/model';
import Modal from './inventory/Modal';
import { useInventory } from './inventory/useInventory';
import InventoryActions from './inventory/InventoryActions';
import StockCountBar from './inventory/StockCountBar';
import ProductList from './inventory/ProductList';
import AddProductSheet from './inventory/AddProductSheet';
import EditProductSheet from './inventory/EditProductSheet';
import RestockSheet from './inventory/RestockSheet';
import PlannedRestocksSheet from './inventory/PlannedRestocksSheet';
import ImportProductsSheet from './inventory/ImportProductsSheet';
import MassEditSheet from './inventory/MassEditSheet';
import ProductBarcodeSheet from './inventory/ProductBarcodeSheet';
import TransferStockSheet from './inventory/TransferStockSheet';
import ProductDetailSheet from './inventory/ProductDetailSheet';
import BarcodeNotFoundSheet from './inventory/BarcodeNotFoundSheet';
import MassDeleteSheet from './inventory/MassDeleteSheet';
import DuplicateMergeSheet from './inventory/DuplicateMergeSheet';
import DuplicateReviewSheet from './inventory/DuplicateReviewSheet';

export default function Inventory(props: InventoryProps) {
  const s = useInventory(props);
  const {
    store, onUpdate, filterLowStock, onClearFilter, selectedDetailProduct, setSelectedDetailProduct,
    focusGroup, setFocusGroup, search, setSearch, pendingBackorderClear, setPendingBackorderClear,
    pendingMassEditDelete, setPendingMassEditDelete, selectedProductIds, showSelectedDeleteModal,
    setShowSelectedDeleteModal, showAddModal, editProduct, editDraft, setEditDraft, restockProduct,
    showImportModal, setNewProduct, highConfidencePair, mediumConfidencePairs, showMediumReviews,
    setShowMediumReviews, shoppingList, showShoppingList, setShowShoppingList, showBuyLists,
    setShowBuyLists, confirmDelete, setConfirmDelete, scanForProduct, setScanForProduct,
    showMassDeleteModal, countMode, setCountMode, showAuditHistory, setShowAuditHistory,
    showPlannedRestocks, setShowPlannedRestocks, selectedBarcodeProduct, globalScannerOpen,
    setGlobalScannerOpen, notFoundBarcode, setNotFoundBarcode, scanForNewProduct,
    setScanForNewProduct, scanForEditProduct, setScanForEditProduct, selectedTransferProduct,
    showDiscontinued, setShowDiscontinued, massEditItems, setMassEditItems, doDelete,
    handleDeleteSelected, clearList,
  } = s;

  return (
    <div className="animate-fade-in">
      {mediumConfidencePairs.length > 0 && (
        <div className="flex items-center justify-between p-3.5 bg-yellow-500/5 border border-yellow-500/30 text-yellow-500 text-xs rounded-xl shadow-sm mb-4">
          <span className="font-semibold flex items-center gap-1.5 text-foreground">
            <span className="text-yellow-500">🔍</span>
            <span>
              <span className="text-yellow-500 font-bold">{mediumConfidencePairs.length} similar</span> product{mediumConfidencePairs.length > 1 ? 's' : ''} found for review.
            </span>
          </span>
          <button
            onClick={() => setShowMediumReviews(true)}
            className="px-3.5 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black font-display font-bold text-[10px] rounded-full transition shadow-sm cursor-pointer whitespace-nowrap"
          >
            Review Now
          </button>
        </div>
      )}

      {/* Row 1: Search & Discontinued Toggle */}
      <div className="flex gap-2.5 mb-4">
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">
            <Search className="w-4 h-4" />
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-yellow-500/50 text-sm transition-all"
          />
          <button
            type="button"
            onClick={() => setGlobalScannerOpen(true)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-yellow-500 transition-colors cursor-pointer"
            title="Scan product barcode / QR"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setShowDiscontinued(!showDiscontinued)}
          className={`px-4 py-2.5 rounded-xl text-sm font-display font-bold border transition-all cursor-pointer whitespace-nowrap ${
            showDiscontinued
              ? 'bg-destructive/10 border-destructive/30 text-destructive shadow-sm'
              : 'bg-surface-2 border-border text-foreground hover:bg-surface-3'
          }`}
        >
          Discontinued
        </button>
      </div>

      {/* Row 2: 5 Action Buttons */}
      <InventoryActions s={s} />

      {/* Row 3: Planned Restocks & Count Audit */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button
          onClick={() => setShowPlannedRestocks(true)}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-2 border border-yellow-500/20 text-yellow-500 font-display font-bold text-xs hover:bg-surface-3 active:scale-95 transition-all relative cursor-pointer"
        >
          <div className="text-base shrink-0 flex items-center">
            <div className="relative w-5 h-5 bg-foreground rounded overflow-hidden flex flex-col items-center border border-border">
              <div className="w-full h-1.5 bg-red-500" />
              <span className="text-[9px] font-bold text-background leading-none mt-0.5">17</span>
            </div>
          </div>
          <span>Planned Restocks</span>
          {(store.plannedRestocks || []).length > 0 && (
            <span className="bg-yellow-500 text-black text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 animate-pulse">
              {(store.plannedRestocks || []).length}
            </span>
          )}
        </button>

        <button
          onClick={() => setCountMode(true)}
          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-surface-2 border border-yellow-500/20 text-yellow-500 font-display font-bold text-xs hover:bg-surface-3 active:scale-95 transition-all cursor-pointer"
        >
          <span className="text-base shrink-0">📋</span>
          <span>Count Audit</span>
        </button>
      </div>

      {/* Every buy list the shop has made, next to where restocking happens.
          MyBuyLists was already built — search, import code, share — and
          nothing in the app opened it, so a list created by Auto Fix or by
          approving a buy list could only be found by going to Flow, opening
          Advice and scrolling to a link at the very bottom. */}
      {(store.purchaseOrders || []).length > 0 && (
        <button
          onClick={() => setShowBuyLists(true)}
          className="w-full mb-4 flex items-center justify-between gap-2 py-3 px-4 rounded-xl bg-surface-2 border border-border/80 hover:bg-surface-3 active:scale-[0.99] transition-all cursor-pointer"
        >
          <span className="flex items-center gap-2 min-w-0">
            <ClipboardList className="w-4 h-4 text-primary shrink-0" />
            <span className="font-display font-bold text-xs text-foreground">My Buy Lists</span>
            <span className="text-[11px] text-muted-foreground truncate">codes, sharing and history</span>
          </span>
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
            {(store.purchaseOrders || []).length}
          </span>
        </button>
      )}

      {countMode && <StockCountBar s={s} />}

      {filterLowStock && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-warning text-sm">⚠ Showing low stock items only</span>
          <button onClick={onClearFilter} className="text-primary text-sm underline">Show all</button>
        </div>
      )}

      {/* Says why the list is short. A filter with nothing explaining it is
          how a screen starts feeling broken. */}
      {focusGroup && (
        <div className="mb-3 flex items-center justify-between gap-2 p-3 rounded-xl bg-primary/5 border border-primary/25">
          <div className="min-w-0">
            <p className="text-xs font-display font-bold text-primary truncate">{focusGroup.label}</p>
            <p className="text-[11px] text-muted-foreground">Showing just these {focusGroup.ids.length}, sent from Flow's advice.</p>
          </div>
          <button
            onClick={() => setFocusGroup(null)}
            className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-display font-bold border border-border bg-surface-2 hover:bg-surface-3"
          >
            Show all
          </button>
        </div>
      )}

      {/* Shopping Cart Summary Bar — visible when cart has items */}
      {shoppingList.length > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-surface-1 border border-yellow-500/30 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <ShoppingCart className="w-5 h-5 text-yellow-500" />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-yellow-500 text-black text-[9px] font-black flex items-center justify-center shadow">
                {shoppingList.reduce((s, i) => s + i.quantity, 0)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-display font-bold text-foreground truncate">
                {shoppingList.length} item{shoppingList.length !== 1 ? 's' : ''} in cart
              </p>
              <p className="text-[10px] text-muted-foreground">
                {shoppingList.map(i => i.name).join(', ').length > 40
                  ? shoppingList.map(i => i.name).join(', ').slice(0, 40) + '…'
                  : shoppingList.map(i => i.name).join(', ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowShoppingList(true)}
              className="px-3 py-1.5 rounded-xl bg-yellow-500 text-black font-display font-bold text-[11px] hover:brightness-105 transition-all active:scale-95 cursor-pointer"
            >
              View Cart
            </button>
            <button
              onClick={() => {
                clearList();
              }}
              className="px-3 py-1.5 rounded-xl bg-surface-2 border border-destructive/30 text-destructive font-display font-bold text-[11px] hover:bg-destructive/10 transition-all active:scale-95 cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <ProductList s={s} />

      {showSelectedDeleteModal && (
        <Modal title="Delete Selected Products" onClose={() => setShowSelectedDeleteModal(false)}>
          <div className="space-y-4 text-left">
            <p className="text-sm text-foreground">
              Are you sure you want to delete the <strong>{selectedProductIds.length}</strong> selected product(s) from your inventory?
            </p>
            <div className="p-3 bg-surface-2 border border-border rounded-xl max-h-40 overflow-y-auto no-scrollbar space-y-1">
              {selectedProductIds.map(id => {
                const p = store.products.find(prod => prod.id === id);
                return p ? (
                  <div key={id} className="text-xs text-foreground flex items-center justify-between">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">{p.category}</span>
                  </div>
                ) : null;
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSelectedDeleteModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-2 border border-border font-display font-semibold text-xs text-center cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelected}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-white font-display font-bold text-xs text-center cursor-pointer"
              >
                Delete Selected
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Modal */}
      {showAddModal && <AddProductSheet s={s} />}


      {/* Edit Modal */}
      {editProduct && editDraft && <EditProductSheet s={s} />}


      {/* Restock Modal */}
      {restockProduct && <RestockSheet s={s} />}

      {/* Planned Restocks Modal */}
      {showPlannedRestocks && <PlannedRestocksSheet s={s} />}

      {/* Import Modal */}
      {showImportModal && <ImportProductsSheet s={s} />}

      {/* Mass Edit Modal */}
      {massEditItems && <MassEditSheet s={s} />}


      {/* Shopping List Modal */}
      {showBuyLists && (
        <MyBuyLists store={store} onClose={() => setShowBuyLists(false)} />
      )}

      {showShoppingList && (
        <SmartRestockEngine
          store={store}
          onUpdate={onUpdate}
          onClose={() => setShowShoppingList(false)}
        />
      )}

      {showAuditHistory && (
        <Modal title="Stock Count Audits" onClose={() => setShowAuditHistory(false)}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground text-left">
              Recent discrepancy adjustments logged from shelf counts.
            </p>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {(store.stockCountAudits || []).map(audit => (
                <div key={audit.id} className="p-2.5 rounded-lg bg-surface-2 border border-border text-xs flex justify-between items-center">
                  <div className="text-left">
                    <p className="font-semibold text-foreground">{audit.product}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(audit.date).toLocaleString('en-GB')}</p>
                  </div>
                  <div className="text-right font-mono">
                    <p className="text-muted-foreground">Exp: {audit.expected} | Act: {audit.actual}</p>
                    <p className={`font-bold ${audit.variance === 0 ? 'text-success' : audit.variance > 0 ? 'text-blue-400' : 'text-destructive'}`}>
                      Var: {audit.variance > 0 ? '+' : ''}{audit.variance}
                    </p>
                  </div>
                </div>
              ))}
              {(!store.stockCountAudits || store.stockCountAudits.length === 0) && (
                <p className="text-center text-muted-foreground py-6 text-xs">No audits logged yet.</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {selectedBarcodeProduct && <ProductBarcodeSheet s={s} />}

      {selectedTransferProduct && <TransferStockSheet s={s} />}

      {selectedDetailProduct && <ProductDetailSheet s={s} />}

      {confirmDelete && (
        <ConfirmAccessCode
          expectedCode={store.accessCode}
          title={`Delete "${confirmDelete.name}"?`}
          message="Archive this product? It will no longer be available for sale. Stock and financial history will be kept. Enter your store access code to confirm."
          confirmLabel="Delete Product"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {globalScannerOpen && (
        <BarcodeScanner
          title="Global Barcode Search"
          subtitle="Point at a product barcode or StoreFlow QR code"
          onClose={() => setGlobalScannerOpen(false)}
          onDetected={(code) => {
            setGlobalScannerOpen(false);
            let targetId = code;
            if (code.includes('/product/')) {
              const parts = code.split('/product/');
              targetId = parts[parts.length - 1];
            }
            const matching = store.products.find(p => p.barcode === targetId || p.id === targetId);
            if (matching) {
              setSelectedDetailProduct(matching);
              showToast(`✓ Scanned: ${matching.name}`);
            } else {
              setNotFoundBarcode(targetId);
            }
          }}
        />
      )}

      {notFoundBarcode && <BarcodeNotFoundSheet s={s} />}

      {scanForProduct && (
        <BarcodeScanner
          title={`Scan barcode for: ${scanForProduct.name}`}
          subtitle="Hold the product's barcode steady inside the frame"
          onClose={() => setScanForProduct(null)}
          onDetected={(code) => {
            const existing = store.products.find(p => p.barcode === code && p.id !== scanForProduct.id);
            if (existing) {
              showToast(`Already linked to ${existing.name}`, 'error');
              setScanForProduct(null);
              return;
            }
            const updated = updateProduct(store, scanForProduct.id, { barcode: code });
            onUpdate(updated);
            showToast(`✓ Saved barcode for ${scanForProduct.name}`);
            setScanForProduct(null);
          }}
        />
      )}

      {scanForNewProduct && (
        <BarcodeScanner
          title="Scan barcode for new product"
          subtitle="Point at the barcode on the item"
          onClose={() => setScanForNewProduct(false)}
          onDetected={(code) => {
            setNewProduct(prev => ({ ...prev, barcode: code }));
            setScanForNewProduct(false);
            showToast(`✓ Scanned barcode: ${code}`);
          }}
        />
      )}

      {scanForEditProduct && (
        <BarcodeScanner
          title="Scan barcode for product"
          subtitle="Point at the barcode on the item"
          onClose={() => setScanForEditProduct(false)}
          onDetected={(code) => {
            setEditDraft(prev => prev ? ({ ...prev, barcode: code }) : null);
            setScanForEditProduct(false);
            showToast(`✓ Scanned barcode: ${code}`);
          }}
        />
      )}

      {showMassDeleteModal && <MassDeleteSheet s={s} />}
      {highConfidencePair && <DuplicateMergeSheet s={s} />}

      {showMediumReviews && <DuplicateReviewSheet s={s} />}

      <ConfirmModal
        isOpen={Boolean(pendingBackorderClear)}
        title="Clear Owed Backorder?"
        description={pendingBackorderClear ? `Are you sure you want to clear the ${pendingBackorderClear.backorderedQty || 0} owed units for ${pendingBackorderClear.name}? This writes off the debt without changing stock.` : ''}
        confirmText="Clear Debt"
        cancelText="Cancel"
        variant="warning"
        icon="📦"
        onConfirm={() => {
          if (pendingBackorderClear) {
            onUpdate(clearBackorder(store, pendingBackorderClear.id));
            showToast(`Cleared owed units for ${pendingBackorderClear.name}`);
            setPendingBackorderClear(null);
          }
        }}
        onCancel={() => setPendingBackorderClear(null)}
      />

      <ConfirmModal
        isOpen={Boolean(pendingMassEditDelete)}
        title="Delete Product?"
        description={pendingMassEditDelete ? `Are you sure you want to delete ${pendingMassEditDelete.name}?` : ''}
        confirmText="Delete Product"
        cancelText="Cancel"
        variant="danger"
        icon="🗑️"
        onConfirm={() => {
          if (pendingMassEditDelete) {
            setMassEditItems(items => items.filter(item => item.id !== pendingMassEditDelete.id));
            showToast(`Removed ${pendingMassEditDelete.name}`, 'info');
            setPendingMassEditDelete(null);
          }
        }}
        onCancel={() => setPendingMassEditDelete(null)}
      />
    </div>
  );
}
