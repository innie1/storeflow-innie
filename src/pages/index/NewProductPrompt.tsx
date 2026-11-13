import ScrollLock from '@/components/ScrollLock';
import type { IndexScreenReady } from './useIndexScreen';

/**
 * Offered when a scanned barcode matches nothing: add it as a new product.
 */
export default function NewProductPrompt({ s }: { s: IndexScreenReady }) {
  const { newProductPrompt, setNewProductPrompt, handleSaveNewProduct } = s;
  return (
    <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setNewProductPrompt(null)}><ScrollLock />
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-5 animate-slide-up space-y-3" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="font-display font-bold text-lg">New Product</h3>
          <p className="text-xs text-muted-foreground">Barcode <span className="font-mono text-primary">{newProductPrompt.barcode}</span> not found. Save it to your inventory.</p>
        </div>
        <input
          autoFocus
          placeholder="Product name"
          value={newProductPrompt.name}
          onChange={e => setNewProductPrompt({ ...newProductPrompt, name: e.target.value })}
          className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            placeholder="Cost price (₦)"
            value={newProductPrompt.costPrice}
            onChange={e => setNewProductPrompt({ ...newProductPrompt, costPrice: e.target.value })}
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
          />
          <input
            type="number"
            placeholder="Selling price (₦)"
            value={newProductPrompt.sellingPrice}
            onChange={e => setNewProductPrompt({ ...newProductPrompt, sellingPrice: e.target.value })}
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <input
          type="number"
          placeholder="Quantity"
          value={newProductPrompt.quantity}
          onChange={e => setNewProductPrompt({ ...newProductPrompt, quantity: e.target.value })}
          className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-primary"
        />
        <div className="flex gap-2">
          <button onClick={() => setNewProductPrompt(null)} className="flex-1 p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-display font-semibold">Cancel</button>
          <button onClick={handleSaveNewProduct} className="flex-1 p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold">Save Product</button>
        </div>
      </div>
    </div>
  );
}
