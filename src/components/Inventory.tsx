import { useState } from 'react';
import { StoreData, Product } from '@/types/store';
import { addProduct, updateProduct, deleteProduct, importProducts } from '@/lib/store-data';
import { showToast } from '@/components/Toast';

interface InventoryProps {
  store: StoreData;
  onUpdate: (store: StoreData) => void;
  filterLowStock?: boolean;
  onClearFilter?: () => void;
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

  let products = store.products;
  if (filterLowStock) products = products.filter(p => p.quantity <= 5);
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

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    onUpdate(deleteProduct(store, id));
    showToast('Product deleted');
  };

  const handleRestock = () => {
    if (!restockProduct || !restockQty) return;
    const updated = updateProduct(store, restockProduct.id, { quantity: restockProduct.quantity + Number(restockQty) });
    onUpdate(updated);
    setRestockProduct(null);
    setRestockQty('');
    showToast('Stock updated');
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
      </div>

      {filterLowStock && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-warning text-sm">⚠ Showing low stock items only</span>
          <button onClick={onClearFilter} className="text-primary text-sm underline">Show all</button>
        </div>
      )}

      <div className="space-y-2">
        {products.map(p => (
          <div key={p.id} className="p-3 rounded-lg bg-card border border-border flex flex-wrap items-center gap-3 hover:border-primary/20 transition-colors">
            <div className="flex-1 min-w-[150px]">
              <p className="font-display font-semibold text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.category}</p>
            </div>
            <div className="text-right text-xs space-y-0.5">
              <p>Cost: <span className="text-muted-foreground">₦{p.costPrice.toLocaleString()}</span></p>
              <p>Sell: <span className="text-primary">₦{p.sellingPrice.toLocaleString()}</span></p>
            </div>
            <div className={`text-center min-w-[60px] ${p.quantity <= 5 ? 'text-destructive' : p.quantity <= 15 ? 'text-warning' : 'text-success'}`}>
              <p className="text-lg font-bold">{p.quantity}</p>
              <p className="text-[10px] text-muted-foreground">in stock</p>
            </div>
            <div className="flex gap-1">
              <button onClick={() => { setRestockProduct(p); setRestockQty(''); }} className="px-2 py-1 rounded bg-surface-3 text-xs hover:bg-surface-2 text-success">↑</button>
              <button onClick={() => setEditProduct({ ...p })} className="px-2 py-1 rounded bg-surface-3 text-xs hover:bg-surface-2 text-primary">✎</button>
              <button onClick={() => handleDelete(p.id, p.name)} className="px-2 py-1 rounded bg-surface-3 text-xs hover:bg-surface-2 text-destructive">✕</button>
            </div>
          </div>
        ))}
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
