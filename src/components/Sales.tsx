import { useState } from 'react';
import { StoreData } from '@/types/store';
import { recordSale, getTopSellers } from '@/lib/store-data';
import { showToast } from '@/components/Toast';

interface SalesProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

export default function Sales({ store, onUpdate }: SalesProps) {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [search, setSearch] = useState('');

  const topSellerIds = new Set(getTopSellers(store, 100).map(t => {
    const p = store.products.find(p => p.name === t.name);
    return p?.id;
  }).filter(Boolean));

  const sortedProducts = [...store.products].sort((a, b) => {
    const aTop = topSellerIds.has(a.id) ? 0 : 1;
    const bTop = topSellerIds.has(b.id) ? 0 : 1;
    return aTop - bTop || a.name.localeCompare(b.name);
  }).filter(p => p.quantity > 0);

  const filteredProducts = sortedProducts.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const selected = store.products.find(p => p.id === selectedProduct);

  const handleSale = () => {
    if (!selectedProduct) return showToast('Select a product', 'error');
    const qty = Number(quantity);
    if (qty < 1) return showToast('Invalid quantity', 'error');
    if (selected && qty > selected.quantity) return showToast('Not enough stock', 'error');
    const updated = recordSale(store, selectedProduct, qty);
    onUpdate(updated);
    setSelectedProduct('');
    setQuantity('1');
    setSearch('');
    showToast(`Sale recorded: ${selected?.name} × ${qty}`);
  };

  return (
    <div className="animate-fade-in max-w-md mx-auto">
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h3 className="font-display font-bold text-lg text-center">Record Sale</h3>

        {/* Search */}
        <div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search products..."
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
          />
        </div>
        
        <div>
          <label className="block text-sm text-muted-foreground mb-1">Product</label>
          <select
            value={selectedProduct}
            onChange={e => setSelectedProduct(e.target.value)}
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
          >
            <option value="">Select product...</option>
            {filteredProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name} (₦{p.sellingPrice.toLocaleString()} — {p.quantity} left)</option>
            ))}
          </select>
          {search && (
            <p className="text-xs text-muted-foreground mt-1">{filteredProducts.length} result{filteredProducts.length !== 1 ? 's' : ''}</p>
          )}
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">Quantity</label>
          <input
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            type="number"
            min="1"
            max={selected?.quantity || 999}
            className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground focus:outline-none focus:border-primary text-sm"
          />
        </div>

        {selected && (
          <div className="p-3 rounded-lg bg-surface-2 border border-primary/20 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Unit Price:</span>
              <span className="text-primary">₦{selected.sellingPrice.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total:</span>
              <span className="text-primary font-bold">₦{(selected.sellingPrice * Number(quantity || 0)).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Profit:</span>
              <span className="text-success">₦{((selected.sellingPrice - selected.costPrice) * Number(quantity || 0)).toLocaleString()}</span>
            </div>
          </div>
        )}

        <button onClick={handleSale} className="w-full p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold text-lg hover:opacity-90 transition-opacity">
          Record Sale
        </button>
      </div>
    </div>
  );
}