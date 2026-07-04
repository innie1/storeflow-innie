import { 
  Product, Sale, StoreData, Restock, Expense, ExpenseCategory, TrashItem, TrashKind, 
  Investment, StoreCategory, GameService, GameSession,
  Customer, Supplier, BusinessGoal, MemoryEvent, DiaryEntry, StaffMember, Shift, 
  CashSession, LostSale, WishlistItem, VaultDocument, BusinessChallenge, InventoryTransfer,
  DEFAULT_MANAGER_SETTINGS
} from '@/types/store';
import { getLowStockThreshold } from '@/lib/settings';
import { createAutoBackupSnapshot } from '@/lib/backup-system';

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['Restock', 'Rent', 'Utilities', 'Salaries', 'Transport', 'Other'];

export const STORE_PREFIX = 'storeflow_';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function generateStoreUniqueCode(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Generates a permanent UUID-style Store ID (e.g. SF-8F3A2C1D-B4E9). Never changes after creation. */
function generatePermanentStoreId(): string {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).toUpperCase().padStart(4, '0');
  return `SF-${hex()}${hex()}-${hex()}`;
}

/**
 * Ensures a store has a permanent storeId. If one doesn't exist (e.g. existing stores),
 * it generates one and persists it immediately. Call this at app load.
 */
export function ensureStoreId(store: StoreData): StoreData {
  if (store.storeId) return store; // Already has one — never overwrite
  const storeId = generatePermanentStoreId();
  const updated = { ...store, storeId };
  // Persist immediately to localStorage
  try {
    localStorage.setItem(STORE_PREFIX + store.accessCode, JSON.stringify(updated));
  } catch (_) { /* storage quota — non-fatal */ }
  return updated;
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

export function createStore(storeName: string, category: StoreCategory = 'retail', retailType?: string, logoStyle?: string): StoreData {
  const code = generateCode();
  const now = new Date().toISOString();
  const isRetail = category === 'retail';
  const shouldPreload = isRetail && (!retailType || retailType === 'provision_retail' || retailType === 'provision_wholesale');
  const products = shouldPreload
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
    retailType,
    products,
    sales: [],
    restocks: [],
    expenses: [],
    investments,
    games,
    gameSessions: category === 'games' ? [] : undefined,
    createdAt: now,
    profile: {
      storeType: '',
      location: '',
      phone: '',
      email: '',
      logoStyle: logoStyle || 'minimalist',
      uniqueCode: generateStoreUniqueCode(),
    }
  };
  localStorage.setItem(STORE_PREFIX + code, JSON.stringify(store));
  upsertStoreIndex(store);
  return store;
}

export function recalculateSavings(store: StoreData): StoreData {
  if (!store.savingsGoal || store.savingsGoal.autoSaveEnabled) return store;
  const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
  const totalProfit = store.sales.reduce((sum, s) => sum + s.profit, 0);
  const percentage = store.savingsGoal.percentage || 0;
  const source = store.savingsGoal.source || 'profit';
  const base = source === 'profit' ? totalProfit : totalRevenue;
  store.savingsGoal.saved = Math.round((percentage / 100) * base * 100) / 100;
  return store;
}

export function syncStoreData(store: StoreData): StoreData {
  if (!store) return store;
  const profile = store.profile || {
    storeType: store.category || 'retail',
    location: '',
    phone: '',
    email: '',
  };
  if (!profile.uniqueCode) {
    profile.uniqueCode = generateStoreUniqueCode();
  }
  const settings = store.managerSettings || { ...DEFAULT_MANAGER_SETTINGS };

  if (store.storeName) {
    settings.receiptStoreName = store.storeName;
  } else if (settings.receiptStoreName) {
    store.storeName = settings.receiptStoreName;
  }

  if (profile.phone) {
    settings.receiptPhone = profile.phone;
  } else if (settings.receiptPhone) {
    profile.phone = settings.receiptPhone;
  }

  if (profile.location) {
    settings.receiptAddress = profile.location;
  } else if (settings.receiptAddress) {
    profile.location = settings.receiptAddress;
  }

  if (store.category) {
    profile.storeType = store.category;
  } else if (profile.storeType) {
    store.category = profile.storeType as any;
  }

  if (store.cashBalance === undefined) {
    const totalSalesCash = store.sales.filter(s => s.paymentMethod === 'cash' || !s.paymentMethod).reduce((sum, s) => sum + s.total, 0);
    const totalSalesBank = store.sales.filter(s => s.paymentMethod && s.paymentMethod !== 'cash').reduce((sum, s) => sum + s.total, 0);
    const totalExpenses = (store.expenses || []).reduce((sum, e) => sum + e.amount, 0);
    const totalInvest = (store.investments || []).reduce((sum, i) => sum + i.amount, 0);
    const totalWithdrawn = (store.withdrawals || []).reduce((sum, w) => sum + w.amount, 0);

    store.cashBalance = Math.max(0, totalInvest + totalSalesCash - totalExpenses - totalWithdrawn);
    store.bankBalance = Math.max(0, totalSalesBank);
    store.walletBalance = 0;
    store.otherAssets = 0;
    store.liabilities = 0;
  } else {
    if (store.bankBalance === undefined) store.bankBalance = 0;
    if (store.walletBalance === undefined) store.walletBalance = 0;
    if (store.otherAssets === undefined) store.otherAssets = 0;
    if (store.liabilities === undefined) store.liabilities = 0;
  }

  store.profile = profile;
  store.managerSettings = settings;

  return recalculateSavings(store);
}

export function runScheduledSavingsDeduction(store: StoreData): StoreData {
  if (!store.savingsGoal || !store.savingsGoal.autoSaveEnabled) return store;
  const goal = store.savingsGoal;
  const nowTime = new Date();
  const lastTime = goal.lastDeductionTime ? new Date(goal.lastDeductionTime) : new Date(store.createdAt || nowTime.toISOString());
  
  if (lastTime.getTime() >= nowTime.getTime()) return store;

  const occurrences: Date[] = [];
  let current = new Date(lastTime.getTime());
  const [hStr, mStr] = (goal.timeOfDay || "00:00").split(":");
  const schedHours = parseInt(hStr, 10) || 0;
  const schedMinutes = parseInt(mStr, 10) || 0;

  current.setHours(schedHours, schedMinutes, 0, 0);
  if (current.getTime() <= lastTime.getTime()) {
    current.setDate(current.getDate() + 1);
  }

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  while (current.getTime() <= nowTime.getTime()) {
    let isDue = false;
    if (goal.frequency === 'daily') {
      isDue = true;
    } else if (goal.frequency === 'weekly') {
      const targetDay = goal.dayOfWeek || 'Monday';
      if (DAYS[current.getDay()] === targetDay) {
        isDue = true;
      }
    } else if (goal.frequency === 'monthly') {
      const targetDayOfMonth = goal.dayOfMonth || 1;
      const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
      const adjustedTarget = Math.min(targetDayOfMonth, daysInMonth);
      if (current.getDate() === adjustedTarget) {
        isDue = true;
      }
    }

    if (isDue) {
      occurrences.push(new Date(current.getTime()));
    }
    current.setDate(current.getDate() + 1);
    current.setHours(schedHours, schedMinutes, 0, 0);
  }

  if (occurrences.length === 0) return store;

  let currentSaved = goal.saved || 0;
  let flowNotifications = store.flowNotifications || [];
  let memoryTimeline = store.memoryTimeline || [];

  occurrences.forEach(occurrence => {
    const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
    const totalExpenses = (store.expenses || []).reduce((sum, e) => sum + e.amount, 0);
    const netIncomeBefore = totalRevenue - totalExpenses - currentSaved;

    let deductionAmount = 0;
    if (goal.autoSaveAmount && goal.autoSaveAmount > 0) {
      deductionAmount = goal.autoSaveAmount;
    } else if (goal.percentage && goal.percentage > 0) {
      deductionAmount = (goal.percentage / 100) * netIncomeBefore;
    }

    deductionAmount = Math.round(Math.max(0, deductionAmount) * 100) / 100;
    if (deductionAmount > 0) {
      currentSaved += deductionAmount;
      const deductionMsg = `Auto-saved ₦${deductionAmount.toLocaleString()} to ${goal.label || 'Savings'}`;
      
      flowNotifications = [{
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        text: deductionMsg,
        icon: '🏦',
        tone: 'success',
        date: occurrence.toISOString(),
        read: false,
        title: 'Automated Savings',
        description: deductionMsg,
        actionLabel: 'View Savings',
        actionTab: 'dashboard'
      }, ...flowNotifications];

      memoryTimeline = [{
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        type: 'milestone',
        title: 'Automated Savings',
        date: occurrence.toISOString(),
        description: deductionMsg
      }, ...memoryTimeline];
    }
  });

  store.savingsGoal.saved = currentSaved;
  store.savingsGoal.lastDeductionTime = occurrences[occurrences.length - 1].toISOString();
  store.flowNotifications = flowNotifications;
  store.memoryTimeline = memoryTimeline;

  return store;
}

export function loadStore(code: string): StoreData | null {
  const data = localStorage.getItem(STORE_PREFIX + code.toUpperCase());
  if (!data) return null;
  let store = JSON.parse(data);
  
  store = ensureStoreId(store);
  store = runScheduledSavingsDeduction(store);
  store = syncStoreData(store);
  
  upsertStoreIndex(store);
  return store;
}

export function saveStore(store: StoreData): void {
  const synced = syncStoreData(store);
  const scheduled = runScheduledSavingsDeduction(synced);
  Object.assign(store, scheduled);

  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const trash = (store.trash || []).filter(t => new Date(t.deletedAt).getTime() > cutoff);
  store.trash = trash;

  localStorage.setItem(STORE_PREFIX + store.accessCode, JSON.stringify(store));
  if (store.managerSettings?.autoBackupsEnabled !== false) {
    createAutoBackupSnapshot().catch(() => {});
  }
  
  if (store.managerSettings?.multiDeviceSync) {
    import('@/integrations/supabase/client').then(async ({ supabase }) => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session || !session.user) {
          console.warn('Cloud Sync: No active authenticated session found.', sessionError);
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('auth_user_id', session.user.id)
          .maybeSingle();

        if (profileError || !profile || !profile.id) {
          console.warn('Cloud Sync: Active owner profile is missing or missing ID.', profileError);
          return;
        }

        const payload: any = {
          owner_id: profile.id,
          business_name: store.storeName,
          business_type: store.category || 'retail',
          logo: store.profile?.logoStyle || 'minimalist',
          access_code: store.accessCode,
          owner_password: store.managerSettings?.ownerPassword || '',
          data: store as any,
          updated_at: new Date().toISOString()
        };

        const { data: existingStore, error: fetchError } = await supabase
          .from('stores')
          .select('id')
          .eq('access_code', store.accessCode)
          .maybeSingle();

        if (fetchError) {
          console.warn('Cloud Sync: Failed to query existing store row ID:', fetchError);
        }

        if (existingStore && existingStore.id) {
          payload.id = existingStore.id;
        }

        const { error: upsertError } = await supabase
          .from('stores')
          .upsert(payload, { onConflict: 'access_code' });

        if (upsertError) {
          console.error('Supabase multi-device sync error during background auto-save:', upsertError);
        }
      } catch (err) {
        console.error('Cloud Sync background execution failed:', err);
      }
    }).catch(err => console.error('Failed to load supabase client for sync:', err));
  }
}

export function recordActivityLog(store: StoreData, user?: string, role?: string, action?: string): StoreData {
  if (!user || !action) return store;
  const newLog = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    user,
    role: role || 'owner',
    action,
    timestamp: new Date().toISOString(),
  };
  return {
    ...store,
    activityLogs: [newLog, ...(store.activityLogs || [])].slice(0, 1000),
  };
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

export function addProduct(store: StoreData, product: Omit<Product, 'id'>, actorName?: string, actorRole?: string): StoreData {
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
  let updated = {
    ...store,
    products: [...store.products, { 
      ...product, 
      id: generateId(), 
      initialQuantity: product.quantity, 
      addedAt: now,
      priceHistory: product.costPrice > 0 ? [{ costPrice: product.costPrice, date: now }] : []
    }],
    investments: newInvestments,
    expenses: newExpenses,
  };
  if (actorName) {
    updated = recordActivityLog(updated, actorName, actorRole, `Added product: ${product.name} (${product.quantity} units)`);
  }
  saveStore(updated);
  return updated;
}

export function updateProduct(store: StoreData, id: string, updates: Partial<Product>, actorName?: string, actorRole?: string): StoreData {
  const pName = store.products.find(p => p.id === id)?.name || 'Product';
  let updated = {
    ...store,
    products: store.products.map(p => {
      if (p.id === id) {
        const newHistory = [...(p.priceHistory || [])];
        if (updates.costPrice !== undefined && updates.costPrice !== p.costPrice && updates.costPrice > 0) {
          newHistory.push({ costPrice: updates.costPrice, date: new Date().toISOString() });
        }
        return { ...p, ...updates, priceHistory: newHistory };
      }
      return p;
    }),
  };
  if (actorName) {
    const details = updates.quantity !== undefined ? ` (set qty to ${updates.quantity})` : '';
    updated = recordActivityLog(updated, actorName, actorRole, `Updated product: ${pName}${details}`);
  }
  saveStore(updated);
  return updated;
}

export function deleteProduct(store: StoreData, id: string, actorName?: string, actorRole?: string): StoreData {
  const product = store.products.find(p => p.id === id);
  if (!product) return store;
  
  // Wipe all associated sales, planned restocks, learned mappings, and product entry
  let updated = {
    ...store,
    products: store.products.filter(p => p.id !== id),
    sales: (store.sales || []).filter(s => s.productId !== id),
    plannedRestocks: (store.plannedRestocks || []).filter(r => r.productId !== id),
    learnedProducts: (store.learnedProducts || []).filter(lp => lp.id !== id),
    trash: pushTrash(store, 'product', product),
  };
  
  if (actorName) {
    updated = recordActivityLog(updated, actorName, actorRole, `Deleted product: ${product.name} (wiped financial and sales history)`);
  }
  saveStore(updated);
  return updated;
}

export function clearInventory(store: StoreData): StoreData {
  // Total clean wipe: resets all products, sales history, balances, learned data, and investments
  const updated = {
    ...store,
    products: [],
    sales: [],
    expenses: [],
    debtors: [],
    suppliers: [],
    cashBalance: 0,
    bankBalance: 0,
    walletBalance: 0,
    plannedRestocks: [],
    activityLogs: [],
    trash: [],
    similarProductReviews: [],
    dismissedSimilarPairs: [],
    learnedProducts: [],
    investments: [],
    loans: [],
    withdrawals: [],
    otherAssets: 0,
    liabilities: 0
  };
  saveStore(updated);
  return updated;
}

export function deleteSale(store: StoreData, id: string): StoreData {
  const salesToDelete = store.sales.filter(s => s.id === id || (s.transactionId && s.transactionId === id));
  if (salesToDelete.length === 0) return store;
  
  let nextTrash = store.trash || [];
  for (const sale of salesToDelete) {
    const item: TrashItem = {
      id: generateId(),
      kind: 'sale',
      deletedAt: new Date().toISOString(),
      payload: sale,
    };
    nextTrash = [item, ...nextTrash];
  }
  
  let cashDeduct = 0;
  let bankDeduct = 0;
  for (const sale of salesToDelete) {
    const method = sale.paymentMethod || 'cash';
    if (method === 'cash') {
      cashDeduct += sale.total;
    } else {
      bankDeduct += sale.total;
    }
  }

  const updated = {
    ...store,
    sales: store.sales.filter(s => s.id !== id && (!s.transactionId || s.transactionId !== id)),
    trash: nextTrash,
    cashBalance: Math.max(0, (store.cashBalance || 0) - cashDeduct),
    bankBalance: Math.max(0, (store.bankBalance || 0) - bankDeduct),
  };
  saveStore(updated);
  return updated;
}

export function recordSale(
  store: StoreData,
  productId: string,
  quantity: number,
  actorName?: string,
  actorRole?: string,
  transactionId?: string,
  saleType?: 'carton' | 'single'
): StoreData {
  const product = store.products.find(p => p.id === productId);
  if (!product) return store;
  if (quantity <= 0) return store;

  let unitPrice = product.sellingPrice;
  let costPrice = product.costPrice;
  let qtyDeduction = quantity;
  const isSingle = saleType === 'single' && product.isCartonSingleEnabled;

  if (isSingle) {
    const singles = product.singlesPerCarton || 1;
    unitPrice = product.singleSellingPrice ?? (product.sellingPrice / singles);
    costPrice = product.costPrice / singles;
    qtyDeduction = quantity / singles;
  }

  if (product.quantity < qtyDeduction) return store;
  
  const sale: Sale = {
    id: generateId(),
    productId,
    productName: product.name + (isSingle ? ' (Single)' : ''),
    quantity: Math.round(quantity * 100) / 100, // Round to 2 decimal places
    unitPrice: Math.round(unitPrice * 100) / 100,
    total: Math.round(unitPrice * quantity * 100) / 100,
    profit: Math.round((unitPrice - costPrice) * quantity * 100) / 100,
    date: new Date().toISOString(),
    transactionId,
  };

  let updated = {
    ...store,
    products: store.products.map(p => p.id === productId ? { ...p, quantity: Math.round((p.quantity - qtyDeduction) * 100) / 100 } : p),
    sales: [sale, ...store.sales],
  };
  if (actorName) {
    const displayQty = isSingle ? `${quantity} pcs` : `${quantity} ctn`;
    updated = recordActivityLog(updated, actorName, actorRole, `Completed sale: ${product.name} × ${displayQty} (Total: ₦${sale.total.toLocaleString()})`);
  }
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

  // Initial mass import check: no sales yet and no existing restock expenses
  const isInitialImport = (store.sales || []).length === 0 && 
    (store.expenses || []).filter(e => e.source === 'restock').length === 0;

  if (importTotal > 0) {
    newInvestments.push({
      id: generateId(),
      amount: importTotal,
      note: isInitialImport 
        ? `Initial Inventory Import (${products.length} products)` 
        : `Bulk Imported Inventory (${products.length} products)`,
      date: now,
      type: isInitialImport ? 'initial' : 'additional',
    });

    if (!isInitialImport) {
      newExpenses.push({
        id: generateId(),
        amount: importTotal,
        category: 'Restock',
        date: now,
        note: `Bulk Imported Inventory (${products.length} products)`,
        source: 'restock',
      });
    }
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
    const currentPriceHistory = p.priceHistory || (p.costPrice > 0 ? [{ costPrice: p.costPrice, date: p.addedAt || now }] : []);
    const newPriceHistory = entry.costPrice > 0 
      ? [...currentPriceHistory, { costPrice: entry.costPrice, date: now }]
      : currentPriceHistory;
    return {
      ...p,
      quantity: Math.round((p.quantity + entry.quantity) * 100) / 100,
      costPrice: entry.costPrice > 0 ? entry.costPrice : p.costPrice,
      initialQuantity: p.initialQuantity ?? p.quantity,
      priceHistory: newPriceHistory
    };
  });

  // Auto-create a single Restock expense for the entire batch (always — reduces net income / cash)
  const newExpenses: Expense[] = [];
  const newInvestments: Investment[] = [];
  
  let newCashBalance = store.cashBalance ?? 0;
  let newBankBalance = store.bankBalance ?? 0;
  let newWalletBalance = store.walletBalance ?? 0;

  if (restockTotal > 0) {
    // Initial import check: no sales yet and no existing restock expenses
    const isInitialImport = (store.sales || []).length === 0 && 
      (store.expenses || []).filter(e => e.source === 'restock').length === 0;

    if (isInitialImport) {
      newInvestments.push({
        id: generateId(),
        amount: Math.round(restockTotal * 100) / 100,
        note: `Initial Inventory Setup via Invoice Import`,
        source: 'Inventory Restock',
        date: now,
        type: 'initial',
      });
    } else {
      const availableCash = newCashBalance + newBankBalance + newWalletBalance;
      let autoInvestedAmt = 0;
      let cashDeduction = 0;

      if (restockTotal <= availableCash) {
        cashDeduction = restockTotal;
      } else {
        cashDeduction = availableCash;
        autoInvestedAmt = restockTotal - availableCash;
      }

      // Deduct from cash balances
      let remainingDeduct = cashDeduction;
      if (newCashBalance >= remainingDeduct) {
        newCashBalance -= remainingDeduct;
        remainingDeduct = 0;
      } else {
        remainingDeduct -= newCashBalance;
        newCashBalance = 0;
      }

      if (remainingDeduct > 0) {
        if (newBankBalance >= remainingDeduct) {
          newBankBalance -= remainingDeduct;
          remainingDeduct = 0;
        } else {
          remainingDeduct -= newBankBalance;
          newBankBalance = 0;
        }
      }

      if (remainingDeduct > 0) {
        if (newWalletBalance >= remainingDeduct) {
          newWalletBalance -= remainingDeduct;
          remainingDeduct = 0;
        } else {
          newWalletBalance = 0;
        }
      }

      const fundingLabel = autoInvestedAmt > 0 ? ' (automatic investment)' : ' (from cash balance)';
      newExpenses.push({
        id: generateId(),
        amount: Math.round(restockTotal * 100) / 100,
        category: 'Restock',
        date: now,
        note: `Stock from supplier${fundingLabel}: ${itemNames.slice(0, 4).join(', ')}${itemNames.length > 4 ? `, +${itemNames.length - 4} more` : ''}`,
        source: 'restock',
        restockBatchId: batchId,
      });

      if (autoInvestedAmt > 0) {
        newInvestments.push({
          id: generateId(),
          amount: Math.round(autoInvestedAmt * 100) / 100,
          note: `Inventory Capital Injection`,
          source: 'Inventory Restock',
          date: now,
          type: 'additional',
        });
      }
    }
  }

  const updated: StoreData = {
    ...store,
    products: updatedProducts,
    restocks: [...newRestocks, ...(store.restocks || [])],
    expenses: [...newExpenses, ...(store.expenses || [])],
    investments: [...newInvestments, ...(store.investments || [])],
    cashBalance: Math.round(newCashBalance * 100) / 100,
    bankBalance: Math.round(newBankBalance * 100) / 100,
    walletBalance: Math.round(newWalletBalance * 100) / 100,
  };
  saveStore(updated);
  return updated;
}

export function findProductByBarcode(store: StoreData, barcode: string): Product | undefined {
  return store.products.find(p => p.barcode === barcode);
}

export function addExpense(store: StoreData, expense: Omit<Expense, 'id' | 'source'>, actorName?: string, actorRole?: string): StoreData {
  const newExpense: Expense = {
    ...expense,
    id: generateId(),
    source: 'manual',
  };
  
  let newCashBalance = store.cashBalance ?? 0;
  newCashBalance = Math.max(0, newCashBalance - expense.amount);

  let updated: StoreData = {
    ...store,
    expenses: [newExpense, ...(store.expenses || [])],
    cashBalance: Math.round(newCashBalance * 100) / 100,
  };
  if (actorName) {
    updated = recordActivityLog(updated, actorName, actorRole, `Recorded expense: ${expense.category} - ₦${expense.amount.toLocaleString()}`);
  }
  saveStore(updated);
  return updated;
}

export function deleteExpense(store: StoreData, id: string): StoreData {
  const expense = (store.expenses || []).find(e => e.id === id);
  if (!expense) return store;

  let newCashBalance = store.cashBalance ?? 0;
  newCashBalance = newCashBalance + expense.amount;

  const updated: StoreData = {
    ...store,
    expenses: (store.expenses || []).filter(e => e.id !== id),
    cashBalance: Math.round(newCashBalance * 100) / 100,
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
  const savingsSaved = store.savingsGoal?.saved || 0;
  const netIncome = totalRevenue - totalExpenses - savingsSaved;
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
  items: { productId: string; quantity: number; saleType?: 'carton' | 'single' }[],
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
  const transactionId = pid();

  for (const it of items) {
    const p = updated.products.find(p => p.id === it.productId);
    if (!p) continue;

    let qtyDeduction = it.quantity;
    if (it.saleType === 'single' && p.isCartonSingleEnabled && p.singlesPerCarton) {
      qtyDeduction = it.quantity / p.singlesPerCarton;
    }
    if (p.quantity < qtyDeduction) continue;

    updated = recordSale(updated, it.productId, it.quantity, undefined, undefined, transactionId, it.saleType);
    const created = updated.sales[0];
    newSales.push(created);
    pendingItems.push({
      productId: p.id,
      productName: created.productName,
      quantity: it.quantity,
      unitPrice: created.unitPrice,
    });
  }
  const subtotal = newSales.reduce((s, x) => s + x.total, 0);
  const total = Math.max(0, subtotal - (opts.discount || 0));
  const paid = Math.min(opts.paid, total);
  const balance = Math.max(0, total - paid);

  // Distribute the discount proportionally across sales
  if (opts.discount && opts.discount > 0 && subtotal > 0) {
    const ratio = total / subtotal;
    const saleIds = newSales.map(s => s.id);
    updated = {
      ...updated,
      sales: updated.sales.map(s => {
        if (saleIds.includes(s.id)) {
          const newTotal = Math.round(s.total * ratio * 100) / 100;
          const discountAmt = s.total - newTotal;
          const newProfit = Math.round((s.profit - discountAmt) * 100) / 100;
          return {
            ...s,
            total: newTotal,
            profit: newProfit,
          };
        }
        return s;
      }),
    };
    newSales.forEach(s => {
      const origTotal = s.total;
      s.total = Math.round(s.total * ratio * 100) / 100;
      const discountAmt = origTotal - s.total;
      s.profit = Math.round((s.profit - discountAmt) * 100) / 100;
    });
  }

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

  let cashAdd = 0;
  let bankAdd = 0;
  if (paid > 0) {
    if (opts.method === 'cash') {
      cashAdd = paid;
    } else if (opts.method === 'pos' || opts.method === 'transfer') {
      bankAdd = paid;
    } else if (opts.method === 'mixed') {
      cashAdd = paid / 2;
      bankAdd = paid / 2;
    }
  }

  updated = {
    ...updated,
    cashBalance: Math.round(((updated.cashBalance || 0) + cashAdd) * 100) / 100,
    bankBalance: Math.round(((updated.bankBalance || 0) + bankAdd) * 100) / 100,
  };

  // Update customer record
  if (opts.customerName) {
    const nowStr = new Date().toISOString();
    const customers = updated.customers || [];
    let cust = customers.find(c => c.name.toLowerCase() === opts.customerName!.toLowerCase());
    const itemsSummary = pendingItems.map(pi => `${pi.productName} (x${pi.quantity})`).join(', ');
    const purchase = { date: nowStr, amount: total, items: itemsSummary };
    
    if (cust) {
      const updatedCust: Customer = {
        ...cust,
        phone: opts.customerPhone || cust.phone,
        totalPurchases: cust.totalPurchases + total,
        outstandingDebt: cust.outstandingDebt + balance,
        lastPurchaseDate: nowStr,
        purchaseHistory: [purchase, ...(cust.purchaseHistory || [])],
        visitsCount: cust.visitsCount + 1,
        loyaltyPoints: cust.loyaltyPoints + Math.floor(total / 1000)
      };
      updated = {
        ...updated,
        customers: customers.map(c => c.id === cust!.id ? updatedCust : c)
      };
    } else {
      const newCust: Customer = {
        id: pid(),
        name: opts.customerName,
        phone: opts.customerPhone || '',
        totalPurchases: total,
        outstandingDebt: balance,
        lastPurchaseDate: nowStr,
        purchaseHistory: [purchase],
        visitsCount: 1,
        loyaltyPoints: Math.floor(total / 1000)
      };
      updated = {
        ...updated,
        customers: [newCust, ...customers]
      };
    }
  }

  saveStore(updated);
  return { store: updated, sales: newSales, pending };
}

export function addPaymentToPending(store: StoreData, id: string, amount: number, method: PaymentMethod = 'cash'): StoreData {
  const list = store.pendingPayments || [];
  // Reduce outstanding customer debt if customer name matches
  const p = list.find(x => x.id === id);
  let updatedCustomers = store.customers || [];
  if (p && p.customerName) {
    updatedCustomers = updatedCustomers.map(c => {
      if (c.name.toLowerCase() === p.customerName.toLowerCase()) {
        return {
          ...c,
          outstandingDebt: Math.max(0, c.outstandingDebt - amount)
        };
      }
      return c;
    });
  }

  let cashAdd = 0;
  let bankAdd = 0;
  if (amount > 0) {
    if (method === 'cash') {
      cashAdd = amount;
    } else if (method === 'pos' || method === 'transfer') {
      bankAdd = amount;
    } else if (method === 'mixed') {
      cashAdd = amount / 2;
      bankAdd = amount / 2;
    }
  }

  const updated: StoreData = {
    ...store,
    customers: updatedCustomers,
    cashBalance: Math.round(((store.cashBalance || 0) + cashAdd) * 100) / 100,
    bankBalance: Math.round(((store.bankBalance || 0) + bankAdd) * 100) / 100,
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

// ─── Customer Helpers ─────────────────────────────────────────────────────────
export function addCustomer(store: StoreData, customer: Omit<Customer, 'id' | 'totalPurchases' | 'outstandingDebt' | 'purchaseHistory' | 'loyaltyPoints' | 'visitsCount'>): StoreData {
  const newCust: Customer = {
    ...customer,
    id: generateId(),
    totalPurchases: 0,
    outstandingDebt: 0,
    purchaseHistory: [],
    loyaltyPoints: 0,
    visitsCount: 0
  };
  const updated = {
    ...store,
    customers: [newCust, ...(store.customers || [])]
  };
  saveStore(updated);
  return updated;
}

export function updateCustomer(store: StoreData, id: string, updates: Partial<Customer>): StoreData {
  const updated = {
    ...store,
    customers: (store.customers || []).map(c => c.id === id ? { ...c, ...updates } : c)
  };
  saveStore(updated);
  return updated;
}

export function deleteCustomer(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    customers: (store.customers || []).filter(c => c.id !== id)
  };
  saveStore(updated);
  return updated;
}

// ─── Supplier Helpers ─────────────────────────────────────────────────────────
export function addSupplier(store: StoreData, supplier: Omit<Supplier, 'id'>): StoreData {
  const newSup: Supplier = {
    ...supplier,
    id: generateId()
  };
  const updated = {
    ...store,
    suppliers: [newSup, ...(store.suppliers || [])]
  };
  saveStore(updated);
  return updated;
}

export function updateSupplier(store: StoreData, id: string, updates: Partial<Supplier>): StoreData {
  const updated = {
    ...store,
    suppliers: (store.suppliers || []).map(s => s.id === id ? { ...s, ...updates } : s)
  };
  saveStore(updated);
  return updated;
}

export function deleteSupplier(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    suppliers: (store.suppliers || []).filter(s => s.id !== id)
  };
  saveStore(updated);
  return updated;
}

// ─── Business Goals ───────────────────────────────────────────────────────────
export function addGoal(store: StoreData, goal: Omit<BusinessGoal, 'id' | 'completed'>): StoreData {
  const newGoal: BusinessGoal = {
    ...goal,
    id: generateId(),
    completed: goal.current >= goal.target
  };
  const updated = {
    ...store,
    goals: [newGoal, ...(store.goals || [])]
  };
  saveStore(updated);
  return updated;
}

export function updateGoal(store: StoreData, id: string, updates: Partial<BusinessGoal>): StoreData {
  const updated = {
    ...store,
    goals: (store.goals || []).map(g => {
      if (g.id !== id) return g;
      const combined = { ...g, ...updates };
      return {
        ...combined,
        completed: combined.current >= combined.target
      };
    })
  };
  saveStore(updated);
  return updated;
}

export function deleteGoal(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    goals: (store.goals || []).filter(g => g.id !== id)
  };
  saveStore(updated);
  return updated;
}

// ─── Flow Memory Timeline ────────────────────────────────────────────────────
export function addMemoryTimelineEvent(store: StoreData, event: Omit<MemoryEvent, 'id'>): StoreData {
  const newEv: MemoryEvent = {
    ...event,
    id: generateId()
  };
  const updated = {
    ...store,
    memoryTimeline: [newEv, ...(store.memoryTimeline || [])]
  };
  saveStore(updated);
  return updated;
}

// ─── Diary Helpers ────────────────────────────────────────────────────────────
export function addDiaryEntry(store: StoreData, text: string, audioData?: string): StoreData {
  const newEntry: DiaryEntry = {
    id: generateId(),
    text,
    date: new Date().toISOString(),
    audioData
  };
  const updated = {
    ...store,
    diaryEntries: [newEntry, ...(store.diaryEntries || [])]
  };
  saveStore(updated);
  return updated;
}

export function deleteDiaryEntry(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    diaryEntries: (store.diaryEntries || []).filter(d => d.id !== id)
  };
  saveStore(updated);
  return updated;
}

// ─── Staff Management Helpers ─────────────────────────────────────────────────
export function addStaffMember(store: StoreData, staff: Omit<StaffMember, 'id'>, actorName?: string, actorRole?: string): StoreData {
  const newStaff: StaffMember = {
    ...staff,
    id: generateId()
  };
  let updated = {
    ...store,
    staffMembers: [newStaff, ...(store.staffMembers || [])]
  };
  if (actorName) {
    updated = recordActivityLog(updated, actorName, actorRole, `Registered staff account: ${staff.name} (${staff.role})`);
  }
  saveStore(updated);
  return updated;
}

export function updateStaffMember(store: StoreData, id: string, updates: Partial<StaffMember>, actorName?: string, actorRole?: string): StoreData {
  const staff = (store.staffMembers || []).find(s => s.id === id);
  const staffName = staff?.name || 'Staff Member';
  let updated = {
    ...store,
    staffMembers: (store.staffMembers || []).map(s => s.id === id ? { ...s, ...updates } : s)
  };
  if (actorName) {
    let desc = `Updated staff account details for: ${staffName}`;
    if (updates.pin) desc = `Reset PIN for staff account: ${staffName}`;
    updated = recordActivityLog(updated, actorName, actorRole, desc);
  }
  saveStore(updated);
  return updated;
}

export function deleteStaffMember(store: StoreData, id: string, actorName?: string, actorRole?: string): StoreData {
  const staff = (store.staffMembers || []).find(s => s.id === id);
  const staffName = staff?.name || 'Staff Member';
  let updated = {
    ...store,
    staffMembers: (store.staffMembers || []).filter(s => s.id !== id)
  };
  if (actorName) {
    updated = recordActivityLog(updated, actorName, actorRole, `Deleted staff account: ${staffName}`);
  }
  saveStore(updated);
  return updated;
}

// ─── Shift Tracking Helpers ───────────────────────────────────────────────────
export function startShift(store: StoreData, staffId: string, staffName: string, openingCash: number): StoreData {
  const newShift: Shift = {
    id: generateId(),
    staffId,
    staffName,
    startTime: new Date().toISOString(),
    salesMade: 0,
    revenue: 0,
    openingCash
  };
  const updated = {
    ...store,
    shifts: [newShift, ...(store.shifts || [])]
  };
  saveStore(updated);
  return updated;
}

export function endShift(store: StoreData, id: string, closingCash: number): StoreData {
  const updated = {
    ...store,
    shifts: (store.shifts || []).map(s => {
      if (s.id !== id) return s;
      return {
        ...s,
        endTime: new Date().toISOString(),
        closingCash
      };
    })
  };
  saveStore(updated);
  return updated;
}

// ─── Cash Session Drawer Helpers ──────────────────────────────────────────────
export function recordCashSession(store: StoreData, session: Omit<CashSession, 'id'>): StoreData {
  const newSession: CashSession = {
    ...session,
    id: generateId()
  };
  const updated = {
    ...store,
    cashSessions: [newSession, ...(store.cashSessions || [])]
  };
  saveStore(updated);
  return updated;
}

// ─── Lost Sale Helpers ────────────────────────────────────────────────────────
export function recordLostSale(store: StoreData, productName: string, quantity: number): StoreData {
  const newSale: LostSale = {
    id: generateId(),
    productName,
    date: new Date().toISOString(),
    quantity
  };
  const updated = {
    ...store,
    lostSales: [newSale, ...(store.lostSales || [])]
  };
  saveStore(updated);
  return updated;
}

// ─── Wishlist Helpers ─────────────────────────────────────────────────────────
export function addWishlistItem(store: StoreData, name: string, estimatedCost: number, notes?: string): StoreData {
  const newItem: WishlistItem = {
    id: generateId(),
    name,
    estimatedCost,
    notes,
    dateAdded: new Date().toISOString()
  };
  const updated = {
    ...store,
    wishlist: [newItem, ...(store.wishlist || [])]
  };
  saveStore(updated);
  return updated;
}

export function deleteWishlistItem(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    wishlist: (store.wishlist || []).filter(w => w.id !== id)
  };
  saveStore(updated);
  return updated;
}

// ─── Stock Count Mode Auditing ────────────────────────────────────────────────
export function recordStockCountAudit(store: StoreData, productId: string, productName: string, expected: number, actual: number): StoreData {
  const variance = actual - expected;
  const auditEntry = {
    id: generateId(),
    date: new Date().toISOString(),
    expected,
    actual,
    variance,
    product: productName
  };
  
  // Adjust the product's actual stock quantity in the inventory to match actual count
  const updatedProducts = store.products.map(p => p.id === productId ? { ...p, quantity: actual } : p);
  
  const updated = {
    ...store,
    products: updatedProducts,
    stockCountAudits: [auditEntry, ...(store.stockCountAudits || [])]
  };
  saveStore(updated);
  return updated;
}

// ─── Inventory Multi-Store Transfers ──────────────────────────────────────────
export function transferStock(
  sourceStore: StoreData,
  productId: string,
  quantity: number,
  destStoreCode: string
): StoreData {
  const product = sourceStore.products.find(p => p.id === productId);
  if (!product || product.quantity < quantity || quantity <= 0) return sourceStore;

  const now = new Date().toISOString();
  
  // Decrease source stock
  let updatedSource = {
    ...sourceStore,
    products: sourceStore.products.map(p => p.id === productId ? { ...p, quantity: Math.round((p.quantity - quantity) * 100) / 100 } : p),
    transfers: [
      {
        id: generateId(),
        productId,
        productName: product.name,
        quantity,
        sourceStoreCode: sourceStore.accessCode,
        destStoreCode,
        date: now
      },
      ...(sourceStore.transfers || [])
    ]
  };

  // Load and update destination store
  const destStore = loadStore(destStoreCode);
  if (destStore) {
    let destProducts = [...destStore.products];
    const destProd = destProducts.find(p => p.name.toLowerCase() === product.name.toLowerCase() || (product.barcode && p.barcode === product.barcode));
    
    if (destProd) {
      destProducts = destProducts.map(p => p.id === destProd.id ? { ...p, quantity: Math.round((p.quantity + quantity) * 100) / 100 } : p);
    } else {
      // Add product as new in destination store
      destProducts.push({
        id: generateId(),
        name: product.name,
        costPrice: product.costPrice,
        sellingPrice: product.sellingPrice,
        quantity,
        category: product.category,
        barcode: product.barcode,
        addedAt: now,
        initialQuantity: quantity,
        priceHistory: product.costPrice > 0 ? [{ costPrice: product.costPrice, date: now }] : []
      });
    }

    const updatedDest: StoreData = {
      ...destStore,
      products: destProducts,
      transfers: [
        {
          id: generateId(),
          productId: destProd ? destProd.id : 'new',
          productName: product.name,
          quantity,
          sourceStoreCode: sourceStore.accessCode,
          destStoreCode,
          date: now
        },
        ...(destStore.transfers || [])
      ]
    };
    saveStore(updatedDest);
  }

  saveStore(updatedSource);
  return updatedSource;
}

// ─── Business Document Vault Helpers ──────────────────────────────────────────
export function addVaultDocument(store: StoreData, name: string, category: string, fileContent: string, fileSizeKB: number): StoreData {
  const newDoc: VaultDocument = {
    id: generateId(),
    name,
    category,
    dateAdded: new Date().toISOString(),
    fileContent,
    fileSize: fileSizeKB
  };
  const updated = {
    ...store,
    documents: [newDoc, ...(store.documents || [])]
  };
  saveStore(updated);
  return updated;
}

export function deleteVaultDocument(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    documents: (store.documents || []).filter(d => d.id !== id)
  };
  saveStore(updated);
  return updated;
}

// ─── Smart ROI System Helpers ──────────────────────────────────────────
export function addManualInvestment(store: StoreData, amount: number, note: string, source: string, reason?: string): StoreData {
  const newInv: Investment = {
    id: generateId(),
    amount,
    note,
    date: new Date().toISOString(),
    type: 'additional',
    source,
    reason,
  };
  
  const updated = {
    ...store,
    investments: [newInv, ...(store.investments || [])],
    cashBalance: source === 'Cash Drawer' ? Math.round(((store.cashBalance || 0) + amount) * 100) / 100 : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.round(((store.bankBalance || 0) + amount) * 100) / 100 : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.round(((store.walletBalance || 0) + amount) * 100) / 100 : (store.walletBalance || 0),
  };
  
  saveStore(updated);
  return updated;
}

export function deleteManualInvestment(store: StoreData, id: string): StoreData {
  const inv = (store.investments || []).find(i => i.id === id);
  if (!inv) return store;
  
  const source = inv.source || 'Cash Drawer';
  const updated = {
    ...store,
    investments: (store.investments || []).filter(i => i.id !== id),
    cashBalance: source === 'Cash Drawer' ? Math.max(0, Math.round(((store.cashBalance || 0) - inv.amount) * 100) / 100) : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.max(0, Math.round(((store.bankBalance || 0) - inv.amount) * 100) / 100) : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.max(0, Math.round(((store.walletBalance || 0) - inv.amount) * 100) / 100) : (store.walletBalance || 0),
  };
  
  saveStore(updated);
  return updated;
}

export function addLoan(store: StoreData, amount: number, source: string, note?: string): StoreData {
  const newLoan: Loan = {
    id: generateId(),
    amount,
    source,
    date: new Date().toISOString(),
    note,
    status: 'active',
  };
  
  const updated = {
    ...store,
    loans: [newLoan, ...(store.loans || [])],
    liabilities: Math.round(((store.liabilities || 0) + amount) * 100) / 100,
    cashBalance: source === 'Cash Drawer' ? Math.round(((store.cashBalance || 0) + amount) * 100) / 100 : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.round(((store.bankBalance || 0) + amount) * 100) / 100 : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.round(((store.walletBalance || 0) + amount) * 100) / 100 : (store.walletBalance || 0),
  };
  
  saveStore(updated);
  return updated;
}

export function deleteLoan(store: StoreData, id: string): StoreData {
  const loan = (store.loans || []).find(l => l.id === id);
  if (!loan) return store;
  
  const source = loan.source || 'Cash Drawer';
  const updated = {
    ...store,
    loans: (store.loans || []).filter(l => l.id !== id),
    liabilities: Math.max(0, Math.round(((store.liabilities || 0) - loan.amount) * 100) / 100),
    cashBalance: source === 'Cash Drawer' ? Math.max(0, Math.round(((store.cashBalance || 0) - loan.amount) * 100) / 100) : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.max(0, Math.round(((store.bankBalance || 0) - loan.amount) * 100) / 100) : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.max(0, Math.round(((store.walletBalance || 0) - loan.amount) * 100) / 100) : (store.walletBalance || 0),
  };
  
  saveStore(updated);
  return updated;
}

export function repayLoan(store: StoreData, id: string, amount: number): StoreData {
  const loans = store.loans || [];
  const loanIndex = loans.findIndex(l => l.id === id);
  if (loanIndex === -1) return store;
  
  const loan = loans[loanIndex];
  const source = loan.source || 'Cash Drawer';
  
  const updatedLoans = [...loans];
  const updatedLoan = {
    ...loan,
    amount: Math.max(0, Math.round((loan.amount - amount) * 100) / 100),
  };
  if (updatedLoan.amount <= 0) {
    updatedLoan.status = 'repaid';
  }
  updatedLoans[loanIndex] = updatedLoan as Loan;
  
  const updated = {
    ...store,
    loans: updatedLoans,
    liabilities: Math.max(0, Math.round(((store.liabilities || 0) - amount) * 100) / 100),
    cashBalance: source === 'Cash Drawer' ? Math.max(0, Math.round(((store.cashBalance || 0) - amount) * 100) / 100) : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.max(0, Math.round(((store.bankBalance || 0) - amount) * 100) / 100) : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.max(0, Math.round(((store.walletBalance || 0) - amount) * 100) / 100) : (store.walletBalance || 0),
  };
  
  saveStore(updated);
  return updated;
}

export function addWithdrawal(store: StoreData, amount: number, note?: string): StoreData {
  const newWithdrawal: Withdrawal = {
    id: generateId(),
    amount,
    date: new Date().toISOString(),
    note,
  };
  
  const updated = {
    ...store,
    withdrawals: [newWithdrawal, ...(store.withdrawals || [])],
    cashBalance: Math.max(0, Math.round(((store.cashBalance || 0) - amount) * 100) / 100),
  };
  
  saveStore(updated);
  return updated;
}

export function deleteWithdrawal(store: StoreData, id: string): StoreData {
  const w = (store.withdrawals || []).find(x => x.id === id);
  if (!w) return store;
  
  const updated = {
    ...store,
    withdrawals: (store.withdrawals || []).filter(x => x.id !== id),
    cashBalance: Math.round(((store.cashBalance || 0) + w.amount) * 100) / 100,
  };
  
  saveStore(updated);
  return updated;
}

