import { Product, Sale, StoreData, Restock, Expense, ExpenseCategory, TrashItem, TrashKind, Investment, StoreCategory, GameService, GameSession } from '@/types/store';
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

const RAW_DEFAULT_PRODUCTS = [
  { name: "Peak Milk Liquid (New)", costPrice: 700, quantity: 1, category: "Beverage" },
  { name: "Peak Milk Liquid (Old)", costPrice: 1100, quantity: 1, category: "Beverage" },
  { name: "Raid", costPrice: 2200, quantity: 1, category: "Insecticide" },
  { name: "Viva Refill (Big)", costPrice: 2100, quantity: 1, category: "Detergent" },
  { name: "Cabin Biscuit", costPrice: 850, quantity: 1, category: "Biscuit" },
  { name: "Golden Penny Butter", costPrice: 900, quantity: 1, category: "Butter" },
  { name: "Small Corned Beef", costPrice: 2500, quantity: 1, category: "Canned Food" },
  { name: "Titus", costPrice: 1500, quantity: 1, category: "Canned Food" },
  { name: "Oral-B / Close-up (Big)", costPrice: 1500, quantity: 1, category: "Toothpaste" },
  { name: "Ashante Butter", costPrice: 500, quantity: 1, category: "Butter" },
  { name: "Tin Tomatoes (Medium)", costPrice: 700, quantity: 1, category: "Canned Food" },
  { name: "Butter Roll", costPrice: 700, quantity: 10, category: "Butter" },
  { name: "Sachet Onion & Pepper Paste Roll", costPrice: 800, quantity: 8, category: "Condiment" },
  { name: "Super Pack Carton", costPrice: 15000, quantity: 44, category: "Packaged Food" },
  { name: "Sugar Packet", costPrice: 1200, quantity: 1, category: "Sugar" },
  { name: "Sachet Peak Milk & Milo Roll", costPrice: 1750, quantity: 10, category: "Beverage" },
  { name: "Pampers (Big Size)", costPrice: 5700, quantity: 1, category: "Diaper" },
  { name: "Mama Lemon (Big)", costPrice: 2500, quantity: 1, category: "Detergent" },
  { name: "Mama Lemon (Medium)", costPrice: 1500, quantity: 1, category: "Detergent" },
  { name: "Action Bitter Can (20cl)", costPrice: 700, quantity: 1, category: "Beverage" },
  { name: "Balamo Can", costPrice: 400, quantity: 1, category: "Beverage" },
  { name: "David P Water Pack", costPrice: 2400, quantity: 1, category: "Water" },
  { name: "Aquafina Water Pack", costPrice: 2400, quantity: 1, category: "Water" },
  { name: "Baby & Me Soap", costPrice: 600, quantity: 1, category: "Soap" },
  { name: "Viva Tablet Soap", costPrice: 700, quantity: 1, category: "Soap" },
  { name: "Colgate", costPrice: 1500, quantity: 1, category: "Toothpaste" },
  { name: "Super Glue Carton", costPrice: 1800, quantity: 12, category: "Adhesive" },
  { name: "Capt. Jack", costPrice: 500, quantity: 1, category: "Beverage" },
  { name: "Engine Oil (Small Jerrycan)", costPrice: 3500, quantity: 1, category: "Automotive" },
  { name: "Big Tissue Paper", costPrice: 6000, quantity: 1, category: "Toiletries" },
  { name: "Softcare Pampers (Small Pack)", costPrice: 1100, quantity: 1, category: "Diaper" },
  { name: "Powdered Refill Peak Milk", costPrice: 4000, quantity: 1, category: "Beverage" },
  { name: "Refill Milo", costPrice: 3500, quantity: 1, category: "Beverage" },
  { name: "Cake Roll", costPrice: 1600, quantity: 10, category: "Bakery" },
  { name: "Dano Milk", costPrice: 1500, quantity: 10, category: "Beverage" },
  { name: "Golden Penny Spaghetti", costPrice: 900, quantity: 1, category: "Pasta" },
  { name: "Custard Cup (Smallest)", costPrice: 1500, quantity: 1, category: "Food" },
  { name: "Custard Cup (with Milk & Sugar)", costPrice: 2000, quantity: 1, category: "Food" },
  { name: "Garri Mix (Big Roll)", costPrice: 3000, quantity: 10, category: "Food" },
  { name: "Garri Mix (Small Roll)", costPrice: 1800, quantity: 10, category: "Food" },
  { name: "Coca Oat Roll", costPrice: 3000, quantity: 10, category: "Food" },
  { name: "Choco Roll", costPrice: 3300, quantity: 10, category: "Food" },
  { name: "3-in-1 Nescafé", costPrice: 1800, quantity: 10, category: "Beverage" },
  { name: "Power Oil Groundnut Oil Roll", costPrice: 3400, quantity: 8, category: "Oil" },
  { name: "Lipton", costPrice: 800, quantity: 10, category: "Beverage" },
  { name: "Bama Roll", costPrice: 800, quantity: 10, category: "Condiment" },
  { name: "Mineral", costPrice: 4700, quantity: 10, category: "Beverage" },
  { name: "Eagle Gin", costPrice: 2300, quantity: 6, category: "Alcohol" },
  { name: "Malta Guinness", costPrice: 13500, quantity: 3, category: "Beverage" },
  { name: "Chelsea", costPrice: 3200, quantity: 3, category: "Biscuit" },
  { name: "Predator", costPrice: 5500, quantity: 2, category: "Beverage" },
  { name: "Fearless", costPrice: 5000, quantity: 2, category: "Beverage" },
  { name: "Nutrimilk", costPrice: 6000, quantity: 2, category: "Beverage" },
  { name: "Bigi", costPrice: 2700, quantity: 2, category: "Beverage" },
  { name: "Hollandia", costPrice: 17000, quantity: 2, category: "Beverage" },
  { name: "Nutrichoco", costPrice: 9500, quantity: 1, category: "Beverage" },
  { name: "Fayrouz", costPrice: 14000, quantity: 1, category: "Beverage" },
  { name: "Pepsi", costPrice: 5000, quantity: 1, category: "Beverage" },
  { name: "Teem Lemon", costPrice: 5000, quantity: 1, category: "Beverage" },
  { name: "Lacasera S/M", costPrice: 3000, quantity: 1, category: "Beverage" },
  { name: "Big Lacasera", costPrice: 4200, quantity: 1, category: "Beverage" },
  { name: "GINO Tomatoes Sachet", costPrice: 8000, quantity: 1, category: "Condiment" },
  { name: "Indomitable", costPrice: 10000, quantity: 1, category: "Packaged Food" },
  { name: "Dudu Mixed Fruit", costPrice: 8700, quantity: 1, category: "Beverage" },
  { name: "Can Coke", costPrice: 12000, quantity: 1, category: "Beverage" },
  { name: "Can Fanta", costPrice: 12000, quantity: 1, category: "Beverage" },
  { name: "Viju Baked", costPrice: 10500, quantity: 1, category: "Beverage" },
  { name: "Ceeder", costPrice: 11000, quantity: 1, category: "Beverage" },
  { name: "Exotic", costPrice: 15000, quantity: 1, category: "Beverage" },
  { name: "5Alive Pulpy", costPrice: 8000, quantity: 1, category: "Beverage" },
  { name: "Black Bullet", costPrice: 28600, quantity: 1, category: "Beverage" },
  { name: "Action Schnapps", costPrice: 19500, quantity: 1, category: "Alcohol" },
  { name: "Guinness Stout", costPrice: 25000, quantity: 1, category: "Beverage" },
  { name: "Spaghetti", costPrice: 19500, quantity: 1, category: "Pasta" },
  { name: "Macaroni", costPrice: 19600, quantity: 1, category: "Pasta" },
  { name: "Rice Mango", costPrice: 80000, quantity: 1, category: "Rice" },
  { name: "Blue Bullet", costPrice: 21000, quantity: 1, category: "Beverage" },
  { name: "Garri (White Bucket)", costPrice: 2500, quantity: 1, category: "Grocery" },
  { name: "Garri (Yellow Bucket)", costPrice: 2500, quantity: 1, category: "Grocery" },
  { name: "Rice (Foreign Bucket)", costPrice: 8000, quantity: 1, category: "Rice" },
  { name: "Rice (Foreign Bag 50kg)", costPrice: 96000, quantity: 1, category: "Rice" },
  { name: "White Beans Bucket", costPrice: 7000, quantity: 1, category: "Grocery" },
  { name: "Honey Beans Bucket", costPrice: 7500, quantity: 1, category: "Grocery" },
  { name: "Semovita (1kg)", costPrice: 2500, quantity: 1, category: "Food" },
  { name: "Semolina (1kg)", costPrice: 2600, quantity: 1, category: "Food" },
  { name: "Poundo Yam (1kg)", costPrice: 4500, quantity: 1, category: "Food" },
  { name: "Wheat Meal (1kg)", costPrice: 3000, quantity: 1, category: "Food" },
  { name: "Golden Morn (1kg)", costPrice: 3500, quantity: 1, category: "Cereal" },
  { name: "Corn Flakes (500g)", costPrice: 3500, quantity: 1, category: "Cereal" },
  { name: "Peak Milk Sachet Roll", costPrice: 3000, quantity: 10, category: "Beverage" },
  { name: "Milo Sachet Roll", costPrice: 3500, quantity: 10, category: "Beverage" },
  { name: "Bread (Small Loaf)", costPrice: 1500, quantity: 1, category: "Bakery" },
  { name: "Bread (Large Loaf)", costPrice: 2500, quantity: 1, category: "Bakery" },
  { name: "Egg Crate", costPrice: 7000, quantity: 1, category: "Food" },
  { name: "Palm Oil (1 Litre)", costPrice: 2500, quantity: 1, category: "Oil" },
  { name: "Groundnut Oil (1 Litre)", costPrice: 3500, quantity: 1, category: "Oil" },
  { name: "Salt (Small Pack)", costPrice: 1200, quantity: 1, category: "Condiment" },
  { name: "Salt (Large Pack)", costPrice: 2500, quantity: 1, category: "Condiment" },
  { name: "Maggi Star Cubes (Pack)", costPrice: 1800, quantity: 1, category: "Seasoning" },
  { name: "Knorr Cubes (Pack)", costPrice: 1800, quantity: 1, category: "Seasoning" },
  { name: "Dettol Soap", costPrice: 1500, quantity: 1, category: "Soap" },
  { name: "Premier Soap", costPrice: 1200, quantity: 1, category: "Soap" },
  { name: "Joy Soap", costPrice: 1200, quantity: 1, category: "Soap" },
  { name: "Morning Fresh", costPrice: 1800, quantity: 1, category: "Detergent" },
  { name: "Omo Detergent (Small)", costPrice: 2000, quantity: 1, category: "Detergent" },
  { name: "Ariel Detergent (Small)", costPrice: 2500, quantity: 1, category: "Detergent" },
  { name: "Onion Basket", costPrice: 18000, quantity: 1, category: "Vegetables" },
  { name: "Tomatoes Basket", costPrice: 35000, quantity: 1, category: "Vegetables" },
  { name: "Pepper Basket", costPrice: 25000, quantity: 1, category: "Vegetables" },
  { name: "Sachet Water Bag", costPrice: 600, quantity: 1, category: "Water" },
  { name: "Basket (Small)", costPrice: 2500, quantity: 1, category: "Household" },
  { name: "Basket (Medium)", costPrice: 4500, quantity: 1, category: "Household" },
  { name: "Basket (Large)", costPrice: 7000, quantity: 1, category: "Household" },
  { name: "Sack (Rice Sack)", costPrice: 1200, quantity: 1, category: "Packaging" },
  { name: "Sack (Garri Sack)", costPrice: 1000, quantity: 1, category: "Packaging" }
];

const DEFAULT_PRODUCTS: Omit<Product, 'id'>[] = RAW_DEFAULT_PRODUCTS.map(p => {
  const cost = p.costPrice;
  const selling = Math.round((cost * 1.30) / 50) * 50 || cost + 50;
  return {
    name: p.name,
    costPrice: cost,
    sellingPrice: selling,
    quantity: p.quantity,
    category: p.category
  };
});

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

const DEFAULT_GAMES: Omit<GameService, 'id'>[] = [
  { name: 'PlayStation', icon: '🎮', price: 500, enabled: false, order: 0 },
  { name: 'Snooker', icon: '🎱', price: 1000, enabled: false, order: 1 },
  { name: 'Xbox', icon: '🎮', price: 500, enabled: false, order: 2 },
  { name: 'Table Tennis', icon: '🏓', price: 300, enabled: false, order: 3 },
  { name: 'Darts', icon: '🎯', price: 200, enabled: false, order: 4 },
  { name: 'Karaoke', icon: '🎤', price: 1500, enabled: false, order: 5 },
  { name: 'VR Games', icon: '🥽', price: 2000, enabled: false, order: 6 },
];

export function createStore(storeName: string, category: StoreCategory = 'retail'): StoreData {
  const code = generateCode();
  const now = new Date().toISOString();
  const isRetail = category === 'retail';
  const products = isRetail
    ? DEFAULT_PRODUCTS.map(p => {
        const qty = Math.max(6, p.quantity);
        return { ...p, quantity: qty, id: generateId(), initialQuantity: qty, addedAt: now };
      })
    : [];
  const inventoryValue = products.reduce((sum, p) => sum + p.costPrice * p.quantity, 0);
  const investments: Investment[] = inventoryValue > 0 ? [{
    id: generateId(),
    amount: Math.round(inventoryValue * 100) / 100,
    note: 'Auto: starting inventory value',
    date: now,
    type: 'initial',
  }] : [];
  const games: GameService[] | undefined = category === 'games'
    ? DEFAULT_GAMES.map(g => ({ ...g, id: generateId() }))
    : undefined;
  const store: StoreData = {
    storeName,
    accessCode: code,
    category,
    products,
    sales: [],
    restocks: [],
    expenses: [],
    investments,
    games,
    gameSessions: category === 'games' ? [] : undefined,
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
  const now = new Date().toISOString();
  const costTotal = Math.round(product.costPrice * product.quantity * 100) / 100;
  const newInvestments = [...(store.investments || [])];
  const newExpenses = [...(store.expenses || [])];
  if (costTotal > 0) {
    newInvestments.push({
      id: generateId(),
      amount: costTotal,
      note: `Added Inventory: ${product.name}`,
      date: now,
      type: 'additional',
    });
    newExpenses.push({
      id: generateId(),
      amount: costTotal,
      category: 'Restock',
      date: now,
      note: `Added Inventory: ${product.name} (${product.quantity} units)`,
      source: 'restock',
    });
  }
  const updated = {
    ...store,
    products: [...store.products, { ...product, id: generateId(), initialQuantity: product.quantity, addedAt: now }],
    investments: newInvestments,
    expenses: newExpenses,
  };
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

export function clearInventory(store: StoreData): StoreData {
  const now = new Date().toISOString();
  const trashItems = store.products.map(p => ({
    id: generateId(),
    kind: 'product' as TrashKind,
    deletedAt: now,
    payload: p,
  }));
  const updated = {
    ...store,
    products: [],
    trash: [...trashItems, ...(store.trash || [])],
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
  
  let importTotal = 0;
  products.forEach(p => {
    importTotal += p.costPrice * p.quantity;
  });
  importTotal = Math.round(importTotal * 100) / 100;

  const newInvestments = [...(store.investments || [])];
  const newExpenses = [...(store.expenses || [])];

  if (importTotal > 0) {
    newInvestments.push({
      id: generateId(),
      amount: importTotal,
      note: `Bulk Imported Inventory (${products.length} products)`,
      date: now,
      type: 'additional',
    });
    newExpenses.push({
      id: generateId(),
      amount: importTotal,
      category: 'Restock',
      date: now,
      note: `Bulk Imported Inventory (${products.length} products)`,
      source: 'restock',
    });
  }

  const updated = {
    ...store,
    products: [...store.products, ...newProducts],
    investments: newInvestments,
    expenses: newExpenses,
  };
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

// ---------- Pending Payments ----------

import type { PendingPayment, PendingPaymentEvent, PendingPaymentItem, PaymentMethod } from '@/types/store';

function pid(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/**
 * Records the sale (decrements stock, creates Sale rows) AND creates a PendingPayment
 * if `paid < total`. If paid >= total it just records a normal paid sale.
 */
export function recordCheckout(
  store: StoreData,
  items: { productId: string; quantity: number }[],
  opts: {
    paid: number;
    method: PaymentMethod;
    customerName?: string;
    customerPhone?: string;
    customerNote?: string;
    dueDate?: string;
    discount?: number;
  }
): { store: StoreData; sales: Sale[]; pending?: PendingPayment } {
  let updated = store;
  const newSales: Sale[] = [];
  const pendingItems: PendingPaymentItem[] = [];

  for (const it of items) {
    const p = updated.products.find(p => p.id === it.productId);
    if (!p || p.quantity < it.quantity) continue;
    updated = recordSale(updated, it.productId, it.quantity);
    const created = updated.sales[0];
    newSales.push(created);
    pendingItems.push({
      productId: p.id,
      productName: p.name,
      quantity: it.quantity,
      unitPrice: created.unitPrice,
    });
  }

  const total = Math.max(0, newSales.reduce((s, x) => s + x.total, 0) - (opts.discount || 0));
  const paid = Math.min(opts.paid, total);
  const balance = Math.max(0, total - paid);

  let pending: PendingPayment | undefined;
  if (balance > 0 && opts.customerName) {
    const id = pid();
    const event: PendingPaymentEvent = { date: new Date().toISOString(), amount: paid, method: opts.method };
    pending = {
      id,
      customerName: opts.customerName,
      customerPhone: opts.customerPhone,
      customerNote: opts.customerNote,
      items: pendingItems,
      total,
      paid,
      balance,
      dueDate: opts.dueDate,
      createdAt: new Date().toISOString(),
      status: 'pending',
      events: paid > 0 ? [event] : [],
      saleIds: newSales.map(s => s.id),
    };
    // tag sales
    updated = {
      ...updated,
      sales: updated.sales.map(s => pending!.saleIds.includes(s.id) ? { ...s, pendingPaymentId: id, paymentMethod: opts.method } : s),
      pendingPayments: [pending, ...(updated.pendingPayments || [])],
    };
  } else {
    updated = {
      ...updated,
      sales: updated.sales.map(s => newSales.some(x => x.id === s.id) ? { ...s, paymentMethod: opts.method } : s),
    };
  }
  saveStore(updated);
  return { store: updated, sales: newSales, pending };
}

export function addPaymentToPending(store: StoreData, id: string, amount: number, method: PaymentMethod = 'cash'): StoreData {
  const list = store.pendingPayments || [];
  const updated: StoreData = {
    ...store,
    pendingPayments: list.map(p => {
      if (p.id !== id) return p;
      const newPaid = Math.min(p.total, p.paid + Math.max(0, amount));
      const balance = Math.max(0, p.total - newPaid);
      const event: PendingPaymentEvent = { date: new Date().toISOString(), amount, method };
      return {
        ...p,
        paid: newPaid,
        balance,
        status: balance <= 0 ? 'paid' : 'pending',
        events: [event, ...(p.events || [])],
      };
    }),
  };
  saveStore(updated);
  return updated;
}

export function markPendingPaid(store: StoreData, id: string, method: PaymentMethod = 'cash'): StoreData {
  const p = (store.pendingPayments || []).find(x => x.id === id);
  if (!p) return store;
  return addPaymentToPending(store, id, p.balance, method);
}

export function deletePendingPayment(store: StoreData, id: string): StoreData {
  const updated: StoreData = {
    ...store,
    pendingPayments: (store.pendingPayments || []).filter(p => p.id !== id),
  };
  saveStore(updated);
  return updated;
}

export function getPendingSummary(store: StoreData) {
  const list = (store.pendingPayments || []).filter(p => p.status === 'pending');
  const totalOwed = list.reduce((s, p) => s + p.balance, 0);
  const customerCount = new Set(list.map(p => p.customerName.toLowerCase())).size;
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  let collectedThisMonth = 0;
  let collectedAllTime = 0;
  let originatedAllTime = 0;
  (store.pendingPayments || []).forEach(p => {
    originatedAllTime += p.total;
    (p.events || []).forEach(e => {
      collectedAllTime += e.amount;
      if (new Date(e.date) >= monthStart) collectedThisMonth += e.amount;
    });
  });
  const recoveryRate = originatedAllTime > 0 ? Math.round((collectedAllTime / originatedAllTime) * 100) : 0;
  const overdue = list.filter(p => p.dueDate && new Date(p.dueDate) < new Date());
  return { totalOwed, customerCount, collectedThisMonth, recoveryRate, overdue, list };
}
