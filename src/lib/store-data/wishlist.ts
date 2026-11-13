import { StoreData, LostSale, WishlistItem } from '@/types/store';
import { generateId } from './ids';
import { saveStore } from './load-save';

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
