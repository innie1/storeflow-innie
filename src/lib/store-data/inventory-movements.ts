import { stockPrecision, historicalUnits } from '@/lib/inventory-sale-math';
import { StoreData, InventoryMovement } from '@/types/store';

export function recordInventoryMovement(
  store: StoreData,
  productId: string,
  movementType: 'Restock' | 'Sale' | 'Transfer' | 'Return' | 'Adjustment',
  quantity: number,
  user?: string,
  source?: string
): StoreData {
  const movement: InventoryMovement = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    productId,
    movementType,
    quantity: stockPrecision(quantity),
    date: new Date().toISOString(),
    user: user || 'Staff',
    source: source || 'System',
  };

  return {
    ...store,
    inventoryMovements: [movement, ...(store.inventoryMovements || [])],
  };
}

export function syncProductPerformance(store: StoreData): StoreData {
  if (!store || !store.products) return store;

  const sales = store.sales || [];
  const restocks = store.restocks || [];

  const restockCounts: Record<string, number> = {};
  restocks.forEach(r => {
    if (r.productId) {
      restockCounts[r.productId] = (restockCounts[r.productId] || 0) + 1;
    }
  });

  const updatedProducts = store.products.map(p => {
    const productSales = sales.filter(s => s.productId === p.id);
    const unitsSold = productSales.reduce((sum, s) => sum + historicalUnits(s, p), 0);
    const totalRevenue = productSales.reduce((sum, s) => sum + s.total, 0);
    const totalProfit = productSales.reduce((sum, s) => sum + s.profit, 0);

    let firstSaleAt = p.first_sale_at;
    let lastSoldAt = p.last_sold_at;

    if (productSales.length > 0) {
      const sortedSales = [...productSales].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      firstSaleAt = sortedSales[0].date;
      lastSoldAt = sortedSales[sortedSales.length - 1].date;
    }

    let restockCount = p.restock_count;
    if (restockCount === undefined) {
      const computedCount = restockCounts[p.id] || 0;
      restockCount = computedCount + ((p.initialQuantity && p.initialQuantity > 0) ? 1 : 0);
      if (restockCount === 0 && p.quantity > 0) {
        restockCount = 1;
      }
    }

    return {
      ...p,
      restock_count: restockCount,
      units_sold: Math.round(unitsSold * 100) / 100,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_profit: Math.round(totalProfit * 100) / 100,
      first_sale_at: firstSaleAt,
      last_sold_at: lastSoldAt,
    };
  });

  return {
    ...store,
    products: updatedProducts,
  };
}
