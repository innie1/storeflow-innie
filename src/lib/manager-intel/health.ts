import { StoreData } from '@/types/store';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { receivedBetween, runningCostsBetween } from '@/lib/money-figures';
import { isServiceFirstBusiness } from '@/lib/business-runtime';
import { getPendingSummary } from '@/lib/store-data';
import { startOfDay, daysAgo } from './dates';
import { dailySeries } from './forecast';
import { computeStockForecasts } from './stock';

// ─── Store Health (6-factor per spec) ─────────────────────────────────────────
export interface HealthScore {
  overall: number;
  revenue: number;     // 25%
  profit: number;      // 25%
  inventory: number;   // 15%
  expense: number;     // 15%
  savings: number;     // 10%
  debt: number;        // 10%
  // legacy compat
  sales: number;
  label: string;
  details: Record<string, string>;
}

/** Work taken in, for the shops that keep no stock. */
export function serviceRecords(store: StoreData) {
  const accessCode = String((store as { accessCode?: string }).accessCode || '');
  if (!accessCode) return [];
  try {
    return shopLaundryRecords(accessCode);
  } catch {
    return [];
  }
}

/**
 * Store Health as a shop sees it: the score, and the last seven days' money.
 *
 * The card worked these out for itself and Flow worked out its own - a score
 * made up from a few stock counts, and profit before any costs - so asking
 * Flow how the store was doing gave a different number from the card on the
 * same screen. Both read this now.
 */
export interface StoreHealthFigures {
  score: number;
  label: string;
  /** Money received, last 7 days. */
  revenue: number;
  /** Running costs, last 7 days, with piece work counted when approved. */
  expenses: number;
  /** Sales profit less those costs. */
  profit: number;
}

export function storeHealthFigures(store: StoreData, now: number = Date.now()): StoreHealthFigures {
  const health = healthScore(store);
  const from = now - 7 * 86400000;
  const to = Number.MAX_SAFE_INTEGER;
  const expenses = runningCostsBetween(store, from, to);
  const salesProfit = (store.sales || [])
    .filter(sale => new Date(sale.date).getTime() >= from)
    .reduce((sum, sale) => sum + (Number(sale.profit) || 0), 0);
  return {
    score: health.overall,
    label: health.label,
    revenue: receivedBetween(store, from, to),
    expenses,
    profit: salesProfit - expenses,
  };
}

export function healthScore(store: StoreData): HealthScore {
  const last7 = dailySeries(store, 7);
  const prev7 = dailySeries(store, 14).slice(0, 7);
  const rev7 = last7.reduce((s, d) => s + d.revenue, 0);
  const revPrev = prev7.reduce((s, d) => s + d.revenue, 0);
  const profit7 = last7.reduce((s, d) => s + d.profit, 0);
  const exp7 = last7.reduce((s, d) => s + d.expenses, 0);

  // 25%: Revenue Performance
  let revenueScore = 50;
  if (revPrev > 0) {
    const growth = (rev7 - revPrev) / revPrev;
    revenueScore = Math.max(0, Math.min(100, 60 + growth * 150));
  } else if (rev7 > 0) revenueScore = 65;
  const revDetail = revPrev > 0
    ? `Revenue ${rev7 >= revPrev ? '↑' : '↓'} ${Math.abs(((rev7 - revPrev) / revPrev) * 100).toFixed(1)}% vs last week`
    : rev7 > 0 ? `₦${rev7.toLocaleString()} this week` : 'No sales this week';

  // 25%: Profit Performance
  /*
   * After running costs - the same profit Store Health shows on its card.
   * Sales profit alone is the whole payment for a laundry, so the margin read
   * 100% for every service shop whatever it spent.
   */
  const netProfit7 = profit7 - runningCostsBetween(store, startOfDay(new Date()).getTime() - 6 * 86400000, Number.MAX_SAFE_INTEGER);
  let profitScore = 50;
  if (rev7 > 0) { const margin = netProfit7 / rev7; profitScore = Math.max(0, Math.min(100, margin * 200)); }
  const profDetail = rev7 > 0 ? `${((netProfit7 / rev7) * 100).toFixed(1)}% margin after costs` : 'No sales data';

  // 15%: Inventory Health
  // Previously: healthy = quantity > threshold, score = healthy/total. This
  // treated a dead product sitting fully stocked the same as your best
  // seller, and a store with 20 stocked-but-unsold SKUs could show ~100%
  // "health" while its 2 actual best sellers were completely out of stock.
  // Now: reuses the same velocity-aware urgency data as the restock
  // suggestions (so the two features can't disagree), and weights each
  // product by how much of your recent sales it actually represents —
  // a fast seller going critical hurts the score much more than a slow
  // mover being low, and a slow mover being low barely moves it at all.
  const activeProducts = store.products.filter(p => !p.discontinued);
  const total = activeProducts.length;
  let inventoryScore = 100;
  let invDetail = 'No products in catalog yet';

  // A shop that keeps no stock cannot be scored on it. A laundry was having
  // 15% of its health decided by an inventory it does not have, and told
  // "All 0 products well-stocked". What it lives or dies by is whether work
  // goes back on the day it was promised, so that is what is measured here.
  const serviceShop = isServiceFirstBusiness(store);
  if (serviceShop) {
    const records = serviceRecords(store);
    const open = records.filter(record => record.workflowStage !== 'collected');
    const now = Date.now();
    const late = open.filter(record => {
      const due = new Date(record.promisedFor || '').getTime();
      return Number.isFinite(due) && due < now;
    }).length;

    if (!records.length) {
      inventoryScore = 100;
      invDetail = 'Nothing taken in yet';
    } else if (!open.length) {
      inventoryScore = 100;
      invDetail = 'Everything has been handed back';
    } else {
      inventoryScore = Math.max(0, Math.round(100 - (late / open.length) * 100));
      invDetail = late === 0
        ? `${open.length} in the shop, none past its promised day`
        : `${late} of ${open.length} past the promised day`;
    }
  } else if (total > 0) {
    const forecasts = computeStockForecasts(store);
    const last30 = store.sales.filter(s => new Date(s.date) >= daysAgo(30));
    const sold30ByProduct = new Map<string, number>();
    last30.forEach(s => sold30ByProduct.set(s.productId, (sold30ByProduct.get(s.productId) || 0) + s.quantity));

    // Additive smoothing so untested/new products still count a little,
    // instead of being invisible to the score until they've sold something.
    const SMOOTHING = 1;
    const weighted = forecasts.map(f => {
      const unitsSold30 = sold30ByProduct.get(f.product.id) || 0;
      const weight = unitsSold30 * f.product.sellingPrice + SMOOTHING;
      const points = f.product.quantity === 0 ? 0 : f.urgency === 'critical' ? 25 : f.urgency === 'soon' ? 65 : 100;
      return { weight, points, urgency: f.urgency, isOut: f.product.quantity === 0 };
    });
    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0) || 1;
    inventoryScore = Math.round(weighted.reduce((s, w) => s + w.points * (w.weight / totalWeight), 0));

    const outOfStock = weighted.filter(w => w.isOut).length;
    const critical = forecasts.filter(f => f.urgency === 'critical' && f.product.quantity > 0).length;
    const soon = forecasts.filter(f => f.urgency === 'soon').length;
    if (outOfStock > 0) invDetail = `${outOfStock} product${outOfStock === 1 ? '' : 's'} out of stock right now`;
    else if (critical > 0) invDetail = `${critical} fast-moving product${critical === 1 ? '' : 's'} about to run out`;
    else if (soon > 0) invDetail = `${soon} product${soon === 1 ? '' : 's'} running low, none urgent yet`;
    else invDetail = `All ${total} products well-stocked`;
  }

  // 15%: Expense Control
  let expenseScore = 80;
  if (rev7 > 0) { const ratio = exp7 / rev7; expenseScore = Math.max(0, Math.min(100, 100 - ratio * 60)); }
  const expDetail = rev7 > 0 ? `Expenses = ${((exp7 / rev7) * 100).toFixed(0)}% of revenue` : exp7 > 0 ? `₦${exp7.toLocaleString()} expenses this week` : 'No expenses recorded';

  // 10%: Savings Progress
  let savingsScore = 50;
  const sg = store.savingsGoal;
  if (sg && sg.amount > 0) { savingsScore = Math.min(100, Math.round((sg.saved / sg.amount) * 100)); }
  const savDetail = sg ? `₦${sg.saved.toLocaleString()} / ₦${sg.amount.toLocaleString()} saved` : 'No savings goal set';

  // 10%: Customer Debt Management
  let debtScore = 80;
  const pendSum = getPendingSummary(store);
  if (pendSum.totalOwed > 0 && rev7 > 0) {
    const debtRatio = pendSum.totalOwed / (rev7 * 4);
    debtScore = Math.max(0, Math.min(100, 100 - debtRatio * 80));
  } else if (pendSum.totalOwed === 0) debtScore = 100;
  const debtDetail = pendSum.totalOwed > 0 ? `₦${pendSum.totalOwed.toLocaleString()} outstanding · ${pendSum.overdue.length} overdue` : 'No outstanding debts';

  const overall = Math.round(
    revenueScore * 0.25 + profitScore * 0.25 + inventoryScore * 0.15 +
    expenseScore * 0.15 + savingsScore * 0.10 + debtScore * 0.10
  );
  let label = 'Needs Attention';
  if (overall >= 80) label = 'Great Performance';
  else if (overall >= 60) label = 'Healthy';
  else if (overall >= 40) label = 'Average';

  return {
    overall,
    revenue: Math.round(revenueScore),
    profit: Math.round(profitScore),
    inventory: inventoryScore,
    expense: Math.round(expenseScore),
    savings: savingsScore,
    debt: debtScore,
    sales: Math.round(revenueScore), // legacy compat
    label,
    details: { revenue: revDetail, profit: profDetail, inventory: invDetail, expense: expDetail, savings: savDetail, debt: debtDetail },
  };
}
