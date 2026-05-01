export interface Product {
  id: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  category: string;
  initialQuantity?: number;
  addedAt?: string;
}

export interface Restock {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  total: number;
  date: string;
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

export interface StoreData {
  storeName: string;
  accessCode: string;
  products: Product[];
  sales: Sale[];
  restocks?: Restock[];
  expenses?: Expense[];
  trash?: TrashItem[];
  investments?: Investment[];
  createdAt: string;
  profile?: StoreProfile;
}

export type TabId = 'dashboard' | 'inventory' | 'sales' | 'history' | 'expenses' | 'settings';
