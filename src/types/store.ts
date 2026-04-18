export interface Product {
  id: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  category: string;
  initialQuantity?: number;
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

export interface StoreProfile {
  storeType: string;
  location: string;
  phone: string;
  email: string;
}

export interface StoreData {
  storeName: string;
  accessCode: string;
  products: Product[];
  sales: Sale[];
  restocks?: Restock[];
  createdAt: string;
  profile?: StoreProfile;
}

export type TabId = 'dashboard' | 'inventory' | 'sales' | 'history' | 'settings';
