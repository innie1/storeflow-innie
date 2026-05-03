import { Product, Sale, StoreData, Restock, Expense, ExpenseCategory, TrashItem, TrashKind, Investment } from '@/types/store';
import { getLowStockThreshold } from '@/lib/settings';

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['Restock', 'Rent', 'Utilities', 'Salaries', 'Transport', 'Other'];

const STORE_PREFIX = 'storeflow_';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const DEFAULT_PRODUCTS: Omit<Product, 'id'>[] = [
  { name: "Dettol Soap", costPrice: 250, sellingPrice: 350, quantity: 48, category: "Toiletries" },
  { name: "Peak Milk (Tin)", costPrice: 500, sellingPrice: 650, quantity: 36, category: "Groceries" },
  { name: "Indomie (Carton)", costPrice: 4500, sellingPrice: 5200, quantity: 12, category: "Groceries" },
  { name: "Golden Penny Spaghetti", costPrice: 400, sellingPrice: 550, quantity: 30, category: "Groceries" },
  { name: "Bournvita 400g", costPrice: 1200, sellingPrice: 1500, quantity: 15, category: "Beverages" },
  { name: "Milo 400g", costPrice: 1400, sellingPrice: 1750, quantity: 18, category: "Beverages" },
  { name: "Dangote Sugar 500g", costPrice: 350, sellingPrice: 500, quantity: 40, category: "Groceries" },
  { name: "Kings Oil 75cl", costPrice: 800, sellingPrice: 1050, quantity: 24, category: "Groceries" },
  { name: "Maggi Star (Pack)", costPrice: 100, sellingPrice: 150, quantity: 100, category: "Groceries" },
  { name: "Omo Detergent 500g", costPrice: 300, sellingPrice: 450, quantity: 35, category: "Toiletries" },
  { name: "Close Up Toothpaste", costPrice: 200, sellingPrice: 300, quantity: 25, category: "Toiletries" },
  { name: "Harpic Toilet Cleaner", costPrice: 500, sellingPrice: 700, quantity: 10, category: "Toiletries" },
  { name: "Coca-Cola (Bottle)", costPrice: 150, sellingPrice: 200, quantity: 60, category: "Beverages" },
  { name: "Fanta (Bottle)", costPrice: 150, sellingPrice: 200, quantity: 48, category: "Beverages" },
  { name: "Maltina (Can)", costPrice: 200, sellingPrice: 300, quantity: 36, category: "Beverages" },
  { name: "Eva Water 75cl", costPrice: 100, sellingPrice: 150, quantity: 72, category: "Beverages" },
  { name: "Cabin Biscuit", costPrice: 50, sellingPrice: 100, quantity: 80, category: "Snacks" },
  { name: "Digestive Biscuit", costPrice: 150, sellingPrice: 250, quantity: 30, category: "Snacks" },
  { name: "Gala Sausage Roll", costPrice: 100, sellingPrice: 150, quantity: 50, category: "Snacks" },
  { name: "Butter Bread (Loaf)", costPrice: 500, sellingPrice: 700, quantity: 8, category: "Bakery" },
  { name: "Golden Penny Flour 1kg", costPrice: 600, sellingPrice: 800, quantity: 20, category: "Groceries" },
  { name: "Nescafe Sachet", costPrice: 50, sellingPrice: 100, quantity: 100, category: "Beverages" },
  { name: "Lipton Tea (Pack)", costPrice: 200, sellingPrice: 300, quantity: 40, category: "Beverages" },
  { name: "Vaseline Jelly 100ml", costPrice: 300, sellingPrice: 450, quantity: 20, category: "Toiletries" },
  { name: "Nivea Roll-On", costPrice: 400, sellingPrice: 600, quantity: 15, category: "Toiletries" },
  { name: "Dano Milk Sachet", costPrice: 100, sellingPrice: 150, quantity: 60, category: "Groceries" },
  { name: "Sardine (Titus)", costPrice: 500, sellingPrice: 700, quantity: 25, category: "Groceries" },
  { name: "Tomato Paste (Tin)", costPrice: 200, sellingPrice: 300, quantity: 40, category: "Groceries" },
  { name: "Groundnut Oil 75cl", costPrice: 900, sellingPrice: 1200, quantity: 18, category: "Groceries" },
  { name: "Pampers Diapers (Small)", costPrice: 1500, sellingPrice: 2000, quantity: 10, category: "Baby" },
  { name: "Cway Water (Big)", costPrice: 200, sellingPrice: 300, quantity: 30, category: "Beverages" },
  { name: "Tissue Paper (Roll)", costPrice: 150, sellingPrice: 250, quantity: 50, category: "Toiletries" },
];

const STORE_INDEX_KEY = 'storeflow_index';

export interface StoreIndexEntry {
  code: string;
  name: string;
  createdAt: string;
}

export function getStoreIndex(): StoreIndexEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_INDEX_KEY) || '[]');
  } catch {
    return [];
  }
}

function upsertStoreIndex(store: StoreData) {
  const idx = getStoreIndex().filter(s => s.code !== store.accessCode);
  idx.unshift({ code: store.accessCode, name: store.storeName, createdAt: store.createdAt });
  localStorage.setItem(STORE_INDEX_KEY, JSON.stringify(idx));
}

export function removeStoreFromIndex(code: string) {
  const idx = getStoreIndex().filter(s => s.code !== code);
  localStorage.setItem(STORE_INDEX_KEY, JSON.stringify(idx));
  localStorage.removeItem(STORE_PREFIX + code);
}

export function createStore(storeName: string): StoreData {
  const code = generateCode();
  const now = new Date().toISOString();
  const products = DEFAULT_PRODUCTS.map(p => ({ ...p, id: generateId(), initialQuantity: p.quantity, addedAt: now }));
  const inventoryValue = products.reduce((sum, p) => sum + p.costPrice * p.quantity, 0);
  const investments: Investment[] = inventoryValue > 0 ? [{
    id: generateId(),
    amount: Math.round(inventoryValue * 100) / 100,
    note: 'Auto: starting inventory value',
    date: now,
    type: 'initial',
  }] : [];
  const store: StoreData = {
    storeName,
    accessCode: code,
    products,
    sales: [],
    restocks: [],
    expenses: [],
    investments,
    createdAt: now,
  };
  localStorage.setItem(STORE_PREFIX + code, JSON.stringify(store));
  upsertStoreIndex(store);
  return store;
}

export function loadStore(code: string): StoreData | null {
  const data = localStorage.getItem(STORE_PREFIX + code.toUpperCase());
  if (!data) return null;
  const store = JSON.parse(data);
  upsertStoreIndex(store);
  return store;
}

export function saveStore(store: StoreData): void {
  // Auto-purge trash items older than 7 days on every save
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const trash = (store.trash || []).filter(t => new Date(t.deletedAt).getTime() > cutoff);
  const cleaned = { ...store, trash };
  localStorage.setItem(STORE_PREFIX + store.accessCode, JSON.stringify(cleaned));
}

function pushTrash(store: StoreData, kind: TrashKind, payload: Product | Sale | Expense): TrashItem[] {
  const item: TrashItem = {
    id: generateId(),
    kind,
    deletedAt: new Date().toISOString(),
    payload,
  };
  return [item, ...(store.trash || [])];
}

export function addProduct(store: StoreData, product: Omit<Product, 'id'>): StoreData {
  const updated = { ...store, products: [...store.products, { ...product, id: generateId(), initialQuantity: product.quantity, addedAt: new Date().toISOString() }] };
  saveStore(updated);
  return updated;
}

export function updateProduct(store: StoreData, id: string, updates: Partial<Product>): StoreData {
  const updated = {
    ...store,
    products: store.products.map(p => p.id === id ? { ...p, ...updates } : p),
  };
  saveStore(updated);
  return updated;
}

export function deleteProduct(store: StoreData, id: string): StoreData {
  const product = store.products.find(p => p.id === id);
  if (!product) return store;
  const updated = {
    ...store,
    products: store.products.filter(p => p.id !== id),
    trash: pushTrash(store, 'product', product),
  };
  saveStore(updated);
  return updated;
}

export function deleteSale(store: StoreData, id: string): StoreData {
  const sale = store.sales.find(s => s.id === id);
  if (!sale) return store;
  const updated = {
    ...store,
    sales: store.sales.filter(s => s.id !== id),
    trash: pushTrash(store, 'sale', sale),
  };
  saveStore(updated);
  return updated;
}

export function recordSale(store: StoreData, productId: string, quantity: number): StoreData {
  const product = store.products.find(p => p.id === productId);
  if (!product || product.quantity < quantity) return store;
  if (quantity <= 0) return store;
  
  const sale: Sale = {
    id: generateId(),
    productId,
    productName: product.name,
    quantity: Math.round(quantity * 100) / 100, // Round to 2 decimal places
    unitPrice: product.sellingPrice,
    total: Math.round(product.sellingPrice * quantity * 100) / 100,
    profit: Math.round((product.sellingPrice - product.costPrice) * quantity * 100) / 100,
    date: new Date().toISOString(),
  };

  const updated = {
    ...store,
    products: store.products.map(p => p.id === productId ? { ...p, quantity: Math.round((p.quantity - quantity) * 100) / 100 } : p),
    sales: [sale, ...store.sales],
  };
  saveStore(updated);
  return updated;
}

export function clearSales(store: StoreData): StoreData {
  const trash = store.sales.reduce<TrashItem[]>((acc, s) => {
    acc.unshift({ id: generateId(), kind: 'sale', deletedAt: new Date().toISOString(), payload: s });
    return acc;
  }, []);
  const updated = { ...store, sales: [], trash: [...trash, ...(store.trash || [])] };
  saveStore(updated);
  return updated;
}

export function importProducts(store: StoreData, products: Omit<Product, 'id'>[]): StoreData {
  const now = new Date().toISOString();
  const newProducts = products.map(p => ({ ...p, id: generateId(), initialQuantity: p.quantity, addedAt: now }));
  const updated = { ...store, products: [...store.products, ...newProducts] };
  saveStore(updated);
  return updated;
}

export interface RestockEntry {
  productId: string;
  quantity: number;
  costPrice: number;
}

export type RestockFunding = 'balance' | 'new_money';

export function receiveStock(store: StoreData, entries: RestockEntry[], funding: RestockFunding = 'balance'): StoreData {
  const now = new Date().toISOString();
  const batchId = generateId();
  const newRestocks: Restock[] = [];
  let restockTotal = 0;
  const itemNames: string[] = [];
  const updatedProducts = store.products.map(p => {
    const entry = entries.find(e => e.productId === p.id);
    if (!entry || entry.quantity <= 0) return p;
    const lineTotal = Math.round(entry.quantity * entry.costPrice * 100) / 100;
    restockTotal += lineTotal;
    itemNames.push(`${p.name} ×${entry.quantity}`);
    newRestocks.push({
      id: generateId(),
      productId: p.id,
      productName: p.name,
      quantity: entry.quantity,
      costPrice: entry.costPrice,
      total: lineTotal,
      date: now,
      batchId,
      funding,
    });
    return {
      ...p,
      quantity: Math.round((p.quantity + entry.quantity) * 100) / 100,
      costPrice: entry.costPrice > 0 ? entry.costPrice : p.costPrice,
      initialQuantity: p.initialQuantity ?? p.quantity,
    };
  });

  // Auto-create a single Restock expense for the entire batch (always — reduces net income / cash)
  const newExpenses: Expense[] = [];
  const newInvestments: Investment[] = [];
  if (restockTotal > 0) {
    const fundingLabel = funding === 'new_money' ? ' (new money invested)' : ' (from balance)';
    newExpenses.push({
      id: generateId(),
      amount: Math.round(restockTotal * 100) / 100,
      category: 'Restock',
      date: now,
      note: `Stock from supplier${fundingLabel}: ${itemNames.slice(0, 4).join(', ')}${itemNames.length > 4 ? `, +${itemNames.length - 4} more` : ''}`,
      source: 'restock',
      restockBatchId: batchId,
    });
    // If new money was injected, also record an Investment so ROI base grows
    if (funding === 'new_money') {
      newInvestments.push({
        id: generateId(),
        amount: Math.round(restockTotal * 100) / 100,
        note: `Restock capital injection (${itemNames.length} item${itemNames.length === 1 ? '' : 's'})`,
        date: now,
        type: 'additional',
      });
    }
  }

  const updated: StoreData = {
    ...store,
    products: updatedProducts,
    restocks: [...newRestocks, ...(store.restocks || [])],
    expenses: [...newExpenses, ...(store.expenses || [])],
    investments: [...newInvestments, ...(store.investments || [])],
  };
  saveStore(updated);
  return updated;
}

export function findProductByBarcode(store: StoreData, barcode: string): Product | undefined {
  return store.products.find(p => p.barcode === barcode);
}

export function addExpense(store: StoreData, expense: Omit<Expense, 'id' | 'source'>): StoreData {
  const newExpense: Expense = {
    ...expense,
    id: generateId(),
    source: 'manual',
  };
  const updated: StoreData = {
    ...store,
    expenses: [newExpense, ...(store.expenses || [])],
  };
  saveStore(updated);
  return updated;
}

export function deleteExpense(store: StoreData, id: string): StoreData {
  const expense = (store.expenses || []).find(e => e.id === id);
  if (!expense) return store;
  const updated: StoreData = {
    ...store,
    expenses: (store.expenses || []).filter(e => e.id !== id),
    trash: pushTrash(store, 'expense', expense),
  };
  saveStore(updated);
  return updated;
}

// ---------- Trash ----------

export function getTrash(store: StoreData): TrashItem[] {
  const cutoff = Date.now() - TRASH_RETENTION_MS;
  return (store.trash || [])
    .filter(t => new Date(t.deletedAt).getTime() > cutoff)
    .sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
}

export function restoreTrashItem(store: StoreData, trashId: string): StoreData {
  const item = (store.trash || []).find(t => t.id === trashId);
  if (!item) return store;
  const remaining = (store.trash || []).filter(t => t.id !== trashId);
  let updated: StoreData = { ...store, trash: remaining };
  if (item.kind === 'product') {
    const p = item.payload as Product;
    if (!updated.products.some(x => x.id === p.id)) {
      updated = { ...updated, products: [...updated.products, p] };
    }
  } else if (item.kind === 'sale') {
    const s = item.payload as Sale;
    if (!updated.sales.some(x => x.id === s.id)) {
      updated = { ...updated, sales: [s, ...updated.sales] };
    }
  } else if (item.kind === 'expense') {
    const e = item.payload as Expense;
    const list = updated.expenses || [];
    if (!list.some(x => x.id === e.id)) {
      updated = { ...updated, expenses: [e, ...list] };
    }
  }
  saveStore(updated);
  return updated;
}

export function purgeTrashItem(store: StoreData, trashId: string): StoreData {
  const updated: StoreData = {
    ...store,
    trash: (store.trash || []).filter(t => t.id !== trashId),
  };
  saveStore(updated);
  return updated;
}

export function emptyTrash(store: StoreData): StoreData {
  const updated: StoreData = { ...store, trash: [] };
  saveStore(updated);
  return updated;
}

export function getTopSellers(store: StoreData, limit = 5): { name: string; totalSold: number; revenue: number }[] {
  const map = new Map<string, { name: string; totalSold: number; revenue: number }>();
  store.sales.forEach(s => {
    const existing = map.get(s.productId) || { name: s.productName, totalSold: 0, revenue: 0 };
    existing.totalSold += s.quantity;
    existing.revenue += s.total;
    map.set(s.productId, existing);
  });
  return Array.from(map.values()).sort((a, b) => b.totalSold - a.totalSold).slice(0, limit);
}

export function getDashboardStats(store: StoreData) {
  const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
  const totalProfit = store.sales.reduce((sum, s) => sum + s.profit, 0);
  const totalProducts = store.products.length;
  const threshold = getLowStockThreshold();
  const lowStockProducts = store.products.filter(p => p.quantity <= threshold);
  const totalSales = store.sales.length;
  const inventoryValue = store.products.reduce((sum, p) => sum + p.costPrice * p.quantity, 0);
  const totalExpenses = (store.expenses || []).reduce((sum, e) => sum + e.amount, 0);
  const netIncome = totalRevenue - totalExpenses;
  return { totalRevenue, totalProfit, totalProducts, lowStockProducts, totalSales, inventoryValue, totalExpenses, netIncome };
}

// ---------- Investments ----------

function generateId2(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function addInvestment(store: StoreData, investment: Omit<Investment, 'id'>): StoreData {
  const newInv: Investment = { ...investment, id: generateId2() };
  const updated: StoreData = {
    ...store,
    investments: [newInv, ...(store.investments || [])],
  };
  saveStore(updated);
  return updated;
}

export function deleteInvestment(store: StoreData, id: string): StoreData {
  const updated: StoreData = {
    ...store,
    investments: (store.investments || []).filter(i => i.id !== id),
  };
  saveStore(updated);
  return updated;
}

export function getTotalInvestment(store: StoreData): number {
  return (store.investments || []).reduce((sum, i) => sum + i.amount, 0);
}
