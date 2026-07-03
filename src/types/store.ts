export interface PriceHistoryEntry {
  costPrice: number;
  date: string;
  supplierName?: string;
}

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
  priceHistory?: PriceHistoryEntry[];
  discontinued?: boolean;
  isCartonSingleEnabled?: boolean;
  singlesPerCarton?: number;
  singleSellingPrice?: number;
  sellAsSinglesByDefault?: boolean;
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
  transactionId?: string;
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
  logoStyle?: string;    // selected pre-designed logo style
  payment?: PaymentInfo; // how customers can pay this store
  website?: string;
  openingTime?: string;  // "07:00"
  closingTime?: string;  // "21:00"
  openingDate?: string;  // YYYY-MM-DD
  employees?: number;
  ownerName?: string;
  rent?: RentInfo;
  uniqueCode?: string;
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
  source?: string;
  reason?: string;
}

export interface Loan {
  id: string;
  amount: number;
  source: string;
  date: string;
  note?: string;
  status: 'active' | 'repaid';
}

export interface Withdrawal {
  id: string;
  amount: number;
  date: string;
  note?: string;
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
  title?: string;
  description?: string;
  actionLabel?: string;
  actionTab?: string;
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
  dayOfWeek?: string;
  dayOfMonth?: number;
  timeOfDay?: string;
  lastDeductionTime?: string;
  autoSaveEnabled?: boolean;
  autoSaveAmount?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  totalPurchases: number;
  outstandingDebt: number;
  lastPurchaseDate?: string;
  purchaseHistory: { date: string; amount: number; items: string }[];
  loyaltyPoints: number;
  visitsCount: number;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  whatsApp?: string;
  address?: string;
  productsSupplied: string[];
  lastPurchaseDate?: string;
  lastPricePaid?: number;
}

export interface BusinessGoal {
  id: string;
  category: 'revenue' | 'profit' | 'savings' | 'debt' | 'inventory';
  label: string;
  target: number;
  current: number;
  deadline?: string;
  completed: boolean;
}

export interface MemoryEvent {
  id: string;
  type: 'milestone' | 'record';
  title: string;
  date: string;
  description: string;
}

export interface DiaryEntry {
  id: string;
  text: string;
  date: string;
  audioData?: string; // compressed base64 Voice Note data URI
}

export interface StaffMember {
  id: string;
  name: string;
  pin: string;
  phone?: string;
  role: 'owner' | 'admin' | 'manager' | 'cashier' | 'inventory' | 'accountant' | 'supervisor' | 'custom';
  permissions: {
    sales: boolean;
    inventory: boolean;
    reports: boolean;
    settings: boolean;
  };
}

export interface ActivityLog {
  id: string;
  user: string;
  role: string;
  action: string;
  timestamp: string;
}

export interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  startTime: string;
  endTime?: string;
  salesMade: number;
  revenue: number;
  openingCash: number;
  closingCash?: number;
}

export interface CashSession {
  id: string;
  date: string;
  openingCash: number;
  salesCash: number;
  expenses: number;
  expectedCash: number;
  actualCash: number;
  notes?: string;
}

export interface LostSale {
  id: string;
  productName: string;
  date: string;
  quantity: number;
}

export interface WishlistItem {
  id: string;
  name: string;
  estimatedCost: number;
  notes?: string;
  dateAdded: string;
}

export interface InventoryTransfer {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  sourceStoreCode: string;
  destStoreCode: string;
  date: string;
}

export interface VaultDocument {
  id: string;
  name: string;
  category: string;
  dateAdded: string;
  fileContent: string; // base64
  fileSize: number; // in KB
}

export interface BusinessChallenge {
  id: string;
  title: string;
  description: string;
  target: number;
  current: number;
  rewardCoins: number;
  completed: boolean;
  expiryDate: string;
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
  autoPrintReceipt?: boolean;
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
  numericAnimations: boolean;
  reduceMotion: boolean;
  compactMode: boolean;
  // Security
  biometricLock: boolean;
  pinLock: boolean;
  // Graph settings
  graphInterval?: 10 | 30 | 60;
  autoBackupsEnabled?: boolean;
  // Discounts
  autoDiscountEnabled?: boolean;
  autoDiscountType?: 'percentage' | 'flat';
  autoDiscountValue?: number;
  autoDiscountMinSubtotal?: number;
  autoDiscountMaxSubtotal?: number;
  // Receipts Customization Settings
  receiptLogoEnabled?: boolean;
  receiptStoreName?: string;
  receiptPhone?: string;
  receiptAddress?: string;
  receiptFooterMessage?: string;
  receiptWidth?: '58mm' | '80mm' | 'standard';
  receiptCurrency?: string;
  receiptWebsite?: string;
  receiptQrCode?: string;
  receiptWhatsApp?: string;
  // Weather
  weatherImpactEnabled?: boolean;
  voiceGender?: 'male' | 'female' | 'young-male';
  // Default Restock Configs
  defaultPurchaseQty?: number;
  defaultRestockQty?: number;
  restockFrequency?: 'daily' | 'weekly' | 'monthly';
  minStockThreshold?: number;
  autoSuggestRestock?: boolean;
  multiDeviceSync?: boolean;
}

export const DEFAULT_MANAGER_SETTINGS: ManagerSettings = {
  enabled: true,
  voiceGender: 'young-male',
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
  autoPrintReceipt: false,
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
  numericAnimations: true,
  reduceMotion: false,
  compactMode: false,
  biometricLock: false,
  pinLock: false,
  graphInterval: 30,
  autoBackupsEnabled: true,
  autoDiscountEnabled: false,
  autoDiscountType: 'flat',
  autoDiscountValue: 0,
  autoDiscountMinSubtotal: 0,
  autoDiscountMaxSubtotal: 0,
  receiptLogoEnabled: true,
  receiptStoreName: '',
  receiptPhone: '',
  receiptAddress: '',
  receiptFooterMessage: 'Thank you for your patronage! 🙏',
  receiptWidth: '58mm',
  receiptCurrency: '₦',
  receiptWebsite: '',
  receiptQrCode: '',
  receiptWhatsApp: '',
  weatherImpactEnabled: true,
  defaultPurchaseQty: 10,
  defaultRestockQty: 50,
  restockFrequency: 'weekly',
  minStockThreshold: 5,
  autoSuggestRestock: true,
};

export interface PrintedReceipt {
  id: string;
  receiptNumber: string;
  date: string;
  items: { productName: string; quantity: number; unitPrice: number; total: number }[];
  customerName?: string;
  paymentStatus: 'paid' | 'pending' | 'debt_payment';
  amount: number;
  balance: number;
  printerUsed?: string;
}

export interface PlannedRestock {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  funding: 'balance' | 'new_money';
  date: string;
}

export interface LearnedProduct {
  id: string;
  name: string;
  purchaseUnit: string;        // e.g., 'Carton', 'Roll', 'Pack'
  sellingUnit: string;         // e.g., 'Bottle', 'Sachet', 'Pack'
  unitsPerPurchase: number;    // e.g., 24
  suggestedSellingPrice: number;
  markup: number;              // percentage markup (e.g., 20)
  lastPurchasePrice: number;
  averagePurchasePrice: number;
  dateLearned: string;         // ISO timestamp
  aliasUsed?: string;          // e.g. 'Big Coke'
  supplier?: string;           // e.g. 'Alhaji & Sons'
  officialName?: string;       // e.g. 'Coca-Cola PET 50cl'
  parsedFraction?: 'half_carton' | 'half_pack' | 'half_roll';
}

export interface SimilarProductReview {
  id1: string;
  id2: string;
  name1: string;
  name2: string;
  decision: 'merged' | 'separate' | 'renamed';
  reviewedAt: string;
}

export interface StoreData {
  learnedProducts?: LearnedProduct[];
  dismissedSimilarPairs?: string[];
  similarProductReviews?: SimilarProductReview[];
  storeName: string;
  accessCode: string;
  category?: StoreCategory;
  retailType?: string;
  products: Product[];
  sales: Sale[];
  restocks?: Restock[];
  plannedRestocks?: PlannedRestock[];
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
  printedReceipts?: PrintedReceipt[];
  createdAt: string;
  profile?: StoreProfile;
  coins?: number;
  lastDailyClaim?: string;
  marketplaceListings?: any[];
  registeredSuppliers?: any[];
  
  // Feature expansion variables
  customers?: Customer[];
  suppliers?: Supplier[];
  goals?: BusinessGoal[];
  memoryTimeline?: MemoryEvent[];
  diaryEntries?: DiaryEntry[];
  staffMembers?: StaffMember[];
  shifts?: Shift[];
  cashSessions?: CashSession[];
  lostSales?: LostSale[];
  wishlist?: WishlistItem[];
  documents?: VaultDocument[];
  challenges?: BusinessChallenge[];
  stockCountAudits?: { id: string; date: string; expected: number; actual: number; variance: number; product: string }[];
  transfers?: InventoryTransfer[];
  activityLogs?: ActivityLog[];
  communicationHistory?: CommunicationMessage[];
  loans?: Loan[];
  withdrawals?: Withdrawal[];
  cashBalance?: number;
  bankBalance?: number;
  walletBalance?: number;
  otherAssets?: number;
  liabilities?: number;
}

export interface CommunicationMessage {
  id: string;
  recipientType: 'customer' | 'supplier' | 'employee' | 'custom';
  recipientName: string;
  recipientPhone: string;
  messageText: string;
  timestamp: string;
  status: 'sent' | 'pending';
  templateType?: string;
}


export type TabId =
  | 'dashboard' | 'inventory' | 'sales' | 'history' | 'expenses' | 'settings' | 'roi' | 'manager' | 'pending' | 'marketplace'
  | 'games-dashboard' | 'games-history' | 'games-analytics' | 'games-settings' | 'qr-hub'
  | 'customers' | 'suppliers' | 'goals' | 'diary' | 'documents' | 'academy' | 'achievements' | 'wishlist' | 'staff' | 'cash-drawer' | 'activity-log' | 'communication-center'
  | 'finance' | 'reports' | 'profile' | 'more';
