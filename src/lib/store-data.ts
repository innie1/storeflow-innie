import { queueStoreSync } from '@/lib/store-cloud-sync';
import { money, stockPrecision, packSize, stockBase, saleUnits, salePrice, historicalUnits, paymentAllocation, legacyAllocation } from '@/lib/inventory-sale-math';
import type { PaymentAllocation } from '@/types/store';
import {
  Product, Sale, StoreData, Restock, Expense, ExpenseCategory, TrashItem, TrashKind,
  Investment, StoreCategory, StoreType, GameService, GameSession,
  Customer, Supplier, BusinessGoal, MemoryEvent, DiaryEntry, StaffMember, Shift,
  CashSession, LostSale, WishlistItem, VaultDocument, BusinessChallenge, InventoryTransfer,
  DEFAULT_MANAGER_SETTINGS, InventoryMovement, Loan, RecurringBill, Withdrawal, ScanEvent, PurchaseOrderRecord,
  BalanceAdjustment, SavingsGoal } from '@/types/store';
import { attribution } from '@/lib/recorded-by';
import { backfillCustomerBook } from '@/lib/customer-backfill';
import { countDebtors } from '@/lib/customer-key';
import { getLowStockThreshold } from '@/lib/settings';
import { createAutoBackupSnapshot } from '@/lib/backup-system';
import { generateStoreUrl } from '@/lib/qr-code';
import { prepareStoreForMarketplacePublish } from '@/lib/marketplace-publish';

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['Restock', 'Consumables', 'Rent', 'Utilities', 'Salaries', 'Transport', 'Other'];

export const STORE_PREFIX = 'storeflow_';

/**
 * Buying stock is not an operating expense.
 *
 * Paying a supplier turns cash into inventory: the shop is no poorer for it,
 * it just holds goods instead of money. The cost reaches the books when the
 * goods are *sold* — every sale already records `(unitPrice - costPrice) *
 * quantity` as its profit. Counting the supplier payment as an expense too
 * charges the same stock twice, which pushed profit negative the moment a
 * merchant restocked and triggered "your expenses are too high" while they
 * were doing the healthiest thing a shop can do.
 *
 * So: restock still reduces cash (the money really did leave), but it is
 * excluded from profit, balance and overspending figures.
 */
export function isStockPurchase(expense: Pick<Expense, 'category' | 'source'>): boolean {
  return expense.source === 'restock' || expense.category === 'Restock';
}

/** Expenses that are genuinely the cost of running the shop. */
export function getOperatingExpenses(store: Pick<StoreData, 'expenses'>): Expense[] {
  return (store.expenses || []).filter(expense => !isStockPurchase(expense));
}

/**
 * Total running cost, optionally within a period. Use this anywhere a figure
 * represents profit, balance or spending — never a raw sum over `expenses`,
 * which silently includes stock purchases.
 */
export function sumOperatingExpenses(
  store: Pick<StoreData, 'expenses'>,
  inRange?: (date: string) => boolean,
): number {
  return getOperatingExpenses(store)
    .filter(expense => !inRange || inRange(expense.date))
    .reduce((sum, expense) => sum + expense.amount, 0);
}

/**
 * Money the shop actually has to spend, derived from its own records.
 *
 *   collected sales − expenses − stock bought from the balance
 *                   − money withdrawn − money set aside as savings
 *
 * Capital never counts. Whether it is opening stock or a restock the owner
 * paid for out of their own pocket, that money came from outside and went
 * straight into goods; it was never in the till. Formally it is cash in then
 * cash out, netting to nothing, so leaving it out reaches the same answer.
 *
 * The figure is allowed to go negative. Buying more stock than the shop can
 * afford is a debt, and saying so is more useful than clamping to zero and
 * inventing capital to cover the gap, which is what used to happen.
 *
 * Deriving it from history rather than keeping a running total means an
 * existing shop is corrected the moment it opens the app, without anyone
 * having to reconcile anything by hand.
 */
export function getAvailableBalance(store: StoreData): number {
  // Goods handed over on credit are not money in hand until the customer pays.
  const collected = (store.sales || [])
    .filter(sale => !sale.pendingPaymentId)
    .reduce((sum, sale) => sum + (Number(sale.total) || 0), 0)
    + (store.pendingPayments || []).reduce((sum, payment) => sum + (Number(payment.paid) || 0), 0);

  const running = sumOperatingExpenses(store);

  // Which stock purchases came out of the till. A restock records the answer
  // the merchant gave; anything older than that field, or bought before there
  // was a balance to spend, is treated as having come from the balance.
  // Opening stock added through addProduct has no batch and is capital.
  const restockFunding = new Map<string, string>();
  for (const restock of store.restocks || []) {
    if (restock.batchId) restockFunding.set(restock.batchId, restock.funding || 'balance');
  }
  const stockFromBalance = (store.expenses || [])
    .filter(expense => isStockPurchase(expense))
    .filter(expense => {
      if (!expense.restockBatchId) return false; // opening stock: capital, not spend
      return restockFunding.get(expense.restockBatchId) !== 'new_money';
    })
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  const withdrawn = (store.withdrawals || []).reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
  const saved = Number(store.savingsGoal?.saved) || 0;

  // A merchant who counted their money and said the figure was wrong is a
  // better authority than the records. Their corrections carry forward.
  const corrections = (store.balanceAdjustments || [])
    .reduce((sum, adjustment) => sum + (Number(adjustment.difference) || 0), 0);

  return Math.round((collected - running - stockFromBalance - withdrawn - saved + corrections) * 100) / 100;
}

/**
 * Correct a tracked balance to what the merchant actually holds.
 *
 * StoreFlow can only ever know the money it was told about, so a shop that
 * takes cash outside the app, starts with a float, or miscounts will drift.
 * Nothing let a merchant say what was really in the till, so the drift was
 * permanent. Each correction is written to balanceAdjustments with the old
 * and new figure, rather than quietly overwriting the balance.
 */
export function setActualBalance(
  store: StoreData,
  input: { cash?: number; bank?: number; wallet?: number; reason?: string; actorName?: string },
): StoreData {
  const now = new Date().toISOString();
  const adjustments: BalanceAdjustment[] = [];

  const accounts: { key: 'cash' | 'bank' | 'wallet'; field: 'cashBalance' | 'bankBalance' | 'walletBalance'; next?: number }[] = [
    { key: 'cash', field: 'cashBalance', next: input.cash },
    { key: 'bank', field: 'bankBalance', next: input.bank },
    { key: 'wallet', field: 'walletBalance', next: input.wallet },
  ];

  const updated: StoreData = { ...store };
  for (const account of accounts) {
    if (account.next === undefined || !Number.isFinite(account.next)) continue;
    const to = Math.round(Math.max(0, account.next) * 100) / 100;
    const from = Math.round((store[account.field] ?? 0) * 100) / 100;
    if (to === from) continue;

    adjustments.push({
      id: generateId(),
      date: now,
      account: account.key,
      from,
      to,
      difference: Math.round((to - from) * 100) / 100,
      reason: input.reason?.trim() || undefined,
      actorName: input.actorName,
    });
    updated[account.field] = to;
  }

  if (adjustments.length === 0) return store;
  return { ...updated, balanceAdjustments: [...adjustments, ...(store.balanceAdjustments || [])] };
}

/** What the shop paid suppliers for stock — cash out, but not a cost of trading. */
export function sumStockPurchases(
  store: Pick<StoreData, 'expenses'>,
  inRange?: (date: string) => boolean,
): number {
  return (store.expenses || [])
    .filter(expense => isStockPurchase(expense) && (!inRange || inRange(expense.date)))
    .reduce((sum, expense) => sum + expense.amount, 0);
}

export function recordInventoryMovement(
  store: StoreData,
  productId: string,
  movementType: 'Restock' | 'Sale' | 'Transfer' | 'Return' | 'Adjustment',
  quantity: number,
  user?: string,
  source?: string
): StoreData {
  const movement: InventoryMovement = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    productId,
    movementType,
    quantity: stockPrecision(quantity),
    date: new Date().toISOString(),
    user: user || 'Staff',
    source: source || 'System',
  };

  return {
    ...store,
    inventoryMovements: [movement, ...(store.inventoryMovements || [])],
  };
}

export function syncProductPerformance(store: StoreData): StoreData {
  if (!store || !store.products) return store;

  const sales = store.sales || [];
  const restocks = store.restocks || [];

  const restockCounts: Record<string, number> = {};
  restocks.forEach(r => {
    if (r.productId) {
      restockCounts[r.productId] = (restockCounts[r.productId] || 0) + 1;
    }
  });

  const updatedProducts = store.products.map(p => {
    const productSales = sales.filter(s => s.productId === p.id);
    const unitsSold = productSales.reduce((sum, s) => sum + historicalUnits(s, p), 0);
    const totalRevenue = productSales.reduce((sum, s) => sum + s.total, 0);
    const totalProfit = productSales.reduce((sum, s) => sum + s.profit, 0);

    let firstSaleAt = p.first_sale_at;
    let lastSoldAt = p.last_sold_at;

    if (productSales.length > 0) {
      const sortedSales = [...productSales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      firstSaleAt = sortedSales[0].date;
      lastSoldAt = sortedSales[sortedSales.length - 1].date;
    }

    let restockCount = p.restock_count;
    if (restockCount === undefined) {
      const computedCount = restockCounts[p.id] || 0;
      restockCount = computedCount + ((p.initialQuantity && p.initialQuantity > 0) ? 1 : 0);
      if (restockCount === 0 && p.quantity > 0) {
        restockCount = 1;
      }
    }

    return {
      ...p,
      restock_count: restockCount,
      units_sold: Math.round(unitsSold * 100) / 100,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_profit: Math.round(totalProfit * 100) / 100,
      first_sale_at: firstSaleAt,
      last_sold_at: lastSoldAt,
    };
  });

  return {
    ...store,
    products: updatedProducts,
  };
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function generateStoreUniqueCode(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/** Generates a permanent short Store ID (e.g. SF-A8K29M). Never changes after creation. */
function generatePermanentStoreId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Highly legible characters (avoiding O, 0, I, 1)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SF-${code}`;
}

/**
 * Ensures a store has a permanent storeId in the correct short format (SF-[A-Z0-9]{6}).
 * If one doesn't exist or is in the old format, it generates a new short one and persists it immediately.
 * Call this at app load.
 */
export function ensureStoreId(store: StoreData): StoreData {
  const hasValidFormat = store.storeId && /^SF-[A-Z0-9]{6}$/.test(store.storeId);
  if (hasValidFormat) return store; // Already has a valid short format — never overwrite
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
  /**
   * What trade this shop is.
   *
   * The index held a name and a code, so the switcher showed the same generic
   * shop icon for every one of them. Somebody running a laundry, a barber shop
   * and a restaurant off one phone had nothing to tell the three apart except
   * whether they remembered which name went with which trade.
   */
  businessType?: string;
}

/** The trade, from wherever this store happens to record it. */
function resolveIndexBusinessType(store: Partial<StoreData>): string | undefined {
  // businessType is not on StoreData, but some records carry it, so it is read
  // first and the declared fields are the fallback.
  const value = String((store as any).businessType || store.storeType || store.category || '').trim();
  return value || undefined;
}

/**
 * Fill in the trade for entries written before it was recorded.
 *
 * The stores are already on this device, so this is a local read rather than
 * anything that costs a request, and it means an existing merchant does not
 * have to re-add a shop to see what it is.
 */
export function backfillStoreIndexTypes(): StoreIndexEntry[] {
  const index = getStoreIndex();
  let changed = false;

  const filled = index.map(entry => {
    if (entry.businessType) return entry;
    const store = loadStoreQuietly(entry.code);
    const businessType = store ? resolveIndexBusinessType(store) : undefined;
    if (!businessType) return entry;
    changed = true;
    return { ...entry, businessType };
  });

  if (changed) {
    try { localStorage.setItem(STORE_INDEX_KEY, JSON.stringify(filled)); } catch { /* private mode */ }
  }
  return filled;
}

/** A read that must never mutate or persist: loadStore does both. */
function loadStoreQuietly(code: string): StoreData | null {
  try {
    const raw = localStorage.getItem(`${STORE_PREFIX}${String(code || '').toUpperCase()}`);
    return raw ? JSON.parse(raw) as StoreData : null;
  } catch {
    return null;
  }
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
  idx.unshift({
    code: store.accessCode,
    name: store.storeName,
    createdAt: store.createdAt,
    businessType: resolveIndexBusinessType(store),
  });
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

export function createStore(storeName: string, category: StoreCategory = 'retail', retailType?: string, logoStyle?: string, storeTypeOverride?: StoreType, uiMode: 'simple' | 'full' = 'simple'): StoreData {
  const code = generateCode();
  const now = new Date().toISOString();
  // New stores always start with an empty catalogue — no auto-imported starter products.
  const products: Product[] = [];
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
  const storeId = generatePermanentStoreId();
  const store: StoreData = {
    storeId,
    storeName,
    accessCode: code,
    category,
    retailType,
    storeType: storeTypeOverride || (category === 'restaurant' ? 'restaurant' : category === 'games' ? 'games' : category === 'other' ? 'other' : 'provision'),
    uiMode: uiMode,
    simpleOnboarding: { complete: false },
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
  const goals = getSavingsGoals(store);
  if (goals.length === 0) return store;
  const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
  const totalProfit = store.sales.reduce((sum, s) => sum + s.profit, 0);

  const updatedGoals = goals.map(g => {
    if (g.autoSaveEnabled) return g; // auto-save goals track `saved` via runScheduledSavingsDeduction instead
    let saved = g.saved || 0;
    if (g.autoSaveAmount && g.autoSaveAmount > 0) {
      // Fixed Cash mode, no schedule: `saved` is tracked manually/elsewhere — just enforce the cap below, don't overwrite it from revenue.
    } else {
      const base = (g.source || 'profit') === 'profit' ? totalProfit : totalRevenue;
      saved = Math.round(((g.percentage || 0) / 100) * base * 100) / 100;
    }
    if (g.amount && g.amount > 0) saved = Math.min(saved, g.amount);
    return { ...g, saved };
  });

  return withSyncedGoals(store, updatedGoals);
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
    // Reconstructing an older store's cash balance, so this one DOES include
    // stock purchases: that money genuinely left the account.
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

// Returns every active savings goal. Falls back to wrapping the legacy
// single `savingsGoal` field into a one-item array so old stores keep
// working exactly as before until they add a second plan.
export function getSavingsGoals(store: StoreData): SavingsGoal[] {
  if (store.savingsGoals && store.savingsGoals.length > 0) return store.savingsGoals;
  if (store.savingsGoal && store.savingsGoal.amount > 0) return [{ ...store.savingsGoal, id: store.savingsGoal.id || 'legacy' }];
  return [];
}

function withSyncedGoals(store: StoreData, goals: SavingsGoal[]): StoreData {
  return { ...store, savingsGoals: goals, savingsGoal: goals[0] };
}

export function addSavingsGoal(store: StoreData, goal: Omit<SavingsGoal, 'id'>): StoreData {
  const newGoal: SavingsGoal = { ...goal, id: generateId() };
  const updated = withSyncedGoals(store, [...getSavingsGoals(store), newGoal]);
  saveStore(updated);
  return updated;
}

export function updateSavingsGoalById(store: StoreData, id: string, patch: Partial<SavingsGoal>): StoreData {
  const updated = withSyncedGoals(store, getSavingsGoals(store).map(g => g.id === id ? { ...g, ...patch } : g));
  saveStore(updated);
  return updated;
}

export function deleteSavingsGoalById(store: StoreData, id: string): StoreData {
  const updated = withSyncedGoals(store, getSavingsGoals(store).filter(g => g.id !== id));
  saveStore(updated);
  return updated;
}

// Runs every active, auto-save-enabled goal independently against the same
// net-income base — they're parallel budget envelopes (e.g. "10% to rent
// fund" + "5% to equipment fund"), not a sequential stack that eats into
// each other's share.
/** Above this many missed deposits in one run, report the total instead. */
const CATCH_UP_NOTIFICATION_LIMIT = 3;

export function runScheduledSavingsDeduction(store: StoreData): StoreData {
  const goals = getSavingsGoals(store);
  const dueGoals = goals.filter(g => g.autoSaveEnabled);
  if (dueGoals.length === 0) return store;

  const nowTime = new Date();

  // A goal that has never run starts counting from now, not from the day the
  // shop opened. Nothing stamped this when auto-save was switched on, so the
  // first run back-filled every scheduled date since createdAt: switching on
  // "save daily" in a shop open 100 days made 100 deposits at once, with 100
  // notifications behind them.
  const unstarted = goals.filter(g => g.autoSaveEnabled && !g.lastDeductionTime);
  if (unstarted.length > 0) {
    const started = goals.map(g =>
      g.autoSaveEnabled && !g.lastDeductionTime
        ? { ...g, lastDeductionTime: nowTime.toISOString() }
        : g,
    );
    // Nothing is due yet by definition, so record the start and stop here.
    return withSyncedGoals(store, started);
  }
  let flowNotifications = store.flowNotifications || [];
  let memoryTimeline = store.memoryTimeline || [];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const updatedGoals = goals.map(goal => {
    if (!goal.autoSaveEnabled) return goal;

    const lastTime = goal.lastDeductionTime ? new Date(goal.lastDeductionTime) : new Date(store.createdAt || nowTime.toISOString());
    if (lastTime.getTime() >= nowTime.getTime()) return goal;

    const occurrences: Date[] = [];
    const current = new Date(lastTime.getTime());
    const [hStr, mStr] = (goal.timeOfDay || "00:00").split(":");
    const schedHours = parseInt(hStr, 10) || 0;
    const schedMinutes = parseInt(mStr, 10) || 0;

    current.setHours(schedHours, schedMinutes, 0, 0);
    if (current.getTime() <= lastTime.getTime()) {
      current.setDate(current.getDate() + 1);
    }

    while (current.getTime() <= nowTime.getTime()) {
      let isDue = false;
      if (goal.frequency === 'daily') {
        isDue = true;
      } else if (goal.frequency === 'weekly') {
        const targetDay = goal.dayOfWeek || 'Monday';
        if (DAYS[current.getDay()] === targetDay) isDue = true;
      } else if (goal.frequency === 'monthly') {
        const targetDayOfMonth = goal.dayOfMonth || 1;
        const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();
        const adjustedTarget = Math.min(targetDayOfMonth, daysInMonth);
        if (current.getDate() === adjustedTarget) isDue = true;
      }
      if (isDue) occurrences.push(new Date(current.getTime()));
      current.setDate(current.getDate() + 1);
      current.setHours(schedHours, schedMinutes, 0, 0);
    }

    if (occurrences.length === 0) return goal;

    let currentSaved = goal.saved || 0;
    // Each deposit covers the stretch since the one before it, starting at the
    // last recorded deduction.
    let windowStart = lastTime.getTime();
    let depositedThisRun = 0;
    let depositsThisRun = 0;

    occurrences.forEach(occurrence => {
      const hasTarget = goal.amount && goal.amount > 0;
      if (hasTarget && currentSaved >= goal.amount) return; // target already hit — stop depositing

      const windowEnd = occurrence.getTime();

      let deductionAmount = 0;
      if (goal.autoSaveAmount && goal.autoSaveAmount > 0) {
        deductionAmount = goal.autoSaveAmount;
      } else if (goal.percentage && goal.percentage > 0) {
        // Against what the shop earned in THIS period, not across its whole
        // life. Reading the lifetime figure every time meant a daily 10% goal
        // set aside 10% of everything the shop had ever earned, every day —
        // ₦995m on a shop that had taken ₦100m.
        let revenue = 0;
        let profit = 0;
        for (const sale of store.sales) {
          const t = new Date(sale.date).getTime();
          if (t > windowStart && t <= windowEnd) {
            revenue += Number(sale.total) || 0;
            profit += Number(sale.profit) || 0;
          }
        }
        // Restocking should not shrink what a merchant sets aside for a goal.
        const expenses = sumOperatingExpenses(store, date => {
          const t = new Date(date).getTime();
          return t > windowStart && t <= windowEnd;
        });
        // The goal says which figure it saves out of; the auto-save path used
        // to ignore it and always use net income.
        const base = (goal.source || 'profit') === 'revenue' ? revenue : profit - expenses;
        deductionAmount = (goal.percentage / 100) * base;
      }

      windowStart = windowEnd;
      deductionAmount = Math.round(Math.max(0, deductionAmount) * 100) / 100;
      if (hasTarget) {
        // don't overshoot the target on the final deposit
        deductionAmount = Math.min(deductionAmount, goal.amount - currentSaved);
      }
      if (deductionAmount > 0) {
        currentSaved += deductionAmount;
        depositedThisRun += deductionAmount;
        depositsThisRun++;
        const deductionMsg = `Auto-saved ₦${deductionAmount.toLocaleString()} to ${goal.label || 'Savings'}`;

        // A phone left closed for a month catches up on reopening. One line
        // per missed day buries every other notification, so those are
        // summarised into a single entry below instead.
        if (occurrences.length > CATCH_UP_NOTIFICATION_LIMIT) return;

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

    if (depositsThisRun > 0 && occurrences.length > CATCH_UP_NOTIFICATION_LIMIT) {
      const summary = `Auto-saved ₦${depositedThisRun.toLocaleString()} to ${goal.label || 'Savings'} across ${depositsThisRun} missed deposits`;
      flowNotifications = [{
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        text: summary,
        icon: '🏦',
        tone: 'success',
        date: nowTime.toISOString(),
        read: false,
        title: 'Automated Savings',
        description: summary,
        actionLabel: 'View Savings',
        actionTab: 'dashboard'
      }, ...flowNotifications];
      memoryTimeline = [{
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        type: 'milestone',
        title: 'Automated Savings',
        date: nowTime.toISOString(),
        description: summary
      }, ...memoryTimeline];
    }

    return { ...goal, saved: currentSaved, lastDeductionTime: occurrences[occurrences.length - 1].toISOString() };
  });

  const updated = withSyncedGoals(store, updatedGoals);
  updated.flowNotifications = flowNotifications;
  updated.memoryTimeline = memoryTimeline;
  return updated;
}

/**
 * Move anyone left on the retired 'admin' role over to manager.
 *
 * 'admin' was offered in the staff form and implemented nowhere: it had no
 * case in isTabAllowed, so it fell to `default: return false` and reached no
 * tabs at all. Manager is what it was always meant to be, and is the role that
 * exists. Runs on load so a staff member created before this cannot be locked
 * out of the app by the role being dropped.
 */
function retireAdminRole(store: any): any {
  const staff = store?.staffMembers;
  if (!Array.isArray(staff) || !staff.some((member: any) => member?.role === 'admin')) return store;
  const migrated = {
    ...store,
    staffMembers: staff.map((member: any) => (
      member?.role === 'admin' ? { ...member, role: 'manager' } : member
    )),
  };
  // Written back, or the record on disk keeps saying 'admin' forever and only
  // the copy in memory is ever right. A plain setItem rather than saveStore:
  // this is a one-off correction, not a change worth a cloud sync and a backup
  // on every load.
  try {
    if (typeof localStorage !== 'undefined' && migrated.accessCode) {
      localStorage.setItem(STORE_PREFIX + migrated.accessCode, JSON.stringify(migrated));
    }
  } catch { /* private mode: the in-memory copy is still correct */ }
  return migrated;
}

export function loadStore(code: string): StoreData | null {
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null;
  const journal = localStorage.getItem('storeflow_transfer_journal');
  if (journal) {
    const pair = JSON.parse(journal);
    for (const value of [pair.source, pair.destination]) localStorage.setItem(STORE_PREFIX + value.accessCode, JSON.stringify(value));
    localStorage.removeItem('storeflow_transfer_journal');
    saveStore(pair.source, { cloudBase: pair.sourceBase });
    saveStore(pair.destination, { cloudBase: pair.destinationBase });
  }
  if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') {
    return null;
  }
  const data = localStorage.getItem(STORE_PREFIX + code.toUpperCase());
  if (!data) return null;
  let store = JSON.parse(data);

  store = retireAdminRole(store);
  store = ensureStoreId(store);
  /*
   * Everyone the shop has actually served gets a real customer record.
   *
   * Here rather than in each screen: the count sits on the simple home, the
   * full dashboard, the customer page, the export, the analytics and in what
   * Flow says, and teaching six places to read around the same gap is how one
   * of them keeps disagreeing with the others.
   */
  const backfilled = backfillCustomerBook(store, generateId);
  /*
   * Written down when it changed something.
   *
   * The links onto the bundles are written as they are made, so leaving the
   * new customer records unsaved would be the worst of both: bundles pointing
   * at people the book has never heard of, and the check that starts this off
   * seeing them as already linked and never looking again.
   */
  const migratedCustomers = backfilled !== store;
  store = backfilled;
  store = runScheduledSavingsDeduction(store);
  store = syncStoreData(store);
  store = syncProductPerformance(store);

  upsertStoreIndex(store);
  if (migratedCustomers) saveStore(store);
  return store;
}

export function saveStore(store: StoreData, options?: { skipCloudSync?: boolean; cloudBase?: StoreData }): void {
  const before = options?.cloudBase ? JSON.stringify(options.cloudBase) : typeof localStorage !== 'undefined' ? localStorage.getItem(STORE_PREFIX + store.accessCode) : null;
  const synced = syncStoreData(store);
  const scheduled = runScheduledSavingsDeduction(synced);
  Object.assign(store, scheduled);

  const cutoff = Date.now() - TRASH_RETENTION_MS;
  const trash = (store.trash || []).filter(t => new Date(t.deletedAt).getTime() > cutoff);
  store.trash = trash;

  if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
    localStorage.setItem(STORE_PREFIX + store.accessCode, JSON.stringify(store));
  }
  if (store.managerSettings?.autoBackupsEnabled !== false) {
    createAutoBackupSnapshot().catch(() => {});
  }

  if (!options?.skipCloudSync && (store.storeId || store.managerSettings?.multiDeviceSync)) {
    queueStoreSync(store, before ? JSON.parse(before) : undefined);
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

// Short, easy-to-type/share code identifying one Buy List / Purchase Order,
// so it can be redeemed later in the Import modal to bring those exact
// quantities into stock without retyping anything.
function generatePurchaseImportCode(existing: PurchaseOrderRecord[]): string {
  const used = new Set(existing.map(po => po.importCode));
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids confusion when read aloud or handwritten
  let code = '';
  do {
    const body = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    code = `PO-${body}`;
  } while (used.has(code));
  return code;
}

export function addPurchaseOrder(store: StoreData, order: Omit<PurchaseOrderRecord, 'id' | 'createdAt' | 'importCode'>): StoreData {
  const record: PurchaseOrderRecord = {
    ...order,
    id: generateId(),
    createdAt: new Date().toISOString(),
    importCode: generatePurchaseImportCode(store.purchaseOrders || []),
  };
  const updated: StoreData = {
    ...store,
    purchaseOrders: [record, ...(store.purchaseOrders || [])].slice(0, 200), // cap to keep the local blob bounded
  };
  saveStore(updated);
  return updated;
}

export function updatePurchaseOrderStatus(store: StoreData, id: string, status: PurchaseOrderRecord['status']): StoreData {
  const updated: StoreData = {
    ...store,
    purchaseOrders: (store.purchaseOrders || []).map(po => po.id === id ? { ...po, status } : po),
  };
  saveStore(updated);
  return updated;
}

// Redeems a Purchase Import Code: finds the matching Buy List / Purchase
// Order, checks it hasn't already been used, and brings its exact items
// into stock via the same receiveStock path as a manual restock. Returns
// success/failure with a human-readable reason rather than throwing, so
// the UI can show it directly.
export function importPurchaseOrderByCode(
  store: StoreData,
  rawCode: string,
  actorName?: string,
  actorRole?: string
): { store: StoreData; success: boolean; message: string; po?: PurchaseOrderRecord } {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { store, success: false, message: 'Enter a code first.' };

  const po = (store.purchaseOrders || []).find(p => p.importCode === code);
  if (!po) {
    return { store, success: false, message: `No purchase order found for code "${code}". Double-check it matches exactly.` };
  }
  if (po.imported) {
    return { store, success: false, message: `This code was already imported on ${po.importedAt ? new Date(po.importedAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'a previous date'}. Each code can only be used once.` };
  }
  if (po.status === 'cancelled') {
    return { store, success: false, message: 'This purchase order was cancelled — it can\'t be imported.' };
  }
  if (!po.items || po.items.length === 0) {
    return { store, success: false, message: 'This purchase order has no items to import.' };
  }

  const entries: RestockEntry[] = po.items
    .filter(it => it.productId && store.products.some(p => p.id === it.productId))
    .map(it => ({ productId: it.productId, quantity: it.qty, costPrice: it.costPrice }));

  if (entries.length === 0) {
    return { store, success: false, message: 'None of the products in this list still exist in your inventory — nothing to import.' };
  }

  let updated = receiveStock(store, entries, 'balance', `Purchase Import (${code})`, actorName, actorRole);
  updated = {
    ...updated,
    purchaseOrders: (updated.purchaseOrders || []).map(p =>
      p.id === po.id ? { ...p, imported: true, importedAt: new Date().toISOString(), status: 'received' as const } : p
    ),
  };
  saveStore(updated);

  const skipped = po.items.length - entries.length;
  return {
    store: updated,
    success: true,
    message: `Imported ${entries.length} item${entries.length === 1 ? '' : 's'} into stock.${skipped > 0 ? ` (${skipped} item${skipped === 1 ? '' : 's'} skipped — no longer in inventory.)` : ''}`,
    po: updated.purchaseOrders?.find(p => p.id === po.id),
  };
}

export function addProduct(store: StoreData, product: Omit<Product, 'id'>, actorName?: string, actorRole?: string): StoreData {
  const id = generateId();
  const now = new Date().toISOString();
  const costTotal = Math.round(product.costPrice * product.quantity * 100) / 100;
  const newInvestments = [...(store.investments || [])];
  const newExpenses = [...(store.expenses || [])];
  if (costTotal > 0) {
    // Stock a merchant already owns is capital they put into the shop, not
    // money the shop spent. This used to record the same cost twice — once
    // here as an investment and again as a Restock expense — so uploading a
    // catalogue instantly reported a loss the size of the opening stock, and
    // every figure derived from expenses was wrong by that amount.
    newInvestments.push({
      id: generateId(),
      amount: costTotal,
      note: `Added Inventory: ${product.name}`,
      date: now,
      type: 'additional',
    });
  }
  let updated: StoreData = {
    ...store,
    products: [...store.products, {
      ...product,
      id,
      initialQuantity: product.quantity,
      addedAt: now,
      priceHistory: product.costPrice > 0 ? [{ costPrice: product.costPrice, date: now }] : [],
      restock_count: 0,
      units_sold: 0,
      total_revenue: 0,
      total_profit: 0
    }],
    investments: newInvestments,
    expenses: newExpenses,
  };
  if (actorName) {
    updated = recordActivityLog(updated, actorName, actorRole, `Added product: ${product.name} (${product.quantity} units)`);
  }
  if (product.quantity > 0) {
    updated = recordInventoryMovement(
      updated,
      id,
      'Adjustment',
      product.quantity,
      actorName,
      'Manual'
    );
  }
  saveStore(updated);
  return updated;
}

export function updateProduct(store: StoreData, id: string, updates: Partial<Product>, actorName?: string, actorRole?: string): StoreData {
  const oldProd = store.products.find(p => p.id === id);
  const oldQty = oldProd ? oldProd.quantity : 0;
  const pName = oldProd?.name || 'Product';
  let updated: StoreData = {
    ...store,
    products: store.products.map(p => {
      if (p.id === id) {
        const newHistory = [...(p.priceHistory || [])];
        if (updates.costPrice !== undefined && updates.costPrice !== p.costPrice && updates.costPrice > 0) {
          newHistory.push({ costPrice: updates.costPrice, date: new Date().toISOString() });
        }
        const next = { ...p, ...updates, priceHistory: newHistory };
        if (packSize(next) !== packSize(p)) {
          if (updates.quantity === undefined || updates.quantity === p.quantity) next.quantity = stockBase(p) / packSize(next);
          next.backorderedQty = stockPrecision((p.backorderedQty || 0) * packSize(p)) / packSize(next);
        }
        return next;
      }
      return p;
    }),
  };
  if (actorName) {
    const details = updates.quantity !== undefined ? ` (set qty to ${updates.quantity})` : '';
    updated = recordActivityLog(updated, actorName, actorRole, `Updated product: ${pName}${details}`);
  }
  if (updates.quantity !== undefined && oldProd && updates.quantity !== oldQty) {
    const diff = updates.quantity - oldQty;
    updated = recordInventoryMovement(
      updated,
      id,
      'Adjustment',
      diff,
      actorName,
      'Manual'
    );
  }
  saveStore(updated);
  return updated;
}

export function deleteProduct(store: StoreData, id: string, actorName?: string, actorRole?: string): StoreData {
  const product = store.products.find(p => p.id === id);
  if (!product || product.discontinued) return store;
  let updated: StoreData = { ...store, products: store.products.map(p => p.id === id ? { ...p, discontinued: true } : p), trash: pushTrash(store, 'product', product) };
  updated = recordActivityLog(updated, actorName, actorRole, `Archived product: ${product.name}; sales history retained`);
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

export function deleteSale(store: StoreData, id: string, deferSave = false): StoreData {
  const selected = store.sales.find(s => s.id === id || s.transactionId === id);
  if (!selected) return store;
  // A credit invoice and its payments are indivisible. Delete the transaction,
  // even when a caller passed one of its line IDs.
  const sales = store.sales.filter(s => s.id === selected.id || (!!selected.transactionId && s.transactionId === selected.transactionId) || (!!selected.pendingPaymentId && s.pendingPaymentId === selected.pendingPaymentId));
  const ids = new Set(sales.map(s => s.id));
  const pending = (store.pendingPayments || []).filter(p => sales.some(s => s.pendingPaymentId === p.id) || (p.saleIds || []).some(id => ids.has(id)));
  const allocation = { cash: 0, bank: 0 };
  for (const payment of pending) {
    let accounted = 0;
    for (const event of payment.events || []) {
      const split = event.allocation || legacyAllocation(event.amount, event.method || selected.paymentMethod);
      allocation.cash += split.cash; allocation.bank += split.bank; accounted += event.amount;
    }
    if (payment.paid > accounted) {
      const split = legacyAllocation(payment.paid - accounted, selected.paymentMethod);
      allocation.cash += split.cash; allocation.bank += split.bank;
    }
  }
  for (const sale of sales.filter(s => !pending.some(p => p.id === s.pendingPaymentId || (p.saleIds || []).includes(s.id)))) {
    const split = sale.paymentAllocation || legacyAllocation(sale.total, sale.paymentMethod);
    allocation.cash += split.cash; allocation.bank += split.bank;
  }
  const stock: NonNullable<TrashItem['saleUndo']>['stock'] = [];
  let updated: StoreData = { ...store, products: store.products.map(p => ({ ...p })) };
  for (const sale of sales) {
    const product = updated.products.find(p => p.id === sale.productId);
    if (!product || sale.pendingPaymentId?.startsWith('laundry-')) continue;
    const backorderQuantity = sale.backorderQuantity || 0;
    const baseQuantity = Math.max(0, historicalUnits(sale, product) - backorderQuantity);
    stock.push({ productId: product.id, baseQuantity, backorderQuantity });
    product.quantity = stockPrecision(stockBase(product) + baseQuantity) / packSize(product);
    product.backorderedQty = Math.max(0, stockPrecision((product.backorderedQty || 0) * packSize(product) - backorderQuantity)) / packSize(product);
    updated = recordInventoryMovement(updated, product.id, 'Return', baseQuantity / packSize(product), 'Staff', 'Sale reversal');
  }
  const customerIds = new Set(sales.map(s => s.customerId).filter(Boolean));
  for (const payment of pending) {
    const matches = (store.customers || []).filter(c => payment.customerId ? c.id === payment.customerId : payment.customerPhone ? c.phone.replace(/\D/g, '') === payment.customerPhone.replace(/\D/g, '') : c.name.toLowerCase() === payment.customerName.toLowerCase());
    if (matches.length === 1) customerIds.add(matches[0].id);
  }
  const customerDeltas = [...customerIds].map(customerId => {
    const customer = (store.customers || []).find(c => c.id === customerId);
    return {
      id: customerId!,
      purchases: money(Math.min(customer?.totalPurchases || 0, sales.reduce((sum, s) => sum + s.total, 0))),
      debt: money(Math.min(customer?.outstandingDebt || 0, pending.reduce((sum, p) => sum + p.balance, 0))),
      visits: Math.min(customer?.visitsCount || 0, 1),
      points: Math.min(customer?.loyaltyPoints || 0, Math.floor(sales.reduce((sum, s) => sum + s.total, 0) / 1000)),
      history: (customer?.purchaseHistory || []).filter(p => p.transactionId && p.transactionId === selected.transactionId),
    };
  });
  updated = { ...updated,
    sales: store.sales.filter(s => !ids.has(s.id)),
    pendingPayments: (store.pendingPayments || []).filter(p => !pending.some(x => x.id === p.id)),
    cashBalance: money((store.cashBalance || 0) - allocation.cash), bankBalance: money((store.bankBalance || 0) - allocation.bank),
    customers: (store.customers || []).map(c => { const delta = customerDeltas.find(d => d.id === c.id); return delta ? { ...c, purchaseHistory: (c.purchaseHistory || []).filter(p => !p.transactionId || !delta.history.some(h => h.transactionId === p.transactionId)), totalPurchases: money(Math.max(0, c.totalPurchases - delta.purchases)), outstandingDebt: money(Math.max(0, c.outstandingDebt - delta.debt)), visitsCount: Math.max(0, c.visitsCount - delta.visits), loyaltyPoints: Math.max(0, c.loyaltyPoints - delta.points) } : c; }),
    trash: [{ id: generateId(), kind: 'sale', deletedAt: new Date().toISOString(), payload: selected, saleUndo: { sales, pending, allocation, stock, customers: customerDeltas } }, ...(store.trash || [])],
  };
  updated = syncProductPerformance(updated);
  if (!deferSave) saveStore(updated);
  return updated;
}

export function recordSale(
  store: StoreData,
  productId: string,
  quantity: number,
  actorName?: string,
  actorRole?: string,
  transactionId?: string,
  saleType?: 'carton' | 'single',
  deferSave = false
): StoreData {
  const product = store.products.find(p => p.id === productId);
  if (!product || product.discontinued) return store;
  if (!Number.isFinite(quantity) || quantity <= 0) return store;
  if ((saleType === 'single' || packSize(product) > 1) && !Number.isInteger(saleUnits(product, quantity, saleType))) return store;

  let unitPrice = salePrice(product, saleType);
  let costPrice = product.costPrice;
  let qtyDeduction = quantity;
  const isSingle = saleType === 'single' && product.isCartonSingleEnabled;

  if (isSingle) {
    const singles = product.singlesPerCarton || 1;
    unitPrice = salePrice(product, saleType);
    costPrice = product.costPrice / singles;
    qtyDeduction = quantity / singles;
  }

  const backorderEnabled = !!store.managerSettings?.backorderSellingEnabled;
  const baseQuantity = saleUnits(product, quantity, saleType);
  const shortfallBase = Math.max(0, stockPrecision(baseQuantity - stockBase(product)));
  const shortfall = shortfallBase / packSize(product);
  if (shortfall > 0 && !backorderEnabled) return store;

  const sale: Sale = {
    id: generateId(),
    productId,
    productName: product.name + (isSingle ? ' (Single)' : ''),
    quantity: stockPrecision(quantity), // Preserve weighed quantities and fractional cartons
    unitPrice: Math.round(unitPrice * 100) / 100,
    total: Math.round(unitPrice * quantity * 100) / 100,
    profit: Math.round((unitPrice - costPrice) * quantity * 100) / 100,
    date: new Date().toISOString(),
    transactionId,
    channel: 'in_store',
    saleType: isSingle ? 'single' : 'carton',
    stockQuantity: qtyDeduction,
    baseQuantity,
    unitsPerStockUnit: packSize(product),
    backorderQuantity: shortfallBase,
    costAtSale: costPrice,
    ...(deferSave ? {} : { paymentMethod: 'cash' as const, paymentAllocation: { cash: money(unitPrice * quantity), bank: 0 } }),
    // The actor reached this function already; it was spent on a log line and
    // thrown away, so nothing could say who sold what.
    ...attribution({ name: actorName, role: actorRole }),
  };

  const newQty = Math.max(0, stockPrecision(stockBase(product) - baseQuantity)) / packSize(product);
  const newBackorderedQty = stockPrecision((product.backorderedQty || 0) + shortfall);
  const newUnitsSold = stockPrecision((product.units_sold || 0) + baseQuantity);
  const newTotalRevenue = Math.round(((product.total_revenue || 0) + sale.total) * 100) / 100;
  const newTotalProfit = Math.round(((product.total_profit || 0) + sale.profit) * 100) / 100;

  let updated: StoreData = {
    ...store,
    products: store.products.map(p => p.id === productId ? {
      ...p,
      quantity: newQty,
      backorderedQty: newBackorderedQty,
      units_sold: newUnitsSold,
      total_revenue: newTotalRevenue,
      total_profit: newTotalProfit,
      first_sale_at: p.first_sale_at || sale.date,
      last_sold_at: sale.date
    } : p),
    sales: [sale, ...store.sales],
    cashBalance: money((store.cashBalance || 0) + (deferSave ? 0 : sale.total)),
  };

  updated = recordInventoryMovement(
    updated,
    productId,
    'Sale',
    -(baseQuantity - shortfallBase) / packSize(product),
    actorName,
    'Sales Checkout'
  );

  if (actorName) {
    const displayQty = isSingle ? `${quantity} pcs` : `${quantity} ctn`;
    const backorderNote = shortfall > 0 ? ' [backorder]' : '';
    updated = recordActivityLog(updated, actorName, actorRole, `Completed sale: ${product.name} × ${displayQty} (Total: ₦${sale.total.toLocaleString()})${backorderNote}`);
  }
  if (!deferSave) saveStore(updated);
  return updated;
}

// Settle a product's backorder against its current stock (call after restocking).
// Subtracts the owed quantity from stock and clears the backorder counter.
export function syncBackorder(store: StoreData, productId: string): StoreData {
  const product = store.products.find(p => p.id === productId);
  if (!product || !product.backorderedQty) return store;
  const owed = stockPrecision(product.backorderedQty * packSize(product));
  const fulfilled = Math.min(stockBase(product), owed);
  let remaining = fulfilled;
  const sales = [...store.sales].reverse().map(sale => {
    if (sale.productId !== productId || !sale.backorderQuantity) return sale;
    const applied = Math.min(remaining, sale.backorderQuantity);
    remaining -= applied;
    return { ...sale, backorderQuantity: stockPrecision(sale.backorderQuantity - applied) };
  }).reverse();
  let updated = { ...store, sales, products: store.products.map(p => p.id === productId ? {
    ...p, quantity: stockPrecision(stockBase(p) - fulfilled) / packSize(p), backorderedQty: stockPrecision(owed - fulfilled) / packSize(p),
  } : p) };
  updated = recordInventoryMovement(updated, productId, 'Sale', -fulfilled / packSize(product), 'Staff', 'Backorder fulfilment');
  saveStore(updated);
  return updated;
}

// Clear a product's backorder counter without touching stock (owner chose to write it off).
export function clearBackorder(store: StoreData, productId: string): StoreData {
  const updated = {
    ...store,
    products: store.products.map(p => p.id === productId ? {
      ...p,
      backorderedQty: 0,
    } : p),
  };
  saveStore(updated);
  return updated;
}

export function clearSales(store: StoreData): StoreData {
  let updated = store;
  while (updated.sales.length) updated = deleteSale(updated, updated.sales[0].id, true);
  saveStore(updated);
  return updated;
}

export function importProducts(
  store: StoreData,
  products: Omit<Product, 'id'>[],
  source: string = 'Supplier Invoice',
  actorName?: string
): StoreData {
  const now = new Date().toISOString();
  const newProducts = products.map(p => ({
    ...p,
    id: generateId(),
    initialQuantity: p.quantity,
    addedAt: now,
    restock_count: p.quantity > 0 ? 1 : 0,
    units_sold: 0,
    total_revenue: 0,
    total_profit: 0
  }));

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

  let updated: StoreData = {
    ...store,
    products: [...store.products, ...newProducts],
    investments: newInvestments,
    expenses: newExpenses,
  };

  newProducts.forEach(p => {
    if (p.quantity > 0) {
      updated = recordInventoryMovement(
        updated,
        p.id,
        'Restock',
        p.quantity,
        actorName,
        source
      );
    }
  });

  saveStore(updated);
  return updated;
}

export interface RestockEntry {
  productId: string;
  quantity: number;
  costPrice: number;
}

export type RestockFunding = 'balance' | 'new_money';

export function receiveStock(
  store: StoreData,
  entries: RestockEntry[],
  funding: RestockFunding = 'balance',
  source: string = 'Restock Button',
  actorName?: string,
  actorRole?: string
): StoreData {
  const grouped = new Map<string, RestockEntry>();
  for (const entry of entries) {
    const product = store.products.find(p => p.id === entry.productId);
    if (!product || !Number.isFinite(entry.quantity) || entry.quantity <= 0 || !Number.isFinite(entry.costPrice) || entry.costPrice < 0) throw new Error('Check the restock products, quantities and costs.');
    if (packSize(product) > 1 && !Number.isInteger(saleUnits(product, entry.quantity))) throw new Error('Pack stock must contain whole pieces.');
    const old = grouped.get(entry.productId);
    grouped.set(entry.productId, old ? { ...entry, quantity: old.quantity + entry.quantity, costPrice: (old.quantity * old.costPrice + entry.quantity * entry.costPrice) / (old.quantity + entry.quantity) } : entry);
  }
  entries = [...grouped.values()];
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
      quantity: stockPrecision(stockBase(p) + saleUnits(p, entry.quantity)) / packSize(p),
      costPrice: (Math.max(0, p.quantity) * p.costPrice + entry.quantity * entry.costPrice) / (Math.max(0, p.quantity) + entry.quantity),
      initialQuantity: p.initialQuantity ?? p.quantity,
      priceHistory: newPriceHistory,
      restock_count: (p.restock_count || 0) + 1,
    };
  });

  // Auto-create a single Restock expense for the entire batch (always — reduces net income / cash)
  const newExpenses: Expense[] = [];
  const newInvestments: Investment[] = [];

  let newCashBalance = store.cashBalance ?? 0;
  let newBankBalance = store.bankBalance ?? 0;
  let newWalletBalance = store.walletBalance ?? 0;

  if (restockTotal > 0) {
    {
      const availableCash = newCashBalance + newBankBalance + newWalletBalance;
      let autoInvestedAmt = 0;
      let cashDeduction = 0;

      // Honour what the merchant said. The intake screens already ask "from
      // balance" or "new money", but that answer used to be filed against the
      // restock and then ignored: the till was drained either way, and any
      // shortfall was booked as capital the merchant never said they had put
      // in. Those invented injections then inflated the balance.
      if (funding === 'new_money') {
        // Came from outside and went straight to the supplier, so it never sat
        // in the till and nothing is deducted from it.
        autoInvestedAmt = restockTotal;
      } else {
        // Paid from the balance. Spending past what is there is a debt, and
        // the balance is allowed to say so — it is no longer floored at zero
        // and no capital is invented to cover the gap.
        cashDeduction = restockTotal;
      }
      const shortfall = funding !== 'new_money' && restockTotal > availableCash;

      // Spend the balance, drawing on cash first, then bank, then wallet.
      // Whatever is left over runs the cash account negative rather than being
      // clamped away: overspending is a debt, and the shop should be told.
      let remainingDeduct = cashDeduction;
      for (const account of ['cash', 'bank', 'wallet'] as const) {
        if (remainingDeduct <= 0) break;
        const held = account === 'cash' ? newCashBalance : account === 'bank' ? newBankBalance : newWalletBalance;
        const taken = Math.min(Math.max(held, 0), remainingDeduct);
        if (account === 'cash') newCashBalance -= taken;
        else if (account === 'bank') newBankBalance -= taken;
        else newWalletBalance -= taken;
        remainingDeduct -= taken;
      }
      if (remainingDeduct > 0) newCashBalance -= remainingDeduct;

      const fundingLabel = funding === 'new_money'
        ? ' (paid with new money)'
        : shortfall
          ? ' (balance was short — check your cash)'
          : ' (from available balance)';
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
          // Say which of the two this was. A shortfall is not the merchant
          // telling us they injected capital — it is the books disagreeing
          // with the till, and it should read that way in the ledger.
          note: shortfall
            ? `Unfunded restock — available balance was short by this much`
            : `Stock bought with new money`,
          source: 'Inventory Restock',
          date: now,
          type: 'additional',
        });
      }
    }
  }

  let updated: StoreData = {
    ...store,
    products: updatedProducts,
    restocks: [...newRestocks, ...(store.restocks || [])],
    expenses: [...newExpenses, ...(store.expenses || [])],
    investments: [...newInvestments, ...(store.investments || [])],
    cashBalance: Math.round(newCashBalance * 100) / 100,
    bankBalance: Math.round(newBankBalance * 100) / 100,
    walletBalance: Math.round(newWalletBalance * 100) / 100,
  };

  for (const entry of entries) {
    if (entry.quantity > 0) {
      updated = recordInventoryMovement(
        updated,
        entry.productId,
        'Restock',
        entry.quantity,
        actorName,
        source
      );
    }
  }

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
    updated = { ...updated, products: updated.products.some(x => x.id === p.id) ? updated.products.map(x => x.id === p.id ? { ...x, discontinued: false } : x) : [...updated.products, p] };
  } else if (item.kind === 'sale') {
    const undo = item.saleUndo;
    // Old trash lacks the payment/stock reversal snapshot. Guessing here can
    // invent cash or goods (old Clear Sales did not reverse either).
    if (!undo) throw new Error('This older sale has no reversal record. Re-enter it after checking stock and payments.');
    if (undo.sales.some(s => updated.sales.some(existing => existing.id === s.id))) throw new Error('This transaction is already restored.');
    const required = new Map<string, number>();
    for (const delta of undo.stock) required.set(delta.productId, (required.get(delta.productId) || 0) + delta.baseQuantity);
    for (const [productId, units] of required) {
      const product = updated.products.find(p => p.id === productId);
      if (!product || stockBase(product) + 1e-8 < units) throw new Error('Not enough stock to restore this sale. Restore or restock the product first.');
    }
    updated = { ...updated, products: updated.products.map(p => ({ ...p })) };
    for (const delta of undo.stock) {
      const p = updated.products.find(p => p.id === delta.productId)!;
      p.quantity = stockPrecision(stockBase(p) - delta.baseQuantity) / packSize(p);
      p.backorderedQty = stockPrecision((p.backorderedQty || 0) * packSize(p) + delta.backorderQuantity) / packSize(p);
      updated = recordInventoryMovement(updated, p.id, 'Sale', -delta.baseQuantity / packSize(p), 'Staff', 'Restored transaction');
    }
    updated = { ...updated, sales: [...undo.sales, ...updated.sales], pendingPayments: [...undo.pending, ...(updated.pendingPayments || [])],
      cashBalance: money((updated.cashBalance || 0) + undo.allocation.cash), bankBalance: money((updated.bankBalance || 0) + undo.allocation.bank),
      customers: (updated.customers || []).map(c => { const delta = undo.customers.find(d => d.id === c.id); return delta ? { ...c, purchaseHistory: [...(delta.history || []), ...(c.purchaseHistory || [])], totalPurchases: money(c.totalPurchases + delta.purchases), outstandingDebt: money(c.outstandingDebt + delta.debt), visitsCount: c.visitsCount + delta.visits, loyaltyPoints: c.loyaltyPoints + delta.points } : c; }),
    };
    updated = syncProductPerformance(updated);
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
    existing.totalSold += historicalUnits(s, store.products.find(p => p.id === s.productId));
    existing.revenue += s.total;
    map.set(s.productId, existing);
  });
  return Array.from(map.values()).sort((a, b) => b.totalSold - a.totalSold).slice(0, limit);
}

export function getDashboardStats(store: StoreData) {
  const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
  const totalProfit = store.sales.reduce((sum, s) => sum + s.profit, 0);
  const activeProducts = store.products.filter(p => !p.discontinued);
  const totalProducts = activeProducts.length;
  const threshold = getLowStockThreshold();
  const lowStockProducts = activeProducts.filter(p => p.quantity <= threshold);
  const totalSales = store.sales.length;
  const inventoryValue = store.products.reduce((sum, p) => sum + p.costPrice * p.quantity, 0);
  const totalExpenses = sumOperatingExpenses(store);
  const stockPurchases = sumStockPurchases(store);
  const savingsSaved = store.savingsGoal?.saved || 0;
  const netIncome = totalRevenue - totalExpenses - savingsSaved;
  return { totalRevenue, totalProfit, totalProducts, lowStockProducts, totalSales, inventoryValue, totalExpenses, stockPurchases, netIncome };
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
  items: { productId: string; quantity: number; saleType?: 'carton' | 'single'; expectedUnitPrice?: number; agreedUnitPrice?: number }[],
  opts: {
    paid: number; method: PaymentMethod; allocation?: PaymentAllocation;
    customerId?: string; customerName?: string; customerPhone?: string; customerNote?: string;
    dueDate?: string; discount?: number; actorName?: string; actorRole?: string; deferSave?: boolean;
  }
): { store: StoreData; sales: Sale[]; pending?: PendingPayment; error?: string; subtotal: number; total: number; discount: number; paid: number; balance: number } {
  const failed = (error: string) => ({ store, sales: [] as Sale[], error, subtotal: 0, total: 0, discount: 0, paid: 0, balance: 0 });
  try {
    if (!items.length) return failed('Add an item before checkout.');
    if (!Number.isFinite(opts.paid) || opts.paid < 0 || !Number.isFinite(opts.discount ?? 0) || (opts.discount ?? 0) < 0) return failed('Check the payment and discount amounts.');
    const needed = new Map<string, number>();
    for (const item of items) {
      const product = store.products.find(p => p.id === item.productId && !p.discontinued);
      if (!product) return failed('An item is no longer available. Review your cart.');
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) return failed(`Enter a valid quantity for ${product.name}.`);
      if (item.agreedUnitPrice !== undefined && (!opts.deferSave || !Number.isFinite(item.agreedUnitPrice) || item.agreedUnitPrice < 0)) return failed('Invalid agreed order price.');
      const units = saleUnits(product, item.quantity, item.saleType);
      if ((packSize(product) > 1 || item.saleType === 'single') && !Number.isInteger(units)) return failed(`${product.name} must be sold in whole pieces.`);
      if (item.expectedUnitPrice !== undefined && money(item.expectedUnitPrice) !== salePrice(product, item.saleType)) return failed(`The price of ${product.name} changed. Remove it and add it again.`);
      if (!Number.isFinite(product.costPrice) || product.costPrice < 0 || !Number.isFinite(salePrice(product, item.saleType)) || salePrice(product, item.saleType) < 0) return failed(`Check the price of ${product.name}.`);
      needed.set(product.id, (needed.get(product.id) || 0) + units);
      if (!store.managerSettings?.backorderSellingEnabled && needed.get(product.id)! > stockBase(product) + 1e-8) return failed(`Not enough stock for ${product.name}. Nothing was sold.`);
    }
    const customerName = opts.customerName?.trim();
    const customers = store.customers || [];
    const phone = String(opts.customerPhone || '').replace(/\D/g, '');
    let customer = opts.customerId ? customers.find(c => c.id === opts.customerId) : undefined;
    if (opts.customerId && !customer) return failed('Select the customer again.');
    if (!customer && customerName) {
      const matches = phone ? customers.filter(c => String(c.phone || '').replace(/\D/g, '') === phone) : customers.filter(c => c.name.trim().toLowerCase() === customerName.toLowerCase());
      if (matches.length > 1) return failed('More than one customer matches. Select the correct customer.');
      customer = matches[0];
    }
    const customerId = customer?.id || (customerName ? pid() : undefined);
    const transactionId = pid();
    let updated = store;
    for (const item of items) {
      const original = updated.products.find(p => p.id === item.productId)!;
      if (item.agreedUnitPrice !== undefined) updated = { ...updated, products: updated.products.map(p => p.id === item.productId ? { ...p, ...(item.saleType === 'single' ? { singleSellingPrice: item.agreedUnitPrice } : { sellingPrice: item.agreedUnitPrice }) } : p) };
      updated = recordSale(updated, item.productId, item.quantity, opts.actorName, opts.actorRole, transactionId, item.saleType, true);
      if (item.agreedUnitPrice !== undefined) updated = { ...updated, products: updated.products.map(p => p.id === item.productId ? { ...p, sellingPrice: original.sellingPrice, singleSellingPrice: original.singleSellingPrice } : p) };
    }
    const rawSales = updated.sales.filter(s => s.transactionId === transactionId);
    if (rawSales.length !== items.length) return failed('The cart could not be recorded. Nothing was sold.');
    const subtotal = money(rawSales.reduce((sum, sale) => sum + sale.total, 0));
    const discount = money(opts.discount || 0);
    if (discount > subtotal) return failed('Discount cannot exceed the sale total.');
    const total = money(subtotal - discount);
    const paid = money(Math.min(opts.paid, total));
    const balance = money(total - paid);
    if (balance > 0 && !customerName) return failed('Enter a customer for the unpaid balance.');
    const allocation = paymentAllocation(paid, opts.method, opts.allocation);
    let remainingDiscount = Math.round(discount * 100);
    let remainingCash = Math.round(allocation.cash * 100);
    let remainingBank = Math.round(allocation.bank * 100);
    const pendingId = balance > 0 ? pid() : undefined;
    const sales = rawSales.map((sale, index) => {
      const last = index === rawSales.length - 1;
      const discountCents = last ? remainingDiscount : Math.min(remainingDiscount, Math.floor(discount * 100 * sale.total / (subtotal || 1)));
      remainingDiscount -= discountCents;
      const saleTotal = money(sale.total - discountCents / 100);
      const cash = last ? remainingCash : Math.min(remainingCash, Math.floor(allocation.cash * 100 * saleTotal / (total || 1)));
      const bank = last ? remainingBank : Math.min(remainingBank, Math.floor(allocation.bank * 100 * saleTotal / (total || 1)));
      remainingCash -= cash; remainingBank -= bank;
      return { ...sale, total: saleTotal, profit: money(sale.profit - discountCents / 100), customerId, pendingPaymentId: pendingId, paymentMethod: opts.method, paymentAllocation: { cash: cash / 100, bank: bank / 100 } };
    });
    const now = new Date().toISOString();
    const pending: PendingPayment | undefined = pendingId ? {
      id: pendingId, customerId, customerName: customerName!, customerPhone: opts.customerPhone || customer?.phone,
      customerNote: opts.customerNote, dueDate: opts.dueDate, createdAt: now,
      items: sales.map(s => ({ productId: s.productId, productName: s.productName, quantity: s.quantity, unitPrice: s.unitPrice })),
      total, paid, balance, status: 'pending', saleIds: sales.map(s => s.id),
      events: paid > 0 ? [{ date: now, amount: paid, method: opts.method, allocation }] : [],
    } : undefined;
    updated = { ...updated, sales: [...sales, ...store.sales],
      pendingPayments: pending ? [pending, ...(store.pendingPayments || [])] : store.pendingPayments,
      cashBalance: money((store.cashBalance || 0) + allocation.cash), bankBalance: money((store.bankBalance || 0) + allocation.bank) };
    if (customerName && customerId) {
      const purchase = { date: now, amount: total, items: sales.map(s => `${s.productName} (x${s.quantity})`).join(', '), transactionId };
      const nextCustomer: Customer = {
        ...(customer || {}), id: customerId, name: customer?.name || customerName, phone: customer?.phone || opts.customerPhone || '',
        totalPurchases: money((customer?.totalPurchases || 0) + total), outstandingDebt: money((customer?.outstandingDebt || 0) + balance),
        lastPurchaseDate: now, purchaseHistory: [purchase, ...(customer?.purchaseHistory || [])],
        visitsCount: (customer?.visitsCount || 0) + 1, loyaltyPoints: (customer?.loyaltyPoints || 0) + Math.floor(total / 1000),
      };
      updated = { ...updated, customers: customer ? customers.map(c => c.id === customerId ? nextCustomer : c) : [nextCustomer, ...customers] };
    }
    updated = syncProductPerformance(updated);
    if (!opts.deferSave) saveStore(updated);
    return { store: updated, sales, pending, subtotal, total, discount, paid, balance };
  } catch (error) {
    return failed(error instanceof Error ? error.message : 'Checkout failed. Your cart has been kept.');
  }
}

/** Atomic cash checkout used by barcode, voice and receipt entry points. */
export function recordCashCheckout(store: StoreData, items: { productId: string; quantity: number }[], actorName?: string, actorRole?: string) {
  const total = items.reduce((sum, item) => { const p = store.products.find(p => p.id === item.productId); return sum + (p ? money(salePrice(p) * item.quantity) : 0); }, 0);
  return recordCheckout(store, items, { paid: money(total), method: 'cash', actorName, actorRole });
}

export function addPaymentToPending(store: StoreData, id: string, amount: number, method: PaymentMethod = 'cash', split?: PaymentAllocation): StoreData {
  const p = (store.pendingPayments || []).find(x => x.id === id);
  if (!p || p.balance <= 0) throw new Error('This payment is no longer outstanding.');
  if (!Number.isFinite(amount) || amount <= 0 || money(amount) > money(p.balance)) throw new Error('Enter an amount no greater than the outstanding balance.');
  amount = money(amount);
  const allocation = paymentAllocation(amount, method, split);
  const numberOf = (value: unknown) => String(value || '').replace(/\D/g, '');
  const customers = store.customers || [];
  const byNumber = numberOf(p.customerPhone) ? customers.filter(c => numberOf(c.phone) === numberOf(p.customerPhone)) : [];
  const byName = customers.filter(c => c.name.toLowerCase() === p.customerName.toLowerCase());
  const payerId = p.customerId || (byNumber.length === 1 ? byNumber[0].id : '') || (byName.length === 1 ? byName[0].id : '');
  const date = new Date().toISOString();
  const updated: StoreData = { ...store,
    customers: customers.map(c => c.id === payerId ? { ...c, outstandingDebt: money(Math.max(0, c.outstandingDebt - amount)) } : c),
    cashBalance: money((store.cashBalance || 0) + allocation.cash), bankBalance: money((store.bankBalance || 0) + allocation.bank),
    pendingPayments: (store.pendingPayments || []).map(entry => entry.id !== id ? entry : {
      ...entry, paid: money(entry.paid + amount), balance: money(entry.balance - amount), status: money(entry.balance - amount) === 0 ? 'paid' : 'pending',
      events: [...(entry.events || []), { date, amount, method, allocation }],
    }),
  };
  // Laundry sales are receipts, whereas inventory sales are invoices. Preserve
  // the laundry receipt convention when a bundle is paid from this screen.
  if (id.startsWith('laundry-')) {
    updated.sales = [...store.sales, { id: pid(), productId: p.items[0]?.productId || id, productName: p.items[0]?.productName || 'Laundry payment', quantity: 1, unitPrice: amount, total: amount, profit: amount, date, pendingPaymentId: id, paymentMethod: method, paymentAllocation: allocation, channel: 'in_store' }];
  }
  saveStore(updated);
  return updated;
}

export function markPendingPaid(store: StoreData, id: string, method: PaymentMethod = 'cash'): StoreData {
  const p = (store.pendingPayments || []).find(x => x.id === id);
  if (!p) return store;
  return addPaymentToPending(store, id, p.balance, method);
}

export function deletePendingPayment(store: StoreData, id: string): StoreData {
  // A write-off forgives the debt; it is not a payment and must retain history.
  const pending = (store.pendingPayments || []).find(p => p.id === id);
  if (!pending || pending.balance <= 0) return store;
  const candidates = (store.customers || []).filter(c => pending.customerId ? c.id === pending.customerId : pending.customerPhone ? c.phone.replace(/\D/g, '') === pending.customerPhone.replace(/\D/g, '') : c.name.toLowerCase() === pending.customerName.toLowerCase());
  const updated: StoreData = { ...store,
    customers: (store.customers || []).map(c => candidates.length === 1 && c.id === candidates[0].id ? { ...c, outstandingDebt: money(Math.max(0, c.outstandingDebt - pending.balance)) } : c),
    pendingPayments: (store.pendingPayments || []).map(p => p.id === id ? { ...p, writtenOffAmount: money((p.writtenOffAmount || 0) + p.balance), writtenOffAt: new Date().toISOString(), balance: 0, status: 'written_off' } : p),
  };
  saveStore(updated);
  return updated;
}

export function getPendingSummary(store: StoreData) {
  const list = (store.pendingPayments || []).filter(p => p.status === 'pending');
  const totalOwed = list.reduce((s, p) => s + p.balance, 0);
  // By customer, not by name: two customers who share a name are two debtors.
  const customerCount = countDebtors(list);
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
/**
 * The one way the app decides whether it already knows somebody.
 *
 * By phone when there is a phone, because two people share a name far more
 * often than a number. By name when there is not - which there often is not
 * now that the counter can take a bundle from a walk-in who would rather not
 * give a number.
 *
 * The empty case is the one that bites: matching '' against '' makes every
 * anonymous walk-in the same person, so a shop that served four of them would
 * find one customer with four visits. Comparing names instead keeps Musa and
 * Ngozi apart, and two different Musas with no phone between them will merge -
 * which is a smaller wrong than either losing them or inventing four people.
 */
export function matchCustomer(
  customers: Customer[] | undefined,
  who: { name?: string; phone?: string },
): Customer | undefined {
  const digits = String(who.phone || '').replace(/\D/g, '');
  const name = String(who.name || '').trim().toLowerCase();

  /*
   * Everybody by that name, whether or not they have a number.
   *
   * This used to consider only customers with no number, on the grounds that
   * "Musa with a phone" and "a walk-in called Musa" were different records.
   * That rule is what turned every number added to an existing customer into
   * a brand-new customer: the new number matched nobody, and the Musa already
   * in the book was skipped for having a number at all.
   */
  const sameName = (customers || []).filter(customer =>
    String(customer.name || '').trim().toLowerCase() === name);

  if (digits) {
    /*
     * Everybody on that number, not the first of them.
     *
     * A number can belong to more than one person - a household phone, a shop
     * line - once the counter has said so at intake. Handing back whichever
     * was recorded first would file this bundle, and its money, against the
     * wrong one of them, so the name decides between them. No name match among
     * them still means the person on that number, which is what a shop with
     * one customer per number has always had.
     */
    const onThatNumber = (customers || []).filter(customer => String(customer.phone || '').replace(/\D/g, '') === digits);
    if (onThatNumber.length) {
      const byName = onThatNumber.find(customer => String(customer.name || '').trim().toLowerCase() === name);
      return byName || onThatNumber[0];
    }
    /*
     * A number the book has never seen, for a name exactly one customer has.
     *
     * That is them: a first number, a changed number or a second phone - not
     * a second copy of the person, which splits their history and their debt.
     * Whether the new number replaces the saved one is the counter's call and
     * is asked on screen; nothing here overwrites anything. Two customers by
     * that name is a coin toss, so that still matches nobody.
     */
    if (name && sameName.length === 1) return sameName[0];
    return undefined;
  }

  if (!name) return undefined;
  /*
   * Two walk-ins called Musa Bello, neither with a number, are two people.
   * Handing back the first of them files this bundle - and its money - against
   * whichever happened to be recorded first, which is a coin toss the shop
   * cannot see and cannot undo. The counter was shown both; not choosing means
   * this is somebody new.
   */
  return sameName.length === 1 ? sameName[0] : undefined;
}

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
  let updated: StoreData = {
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
  let updated: StoreData = {
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
  let updated: StoreData = {
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

  if (!Number.isFinite(actual) || actual < 0) throw new Error('Enter a valid stock count.');
  const updated = recordInventoryMovement({ ...store, products: updatedProducts, stockCountAudits: [auditEntry, ...(store.stockCountAudits || [])] }, productId, 'Adjustment', variance, 'Staff', 'Stock count');
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
  if (!product || !Number.isFinite(quantity) || quantity <= 0 || stockBase(product) + 1e-8 < saleUnits(product, quantity)) throw new Error('Check the transfer quantity.');
  if (destStoreCode.toUpperCase() === sourceStore.accessCode.toUpperCase()) throw new Error('Choose another store.');
  const destStore = loadStore(destStoreCode);
  if (!destStore) throw new Error('Destination store is unavailable. Nothing was transferred.');
  const units = saleUnits(product, quantity);
  if (packSize(product) > 1 && !Number.isInteger(units)) throw new Error('Transfer whole pieces only.');

  const now = new Date().toISOString();

  // Decrease source stock
  let updatedSource: StoreData = {
    ...sourceStore,
    products: sourceStore.products.map(p => p.id === productId ? { ...p, quantity: stockPrecision(stockBase(p) - units) / packSize(p) } : p),
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

  updatedSource = recordInventoryMovement(
    updatedSource,
    productId,
    'Transfer',
    -quantity,
    'Staff',
    `To Store ${destStoreCode}`
  );

  // Load and update destination store
  if (destStore) {
    let destProducts = [...destStore.products];
    const destProd = destProducts.find(p => (product.barcode ? p.barcode === product.barcode : p.name.toLowerCase() === product.name.toLowerCase() && p.unit === product.unit && packSize(p) === packSize(product)));
    let targetProductId = destProd ? destProd.id : '';

    if (destProd) {
      destProducts = destProducts.map(p => p.id === destProd.id ? { ...p, quantity: stockPrecision(stockBase(p) + units) / packSize(p), costPrice: (p.quantity * p.costPrice + quantity * product.costPrice) / (p.quantity + units / packSize(p)) } : p);
    } else {
      targetProductId = generateId();
      // Add product as new in destination store
      destProducts.push({
        ...product,
        units_sold: 0, total_revenue: 0, total_profit: 0, first_sale_at: undefined, last_sold_at: undefined, backorderedQty: 0, discontinued: false,
        id: targetProductId,
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

    let updatedDest: StoreData = {
      ...destStore,
      products: destProducts,
      transfers: [
        {
          id: generateId(),
          productId: targetProductId || 'new',
          productName: product.name,
          quantity,
          sourceStoreCode: sourceStore.accessCode,
          destStoreCode,
          date: now
        },
        ...(destStore.transfers || [])
      ]
    };

    updatedDest = recordInventoryMovement(
      updatedDest,
      targetProductId,
      'Transfer',
      units / (destProd ? packSize(destProd) : packSize(product)),
      'Staff',
      `From Store ${sourceStore.accessCode}`
    );
    // Keep a recovery journal until BOTH local stores are durable. A reload
    // completes an interrupted pair; retries must not re-apply the movement.
    const key = 'storeflow_transfer_journal';
    localStorage.setItem(key, JSON.stringify({ source: updatedSource, destination: updatedDest, sourceBase: sourceStore, destinationBase: destStore }));
    saveStore(updatedDest, { skipCloudSync: true });
    saveStore(updatedSource, { skipCloudSync: true });
    localStorage.removeItem(key);
    saveStore(updatedDest, { cloudBase: destStore });

  }

  saveStore(updatedSource, { cloudBase: sourceStore });
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

export function addLoan(store: StoreData, amount: number, source: string, note?: string, dueDate?: string): StoreData {
  const newLoan: Loan = {
    id: generateId(),
    amount,
    source,
    date: new Date().toISOString(),
    note,
    status: 'active',
    dueDate,
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
  // Never let a repayment exceed what's actually still owed on this loan —
  // without this, overpaying (e.g. a typo) would deduct the full typed
  // amount from cash/bank/wallet and reduce total liabilities by more than
  // this loan actually accounted for, silently corrupting both balances.
  const effectiveAmount = Math.min(amount, loan.amount);

  const updatedLoans = [...loans];
  const updatedLoan = {
    ...loan,
    amount: Math.max(0, Math.round((loan.amount - effectiveAmount) * 100) / 100),
  };
  if (updatedLoan.amount <= 0) {
    updatedLoan.status = 'repaid';
  }
  updatedLoans[loanIndex] = updatedLoan as Loan;

  const updated = {
    ...store,
    loans: updatedLoans,
    liabilities: Math.max(0, Math.round(((store.liabilities || 0) - effectiveAmount) * 100) / 100),
    cashBalance: source === 'Cash Drawer' ? Math.max(0, Math.round(((store.cashBalance || 0) - effectiveAmount) * 100) / 100) : (store.cashBalance || 0),
    bankBalance: source === 'Bank Account' ? Math.max(0, Math.round(((store.bankBalance || 0) - effectiveAmount) * 100) / 100) : (store.bankBalance || 0),
    walletBalance: source === 'Business Wallet' ? Math.max(0, Math.round(((store.walletBalance || 0) - effectiveAmount) * 100) / 100) : (store.walletBalance || 0),
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

// ─── Scan Analytics ─────────────────────────────────────────────────────────
// Every QR/barcode scan surface in the app (QR Hub, checkout scanning,
// quick lookup) calls this so there's finally a real record of what's
// being scanned, instead of the QR/Barcode page being a pure
// generate/scan utility with no visibility into how it's actually used.
// Capped at the most recent 500 events so this can't grow unbounded.
export function logScanEvent(
  store: StoreData,
  event: { kind: 'qr' | 'barcode'; purpose: string; productId?: string; productName?: string; matched: boolean }
): StoreData {
  const newEvent: ScanEvent = {
    id: generateId(),
    date: new Date().toISOString(),
    ...event,
  };
  const updated = {
    ...store,
    scanEvents: [newEvent, ...(store.scanEvents || [])].slice(0, 500),
  };
  saveStore(updated);
  return updated;
}


export function addRecurringBill(
  store: StoreData,
  bill: { label: string; amount: number; category: Expense['category']; frequency: 'weekly' | 'monthly'; nextDueDate: string }
): StoreData {
  const newBill: RecurringBill = {
    id: generateId(),
    label: bill.label,
    amount: bill.amount,
    category: bill.category,
    frequency: bill.frequency,
    nextDueDate: bill.nextDueDate,
    active: true,
  };
  const updated = { ...store, recurringBills: [newBill, ...(store.recurringBills || [])] };
  saveStore(updated);
  return updated;
}

export function deleteRecurringBill(store: StoreData, id: string): StoreData {
  const updated = { ...store, recurringBills: (store.recurringBills || []).filter(b => b.id !== id) };
  saveStore(updated);
  return updated;
}

export function toggleRecurringBill(store: StoreData, id: string): StoreData {
  const updated = {
    ...store,
    recurringBills: (store.recurringBills || []).map(b => b.id === id ? { ...b, active: !b.active } : b),
  };
  saveStore(updated);
  return updated;
}

// Marks a bill as paid right now: logs it as a real Expense and advances
// nextDueDate to the following cycle (7 days for weekly, same day next
// month for monthly), so the reminder clock resets automatically instead
// of nagging about a bill that was just paid.
export function markRecurringBillPaid(store: StoreData, id: string): StoreData {
  const bill = (store.recurringBills || []).find(b => b.id === id);
  if (!bill) return store;

  const current = new Date(bill.nextDueDate);
  const next = new Date(current);
  if (bill.frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else {
    next.setMonth(next.getMonth() + 1);
  }

  const withExpense = addExpense(store, {
    amount: bill.amount,
    category: bill.category,
    date: new Date().toISOString(),
    note: `${bill.label} (recurring bill)`,
  });

  const updated = {
    ...withExpense,
    recurringBills: (withExpense.recurringBills || []).map(b =>
      b.id === id ? { ...b, nextDueDate: next.toISOString(), lastReminderDate: undefined } : b
    ),
  };
  saveStore(updated);
  return updated;
}


// ─── Sales Target ──────────────────────────────────────────────────────────
// Auto mode looks at the last 14 days of selling activity to decide whether
// this is a "sells every day" store (daily target) or a "sells a few times a
// week" store (weekly target), then sets the target a bit above the trailing
// average so it's a stretch goal, not just a mirror of what already happened.
// Manual mode just uses whatever the owner set in Settings.
export interface SalesTargetStatus {
  mode: 'auto' | 'manual';
  period: 'daily' | 'weekly';
  targetAmount: number;
  progressAmount: number;
  progressPercent: number; // 0-100, capped
}

function roundToNiceNumber(n: number): number {
  if (n <= 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / magnitude) * magnitude;
}

export function getSalesTargetStatus(store: StoreData): SalesTargetStatus {
  const manual = store.salesTarget?.mode === 'manual' ? store.salesTarget : null;

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const recentSales = store.sales.filter(s => new Date(s.date) >= fourteenDaysAgo);
  const daysWithSales = new Set(recentSales.map(s => s.date.split('T')[0])).size;
  // Selling on at least 5 of the last 14 tracked days reads as a "daily" store.
  const detectedPeriod: 'daily' | 'weekly' = daysWithSales >= 5 ? 'daily' : 'weekly';

  const period = manual?.period || detectedPeriod;

  let targetAmount: number;
  if (manual?.amount) {
    targetAmount = manual.amount;
  } else {
    const totalRecent = recentSales.reduce((sum, s) => sum + s.total, 0);
    const trailingAverage = period === 'daily'
      ? totalRecent / 14
      : totalRecent / 2; // 14 days ≈ 2 weeks
    // 15% stretch above the trailing average, rounded to a clean number.
    targetAmount = roundToNiceNumber(Math.max(trailingAverage * 1.15, 1000));
  }

  let progressAmount: number;
  if (period === 'daily') {
    progressAmount = store.sales
      .filter(s => s.date.startsWith(todayStr))
      .reduce((sum, s) => sum + s.total, 0);
  } else {
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek);
    weekStart.setHours(0, 0, 0, 0);
    progressAmount = store.sales
      .filter(s => new Date(s.date) >= weekStart)
      .reduce((sum, s) => sum + s.total, 0);
  }

  const progressPercent = targetAmount > 0 ? Math.min(100, Math.round((progressAmount / targetAmount) * 100)) : 0;

  return {
    mode: manual ? 'manual' : 'auto',
    period,
    targetAmount,
    progressAmount,
    progressPercent,
  };
}

// ─── Auto-Applied Price Log ────────────────────────────────────────────────
// Reverts a single Auto-Apply price change. Only reverts if the product's
// current price still matches what auto-apply set it to — if the owner (or
// anything else) already changed it again since, undo is refused rather than
// clobbering a newer, deliberate edit.
export function undoAutoPrice(store: StoreData, eventId: string): StoreData {
  const event = (store.autoPriceLog || []).find(e => e.id === eventId);
  if (!event || event.undone) return store;

  const product = store.products.find(p => p.id === event.productId);
  if (!product || product.sellingPrice !== event.newPrice) return store;

  const updated: StoreData = {
    ...store,
    products: store.products.map(p => p.id === event.productId ? { ...p, sellingPrice: event.oldPrice } : p),
    autoPriceLog: (store.autoPriceLog || []).map(e => e.id === eventId ? { ...e, undone: true } : e),
  };
  saveStore(updated);
  return updated;
}
