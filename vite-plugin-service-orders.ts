import type { Plugin } from 'vite';

/**
 * Incremental service-business integration for the large legacy order surfaces.
 * New feature code lives in normal source modules; these small transforms only
 * mount it into legacy files until those files are physically decomposed.
 */
export default function serviceOrdersPlugin(): Plugin {
  return {
    name: 'storeflow-service-orders',
    transform(code, id) {
      if (id.endsWith('/src/components/Orders.tsx')) {
        let next = code;
        const importAnchor = "import { subscribeToOrderPush } from '@/lib/push-notifications';";
        if (!next.includes('ServiceOrderControls')) {
          next = next.replace(importAnchor, `${importAnchor}\nimport ServiceOrderControls from '@/components/ServiceOrderControls';`);
        }
        if (!next.includes('LaundryWalkInIntake')) {
          next = next.replace(importAnchor, `${importAnchor}\nimport LaundryWalkInIntake from '@/components/laundry/LaundryWalkInIntake';`);
        }

        const rootAnchor = `  return (\n    <div className="space-y-3.5 pt-1">`;
        if (!next.includes('<LaundryWalkInIntake') && next.includes(rootAnchor)) {
          next = next.replace(
            rootAnchor,
            `${rootAnchor}\n      {String((store as any).businessType || store.storeType || '').toLowerCase() === 'laundry' && (\n        <LaundryWalkInIntake store={store} onUpdate={onUpdate} />\n      )}`,
          );
        }

        const oldBlock = `                  {/* Actions for Non-Pending active statuses */}\n                  {normStatus !== 'Pending' && normStatus !== 'Completed' && normStatus !== 'Cancelled' && normStatus !== 'Rejected' && (\n                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/30">\n                      {(normStatus === 'Accepted' || normStatus === 'Preparing' || normStatus === 'Ready') && (\n                        <button\n                          onClick={() => onUpdateOrderStatus(order.id, 'Cancelled')}\n                          className="px-3 py-1.5 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs font-semibold hover:bg-destructive/10 transition active:scale-95 cursor-pointer mr-auto"\n                        >\n                          Cancel Order\n                        </button>\n                      )}\n\n                      {normStatus === 'Accepted' && (\n                        <button\n                          onClick={() => onUpdateOrderStatus(order.id, 'Preparing')}\n                          className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"\n                        >\n                          Start Preparing\n                        </button>\n                      )}\n\n                      {normStatus === 'Preparing' && (\n                        <button\n                          onClick={() => onUpdateOrderStatus(order.id, 'Ready')}\n                          className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"\n                        >\n                          {meta?.delivery_type === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}\n                        </button>\n                      )}\n\n                      {normStatus === 'Ready' && (\n                        <button\n                          onClick={() => onUpdateOrderStatus(order.id, 'Completed')}\n                          className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"\n                        >\n                          {meta?.delivery_type === 'delivery' ? 'Mark Delivered' : 'Mark Collected'}\n                        </button>\n                      )}\n                    </div>\n                  )}`;

        const newBlock = `                  {/* Service orders use their configured workflow instead of product pickup/preparation states. */}\n                  <ServiceOrderControls\n                    order={order}\n                    store={store}\n                    normStatus={normStatus}\n                    meta={meta}\n                    onUpdateOrderStatus={onUpdateOrderStatus}\n                  />\n\n                  {/* Product-order workflow remains unchanged. */}\n                  {!['service', 'appointment', 'session', 'metered'].includes(String(order.order_kind || '').toLowerCase()) && !((order.order_items || []).some((item: any) => store.products?.some((p: any) => String(p.id) === String(item.product_id) && p.isService))) && normStatus !== 'Pending' && normStatus !== 'Completed' && normStatus !== 'Cancelled' && normStatus !== 'Rejected' && (\n                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/30">\n                      {(normStatus === 'Accepted' || normStatus === 'Preparing' || normStatus === 'Ready') && (\n                        <button onClick={() => onUpdateOrderStatus(order.id, 'Cancelled')} className="px-3 py-1.5 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs font-semibold hover:bg-destructive/10 transition active:scale-95 cursor-pointer mr-auto">Cancel Order</button>\n                      )}\n                      {normStatus === 'Accepted' && (\n                        <button onClick={() => onUpdateOrderStatus(order.id, 'Preparing')} className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer">Start Preparing</button>\n                      )}\n                      {normStatus === 'Preparing' && (\n                        <button onClick={() => onUpdateOrderStatus(order.id, 'Ready')} className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer">{meta?.delivery_type === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}</button>\n                      )}\n                      {normStatus === 'Ready' && (\n                        <button onClick={() => onUpdateOrderStatus(order.id, 'Completed')} className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer">{meta?.delivery_type === 'delivery' ? 'Mark Delivered' : 'Mark Collected'}</button>\n                      )}\n                    </div>\n                  )}`;

        if (!next.includes('<ServiceOrderControls') && next.includes(oldBlock)) {
          next = next.replace(oldBlock, newBlock);
        }

        return next === code ? null : { code: next, map: null };
      }

      if (id.endsWith('/src/components/OrderReceipt.tsx')) {
        const oldName = `product?.name || item.product_name || 'Item'`;
        const newName = `product?.name || item.item_name || item.product_name || 'Item'`;
        if (code.includes(oldName)) return { code: code.replace(oldName, newName), map: null };
        return null;
      }

      if (id.endsWith('/src/pages/Index.tsx')) {
        if (code.includes('storeflow:order-created')) return null;
        const anchor = `  // Auto-heal / maintain background push notification subscription when store is loaded`;
        if (!code.includes(anchor)) return null;
        const listener = `  // Refresh a just-created merchant walk-in order after its child rows are saved.\n  // This avoids the realtime INSERT event racing ahead of order_items creation.\n  useEffect(() => {\n    const handleCreatedOrder = async (event: Event) => {\n      const orderId = (event as CustomEvent).detail?.orderId;\n      if (!orderId) return;\n      const { data, error } = await supabase\n        .from('orders')\n        .select('*, order_items(*)')\n        .eq('id', orderId)\n        .single();\n      if (error || !data) return;\n      const normalized = { ...data, status: getNormalizedStatus(data.status) };\n      setOrders(prev => [normalized, ...prev.filter(order => order.id !== orderId)]);\n    };\n    window.addEventListener('storeflow:order-created', handleCreatedOrder);\n    return () => window.removeEventListener('storeflow:order-created', handleCreatedOrder);\n  }, [getNormalizedStatus]);\n\n`;
        return { code: code.replace(anchor, listener + anchor), map: null };
      }

      return null;
    },
  };
}
