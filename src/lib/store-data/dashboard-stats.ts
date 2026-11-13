import { historicalUnits } from '@/lib/inventory-sale-math';
import { StoreData } from '@/types/store';
import { getLowStockThreshold } from '@/lib/settings';
import { sumOperatingExpenses, sumStockPurchases } from './money';

export function getTopSellers(store: StoreData, limit = 5): { name: string; totalSold: number; revenue: number }[] {
  const map = new Map<string, { name: string; totalSold: number; revenue: number }>();
  store.sales.forEach(s => {
    const existing = map.get(s.productId) || { name: s.productName, totalSold: 0, revenue: 0 };
    existing.totalSold += historicalUnits(s, store.products.find(p => p.id === s.productId));
    existing.revenue += s.total;
    map.set(s.productId, existing);
  });
  return Array.from(map.values()).sort((a, b) => b.totalSold - a.totalSold).slice(0, limit);
}

export function getDashboardStats(store: StoreData) {
  const totalRevenue = store.sales.reduce((sum, s) => sum + s.total, 0);
  const totalProfit = store.sales.reduce((sum, s) => sum + s.profit, 0);
  const activeProducts = store.products.filter(p => !p.discontinued);
  const totalProducts = activeProducts.length;
  const threshold = getLowStockThreshold();
  const lowStockProducts = activeProducts.filter(p => p.quantity <= threshold);
  const totalSales = store.sales.length;
  const inventoryValue = store.products.reduce((sum, p) => sum + p.costPrice * p.quantity, 0);
  const totalExpenses = sumOperatingExpenses(store);
  const stockPurchases = sumStockPurchases(store);
  const savingsSaved = store.savingsGoal?.saved || 0;
  const netIncome = totalRevenue - totalExpenses - savingsSaved;
  return { totalRevenue, totalProfit, totalProducts, lowStockProducts, totalSales, inventoryValue, totalExpenses, stockPurchases, netIncome };
}
