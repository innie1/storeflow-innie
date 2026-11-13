import { Pencil, Plus, Upload, Trash2, FileText } from 'lucide-react';
import { MassEditItem } from './model';
import type { InventoryState } from './useInventory';

/**
 * The row of five buttons under the search: add, scan, import, restock and more.
 */
export default function InventoryActions({ s }: { s: InventoryState }) {
  const {
    store, selectedProductIds, setShowSelectedDeleteModal, setShowAddModal, setNewProduct,
    setCustomCategoryActive, setCustomCategoryVal, setShowAddConfirm, setShowMassDeleteModal,
    setMassDeleteStep, setQuizAnswers, setQuizError, setConfirmText, setMassEditItems,
    openImportModal, generateBuyList,
  } = s;
  return (
    <div className="grid grid-cols-5 gap-1.5 mb-4">
      <button
        onClick={() => {
          setShowAddModal(true);
          setShowAddConfirm(false);
          // unit belongs in every reset: leaving it out let the next product
          // save with no unit at all instead of pcs.
          setNewProduct({ name: '', costPrice: '', sellingPrice: '', quantity: '', category: 'Groceries', unit: 'pcs', barcode: '', isCartonSingleEnabled: false, singlesPerCarton: '12', singleSellingPrice: '', sellAsSinglesByDefault: false });
          setCustomCategoryActive(false);
          setCustomCategoryVal('');
        }}
        className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-2xl bg-surface-2 border border-border/80 text-center cursor-pointer transition-all hover:bg-surface-3 active:scale-95"
      >
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-yellow-500 text-black flex items-center justify-center mb-1 sm:mb-1.5 shadow-sm">
          <Plus className="w-4 h-4 sm:w-5 sm:h-5 font-bold" />
        </div>
        <span className="text-[9px] sm:text-[10px] font-bold text-foreground font-display leading-tight">Add</span>
      </button>

      <button
        onClick={openImportModal}
        className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-2xl bg-surface-2 border border-border/80 text-center cursor-pointer transition-all hover:bg-surface-3 active:scale-95"
      >
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-surface-3 border border-border flex items-center justify-center mb-1 sm:mb-1.5">
          <Upload className="w-4 h-4 sm:w-5 sm:h-5 text-foreground" />
        </div>
        <span className="text-[9px] sm:text-[10px] font-bold text-foreground font-display leading-tight">Import</span>
      </button>

      <button
        onClick={() => {
          const nextItems: MassEditItem[] = store.products
            .filter(p => selectedProductIds.length === 0 || selectedProductIds.includes(p.id))
            .map(p => {
              const learned = (store.learnedProducts || []).find(
                lp => lp.id === p.id || lp.name.toLowerCase() === p.name.toLowerCase()
              );
              const purchaseUnit = learned?.purchaseUnit || (p.isCartonSingleEnabled ? 'Carton' : 'Piece');
              const sellingUnit = learned?.sellingUnit || (p.isCartonSingleEnabled ? 'Bottle' : 'Piece');
              const unitsPerPurchase = learned?.unitsPerPurchase || p.singlesPerCarton || 1;
              const purchasePrice = p.costPrice * unitsPerPurchase;
              const unitCostPrice = p.costPrice;
              const purchaseSellingPrice = p.sellingPrice;
              const sellingPrice = p.isCartonSingleEnabled ? (p.singleSellingPrice || Math.round(p.sellingPrice / unitsPerPurchase)) : p.sellingPrice;
              return {
                id: p.id,
                name: p.name,
                category: p.category || 'General',
                purchaseUnit,
                sellingUnit,
                unitsPerPurchase,
                purchasePrice,
                unitCostPrice,
                sellingPrice,
                purchaseSellingPrice,
                pricingMode: 'auto',
                selected: false,
                showMore: false
              };
            });
          setMassEditItems(nextItems);
        }}
        className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-2xl bg-surface-2 border border-border/80 text-center cursor-pointer transition-all hover:bg-surface-3 active:scale-95"
      >
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-surface-3 border border-border flex items-center justify-center mb-1 sm:mb-1.5">
          <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500" />
        </div>
        <span className="text-[9px] sm:text-[10px] font-bold text-foreground font-display leading-tight">Mass Edit</span>
      </button>

      <button
        onClick={() => {
          if (selectedProductIds.length > 0) {
            setShowSelectedDeleteModal(true);
          } else {
            setShowMassDeleteModal(true);
            setMassDeleteStep(1);
            setQuizAnswers({ q1: '', q2: '', q3: '' });
            setQuizError('');
            setConfirmText('');
          }
        }}
        className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-2xl bg-surface-2 border border-destructive/30 text-center cursor-pointer transition-all hover:bg-destructive/5 active:scale-95"
        title={selectedProductIds.length > 0 ? "Delete selected products" : "Delete all products from inventory"}
      >
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-1 sm:mb-1.5">
          <Trash2 className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-destructive" />
        </div>
        <span className="text-[9px] sm:text-[10px] font-bold text-destructive font-display leading-tight">Delete</span>
      </button>

      <button
        onClick={() => { generateBuyList(); }}
        className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-2xl bg-surface-2 border border-border/80 text-center cursor-pointer transition-all hover:bg-surface-3 active:scale-95"
        title="Auto-generate buy list from low/out-of-stock items"
      >
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-surface-3 border border-border flex items-center justify-center mb-1 sm:mb-1.5">
          <FileText className="w-3.5 h-3.5 sm:w-4.5 sm:h-4.5 text-foreground" />
        </div>
        <span className="text-[9px] sm:text-[10px] font-bold text-foreground font-display leading-tight">Buy List</span>
      </button>
    </div>
  );
}
