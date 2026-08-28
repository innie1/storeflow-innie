import type { Plugin } from 'vite';

export function patchOrderItemSnapshots(source: string, id: string): string {
  let code = source;
  const normalized = id.replace(/\\/g, '/').split('?')[0];
  if (normalized.endsWith('/src/components/Orders.tsx')) {
    code = code.replace(
      "const pName = store.products?.find((p: any) => p.id === item.product_id)?.name || 'Item';",
      "const pName = item.item_name || item.product_name || store.products?.find((p: any) => String(p.id) === String(item.product_id))?.name || 'Item';",
    );
    code = code.replace(
      "const pName = store.products?.find((p: any) => p.id === item.product_id)?.name || 'Unknown Product';",
      "const pName = item.item_name || item.product_name || store.products?.find((p: any) => String(p.id) === String(item.product_id))?.name || 'Item';",
    );
  }
  if (normalized.endsWith('/src/components/OrderReceipt.tsx')) {
    code = code.replace(
      "productName: product?.name || item.product_name || 'Item',",
      "productName: item.item_name || item.product_name || product?.name || 'Item',",
    );
  }
  return code;
}

export default function orderItemSnapshotsPlugin(): Plugin {
  return {
    name: 'storeflow-order-item-snapshots',
    enforce: 'pre',
    transform(code, id) {
      const patched = patchOrderItemSnapshots(code, id);
      return patched === code ? null : { code: patched, map: null };
    },
  };
}
