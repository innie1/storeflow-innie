// Flow Auto Fix — turns an AdviceCard's suggestion into an applied change.
//
// Design choices, on purpose:
// - Every local (non-PO) fix goes through the same `updateProduct()` used by
//   manual edits elsewhere in the app, so price history, sync flags, and
//   validation all behave identically to a human making the same edit.
// - Nothing here writes anywhere without the caller having already passed
//   the store-code confirmation gate (see AutoFixConfirmDialog.tsx). This
//   file assumes confirmation already happened — it does not re-check it.
// - Purchase orders are the one exception that isn't a local store mutation:
//   they're a new Supabase-only record (public.purchase_orders), since nothing
//   like it exists in the local StoreData shape today.

import { StoreData, Product } from '@/types/store';
import { updateProduct, addPurchaseOrder } from '@/lib/store-data';
import type { Json } from '@/integrations/supabase/types';

export type AutoFixType =
  | 'adjust_reorder_level'
  | 'update_price'
  | 'create_promotion'
  | 'archive_product'
  | 'generate_purchase_order';

export interface AutoFixSpec {
  type: AutoFixType;
  // One human-readable line describing exactly what will change — shown in
  // the confirmation dialog verbatim, so it must be accurate and complete.
  summary: string;
  payload: any;
}

export interface AutoFixResult {
  ok: boolean;
  store?: StoreData;
  message: string;
}

// Applies every Auto Fix type EXCEPT generate_purchase_order (that one is
// async / cloud-only — see createPurchaseOrder below). Returns the updated
// store; caller is responsible for calling saveStore + onUpdate, same as
// every other mutation path in this app.
export function applyAutoFix(store: StoreData, spec: AutoFixSpec): AutoFixResult {
  switch (spec.type) {
    case 'adjust_reorder_level': {
      const items: { productId: string; reorderLevel: number }[] = spec.payload.items || [
        { productId: spec.payload.productId, reorderLevel: spec.payload.reorderLevel },
      ];
      let updated = store;
      for (const item of items) {
        updated = updateProduct(updated, item.productId, { reorderLevel: item.reorderLevel });
      }
      return { ok: true, store: updated, message: `Reorder level${items.length === 1 ? '' : 's'} updated on ${items.length} product${items.length === 1 ? '' : 's'}.` };
    }

    case 'update_price': {
      const { productId, newPrice } = spec.payload;
      if (typeof newPrice !== 'number' || newPrice <= 0) {
        return { ok: false, message: 'Invalid price — nothing changed.' };
      }
      const updated = updateProduct(store, productId, { sellingPrice: newPrice });
      return { ok: true, store: updated, message: `Price updated to ₦${newPrice.toLocaleString()}.` };
    }

    case 'create_promotion': {
      const { productIds, discountPct, days } = spec.payload as { productIds: string[]; discountPct: number; days: number; reason?: string };
      const until = new Date();
      until.setDate(until.getDate() + (days || 14));
      let updated = store;
      for (const id of productIds) {
        const p = updated.products.find(pr => pr.id === id);
        if (!p) continue;
        const promoPrice = Math.max(1, Math.round(p.sellingPrice * (1 - discountPct / 100)));
        updated = updateProduct(updated, id, {
          promoPrice,
          promoUntil: until.toISOString(),
          promoReason: spec.payload.reason || `${discountPct}% promo`,
        } as Partial<Product>);
      }
      return { ok: true, store: updated, message: `Promo price applied to ${productIds.length} product${productIds.length === 1 ? '' : 's'} for ${days || 14} days.` };
    }

    case 'archive_product': {
      const { productId } = spec.payload;
      const updated = updateProduct(store, productId, { discontinued: true });
      return { ok: true, store: updated, message: 'Product archived — hidden from active inventory, sales history kept.' };
    }

    default:
      return { ok: false, message: 'This Auto Fix type is handled separately.' };
  }
}

export interface PurchaseOrderItem {
  productId: string;
  name: string;
  qty: number;
  costPrice: number;
}

// Local-first, like every other write in this app: the store.purchaseOrders
// array (synced via saveStore -> stores.data JSONB, same as products/sales)
// is the source of truth, so this always succeeds even offline or if the
// cloud insert below fails. The Supabase purchase_orders table is a
// best-effort mirror for cross-device visibility, not the primary record.
export function createPurchaseOrder(store: StoreData, items: PurchaseOrderItem[], supplierName?: string): AutoFixResult {
  const totalCost = items.reduce((s, it) => s + it.qty * it.costPrice, 0);
  const updated = addPurchaseOrder(store, {
    supplierName,
    items,
    totalCost,
    status: 'draft',
    source: 'auto_fix',
  });

  // Best-effort cloud mirror — fire and forget, never blocks or fails the
  // local save. If it fails (offline, RLS, whatever), the purchase order
  // still exists locally and will simply be missing from other devices
  // until the next successful sync of this kind.
  if (store.id) {
    import('@/integrations/supabase/client').then(({ supabase }) => {
      supabase.from('purchase_orders').insert({
        store_id: store.id!,
        supplier_name: supplierName || null,
        items: items as unknown as Json,
        total_cost: totalCost,
        status: 'draft',
        source: 'auto_fix',
      }).then(({ error }) => {
        if (error) console.warn('[auto-fix] purchase order cloud mirror failed (saved locally):', error.message);
      });
    });
  }

  return { ok: true, store: updated, message: `Draft purchase order created — ${items.length} item${items.length === 1 ? '' : 's'}, ₦${totalCost.toLocaleString()} total.` };
}

// Convenience wrapper matching the AdviceCard.autoFix shape produced by
// generateAdvice() for generate_purchase_order cards.
export function runGeneratePurchaseOrder(store: StoreData, spec: AutoFixSpec): AutoFixResult {
  const items: PurchaseOrderItem[] = spec.payload.items;
  return createPurchaseOrder(store, items, spec.payload.supplierName);
}

// Single entry point the UI calls — every Auto Fix type, including
// purchase orders now, resolves synchronously and persists via the same
// local-first path.
export async function executeAutoFix(store: StoreData, spec: AutoFixSpec, onUpdate: (s: StoreData) => void): Promise<AutoFixResult> {
  const result = spec.type === 'generate_purchase_order'
    ? runGeneratePurchaseOrder(store, spec)
    : applyAutoFix(store, spec);
  if (result.ok && result.store) {
    onUpdate(result.store);
  }
  return result;
}
