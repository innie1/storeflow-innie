import { useState, useRef } from 'react';
import { StoreData, Product } from '@/types/store';
import { updateProduct, addProduct, recordSale, saveStore } from '@/lib/store-data';
import { showToast } from '@/components/Toast';
import { supabase } from '@/integrations/supabase/client';

interface ScannedItem {
  name: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  category: string;
}

interface ReceiptScannerProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  onClose: () => void;
}

export default function ReceiptScanner({ store, onUpdate, onClose }: ReceiptScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return showToast('Please upload an image file', 'error');
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Convert to base64
    setScanning(true);
    setError(null);
    setItems([]);

    try {
      const base64 = await fileToBase64(file);

      const { data, error: fnError } = await supabase.functions.invoke('scan-receipt', {
        body: { imageBase64: base64 },
      });

      if (fnError) throw new Error(fnError.message || 'Scan failed');
      if (data?.error) throw new Error(data.error);

      if (data?.items?.length > 0) {
        setItems(data.items);
        showToast(`Found ${data.items.length} items`);
      } else {
        setError('No items found in receipt. Try a clearer image.');
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      setError(err.message || 'Failed to scan receipt');
      showToast('Scan failed', 'error');
    } finally {
      setScanning(false);
    }
  };

  const updateItem = (index: number, field: keyof ScannedItem, value: string | number) => {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: typeof item[field] === 'number' ? Number(value) : value } : item
    ));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleStock = () => {
    let updated = { ...store };
    let stocked = 0;

    for (const item of items) {
      // Find existing product by name (case-insensitive)
      const existing = updated.products.find(
        p => p.name.toLowerCase() === item.name.toLowerCase()
      );

      if (existing) {
        // Increment quantity only
        updated = {
          ...updated,
          products: updated.products.map(p =>
            p.id === existing.id
              ? { ...p, quantity: p.quantity + item.quantity, costPrice: item.costPrice, sellingPrice: item.sellingPrice }
              : p
          ),
        };
      } else {
        // Add new product
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + stocked;
        updated = {
          ...updated,
          products: [...updated.products, { ...item, id }],
        };
      }
      stocked++;
    }

    // Save
    const { saveStore } = require('@/lib/store-data');
    saveStore(updated);
    onUpdate(updated);
    showToast(`${stocked} items stocked`);
    onClose();
  };

  const handleSell = () => {
    let updated = { ...store };
    let sold = 0;

    for (const item of items) {
      const existing = updated.products.find(
        p => p.name.toLowerCase() === item.name.toLowerCase()
      );

      if (existing && existing.quantity >= item.quantity) {
        updated = recordSale(updated, existing.id, item.quantity);
        sold++;
      } else if (existing) {
        showToast(`Not enough stock for ${item.name}`, 'error');
      } else {
        showToast(`${item.name} not in inventory`, 'error');
      }
    }

    if (sold > 0) {
      onUpdate(updated);
      showToast(`${sold} sales recorded`);
      onClose();
    }
  };

  const inputClass = "w-full p-1.5 rounded bg-surface-2 border border-border text-foreground focus:outline-none focus:border-primary text-xs";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl p-5 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-bold text-lg">📷 Scan Receipt</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>

        {/* Upload area */}
        {items.length === 0 && (
          <div className="space-y-3">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/40 transition-colors"
            >
              {preview ? (
                <img src={preview} alt="Receipt" className="max-h-40 mx-auto rounded-lg mb-2" />
              ) : (
                <div className="space-y-2">
                  <span className="text-4xl">📷</span>
                  <p className="text-sm text-muted-foreground">Tap to upload receipt image</p>
                  <p className="text-xs text-muted-foreground">Supports JPG, PNG, HEIC</p>
                </div>
              )}
              {scanning && (
                <div className="mt-3">
                  <div className="animate-pulse text-primary text-sm font-display">Scanning receipt...</div>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            {error && <p className="text-destructive text-sm text-center">{error}</p>}
          </div>
        )}

        {/* Results */}
        {items.length > 0 && (
          <div className="space-y-3">
            {preview && (
              <img src={preview} alt="Receipt" className="max-h-24 mx-auto rounded-lg opacity-60" />
            )}
            <p className="text-sm text-muted-foreground">{items.length} items found — edit before stocking or selling:</p>

            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {items.map((item, i) => (
                <div key={i} className="p-3 rounded-lg bg-surface-2 border border-border space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={item.name}
                      onChange={e => updateItem(i, 'name', e.target.value)}
                      className={`${inputClass} font-display font-semibold`}
                    />
                    <button onClick={() => removeItem(i)} className="text-destructive hover:text-destructive/80 text-lg shrink-0">✕</button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground">Cost</label>
                      <input
                        value={item.costPrice}
                        onChange={e => updateItem(i, 'costPrice', e.target.value)}
                        type="number"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Sell</label>
                      <input
                        value={item.sellingPrice}
                        onChange={e => updateItem(i, 'sellingPrice', e.target.value)}
                        type="number"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Qty</label>
                      <input
                        value={item.quantity}
                        onChange={e => updateItem(i, 'quantity', e.target.value)}
                        type="number"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground">Category</label>
                      <select
                        value={item.category}
                        onChange={e => updateItem(i, 'category', e.target.value)}
                        className={inputClass}
                      >
                        {['Groceries', 'Beverages', 'Toiletries', 'Snacks', 'Bakery', 'Baby', 'General'].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleStock}
                className="p-3 rounded-lg bg-primary text-primary-foreground font-display font-bold hover:opacity-90 transition-opacity"
              >
                📦 Stock Items
              </button>
              <button
                onClick={handleSell}
                className="p-3 rounded-lg bg-surface-3 border border-success/30 text-success font-display font-bold hover:bg-surface-2 transition-colors"
              >
                💰 Record Sales
              </button>
            </div>

            <button
              onClick={() => { setItems([]); setPreview(null); setError(null); }}
              className="w-full p-2 text-muted-foreground text-sm hover:text-foreground"
            >
              ← Scan another receipt
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
