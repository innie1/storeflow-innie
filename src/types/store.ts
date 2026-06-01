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
  createdAt: string;
  profile?: StoreProfile;
}

export type TabId =
  | 'dashboard' | 'inventory' | 'sales' | 'history' | 'expenses' | 'settings' | 'roi'
  | 'games-dashboard' | 'games-history' | 'games-analytics' | 'games-settings';
