export interface Product {
  id: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  category: string;
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

export interface StoreData {
  storeName: string;
  accessCode: string;
  products: Product[];
  sales: Sale[];
  createdAt: string;
}

export type TabId = 'dashboard' | 'inventory' | 'sales' | 'history' | 'settings';
