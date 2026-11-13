import { StoreData, Product } from '@/types/store';
import { daysAgo } from './dates';
import { stockCoverLabel, inventoryIntelligence } from './stock';
import { pricingAlerts } from './costs';

// ─── Product Intelligence ───────────────────────────────────────────────────
export interface ProductIntelligence {
  product: Product;
  currentStock: number;
  qtySoldLast30: number;
  qtySoldAllTime: number;
  revenueLast30: number;
  revenueAllTime: number;
  profitAllTime: number;
  restockCount: number;
  trendPct: number | null; // this 14d window vs previous 14d window, by units
  trendDirection: 'up' | 'down' | 'flat' | 'unknown';
  recommendations: string[]; // short, reuses pricingAlerts/inventoryIntelligence for just this product
  priceChangeEffects: string[]; // one line per priceHistory entry describing before/after velocity
}

export function getProductIntelligence(store: StoreData, productId: string): ProductIntelligence | null {
  const product = store.products.find(p => p.id === productId);
  if (!product) return null;

  const sales = store.sales.filter(s => s.productId === productId);
  const last30 = sales.filter(s => new Date(s.date) >= daysAgo(29));
  const qtySoldLast30 = last30.reduce((s, x) => s + x.quantity, 0);
  const qtySoldAllTime = sales.reduce((s, x) => s + x.quantity, 0);
  const revenueLast30 = last30.reduce((s, x) => s + (x.total || 0), 0);
  const revenueAllTime = product.total_revenue ?? sales.reduce((s, x) => s + (x.total || 0), 0);
  const profitAllTime = product.total_profit ?? 0;

  // 14d vs previous 14d, by units — simple, readable trend signal.
  const win = sales.filter(s => new Date(s.date) >= daysAgo(13));
  const prevWin = sales.filter(s => new Date(s.date) >= daysAgo(27) && new Date(s.date) < daysAgo(13));
  const winQty = win.reduce((s, x) => s + x.quantity, 0);
  const prevQty = prevWin.reduce((s, x) => s + x.quantity, 0);
  let trendPct: number | null = null;
  let trendDirection: ProductIntelligence['trendDirection'] = 'unknown';
  if (prevQty > 0) {
    trendPct = ((winQty - prevQty) / prevQty) * 100;
    trendDirection = trendPct > 5 ? 'up' : trendPct < -5 ? 'down' : 'flat';
  } else if (winQty > 0) {
    trendDirection = 'up';
  }

  // Recommendations — same engines as the Advice tab, filtered to this product.
  const recommendations: string[] = [];
  const priceAlert = pricingAlerts(store).find(a => a.product.id === productId);
  if (priceAlert) {
    recommendations.push(`Underpriced — only ${(priceAlert.currentMarkup * 100).toFixed(0)}% on top of cost. Try ₦${priceAlert.suggestedPrice.toLocaleString()}.`);
  }
  const stockEntry = inventoryIntelligence(store).find(f => f.product.id === productId);
  if (stockEntry) {
    recommendations.push(stockEntry.product.quantity === 0
      ? 'Out of stock — restock to recover lost sales.'
      : `${stockCoverLabel(stockEntry)} — order ${stockEntry.restockQty} units.`);
  }
  if (product.reorderLevel != null && product.quantity <= product.reorderLevel) {
    recommendations.push(`At or below its reorder level (${product.reorderLevel}).`);
  }
  if (recommendations.length === 0) {
    recommendations.push(qtySoldLast30 === 0 ? 'No sales in 30 days — consider a promotion or discontinuing it.' : "No issues found — this product's doing fine.");
  }

  // Price change effects — for each recorded price change, compare average
  // daily units sold in the 14 days before vs after that date.
  const priceChangeEffects: string[] = [];
  const history = (product.priceHistory || []).slice(-3); // last 3 changes is plenty for a chat answer
  history.forEach(entry => {
    const changeDate = new Date(entry.date);
    const before = sales.filter(s => new Date(s.date) >= new Date(changeDate.getTime() - 14 * 86400000) && new Date(s.date) < changeDate);
    const after = sales.filter(s => new Date(s.date) >= changeDate && new Date(s.date) < new Date(changeDate.getTime() + 14 * 86400000));
    const beforeAvg = before.reduce((s, x) => s + x.quantity, 0) / 14;
    const afterAvg = after.reduce((s, x) => s + x.quantity, 0) / 14;
    if (before.length === 0 && after.length === 0) return;
    if (beforeAvg === 0 && afterAvg === 0) return;
    const pct = beforeAvg > 0 ? ((afterAvg - beforeAvg) / beforeAvg) * 100 : null;
    const dateStr = changeDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
    if (pct === null) {
      priceChangeEffects.push(`Cost updated to ₦${entry.costPrice.toLocaleString()} on ${dateStr} — not enough sales before that date to compare.`);
    } else {
      priceChangeEffects.push(`After the ${dateStr} price change, daily sales ${pct >= 0 ? 'rose' : 'dropped'} ${Math.abs(pct).toFixed(0)}%.`);
    }
  });

  return {
    product,
    currentStock: product.quantity,
    qtySoldLast30,
    qtySoldAllTime,
    revenueLast30,
    revenueAllTime,
    profitAllTime,
    restockCount: product.restock_count || 0,
    trendPct,
    trendDirection,
    recommendations,
    priceChangeEffects,
  };
}

// Finds a product by loose name match — used by chat lookups like
// "how is Indomie performing", where the user won't type the exact name.
export function findProductByName(store: StoreData, query: string): Product | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const active = store.products.filter(p => !p.discontinued);
  const exact = active.find(p => p.name.toLowerCase() === q);
  if (exact) return exact;
  const starts = active.find(p => p.name.toLowerCase().startsWith(q) || q.startsWith(p.name.toLowerCase()));
  if (starts) return starts;
  const contains = active.filter(p => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()));
  if (contains.length === 1) return contains[0];
  if (contains.length > 1) {
    // Prefer the one whose name is closest in length to the query — cheap
    // proxy for "most specific match" without pulling in a fuzzy-match lib.
    return contains.sort((a, b) => Math.abs(a.name.length - q.length) - Math.abs(b.name.length - q.length))[0];
  }
  return null;
}
