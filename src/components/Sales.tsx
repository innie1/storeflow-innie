import { useState, useRef } from 'react';
import { StoreData, Sale } from '@/types/store';
import { recordSale, getTopSellers } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { supabase } from '@/integrations/supabase/client';
import SaleReceipt from '@/components/SaleReceipt';

interface SalesProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
}

export default function Sales({ store, onUpdate }: SalesProps) {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [search, setSearch] = useState('');
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{ name: string; quantity: number }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const doSale = (productId: string, qty: number): Sale | null => {
    const product = store.products.find(p => p.id === productId);
    if (!product || product.quantity < qty) return null;
    const updated = recordSale(store, productId, qty);
    onUpdate(updated);
    // Return the latest sale
    return updated.sales[0];
  };

  const handleQuickSell = (productId: string) => {
    const product = store.products.find(p => p.id === productId);
    if (!product || product.quantity < 1) return showToast('Out of stock', 'error');
    const sale = doSale(productId, 1);
    if (sale) {
      setLastSale(sale);
      showToast(`Quick sale: ${product.name} × 1`);
    }
  };

  const handleSale = () => {
    if (!selectedProduct) return showToast('Select a product', 'error');
    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) return showToast('Quantity must be greater than 0', 'error');
    if (selected && qty > selected.quantity) return showToast('Not enough stock', 'error');
    const sale = doSale(selectedProduct, qty);
    if (sale) {
      setLastSale(sale);
      setSelectedProduct('');
      setQuantity('1');
      setSearch('');
      showToast(`Sale recorded: ${selected?.name} × ${qty}`);
    }
  };

  // Scan to sell
  const handleScanToSell = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return showToast('Upload an image', 'error');

    setScanning(true);
    setScanResults([]);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: { imageBase64: base64 },
      });

      if (error) throw new Error(error.message);
      if (!data?.items?.length) {
        showToast('No items found', 'error');
        return;
      }

      // Match scanned items to inventory and sell
      let updated = store;
      let sold = 0;
      for (const item of data.items) {
        const match = updated.products.find(
          p => p.name.toLowerCase() === item.name.toLowerCase()
        );
        if (match && match.quantity >= (item.quantity || 1)) {
          updated = recordSale(updated, match.id, item.quantity || 1);
          sold++;
        }
      }

      if (sold > 0) {
        onUpdate(updated);
        setLastSale(updated.sales[0]);
        showToast(`${sold} items sold from scan`);
      } else {
        showToast('No matching products in stock', 'error');
      }
    } catch (err: any) {
      showToast('Scan failed: ' + (err.message || ''), 'error');
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="animate-fade-in max-w-md mx-auto space-y-4">
      {/* Scan to Sell */}
      <div className="bg-card border border-border rounded-xl p-4">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 text-primary font-display font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {scanning ? (
            <span className="animate-pulse">Scanning...</span>
          ) : (
            <>📷 Scan Item to Sell</>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleScanToSell}
          className="hidden"
        />
        <p className="text-xs text-muted-foreground text-center mt-2">Upload a receipt/item image to auto-sell matching products</p>
      </div>

      {/* Manual Sale */}
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

        {/* Quick-sell results */}
        {search && filteredProducts.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {filteredProducts.slice(0, 8).map(p => (
              <button
                key={p.id}
                onClick={() => handleQuickSell(p.id)}
                className="w-full flex items-center justify-between p-2.5 rounded-lg bg-surface-2 border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors text-sm group"
              >
                <div className="text-left">
                  <span className="text-foreground font-medium">{p.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">({p.quantity} left)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-primary font-semibold">₦{p.sellingPrice.toLocaleString()}</span>
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md font-display font-semibold group-hover:bg-primary group-hover:text-primary-foreground transition-colors">+1</span>
                </div>
              </button>
            ))}
            <p className="text-xs text-muted-foreground text-center pt-1">Tap to quick-sell 1 unit</p>
          </div>
        )}
        {search && filteredProducts.length === 0 && (
          <p className="text-xs text-muted-foreground text-center">No products found</p>
        )}

        {/* Manual sale section */}
        <div className="border-t border-border pt-4">
          <label className="block text-sm text-muted-foreground mb-1">Or select for custom quantity</label>
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
        </div>

        <div>
          <label className="block text-sm text-muted-foreground mb-1">Quantity</label>
          <input
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            type="number"
            step="any"
            min="0.01"
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

      {/* Receipt Modal */}
      {lastSale && (
        <SaleReceipt
          store={store}
          sale={lastSale}
          onClose={() => setLastSale(null)}
        />
      )}
    </div>
  );
}
