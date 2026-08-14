import type { Plugin } from 'vite';

/**
 * Keeps the existing Orders component stable while routing service orders through
 * the configurable service-session workflow. Vite's transform hook is used so the
 * large legacy Orders.tsx file does not need a wholesale rewrite.
 */
export default function serviceOrdersPlugin(): Plugin {
  return {
    name: 'storeflow-service-orders',
    transform(code, id) {
      if (!id.endsWith('/src/components/Orders.tsx')) return null;
      if (code.includes('ServiceOrderControls')) return null;

      const importAnchor = "import { subscribeToOrderPush } from '@/lib/push-notifications';";
      const withImport = code.replace(
        importAnchor,
        `${importAnchor}\nimport ServiceOrderControls from '@/components/ServiceOrderControls';`,
      );

      const oldBlock = `                  {/* Actions for Non-Pending active statuses */}\n                  {normStatus !== 'Pending' && normStatus !== 'Completed' && normStatus !== 'Cancelled' && normStatus !== 'Rejected' && (\n                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/30">\n                      {(normStatus === 'Accepted' || normStatus === 'Preparing' || normStatus === 'Ready') && (\n                        <button\n                          onClick={() => onUpdateOrderStatus(order.id, 'Cancelled')}\n                          className="px-3 py-1.5 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs font-semibold hover:bg-destructive/10 transition active:scale-95 cursor-pointer mr-auto"\n                        >\n                          Cancel Order\n                        </button>\n                      )}\n\n                      {normStatus === 'Accepted' && (\n                        <button\n                          onClick={() => onUpdateOrderStatus(order.id, 'Preparing')}\n                          className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"\n                        >\n                          Start Preparing\n                        </button>\n                      )}\n\n                      {normStatus === 'Preparing' && (\n                        <button\n                          onClick={() => onUpdateOrderStatus(order.id, 'Ready')}\n                          className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"\n                        >\n                          {meta?.delivery_type === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}\n                        </button>\n                      )}\n\n                      {normStatus === 'Ready' && (\n                        <button\n                          onClick={() => onUpdateOrderStatus(order.id, 'Completed')}\n                          className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer"\n                        >\n                          {meta?.delivery_type === 'delivery' ? 'Mark Delivered' : 'Mark Collected'}\n                        </button>\n                      )}\n                    </div>\n                  )}`;

      const newBlock = `                  {/* Service orders use their configured workflow instead of product pickup/preparation states. */}\n                  <ServiceOrderControls\n                    order={order}\n                    store={store}\n                    normStatus={normStatus}\n                    meta={meta}\n                    onUpdateOrderStatus={onUpdateOrderStatus}\n                  />\n\n                  {/* Product-order workflow remains unchanged. */}\n                  {!((order.order_items || []).some((item: any) => store.products?.some((p: any) => String(p.id) === String(item.product_id) && p.isService))) && normStatus !== 'Pending' && normStatus !== 'Completed' && normStatus !== 'Cancelled' && normStatus !== 'Rejected' && (\n                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border/30">\n                      {(normStatus === 'Accepted' || normStatus === 'Preparing' || normStatus === 'Ready') && (\n                        <button onClick={() => onUpdateOrderStatus(order.id, 'Cancelled')} className="px-3 py-1.5 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-xs font-semibold hover:bg-destructive/10 transition active:scale-95 cursor-pointer mr-auto">Cancel Order</button>\n                      )}\n                      {normStatus === 'Accepted' && (\n                        <button onClick={() => onUpdateOrderStatus(order.id, 'Preparing')} className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer">Start Preparing</button>\n                      )}\n                      {normStatus === 'Preparing' && (\n                        <button onClick={() => onUpdateOrderStatus(order.id, 'Ready')} className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer">{meta?.delivery_type === 'delivery' ? 'Ready for Delivery' : 'Ready for Pickup'}</button>\n                      )}\n                      {normStatus === 'Ready' && (\n                        <button onClick={() => onUpdateOrderStatus(order.id, 'Completed')} className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary-focus text-primary-foreground text-xs font-display font-bold transition active:scale-95 cursor-pointer">{meta?.delivery_type === 'delivery' ? 'Mark Delivered' : 'Mark Collected'}</button>\n                      )}\n                    </div>\n                  )}`;

      if (!withImport.includes(oldBlock)) {
        this.warn('storeflow-service-orders: Orders.tsx action block was not found; leaving source unchanged');
        return null;
      }

      return { code: withImport.replace(oldBlock, newBlock), map: null };
    },
  };
}
