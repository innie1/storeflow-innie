import { useState, useMemo, useEffect } from 'react';
import { StoreData, Product } from '@/types/store';
import { addProduct, updateProduct, deleteProduct, importProducts, receiveStock, RestockFunding, clearInventory, recordStockCountAudit, transferStock, getStoreIndex, loadStore } from '@/lib/store-data';
import { getLowStockThreshold } from '@/lib/settings';
import { showToast } from '@/components/Toast';
import ConfirmAccessCode from '@/components/ConfirmAccessCode';
import BarcodeScanner from '@/components/BarcodeScanner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CODE39_MAP: Record<string, string> = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100',
  'A': '100001001', 'B': '001001001', 'C': '101001000', 'D': '000011001',
  'E': '100011000', 'F': '001011000', 'G': '000001101', 'H': '100001100',
  'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110',
  'U': '110000001', 'V': '011000001', 'W': '111000000', 'X': '010010001',
  'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
  '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
};

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
  const [editDraft, setEditDraft] = useState<{ name: string; costPrice: string; sellingPrice: string; quantity: string; category: string } | null>(null);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<{ name: string; costPrice: string; sellingPrice: string; quantity: string; category: string }[] | null>(null);
  const [newProduct, setNewProduct] = useState({ name: '', costPrice: '', sellingPrice: '', quantity: '', category: '' });
  const [customCategoryActive, setCustomCategoryActive] = useState(false);
  const [customCategoryVal, setCustomCategoryVal] = useState('');
  const [editCustomCategoryActive, setEditCustomCategoryActive] = useState(false);
  const [editCustomCategoryVal, setEditCustomCategoryVal] = useState('');

  const existingCategories = useMemo(() => {
    const cats = new Set(['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others']);
    store.products.forEach(p => {
      if (p.category && p.category.trim()) {
        cats.add(p.category.trim());
      }
    });
    return Array.from(cats);
  }, [store.products]);

  const autoCategory = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes('soap') || n.includes('detto') || n.includes('lux') || n.includes('premier') || n.includes('handwash')) return 'Soap';
    if (n.includes('detergent') || n.includes('omo') || n.includes('ariel') || n.includes('soclin') || n.includes('wash') || n.includes('bleach') || n.includes('hypo')) return 'Detergents';
    if (n.includes('milk') || n.includes('drink') || n.includes('water') || n.includes('beverage') || n.includes('soda') || n.includes('milo') || n.includes('coke') || n.includes('mineral') || n.includes('juice') || n.includes('fanta') || n.includes('sprite') || n.includes('pepsi') || n.includes('tea') || n.includes('coffee')) return 'Beverages';
    if (n.includes('rice') || n.includes('beans') || n.includes('garri') || n.includes('yam') || n.includes('food') || n.includes('grocery') || n.includes('spaghetti') || n.includes('indomie') || n.includes('bread') || n.includes('semovita') || n.includes('oil') || n.includes('sugar') || n.includes('salt') || n.includes('flour') || n.includes('semolina')) return 'Groceries';
    return 'Others';
  };

  const [shoppingList, setShoppingList] = useState<ShoppingListItem[]>([]);
  const [showShoppingList, setShowShoppingList] = useState(false);
  const [receiveMode, setReceiveMode] = useState(false);
  const [receiveData, setReceiveData] = useState<Record<string, { qty: string; cost: string }>>({});

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [receiveMode]);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);
  const [scanForProduct, setScanForProduct] = useState<Product | null>(null);

  const [funding, setFunding] = useState<RestockFunding>('balance');
  const [singleRestockFunding, setSingleRestockFunding] = useState<RestockFunding>('balance');

  const [showMassDeleteModal, setShowMassDeleteModal] = useState(false);
  const [massDeleteStep, setMassDeleteStep] = useState(1); // 1 = Quiz, 2 = Confirm
  const [quizAnswers, setQuizAnswers] = useState({ q1: '', q2: '', q3: '' });
  const [quizError, setQuizError] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const [countMode, setCountMode] = useState(false);
  const [auditCounts, setAuditCounts] = useState<Record<string, number>>({});
  const [showAuditHistory, setShowAuditHistory] = useState(false);
  const [selectedBarcodeProduct, setSelectedBarcodeProduct] = useState<Product | null>(null);
  const [selectedDetailProduct, setSelectedDetailProduct] = useState<Product | null>(null);
  const [selectedTransferProduct, setSelectedTransferProduct] = useState<Product | null>(null);
  const [transferQty, setTransferQty] = useState('');
  const [transferDestCode, setTransferDestCode] = useState('');

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
    if (!editProduct || !editDraft) return;
    const updates: Partial<Product> = {
      name: editDraft.name,
      costPrice: Number(editDraft.costPrice) || 0,
      sellingPrice: Number(editDraft.sellingPrice) || 0,
      quantity: Number(editDraft.quantity) || 0,
      category: editDraft.category,
    };
    const updated = updateProduct(store, editProduct.id, updates);
    onUpdate(updated);
    setEditProduct(null); setEditDraft(null);
    showToast('Product updated — inventory value recalculated');
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

  const handleImportParse = () => {
    try {
      const lines = importText.trim().split('\n').filter(Boolean);
      const parsed: { name: string; costPrice: string; sellingPrice: string; quantity: string; category: string }[] = [];
      for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length < 4) continue;
        parsed.push({
          name: parts[0],
          costPrice: parts[1] || '0',
          sellingPrice: parts[2] || '0',
          quantity: parts[3] || '0',
          category: parts[4] || 'General',
        });
      }
      if (parsed.length === 0) return showToast('No valid products found', 'error');
      setImportPreview(parsed);
    } catch {
      showToast('Import failed — check format', 'error');
    }
  };

  const handleImportApprove = () => {
    if (!importPreview) return;
    const cleaned = importPreview
      .filter(p => p.name.trim())
      .map(p => ({
        name: p.name.trim(),
        costPrice: Number(p.costPrice) || 0,
        sellingPrice: Number(p.sellingPrice) || 0,
        quantity: Number(p.quantity) || 0,
        category: p.category.trim() || 'General',
      }));
    if (cleaned.length === 0) return showToast('No items to import', 'error');
    onUpdate(importProducts(store, cleaned));
    setShowImportModal(false);
    setImportText('');
    setImportPreview(null);
    showToast(`${cleaned.length} products imported`);
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

  const generateBuyList = () => {
    // Items needing restock: out of stock first, then low stock, sorted by quantity ascending
    const needing = store.products
      .filter(p => p.quantity <= lowThreshold)
      .sort((a, b) => a.quantity - b.quantity);
    if (needing.length === 0) {
      showToast('No items below threshold', 'error');
      return;
    }
    const items: ShoppingListItem[] = needing.map(p => {
      const target = Math.max(lowThreshold * 4, 10);
      const suggested = Math.max(1, target - p.quantity);
      return { productId: p.id, name: p.name, quantity: suggested, category: p.category };
    });
    // Merge with any existing list (replace duplicates with suggested qty)
    const existingIds = new Set(items.map(i => i.productId));
    const merged = [...items, ...shoppingList.filter(i => !existingIds.has(i.productId))];
    setShoppingList(merged);
    setShowShoppingList(true);
    showToast(`${items.length} items added to buy list`);
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

  const handlePrintBarcode = (product: Product) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return showToast('Popup blocker is active', 'error');
    
    const svgElement = document.getElementById(`barcode-svg-${product.id}`);
    if (!svgElement) return showToast('Barcode element not found', 'error');
    
    const svgHtml = svgElement.outerHTML;
    printWindow.document.write(`
      <html>
        <head>
          <title>Barcode Label - ${product.name}</title>
          <style>
            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: monospace;
              padding: 20px;
              margin: 0;
              background-color: white;
            }
            .title {
              font-size: 14px;
              font-weight: bold;
              margin-bottom: 5px;
              text-align: center;
              color: black;
            }
            .code {
              font-size: 12px;
              margin-top: 5px;
              letter-spacing: 3px;
              font-weight: bold;
              color: black;
            }
            svg {
              max-width: 100%;
            }
          </style>
        </head>
        <body>
          <div class="title">${product.name}</div>
          ${svgHtml}
          <div class="code">${product.barcode}</div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleAutoGenerateBarcode = (product: Product) => {
    const code = `SF${Math.floor(100000 + Math.random() * 900000)}`;
    const existing = store.products.find(p => p.barcode === code);
    if (existing) {
      return handleAutoGenerateBarcode(product); // retry
    }
    const updated = updateProduct(store, product.id, { barcode: code });
    onUpdate(updated);
    setSelectedBarcodeProduct(updated.products.find(p => p.id === product.id) || null);
    showToast('✓ Saved auto-generated barcode');
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
        <button onClick={() => { setShowAddModal(true); setNewProduct({ name: '', costPrice: '', sellingPrice: '', quantity: '', category: 'Groceries' }); setCustomCategoryActive(false); setCustomCategoryVal(''); }} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90">
          + Add
        </button>
        <button onClick={() => setShowImportModal(true)} className="px-4 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-display font-semibold hover:bg-surface-3 border border-border">
          Import
        </button>
        <button
          onClick={() => {
            setShowMassDeleteModal(true);
            setMassDeleteStep(1);
            setQuizAnswers({ q1: '', q2: '', q3: '' });
            setQuizError('');
            setConfirmText('');
          }}
          className="px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-display font-semibold hover:bg-destructive/20"
          title="Delete all products from inventory"
        >
          🗑 Mass Delete
        </button>
        <button
          onClick={() => { generateBuyList(); }}
          className="px-4 py-2.5 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm font-display font-semibold hover:bg-warning/20"
          title="Auto-generate buy list from low/out-of-stock items"
        >
          📝 Buy List
        </button>
        <button
          onClick={() => setCountMode(true)}
          className="px-4 py-2.5 rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm font-display font-semibold hover:bg-warning/20"
          title="Audit product stock counts and adjust inventory"
        >
          📋 Count Audit
        </button>
      </div>

      {countMode && (
        <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 mb-4 flex flex-wrap items-center justify-between gap-3 text-left">
          <div>
            <h3 className="font-display font-bold text-warning text-sm flex items-center gap-1.5">
              📋 Stock Count Mode Active
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter the physical quantities found on store shelves. Audits will adjust stock and log variances.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAuditHistory(true)}
              className="px-3.5 py-2 rounded-lg bg-surface-2 border border-border text-foreground hover:bg-surface-3 text-xs font-semibold animate-pulse"
            >
              📜 Audit History
            </button>
            <button
              onClick={() => {
                let updated = store;
                Object.entries(auditCounts).forEach(([pId, act]) => {
                  const prod = store.products.find(p => p.id === pId);
                  if (prod) {
                    updated = recordStockCountAudit(updated, pId, prod.name, prod.quantity, act);
                  }
                });
                onUpdate(updated);
                setAuditCounts({});
                setCountMode(false);
                showToast('✓ Stock counts reconciled');
              }}
              disabled={Object.keys(auditCounts).length === 0}
              className="px-3.5 py-2 rounded-lg bg-warning text-slate-950 hover:opacity-90 disabled:opacity-50 text-xs font-bold"
            >
              ✓ Reconcile Audits ({Object.keys(auditCounts).length})
            </button>
            <button
              onClick={() => {
                setCountMode(false);
                setAuditCounts({});
              }}
              className="px-3.5 py-2 rounded-lg bg-surface-2 border border-border text-xs font-semibold text-destructive hover:bg-destructive/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {filterLowStock && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-warning text-sm">⚠ Showing low stock items only</span>
          <button onClick={onClearFilter} className="text-primary text-sm underline">Show all</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {products.map(p => {
          const inList = shoppingList.find(i => i.productId === p.id);
          return (
            <div
              key={p.id}
              onClick={() => { if (!countMode) setSelectedDetailProduct(p); }}
              className={`p-3 rounded-lg bg-card border flex items-center gap-3 transition-colors cursor-pointer hover:bg-surface-2/30 ${p.barcode ? 'border-success/40 ring-1 ring-success/20' : 'border-border hover:border-primary/20'}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-display font-semibold text-sm truncate">{p.name}</p>
                  {p.addedAt && (Date.now() - new Date(p.addedAt).getTime()) < 7 * 24 * 60 * 60 * 1000 && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-bold">New</span>
                  )}
                  {p.barcode && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20 font-bold" title={`Barcode: ${p.barcode}`}>✓</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate text-left">
                  {p.category}
                  {p.addedAt && <span className="ml-1.5">• {new Date(p.addedAt).toLocaleDateString()}</span>}
                </p>
              </div>

              {countMode ? (
                <div className="flex items-center gap-3 bg-surface-2/45 p-2 rounded-lg border border-border/40 shrink-0">
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
                <>
                  <div className="w-20 shrink-0 text-right text-xs space-y-0.5">
                    <p className="text-muted-foreground">₦{p.costPrice.toLocaleString()}</p>
                    <p className="text-primary">₦{p.sellingPrice.toLocaleString()}</p>
                    {(() => {
                      const margin = p.sellingPrice - p.costPrice;
                      const pct = p.costPrice > 0 ? (margin / p.costPrice) * 100 : 0;
                      const cls = margin > 0 ? 'text-success' : margin < 0 ? 'text-destructive' : 'text-muted-foreground';
                      return <p className={cls}>+{pct.toFixed(0)}%</p>;
                    })()}
                  </div>
                  <div className={`w-12 shrink-0 text-center ${p.quantity <= lowThreshold ? 'text-destructive' : p.quantity <= lowThreshold * 3 ? 'text-warning' : 'text-success'}`}>
                    <p className="text-lg font-bold leading-none">{p.quantity}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">stock</p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setScanForProduct(p)}
                        title={p.barcode ? 'Re-scan barcode' : 'Scan barcode to save'}
                        className={`w-7 h-7 rounded text-xs hover:bg-surface-2 flex items-center justify-center ${p.barcode ? 'bg-success/20 text-success' : 'bg-surface-3 text-foreground'}`}
                      >
                        📷
                      </button>
                      <button
                        onClick={() => setSelectedBarcodeProduct(p)}
                        title="View / Generate barcode labels"
                        className={`w-7 h-7 rounded text-xs hover:bg-surface-2 flex items-center justify-center ${p.barcode ? 'bg-primary/20 text-primary animate-pulse' : 'bg-surface-3 text-foreground'}`}
                      >
                        📊
                      </button>
                      <button
                        onClick={() => addToShoppingList(p)}
                        title="Add to shopping list"
                        className={`w-7 h-7 rounded text-xs hover:bg-surface-2 flex items-center justify-center relative ${inList ? 'bg-primary/20 text-primary' : 'bg-surface-3 text-foreground'}`}
                      >
                        🛒
                        {inList && (
                          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                            {inList.quantity}
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setRestockProduct(p); setRestockQty(''); setSingleRestockFunding('balance'); }} className="w-7 h-7 rounded bg-surface-3 text-xs hover:bg-surface-2 text-success flex items-center justify-center" title="Restock">↑</button>
                      <button onClick={() => { setSelectedTransferProduct(p); setTransferQty(''); setTransferDestCode(''); }} title="Transfer stock to sister store" className="w-7 h-7 rounded bg-surface-3 text-xs hover:bg-surface-2 text-warning flex items-center justify-center">🚚</button>
                      <button onClick={() => { setEditProduct({ ...p }); setEditDraft({ name: p.name, costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice), quantity: String(p.quantity), category: p.category }); setEditCustomCategoryActive(p.category !== 'Groceries' && p.category !== 'Beverages' && p.category !== 'Detergents' && p.category !== 'Soap' && p.category !== 'Others' && !['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'].includes(p.category)); setEditCustomCategoryVal(p.category); }} className="w-7 h-7 rounded bg-surface-3 text-xs hover:bg-surface-2 text-primary flex items-center justify-center" title="Edit">✎</button>
                      <button onClick={() => handleDelete(p)} className="w-7 h-7 rounded bg-surface-3 text-xs hover:bg-surface-2 text-destructive flex items-center justify-center" title="Delete">✕</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {products.length === 0 && (
          <p className="text-center text-muted-foreground py-8">No products found</p>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (() => {
        const settings = store.managerSettings;
        const showSmartPricing = !settings || settings.smartPricing;
        const cost = Number(newProduct.costPrice) || 0;
        const margins = [20, 30, 40, 50];
        const defaultMargin = settings?.defaultMargin ?? 30;
        return (
        <Modal title="Add Product" onClose={() => setShowAddModal(false)}>
          <div className="space-y-3">
            <input
              value={newProduct.name}
              onChange={e => {
                const name = e.target.value;
                const guessed = autoCategory(name);
                setNewProduct({ ...newProduct, name, category: guessed });
                if (guessed === 'Others') {
                  setCustomCategoryActive(true);
                  setCustomCategoryVal('');
                } else {
                  setCustomCategoryActive(false);
                }
              }}
              placeholder="Product name"
              className={inputClass}
            />
            <div className="grid grid-cols-2 gap-3">
              <input value={newProduct.costPrice} onChange={e => setNewProduct({ ...newProduct, costPrice: e.target.value })} placeholder="Cost price (₦)" type="number" className={inputClass} />
              <input value={newProduct.sellingPrice} onChange={e => setNewProduct({ ...newProduct, sellingPrice: e.target.value })} placeholder="Selling price (₦)" type="number" className={inputClass} />
            </div>
            {showSmartPricing && cost > 0 && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-display font-bold text-primary">✨ Smart Pricing <span className="text-muted-foreground font-normal">(Recommended)</span></p>
                </div>
                <p className="text-[10px] text-muted-foreground">Based on your {defaultMargin}% default profit margin</p>
                <div className="space-y-1.5">
                  {margins.map(m => {
                    const price = Math.round((cost * (1 + m / 100)) / 5) * 5;
                    const profit = price - cost;
                    const isDefault = m === defaultMargin;
                    const isSelected = Number(newProduct.sellingPrice) === price;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setNewProduct({ ...newProduct, sellingPrice: String(price) })}
                        className={`w-full flex items-center justify-between p-2 rounded-lg border text-xs font-display font-semibold transition-colors ${
                          isSelected || (isDefault && !newProduct.sellingPrice)
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'bg-surface-2 border-border text-foreground hover:border-primary/30'
                        }`}
                      >
                        <span>{m}% Margin</span>
                        <span>₦{price.toLocaleString()}</span>
                        <span className="text-success">Profit: ₦{profit.toLocaleString()}{isSelected ? ' ✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input value={newProduct.quantity} onChange={e => setNewProduct({ ...newProduct, quantity: e.target.value })} placeholder="Quantity" type="number" className={inputClass} />
              <div className="space-y-2 text-left">
                <select
                  value={['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'].includes(newProduct.category) ? newProduct.category : 'Others'}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'Others') {
                      setCustomCategoryActive(true);
                      setNewProduct({ ...newProduct, category: customCategoryVal || 'Others' });
                    } else {
                      setCustomCategoryActive(false);
                      setNewProduct({ ...newProduct, category: val });
                    }
                  }}
                  className={inputClass}
                >
                  <option value="Groceries">Groceries</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Detergents">Detergents</option>
                  <option value="Soap">Soap</option>
                  <option value="Others">Others / Custom</option>
                </select>
                {customCategoryActive && (
                  <input
                    value={customCategoryVal}
                    onChange={e => {
                      setCustomCategoryVal(e.target.value);
                      setNewProduct({ ...newProduct, category: e.target.value });
                    }}
                    placeholder="Enter custom category..."
                    className={inputClass}
                  />
                )}
              </div>
            </div>
            <button onClick={handleAdd} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Save Item</button>
          </div>
        </Modal>
        );
      })()}



      {/* Edit Modal */}
      {editProduct && editDraft && (() => {
        const cost = Number(editDraft.costPrice) || 0;
        const settings = store.managerSettings;
        const showSmart = !settings || settings.smartPricing;
        const margins = [20, 30, 40, 50];
        const defaultMargin = settings?.defaultMargin ?? 30;
        return (
        <Modal title="Edit Product" onClose={() => { setEditProduct(null); setEditDraft(null); }}>
          <div className="space-y-3">
            <input value={editDraft.name} onChange={e => setEditDraft({ ...editDraft, name: e.target.value })} className={inputClass} />
            <div className="grid grid-cols-2 gap-3">
              <input value={editDraft.costPrice} onChange={e => setEditDraft({ ...editDraft, costPrice: e.target.value })} type="number" placeholder="Cost (₦)" className={inputClass} />
              <input value={editDraft.sellingPrice} onChange={e => setEditDraft({ ...editDraft, sellingPrice: e.target.value })} type="number" placeholder="Selling (₦)" className={inputClass} />
            </div>
            {showSmart && cost > 0 && (
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                <p className="text-xs font-display font-bold text-primary">✨ Smart Pricing</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {margins.map(m => {
                    const price = Math.round((cost * (1 + m / 100)) / 5) * 5;
                    const selected = Number(editDraft.sellingPrice) === price;
                    return (
                      <button key={m} type="button" onClick={() => setEditDraft({ ...editDraft, sellingPrice: String(price) })}
                        className={`p-2 rounded-lg border text-xs font-display font-semibold ${selected || m === defaultMargin && !editDraft.sellingPrice ? 'bg-primary/20 border-primary text-primary' : 'bg-surface-2 border-border'}`}>
                        {m}% → ₦{price.toLocaleString()}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input value={editDraft.quantity} onChange={e => setEditDraft({ ...editDraft, quantity: e.target.value })} type="number" placeholder="Quantity" className={inputClass} />
              <div className="space-y-2 text-left">
                <select
                  value={['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'].includes(editDraft.category) ? editDraft.category : 'Others'}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'Others') {
                      setEditCustomCategoryActive(true);
                      setEditDraft({ ...editDraft, category: editCustomCategoryVal || 'Others' });
                    } else {
                      setEditCustomCategoryActive(false);
                      setEditDraft({ ...editDraft, category: val });
                    }
                  }}
                  className={inputClass}
                >
                  <option value="Groceries">Groceries</option>
                  <option value="Beverages">Beverages</option>
                  <option value="Detergents">Detergents</option>
                  <option value="Soap">Soap</option>
                  <option value="Others">Others / Custom</option>
                </select>
                {editCustomCategoryActive && (
                  <input
                    value={editCustomCategoryVal}
                    onChange={e => {
                      setEditCustomCategoryVal(e.target.value);
                      setEditDraft({ ...editDraft, category: e.target.value });
                    }}
                    placeholder="Enter custom category..."
                    className={inputClass}
                  />
                )}
              </div>
            </div>
            <button onClick={handleEdit} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Save Changes</button>

            {/* Price History Section */}
            {(() => {
              const priceHistory = editProduct.priceHistory || [];
              if (priceHistory.length === 0) return null;
              return (
                <div className="pt-3 border-t border-border/60 space-y-2 mt-3 text-left">
                  <p className="text-xs font-display font-bold text-primary flex items-center gap-1.5">
                    📈 Cost Price History
                  </p>
                  {priceHistory.length >= 2 && (
                    <div className="h-28 w-full bg-surface-2 p-1.5 rounded-lg border border-border">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={priceHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(str) => {
                              try {
                                return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                              } catch {
                                return '';
                              }
                            }}
                            tick={{ fill: '#94a3b8', fontSize: 8 }}
                          />
                          <YAxis
                            tick={{ fill: '#94a3b8', fontSize: 8 }}
                            domain={['auto', 'auto']}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#d97706', borderRadius: '6px', padding: '6px' }}
                            labelStyle={{ color: '#f59e0b', fontSize: 9, fontWeight: 'bold' }}
                            itemStyle={{ color: '#f8fafc', fontSize: 9 }}
                            labelFormatter={(lbl) => {
                              try {
                                return new Date(lbl).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
                              } catch {
                                return String(lbl);
                              }
                            }}
                          />
                          <Line type="monotone" dataKey="costPrice" stroke="#d97706" strokeWidth={1.5} dot={{ fill: '#d97706', r: 2 }} name="Cost" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="max-h-24 overflow-y-auto space-y-1 text-[10px]">
                    {priceHistory.slice().reverse().map((h, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-surface-2 p-1.5 rounded border border-border">
                        <span className="text-muted-foreground">
                          {new Date(h.date).toLocaleDateString('en-GB')} {new Date(h.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="font-semibold text-primary">₦{h.costPrice.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
        );
      })()}


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
        <Modal title={importPreview ? `Review (${importPreview.length})` : 'Bulk Import'} onClose={() => { setShowImportModal(false); setImportPreview(null); }}>
          {!importPreview ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Format: Name, Cost, Selling Price, Quantity, Category (one per line)</p>
              <textarea value={importText} onChange={e => setImportText(e.target.value)}
                placeholder={"Rice 5kg, 3000, 4500, 20, Groceries\nSugar 1kg, 500, 700, 30, Groceries"}
                rows={6} className={`${inputClass} resize-none`} />
              <button onClick={handleImportParse} className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90">Preview Items →</button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Review and edit each item before saving.</p>
              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {importPreview.map((it, i) => (
                  <div key={i} className="p-2 rounded-lg bg-surface-2 border border-border space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input value={it.name} onChange={e => { const next=[...importPreview]; next[i]={...it,name:e.target.value}; setImportPreview(next); }} placeholder="Name" className="flex-1 text-sm bg-surface-3 border border-border rounded p-1.5" />
                      <button onClick={() => setImportPreview(importPreview.filter((_,k)=>k!==i))} className="w-7 h-7 rounded text-destructive bg-destructive/10 text-sm">✕</button>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      <input value={it.costPrice} onChange={e => { const n=[...importPreview]; n[i]={...it,costPrice:e.target.value}; setImportPreview(n); }} type="number" placeholder="Cost" className="text-xs bg-surface-3 border border-border rounded p-1.5" />
                      <input value={it.sellingPrice} onChange={e => { const n=[...importPreview]; n[i]={...it,sellingPrice:e.target.value}; setImportPreview(n); }} type="number" placeholder="Sell" className="text-xs bg-surface-3 border border-border rounded p-1.5" />
                      <input value={it.quantity} onChange={e => { const n=[...importPreview]; n[i]={...it,quantity:e.target.value}; setImportPreview(n); }} type="number" placeholder="Qty" className="text-xs bg-surface-3 border border-border rounded p-1.5" />
                      <input value={it.category} onChange={e => { const n=[...importPreview]; n[i]={...it,category:e.target.value}; setImportPreview(n); }} placeholder="Cat" className="text-xs bg-surface-3 border border-border rounded p-1.5" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setImportPreview(null)} className="p-2.5 rounded-lg bg-surface-2 border border-border text-sm font-display font-semibold">← Back</button>
                <button onClick={handleImportApprove} className="p-2.5 rounded-lg bg-success text-white text-sm font-display font-bold">✓ Approve & Save</button>
              </div>
            </div>
          )}
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

      {selectedBarcodeProduct && (
        <Modal title="Barcode Label Generator" onClose={() => setSelectedBarcodeProduct(null)}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground text-left">
              Visual representation of the product's barcode for label scanning.
            </p>
            
            {selectedBarcodeProduct.barcode ? (
              <div className="space-y-4">
                <div className="flex justify-center p-4 bg-white rounded-lg border border-border" id={`barcode-container-${selectedBarcodeProduct.id}`}>
                  {(() => {
                    const value = selectedBarcodeProduct.barcode || '';
                    const cleanValue = value.toUpperCase().replace(/[^0-9A-Z\-.\s$/+%*]/g, '');
                    const fullText = `*${cleanValue}*`;
                    const narrowWidth = 1.5;
                    const wideWidth = narrowWidth * 3;
                    const interSpace = narrowWidth;
                    const height = 60;
                    
                    let currentX = 0;
                    const bars: JSX.Element[] = [];
                    
                    for (let i = 0; i < fullText.length; i++) {
                      const char = fullText[i];
                      const pattern = CODE39_MAP[char];
                      if (!pattern) continue;
                      
                      for (let j = 0; j < 9; j++) {
                        const isBar = j % 2 === 0;
                        const isWide = pattern[j] === '1';
                        const width = isWide ? wideWidth : narrowWidth;
                        
                        if (isBar) {
                          bars.push(
                            <rect
                              key={`${i}-${j}`}
                              x={currentX}
                              y={0}
                              width={width}
                              height={height}
                              fill="black"
                            />
                          );
                        }
                        currentX += width;
                      }
                      currentX += interSpace;
                    }
                    
                    return (
                      <div className="flex flex-col items-center">
                        <svg
                          id={`barcode-svg-${selectedBarcodeProduct.id}`}
                          width={Math.max(200, currentX)}
                          height={height}
                          viewBox={`0 0 ${currentX} ${height}`}
                        >
                          {bars}
                        </svg>
                        <span className="mt-2 text-xs font-mono font-bold text-black tracking-widest">{value}</span>
                      </div>
                    );
                  })()}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handlePrintBarcode(selectedBarcodeProduct)}
                    className="p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90"
                  >
                    🖨️ Print Label
                  </button>
                  <button
                    onClick={() => {
                      handleAutoGenerateBarcode(selectedBarcodeProduct);
                    }}
                    className="p-2.5 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-sm hover:bg-surface-3 border border-border"
                  >
                    🔄 Regenerate
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-surface-2 border border-border text-center text-xs text-muted-foreground">
                  No barcode code linked to this product yet.
                </div>
                <button
                  onClick={() => handleAutoGenerateBarcode(selectedBarcodeProduct)}
                  className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-sm hover:opacity-90"
                >
                  ✨ Auto-Generate Barcode SKU
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {selectedTransferProduct && (
        <Modal title={`Transfer: ${selectedTransferProduct.name}`} onClose={() => setSelectedTransferProduct(null)}>
          <div className="space-y-4 text-left">
            <p className="text-xs text-muted-foreground">
              Move stock directly to another store. This adjusts quantities in both stores immediately.
            </p>
            
            <div className="p-3 rounded-lg bg-surface-2 border border-border flex justify-between items-center text-xs">
              <span>Current Stock:</span>
              <span className="font-bold text-primary">{selectedTransferProduct.quantity} units</span>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase">Destination Store</label>
              {(() => {
                const sisterStores = getStoreIndex().filter(s => s.code !== store.accessCode);
                return (
                  <div className="space-y-2">
                    {sisterStores.length > 0 ? (
                      <select
                        value={transferDestCode}
                        onChange={e => setTransferDestCode(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Select sister store...</option>
                        {sisterStores.map(s => (
                          <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                        ))}
                        <option value="MANUAL">Enter Code Manually...</option>
                      </select>
                    ) : null}
                    
                    {(sisterStores.length === 0 || transferDestCode === 'MANUAL') && (
                      <input
                        value={transferDestCode === 'MANUAL' ? '' : transferDestCode}
                        onChange={e => setTransferDestCode(e.target.value)}
                        placeholder="Enter destination store access code (e.g. ABCXYZ)"
                        className={inputClass}
                      />
                    )}
                  </div>
                );
              })()}
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground uppercase">Transfer Quantity</label>
              <input
                type="number"
                min="1"
                max={selectedTransferProduct.quantity}
                value={transferQty}
                onChange={e => setTransferQty(e.target.value)}
                placeholder={`Max: ${selectedTransferProduct.quantity}`}
                className={inputClass}
              />
            </div>
            
            <button
              onClick={() => {
                const qty = Number(transferQty);
                if (!transferDestCode || qty <= 0 || qty > selectedTransferProduct.quantity) {
                  return showToast('Invalid destination store or transfer quantity', 'error');
                }
                let destCode = transferDestCode.trim().toUpperCase();
                if (destCode === 'MANUAL') {
                  return showToast('Please enter store code', 'error');
                }
                if (destCode === store.accessCode) {
                  return showToast('Cannot transfer to current store', 'error');
                }
                
                const targetStore = loadStore(destCode);
                if (!targetStore) {
                  return showToast(`Store code "${destCode}" not found in system`, 'error');
                }
                
                const updated = transferStock(store, selectedTransferProduct.id, qty, destCode);
                onUpdate(updated);
                setSelectedTransferProduct(null);
                setTransferQty('');
                setTransferDestCode('');
                showToast(`✓ Transferred ${qty} unit(s) of ${selectedTransferProduct.name} to store ${destCode}`);
              }}
              className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 text-sm"
            >
              🚚 Complete Transfer
            </button>
          </div>
        </Modal>
      )}

      {selectedDetailProduct && (
        <Modal title={`Product Details: ${selectedDetailProduct.name}`} onClose={() => setSelectedDetailProduct(null)}>
          <div className="space-y-4 text-left">
            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 bg-surface-2 p-3 rounded-xl border border-border text-xs">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Category</p>
                <p className="font-bold text-foreground mt-0.5">{selectedDetailProduct.category}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Barcode / SKU</p>
                <p className="font-mono font-bold text-success mt-0.5">{selectedDetailProduct.barcode || 'Not Linked'}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Current Stock</p>
                <p className={`font-black mt-0.5 ${selectedDetailProduct.quantity <= lowThreshold ? 'text-destructive' : selectedDetailProduct.quantity <= lowThreshold * 3 ? 'text-warning' : 'text-success'}`}>
                  {selectedDetailProduct.quantity} units
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Profit Margin</p>
                {(() => {
                  const margin = selectedDetailProduct.sellingPrice - selectedDetailProduct.costPrice;
                  const pct = selectedDetailProduct.costPrice > 0 ? (margin / selectedDetailProduct.costPrice) * 100 : 0;
                  const cls = margin > 0 ? 'text-success' : margin < 0 ? 'text-destructive' : 'text-muted-foreground';
                  return <p className={`font-bold mt-0.5 ${cls}`}>₦{margin.toLocaleString()} (+{pct.toFixed(0)}%)</p>;
                })()}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Cost Price</p>
                <p className="font-bold text-muted-foreground mt-0.5">₦{selectedDetailProduct.costPrice.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Selling Price</p>
                <p className="font-bold text-primary mt-0.5">₦{selectedDetailProduct.sellingPrice.toLocaleString()}</p>
              </div>
            </div>

            {/* Price History Section */}
            {(() => {
              const priceHistory = selectedDetailProduct.priceHistory || [];
              return (
                <div className="space-y-2 mt-3 pt-3 border-t border-border">
                  <h4 className="text-xs font-display font-bold text-primary flex items-center gap-1.5">
                    📈 Cost Price History Chart
                  </h4>
                  {priceHistory.length >= 2 ? (
                    <div className="h-32 w-full bg-surface-2 p-1 rounded-lg border border-border">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={priceHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(str) => {
                              try {
                                return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                              } catch {
                                return '';
                              }
                            }}
                            tick={{ fill: '#94a3b8', fontSize: 8 }}
                          />
                          <YAxis
                            tick={{ fill: '#94a3b8', fontSize: 8 }}
                            domain={['auto', 'auto']}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#d97706', borderRadius: '6px', padding: '6px' }}
                            labelStyle={{ color: '#f59e0b', fontSize: 9, fontWeight: 'bold' }}
                            itemStyle={{ color: '#f8fafc', fontSize: 9 }}
                            labelFormatter={(lbl) => {
                              try {
                                return new Date(lbl).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
                              } catch {
                                return String(lbl);
                              }
                            }}
                          />
                          <Line type="monotone" dataKey="costPrice" stroke="#d97706" strokeWidth={1.5} dot={{ fill: '#d97706', r: 2 }} name="Cost" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground italic text-center py-1">
                      At least two cost changes are required to render the history trend line.
                    </p>
                  )}

                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Change Log Timeline</p>
                  {priceHistory.length > 0 ? (
                    <div className="max-h-24 overflow-y-auto space-y-1 text-[9px] no-scrollbar">
                      {priceHistory.slice().reverse().map((h, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-surface-2 p-1 rounded border border-border">
                          <span className="text-muted-foreground">
                            {new Date(h.date).toLocaleDateString('en-GB')} {new Date(h.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="font-bold text-foreground">₦{h.costPrice.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-surface-2 border border-border text-center text-[10px] text-muted-foreground">
                      Initial Cost Price: ₦{selectedDetailProduct.costPrice.toLocaleString()} (added at creation)
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Actions buttons inside popup */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border">
              <button
                onClick={() => {
                  setRestockProduct(selectedDetailProduct);
                  setRestockQty('');
                  setSingleRestockFunding('balance');
                  setSelectedDetailProduct(null);
                }}
                className="p-2 rounded-lg bg-success text-white font-display font-semibold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90"
              >
                ↑ Restock
              </button>
              <button
                onClick={() => {
                  setSelectedTransferProduct(selectedDetailProduct);
                  setTransferQty('');
                  setTransferDestCode('');
                  setSelectedDetailProduct(null);
                }}
                className="p-2 rounded-lg bg-warning text-slate-950 font-display font-semibold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90"
              >
                🚚 Transfer
              </button>
              <button
                onClick={() => {
                  const p = selectedDetailProduct;
                  setEditProduct({ ...p });
                  setEditDraft({ name: p.name, costPrice: String(p.costPrice), sellingPrice: String(p.sellingPrice), quantity: String(p.quantity), category: p.category });
                  setEditCustomCategoryActive(p.category !== 'Groceries' && p.category !== 'Beverages' && p.category !== 'Detergents' && p.category !== 'Soap' && p.category !== 'Others' && !['Groceries', 'Beverages', 'Detergents', 'Soap', 'Others'].includes(p.category));
                  setEditCustomCategoryVal(p.category);
                  setSelectedDetailProduct(null);
                }}
                className="p-2 rounded-lg bg-primary text-primary-foreground font-display font-semibold text-xs text-center flex items-center justify-center gap-1 hover:opacity-90"
              >
                ✎ Edit
              </button>
            </div>
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

      {showMassDeleteModal && (
        <Modal
          title={massDeleteStep === 1 ? "Security Quiz" : "Delete All Items?"}
          onClose={() => setShowMassDeleteModal(false)}
        >
          {massDeleteStep === 1 ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Answer these security questions correctly to unlock mass deletion:
              </p>

              <div className="space-y-3">
                {/* Question 1 */}
                <div className="space-y-1">
                  <p className="text-sm font-semibold">1. How many colors does the Nigerian flag have?</p>
                  <div className="flex gap-4">
                    {['3', '2', '4'].map(opt => (
                      <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="q1"
                          value={opt}
                          checked={quizAnswers.q1 === opt}
                          onChange={e => {
                            setQuizAnswers({ ...quizAnswers, q1: e.target.value });
                            setQuizError('');
                          }}
                          className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Question 2 */}
                <div className="space-y-1">
                  <p className="text-sm font-semibold">2. What color is the sky on a clear day?</p>
                  <div className="flex gap-4">
                    {['Blue', 'Red', 'Green'].map(opt => (
                      <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="q2"
                          value={opt}
                          checked={quizAnswers.q2 === opt}
                          onChange={e => {
                            setQuizAnswers({ ...quizAnswers, q2: e.target.value });
                            setQuizError('');
                          }}
                          className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Question 3 */}
                <div className="space-y-1">
                  <p className="text-sm font-semibold">3. Which of the following is a primary color?</p>
                  <div className="flex gap-4">
                    {['Red', 'Purple', 'Orange'].map(opt => (
                      <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="q3"
                          value={opt}
                          checked={quizAnswers.q3 === opt}
                          onChange={e => {
                            setQuizAnswers({ ...quizAnswers, q3: e.target.value });
                            setQuizError('');
                          }}
                          className="text-primary focus:ring-primary h-4 w-4 border-gray-300"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {quizError && (
                <p className="text-xs text-destructive font-semibold">{quizError}</p>
              )}

              <button
                onClick={() => {
                  if (quizAnswers.q1 === '2' && quizAnswers.q2 === 'Blue' && quizAnswers.q3 === 'Red') {
                    setMassDeleteStep(2);
                    setQuizError('');
                  } else {
                    setQuizError('❌ Incorrect answers. Please try again.');
                  }
                }}
                className="w-full p-2.5 rounded-lg bg-primary text-primary-foreground font-display font-semibold hover:opacity-90"
              >
                Next →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs leading-relaxed">
                ⚠️ **WARNING:** This will delete **ALL {store.products.length} products** from your inventory. This action cannot be easily undone, though items are archived in the trash history.
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Are you sure you want to delete your inventory?</p>
                <p className="text-xs text-muted-foreground">Type <span className="font-bold text-foreground">YES</span> below to confirm:</p>
                <input
                  type="text"
                  placeholder="Type YES here"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-surface-2 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-sm font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMassDeleteStep(1)}
                  className="p-2.5 rounded-lg bg-secondary text-secondary-foreground font-display font-semibold text-sm hover:bg-surface-3 border border-border"
                >
                  ← Back
                </button>
                <button
                  onClick={() => {
                    if (confirmText === 'YES') {
                      onUpdate(clearInventory(store));
                      setShowMassDeleteModal(false);
                      showToast('All inventory products deleted');
                    } else {
                      showToast('Type YES to confirm', 'error');
                    }
                  }}
                  disabled={confirmText !== 'YES'}
                  className={`p-2.5 rounded-lg font-display font-semibold text-sm text-white ${
                    confirmText === 'YES' ? 'bg-destructive hover:bg-destructive/95' : 'bg-destructive/40 cursor-not-allowed'
                  }`}
                >
                  Delete Everything
                </button>
              </div>
            </div>
          )}
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
