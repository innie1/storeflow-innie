import { StoreData } from '@/types/store';
import { saveStore } from './load-save';

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
