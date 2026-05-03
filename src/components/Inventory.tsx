import { useState } from 'react';
import { StoreData, Product } from '@/types/store';
import { addProduct, updateProduct, deleteProduct, importProducts, receiveStock, RestockFunding } from '@/lib/store-data';
import { getLowStockThreshold } from '@/lib/settings';
import { showToast } from '@/components/Toast';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';
import BarcodeScanner from '@/components/BarcodeScanner';

interface InventoryProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  filterLowStock?: boolean;
  onClearFilter?: () => void;
}

interface ShoppingListItem {
  productId: string;
  name: string;
  quantity: number;
  category: string;
}

export default function Inventory({ store, onUpdate, filterLowStock, onClearFilter }: InventoryProps) {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [newProduct, setNewProduct] = useState({ name: '', costPrice: '', sellingPrice: '', quantity: '', category: '' });
  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [receiveMode, setReceiveMode] = useState(false);
  const [receiveData, setReceiveData] = useState<Record<string, { qty: string; cost: string }>>({});
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [scanForProduct, setScanForProduct] = useState<Product | null>(null);
  const [funding, setFunding] = useState<RestockFunding>('balance');
  const [singleRestockFunding, setSingleRestockFunding] = useState<RestockFunding>('balance');

  const lowThreshold = getLowStockThreshold();
  let products = store.products;
  if (filterLowStock) products = products.filter(p => p.quantity <= lowThreshold);
  if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = () => {
    if (!newProduct.name || !newProduct.costPrice || !newProduct.sellingPrice || !newProduct.quantity) {
      return showToast('Fill all required fields', 'error');
    }
    const updated = addProduct(store, {
      name: newProduct.name,
      costPrice: Number(newProduct.costPrice),
      sellingPrice: Number(newProduct.sellingPrice),
      quantity: Number(newProduct.quantity),
      category: newProduct.category || 'General',
    });
    onUpdate(updated);
    setNewProduct({ name: '', costPrice: '', sellingPrice: '', quantity: '', category: '' });
    setShowAddModal(false);
    showToast('Product added');
  };

  const handleEdit = () => {
    if (!editProduct) return;
    const updated = updateProduct(store, editProduct.id, editProduct);
    onUpdate(updated);
    setEditProduct(null);
    showToast('Product updated');
  };

  const handleDelete = (p: Product) => {
    setConfirmDelete(p);
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    onUpdate(deleteProduct(store, confirmDelete.id));
    setConfirmDelete(null);
    showToast('Product deleted');
  };

  const handleRestock = () => {
    if (!restockProduct || !restockQty) return;
    const qty = Number(restockQty);
    if (qty <= 0) return showToast('Enter a quantity', 'error');
    const updated = receiveStock(
      store,
      [{ productId: restockProduct.id, quantity: qty, costPrice: restockProduct.costPrice }],
      singleRestockFunding,
    );
    onUpdate(updated);
    setRestockProduct(null);
    setRestockQty('');
    setSingleRestockFunding('balance');
    showToast(singleRestockFunding === 'new_money' ? 'Stock added (new money)' : 'Stock added (from balance)');
  };

  const handleImport = () => {
    try {
      const lines = importText.trim().split('\n').filter(Boolean);
      const imported: { name: string; costPrice: number; sellingPrice: number; quantity: number; category: string }[] = [];
      for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length < 4) continue;
        imported.push({
          name: parts[0],
          costPrice: Number(parts[1]),
          sellingPrice: Number(parts[2]),
          quantity: Number(parts[3]),
          category: parts[4] || 'General',
        });
      }
      if (imported.length === 0) return showToast('No valid products found', 'error');
      onUpdate(importProducts(store, imported));
      setShowImportModal(false);
      setImportText('');
      showToast(`${imported.length} products imported`);
    } catch {
      showToast('Import failed — check format', 'error');
    }
  };

  const addToShoppingList = (p: Product) => {
    const existing = shoppingList.find(i => i.productId === p.id);
    if (existing) {
      setShoppingList(shoppingList.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i));
      showToast(`${p.name} qty +1`);
    } else {
      setShoppingList([...shoppingList, { productId: p.id, name: p.name, quantity: 1, category: p.category }]);
      showToast(`${p.name} added to list`);
    }
  };

  const updateListQty = (productId: string, qty: number) => {
    if (qty <= 0) return removeFromList(productId);
    setShoppingList(shoppingList.map(i => i.productId === productId ? { ...i, quantity: qty } : i));
  };

  const removeFromList = (productId: string) => {
    setShoppingList(shoppingList.filter(i => i.productId !== productId));
  };

  const clearList = () => {
    if (shoppingList.length === 0) return;
    if (!confirm('Clear shopping list?')) return;
    setShoppingList([]);
    showToast('List cleared');
  };

  const generateListText = () => {
    const storeName = store.storeName || 'Store';
    const date = new Date().toLocaleDateString('en-GB');
    let text = `🛒 *SHOPPING LIST*\n${storeName}\n${date}\n\n`;
    shoppingList.forEach((item, idx) => {
      text += `${idx + 1}. ${item.name} — *${item.quantity}* ${item.category ? `(${item.category})` : ''}\n`;
    });
    text += `\n_Total items: ${shoppingList.length}_`;
    return text;
  };

  const handleCopyList = async () => {
    if (shoppingList.length === 0) return showToast('List is empty', 'error');
    try {
      await navigator.clipboard.writeText(generateListText());
      showToast('List copied to clipboard');
    } catch {
      showToast('Copy failed', 'error');
    }
  };

  const handleShareWhatsApp = () => {
    if (shoppingList.length === 0) return showToast('List is empty', 'error');
    const text = encodeURIComponent(generateListText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleShareSystem = async () => {
    if (shoppingList.length === 0) return showToast('List is empty', 'error');
    const text = generateListText();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Shopping List', text });
      } catch {
        // user cancelled
      }
    } else {
      handleCopyList();
    }
  };

  const handleStartReceive = () => {
    const initial: Record<string, { qty: string; cost: string }> = {};
    shoppingList.forEach(item => {
      const product = store.products.find(p => p.id === item.productId);
      initial[item.productId] = {
        qty: String(item.quantity),
        cost: String(product?.costPrice ?? ''),
      };
    });
    setReceiveData(initial);
    setReceiveMode(true);
  };

  const handleConfirmReceive = () => {
    const entries = shoppingList
      .map(item => {
        const data = receiveData[item.productId];
        if (!data) return null;
        const qty = Number(data.qty);
        const cost = Number(data.cost);
        if (!qty || qty <= 0) return null;
        return { productId: item.productId, quantity: qty, costPrice: cost > 0 ? cost : 0 };
      })
      .filter((e): e is { productId: string; quantity: number; costPrice: number } => e !== null);

    if (entries.length === 0) return showToast('Add quantities to confirm', 'error');

    const updated = receiveStock(store, entries, funding);
    onUpdate(updated);
    setShoppingList([]);
    setReceiveData({});
    setReceiveMode(false);
    setShowShoppingList(false);
    setFunding('balance');
    showToast(`Restocked ${entries.length} item${entries.length > 1 ? 's' : ''} ${funding === 'new_money' ? '(new money)' : '(from balance)'}`);
  };

  const inputClass = "w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm";

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products..."
          className="flex-1 min-w-[200px] p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm"
        />
        <button onClick={() => setShowAddModal(true)} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90">
          + Add
        </button>
        <button onClick={() => setShowImportModal(true)} className="px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-display font-semibold hover:bg-surface-3 border border-border">
          Import
        </button>
        <button
          onClick={() => setShowShoppingList(true)}
          className="relative px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-display font-semibold hover:bg-surface-3 border border-border"
        >
          🛒 List
          {shoppingList.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {shoppingList.length}
            </span>
          )}
        </button>
      </div>

      {filterLowStock && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-warning text-sm">⚠ Showing low stock items only</span>
          <button onClick={onClearFilter} className="text-primary text-sm underline">Show all</button>
        </div>
      )}

      <div className="space-y-2">
        {products.map(p => {
          const inList = shoppingList.find(i => i.productId === p.id);
          return (
            <div key={p.id} className={`p-3 rounded-lg bg-card border flex flex-wrap items-center gap-3 transition-colors ${p.barcode ? 'border-success/40 ring-1 ring-success/20' : 'border-border hover:border-primary/20'}`}>
              <div className="flex-1 min-w-[150px]">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-display font-semibold text-sm">{p.name}</p>
                  {p.addedAt && (Date.now() - new Date(p.addedAt).getTime()) < 7 * 24 * 60 * 60 * 1000 && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-bold">New</span>
                  )}
                  {p.barcode && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-bold" title={`Barcode: ${p.barcode}`}>✓ Scanned</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.category}
                  {p.addedAt && <span className="ml-1.5">• Added {new Date(p.addedAt).toLocaleDateString()}</span>}
                </p>
              </div>
              <div className="text-right text-xs space-y-0.5">
                <p>Cost: <span className="text-muted-foreground">₦{p.costPrice.toLocaleString()}</span></p>
                <p>Sell: <span className="text-primary">₦{p.sellingPrice.toLocaleString()}</span></p>
              </div>
              <div className={`text-center min-w-[60px] ${p.quantity <= lowThreshold ? 'text-destructive' : p.quantity <= lowThreshold * 3 ? 'text-warning' : 'text-success'}`}>
                <p className="text-lg font-bold">{p.quantity}</p>
                <p className="text-[10px] text-muted-foreground">in stock</p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setScanForProduct(p)}
                  title={p.barcode ? 'Re-scan barcode' : 'Scan barcode to save'}
                  className={`px-2 py-1 rounded text-xs hover:bg-surface-2 ${p.barcode ? 'bg-success/20 text-success' : 'bg-surface-3 text-foreground'}`}
                >
                  📷
                </button>
                <button
                  onClick={() => addToShoppingList(p)}
                  title="Add to shopping list"
                  className={`px-2 py-1 rounded text-xs hover:bg-surface-2 relative ${inList ? 'bg-primary/20 text-primary' : 'bg-surface-3 text-foreground'}`}
                >
                  🛒
                  {inList && (
                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                      {inList.quantity}
                    </span>
                  )}
                </button>
                <button onClick={() => { setRestockProduct(p); setRestockQty(''); setSingleRestockFunding('balance'); }} className="px-2 py-1 rounded bg-surface-3 text-xs hover:bg-surface-2 text-success">↑</button>
                <button onClick={() => setEditProduct({ ...p })} className="px-2 py-1 rounded bg-surface-3 text-xs hover:bg-surface-2 text-primary">✎</button>
                <button onClick={() => handleDelete(p)} className="px-2 py-1 rounded bg-surface-3 text-xs hover:bg-surface-2 text-destructive">✕</button>
              </div>
            </div>
          );
        })}
        {products.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No products found</p>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <Modal title="Add Product" onClose={() => setShowAddModal(false)}>
          <div className="space-y-3">
            <input value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Product name" className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <input value={newProduct.costPrice} onChange={e => setNewProduct({ ...newProduct, costPrice: e.target.value })} placeholder="Cost price" type="number" className={inputClass} />
              <input value={newProduct.sellingPrice} onChange={e => setNewProduct({ ...newProduct, sellingPrice: e.target.value })} placeholder="Selling price" type="number" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={newProduct.quantity} onChange={e => setNewProduct({ ...newProduct, quantity: e.target.value })} placeholder="Quantity" type="number" className={inputClass} />
              <input value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} placeholder="Category" className={inputClass} />
            </div>
            <button onClick={handleAdd} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Add Product</button>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editProduct && (
        <Modal title="Edit Product" onClose={() => setEditProduct(null)}>
          <div className="space-y-3">
            <input value={editProduct.name} onChange={e => setEditProduct({ ...editProduct, name: e.target.value })} className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <input value={editProduct.costPrice} onChange={e => setEditProduct({ ...editProduct, costPrice: Number(e.target.value) })} type="number" className={inputClass} />
              <input value={editProduct.sellingPrice} onChange={e => setEditProduct({ ...editProduct, sellingPrice: Number(e.target.value) })} type="number" className={inputClass} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={editProduct.quantity} onChange={e => setEditProduct({ ...editProduct, quantity: Number(e.target.value) })} type="number" className={inputClass} />
              <input value={editProduct.category} onChange={e => setEditProduct({ ...editProduct, category: e.target.value })} className={inputClass} />
            </div>
            <button onClick={handleEdit} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Save Changes</button>
          </div>
        </Modal>
      )}

      {/* Restock Modal */}
      {restockProduct && (
        <Modal title={`Restock: ${restockProduct.name}`} onClose={() => setRestockProduct(null)}>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Current stock: <span className="text-foreground">{restockProduct.quantity}</span></p>
            <input value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="Quantity to add" type="number" className={inputClass} />
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">Funding</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => setSingleRestockFunding('balance')}
                  className={`p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                    singleRestockFunding === 'balance' ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-foreground border-border'
                  }`}
                >
                  💰 From Balance
                </button>
                <button
                  onClick={() => setSingleRestockFunding('new_money')}
                  className={`p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                    singleRestockFunding === 'new_money' ? 'bg-primary text-primary-foreground border-primary' : 'bg-surface-2 text-foreground border-border'
                  }`}
                >
                  💵 New Money
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {singleRestockFunding === 'new_money'
                  ? 'Recorded as expense + new investment (ROI base grows, cash neutral).'
                  : 'Recorded as expense only — net income / available cash drops.'}
              </p>
            </div>
            <button onClick={handleRestock} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Restock</button>
          </div>
        </Modal>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <Modal title="Bulk Import" onClose={() => setShowImportModal(false)}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Format: Name, Cost, Selling Price, Quantity, Category (one per line)</p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={"Rice 5kg, 3000, 4500, 20, Groceries\nSugar 1kg, 500, 700, 30, Groceries"}
              rows={6}
              className={`${inputClass} resize-none`}
            />
            <button onClick={handleImport} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Import Products</button>
          </div>
        </Modal>
      )}

      {/* Shopping List Modal */}
      {showShoppingList && (
        <Modal
          title={receiveMode ? '📥 Receive Stock' : `🛒 Shopping List (${shoppingList.length})`}
          onClose={() => { setShowShoppingList(false); setReceiveMode(false); }}
        >
          <div className="space-y-3">
            {shoppingList.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">
                Your list is empty.<br />
                Tap 🛒 on any product to add it.
              </p>
            ) : receiveMode ? (
              <>
                <p className="text-xs text-muted-foreground">
                  Confirm the actual quantity received and unit cost from your supplier. Stock will be added and cost prices updated.
                </p>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {shoppingList.map(item => {
                    const product = store.products.find(p => p.id === item.productId);
                    const data = receiveData[item.productId] || { qty: String(item.quantity), cost: String(product?.costPrice ?? '') };
                    const lineTotal = (Number(data.qty) || 0) * (Number(data.cost) || 0);
                    return (
                      <div key={item.productId} className="p-2.5 rounded-lg bg-surface-2 border border-border space-y-2">
                        <div className="flex justify-between items-baseline gap-2">
                          <p className="font-display font-semibold text-sm truncate">{item.name}</p>
                          <p className="text-xs text-muted-foreground shrink-0">In stock: {product?.quantity ?? 0}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground">Qty received</label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={data.qty}
                              onChange={e => setReceiveData({ ...receiveData, [item.productId]: { ...data, qty: e.target.value } })}
                              className="w-full text-sm bg-surface-3 border border-border rounded p-1.5"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground">Unit cost (₦)</label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={data.cost}
                              onChange={e => setReceiveData({ ...receiveData, [item.productId]: { ...data, cost: e.target.value } })}
                              className="w-full text-sm bg-surface-3 border border-border rounded p-1.5"
                            />
                          </div>
                        </div>
                        <p className="text-right text-xs text-muted-foreground">
                          Line total: <span className="text-primary font-semibold">₦{lineTotal.toLocaleString()}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between items-center px-1 pt-1 border-t border-border">
                  <span className="text-sm text-muted-foreground">Grand total</span>
                  <span className="font-display font-bold text-primary">
                    ₦{shoppingList.reduce((sum, item) => {
                      const product = store.products.find(p => p.id === item.productId);
                      const data = receiveData[item.productId] || { qty: String(item.quantity), cost: String(product?.costPrice ?? 0) };
                      return sum + (Number(data.qty) || 0) * (Number(data.cost) || 0);
                    }, 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-surface-2 border border-border space-y-1.5">
                  <p className="text-[10px] uppercase text-muted-foreground font-display font-bold">How is this restock funded?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setFunding('balance')}
                      className={`p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                        funding === 'balance' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'
                      }`}
                    >
                      💰 From Balance
                    </button>
                    <button
                      onClick={() => setFunding('new_money')}
                      className={`p-2 rounded-lg text-xs font-display font-semibold border transition-colors ${
                        funding === 'new_money' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'
                      }`}
                    >
                      💵 New Money
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {funding === 'new_money'
                      ? 'New investment recorded → ROI base grows, available cash unchanged.'
                      : 'Subtracted from net income / available cash.'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button onClick={() => setReceiveMode(false)} className="p-2.5 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-sm hover:bg-surface-3 border border-border">
                    ← Back
                  </button>
                  <button onClick={handleConfirmReceive} className="p-2.5 rounded-lg bg-success text-success-foreground font-display font-semibold text-sm hover:opacity-90">
                    ✓ Confirm & Restock
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {shoppingList.map(item => (
                    <div key={item.productId} className="flex items-center gap-2 p-2 rounded-lg bg-surface-2 border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="font-display font-semibold text-sm truncate">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.category}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateListQty(item.productId, item.quantity - 1)} className="w-7 h-7 rounded bg-surface-3 hover:bg-surface-2 text-sm">−</button>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateListQty(item.productId, Number(e.target.value))}
                          className="w-12 text-center bg-surface-3 border border-border rounded p-1 text-sm"
                        />
                        <button onClick={() => updateListQty(item.productId, item.quantity + 1)} className="w-7 h-7 rounded bg-surface-3 hover:bg-surface-2 text-sm">+</button>
                        <button onClick={() => removeFromList(item.productId)} className="w-7 h-7 rounded bg-surface-3 hover:bg-surface-2 text-destructive text-sm ml-1">✕</button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleStartReceive}
                  className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90"
                >
                  📥 Receive Stock from Supplier
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={handleShareWhatsApp} className="p-2.5 rounded-lg bg-success text-success-foreground font-display font-semibold text-sm hover:opacity-90">
                    💬 WhatsApp
                  </button>
                  <button onClick={handleShareSystem} className="p-2.5 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-sm hover:bg-surface-3 border border-border">
                    📤 Share
                  </button>
                  <button onClick={handleCopyList} className="p-2.5 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-sm hover:bg-surface-3 border border-border">
                    📋 Copy
                  </button>
                  <button onClick={clearList} className="p-2.5 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-sm hover:bg-surface-3 border border-border text-destructive">
                    🗑 Clear
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <ConfirmAccessCode
          expectedCode={store.accessCode}
          title={`Delete "${confirmDelete.name}"?`}
          message="This will permanently remove the product from your inventory. Enter your store access code to confirm."
          confirmLabel="Delete Product"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

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
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-card border border-border rounded-xl p-5 animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-bold text-lg">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
