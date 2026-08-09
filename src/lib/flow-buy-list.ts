import { Product, StoreData } from '@/types/store';

export interface FlowBuyListItem {
  productId: string;
  name: string;
  quantity: number;
  estimatedCost: number;
  unitsSold30: number;
  avgDailySales: number;
  daysOfCover: number;
  priority: 'urgent' | 'high' | 'normal';
  reason: string;
}

function recentSales(store: StoreData) {
  const cutoff = Date.now() - 30 * 86400000;
  return (store.sales || []).filter(s => new Date(s.date).getTime() >= cutoff);
}

/**
 * Flow's conservative buy-list recommendation. It recommends stock, but never
 * mutates inventory or the existing manual Buy List. Dead stock is deliberately
 * excluded unless it is completely out of stock and has recent sales evidence.
 */
export function createFlowBuyList(store: StoreData): FlowBuyListItem[] {
  const products = (store.products || []).filter(p => !p.discontinued && !p.isService);
  const threshold = Math.max(1, store.managerSettings?.criticalStockThreshold ?? 5);
  const units = new Map<string, number>();
  for (const sale of recentSales(store)) units.set(sale.productId, (units.get(sale.productId) || 0) + sale.quantity);

  const result: FlowBuyListItem[] = [];
  for (const p of products) {
    const sold30 = units.get(p.id) || 0;
    const avgDaily = sold30 / 30;
    const daysCover = avgDaily > 0 ? p.quantity / avgDaily : Infinity;
    const low = p.quantity <= threshold;
    const needsCoverage = avgDaily > 0 && daysCover < 14;
    if (!low && !needsCoverage) continue;
    if (sold30 === 0 && p.quantity > 0) continue; // avoid buying dead stock

    const target = Math.max(threshold * 2, Math.ceil(avgDaily * 14));
    const quantity = Math.max(1, target - p.quantity);
    const margin = p.sellingPrice > 0 ? (p.sellingPrice - p.costPrice) / p.sellingPrice : 0;
    const priority: FlowBuyListItem['priority'] = p.quantity <= 0 ? 'urgent' : (daysCover < 4 || margin >= 0.2 ? 'high' : 'normal');
    const reason = p.quantity <= 0
      ? `out of stock; ${sold30} units sold in 30 days`
      : daysCover < 4
        ? `about ${Math.max(0, Math.round(daysCover))} days of stock left`
        : `below the ${threshold}-unit low-stock threshold`;

    result.push({ productId: p.id, name: p.name, quantity, estimatedCost: quantity * p.costPrice, unitsSold30: sold30, avgDailySales: avgDaily, daysOfCover: daysCover, priority, reason });
  }

  return result.sort((a, b) => ({ urgent: 0, high: 1, normal: 2 }[a.priority] - { urgent: 0, high: 1, normal: 2 }[b.priority]) || b.unitsSold30 - a.unitsSold30).slice(0, 12);
}

export function formatFlowBuyList(items: FlowBuyListItem[]) {
  if (!items.length) return 'I do not see a strong reason to buy anything right now. I am deliberately avoiding products with no recent sales so we do not create more dead stock.';
  const total = items.reduce((n, i) => n + i.estimatedCost, 0);
  return `I built a conservative buy list from your last 30 days of sales and current stock.\n\n${items.map((i, n) => `${n + 1}. **${i.name}** — buy **${i.quantity}** (${i.priority}); ${i.reason}; est. ${`₦${Math.round(i.estimatedCost).toLocaleString()}`}`).join('\n')}\n\nEstimated cost: **₦${Math.round(total).toLocaleString()}**\n\nThis is a recommendation only — I did not automatically select or purchase anything.`;
}
