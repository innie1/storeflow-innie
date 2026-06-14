export interface Product {
  id: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  category: string;
  initialQuantity?: number;
  addedAt?: string;
  barcode?: string;
}

export interface Restock {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  total: number;
  date: string;
  batchId?: string;
  funding?: 'balance' | 'new_money';
}

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  profit: number;
  date: string;
}

export type ExpenseCategory = 'Restock' | 'Rent' | 'Utilities' | 'Salaries' | 'Transport' | 'Other';

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  date: string; // ISO
  note?: string;
  source?: 'manual' | 'restock';
  restockBatchId?: string; // to link expense to a restock event
}

export interface StoreProfile {
  storeType: string;
  location: string;
  phone: string;
  email: string;
}

export type TrashKind = 'product' | 'sale' | 'expense';

export interface TrashItem {
  id: string;          // trash entry id
  kind: TrashKind;
  deletedAt: string;   // ISO
  payload: Product | Sale | Expense;
}

export interface Investment {
  id: string;
  amount: number;
  note: string;
  date: string; // ISO
  type: 'initial' | 'additional'; // initial = first investment, additional = new money in
}

export type StoreCategory = 'retail' | 'restaurant' | 'games' | 'other';

export interface GameService {
  id: string;
  name: string;
  icon: string;
  price: number;
  enabled: boolean;
  order: number;
}

export interface GameSession {
  id: string;
  gameId: string;
  gameName: string;
  amount: number;
  players: number;
  duration?: number; // minutes
  notes?: string;
  date: string; // ISO
}

export interface CustomerRequest {
  id: string;
  text: string;
  date: string;
  fulfilled?: boolean;
}

export interface SavingsGoal {
  amount: number;
  label?: string;
  source: 'revenue' | 'profit';
  percentage: number;
  saved: number;
}

export interface ManagerSettings {
  enabled: boolean;
  revenueForecasts: boolean;
  profitForecasts: boolean;
  inventoryForecasts: boolean;
  expenseAnalysis: boolean;
  smartPricing: boolean;
  productSuggestions: boolean;
  savingsPlanner: boolean;
  voiceFeatures: boolean;
  weeklyRecap: boolean;
  customerRequests: boolean;
  defaultMargin: number;
  autoSuggestPrices: boolean;
  autoApplyPrices: boolean;
}

export const DEFAULT_MANAGER_SETTINGS: ManagerSettings = {
  enabled: true,
  revenueForecasts: true,
  profitForecasts: true,
  inventoryForecasts: true,
  expenseAnalysis: true,
  smartPricing: true,
  productSuggestions: true,
  savingsPlanner: true,
  voiceFeatures: true,
  weeklyRecap: true,
  customerRequests: true,
  defaultMargin: 30,
  autoSuggestPrices: true,
  autoApplyPrices: false,
};

export interface StoreData {
  storeName: string;
  accessCode: string;
  category?: StoreCategory;
  products: Product[];
  sales: Sale[];
  restocks?: Restock[];
  expenses?: Expense[];
  trash?: TrashItem[];
  investments?: Investment[];
  games?: GameService[];
  gameSessions?: GameSession[];
  customerRequests?: CustomerRequest[];
  savingsGoal?: SavingsGoal;
  managerSettings?: ManagerSettings;
  createdAt: string;
  profile?: StoreProfile;
}

export type TabId =
  | 'dashboard' | 'inventory' | 'sales' | 'history' | 'expenses' | 'settings' | 'roi' | 'manager'
  | 'games-dashboard' | 'games-history' | 'games-analytics' | 'games-settings';
