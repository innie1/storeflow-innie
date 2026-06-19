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

export type PaymentMethod = 'cash' | 'transfer' | 'pos' | 'mixed';

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  profit: number;
  date: string;
  pendingPaymentId?: string;
  paymentMethod?: PaymentMethod;
}

export interface PendingPaymentItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface PendingPaymentEvent {
  date: string;
  amount: number;
  method?: PaymentMethod;
  note?: string;
}

export interface PendingPayment {
  id: string;
  customerName: string;
  customerPhone?: string;
  customerNote?: string;
  items: PendingPaymentItem[];
  total: number;
  paid: number;
  balance: number;
  dueDate?: string;
  createdAt: string;
  status: 'pending' | 'paid';
  events: PendingPaymentEvent[];
  saleIds: string[];
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
  photo?: string;        // base64 data URL of store logo / profile photo
  payment?: PaymentInfo; // how customers can pay this store
  website?: string;
  openingTime?: string;  // "07:00"
  closingTime?: string;  // "21:00"
  openingDate?: string;  // YYYY-MM-DD
  employees?: number;
  ownerName?: string;
  rent?: RentInfo;
}

export type RentFrequency = 'monthly' | 'quarterly' | 'yearly';

export interface RentInfo {
  isRented: boolean;
  amount?: number;
  frequency?: RentFrequency;
  dueDate?: string;      // ISO date of next due
  landlordName?: string;
  landlordContact?: string;
}

export interface PaymentInfo {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  paymentLink?: string;
  acceptWebsiteOrders?: boolean;
  acceptWebsitePayments?: boolean;
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

export interface FlowNotification {
  id: string;
  text: string;
  icon: string;
  tone: 'success' | 'warning' | 'info' | 'danger';
  date: string;
  read: boolean;
}

export interface MemoryEntry {
  type: 'product' | 'expense' | 'sale';
  data: Product | Expense | Sale;
  deletedAt: string;
  summary?: string; // e.g. "Coca-Cola: ₦52,000 revenue over 6 months"
}

export type SavingsFrequency = 'daily' | 'weekly' | 'monthly';

export interface SavingsGoal {
  amount: number;
  label?: string;
  source: 'revenue' | 'profit';
  percentage: number;
  saved: number;
  bankName?: string;
  frequency?: SavingsFrequency;
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
  autoVoiceListen: boolean;
  weeklyRecap: boolean;
  customerRequests: boolean;
  businessAdvice: boolean;
  businessExpansion: boolean;
  businessQuestions: boolean;
  defaultMargin: number;
  autoSuggestPrices: boolean;
  autoApplyPrices: boolean;
  showProductProfit: boolean;
  // Inventory
  criticalStockThreshold: number;
  restockSuggestions: boolean;
  inventoryAlerts: boolean;
  // Notifications
  notifyInsights: boolean;
  notifyRecommendations: boolean;
  notifyAlerts: boolean;
  notifyWeeklyRecap: boolean;
  notifyMonthlyReports: boolean;
  notifySavingsReminders: boolean;
  notifyCustomerRequests: boolean;
  notifyLowStock: boolean;
  // Appearance
  mascotAnimations: boolean;
  reduceMotion: boolean;
  compactMode: boolean;
  // Security
  biometricLock: boolean;
  pinLock: boolean;
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
  autoVoiceListen: false,
  weeklyRecap: true,
  customerRequests: true,
  businessAdvice: true,
  businessExpansion: true,
  businessQuestions: true,
  defaultMargin: 30,
  autoSuggestPrices: true,
  autoApplyPrices: false,
  showProductProfit: true,
  criticalStockThreshold: 2,
  restockSuggestions: true,
  inventoryAlerts: true,
  notifyInsights: true,
  notifyRecommendations: true,
  notifyAlerts: true,
  notifyWeeklyRecap: true,
  notifyMonthlyReports: false,
  notifySavingsReminders: true,
  notifyCustomerRequests: true,
  notifyLowStock: true,
  mascotAnimations: true,
  reduceMotion: false,
  compactMode: false,
  biometricLock: false,
  pinLock: false,
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
  pendingPayments?: PendingPayment[];
  flowNotifications?: FlowNotification[];
  memoryArchive?: MemoryEntry[];
  createdAt: string;
  profile?: StoreProfile;
  coins?: number;
  lastDailyClaim?: string;
  marketplaceListings?: any[];
  registeredSuppliers?: any[];
}


export type TabId =
  | 'dashboard' | 'inventory' | 'sales' | 'history' | 'expenses' | 'settings' | 'roi' | 'manager' | 'pending' | 'marketplace'
  | 'games-dashboard' | 'games-history' | 'games-analytics' | 'games-settings';

