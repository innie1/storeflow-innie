import { StoreData, TabId } from '@/types/store';
import { countDebtors } from '@/lib/customer-key';
import { getPendingSummary } from '@/lib/store-data';
import type { ProductFocus } from '@/lib/product-focus';
import { productMarkup } from '@/lib/pricing-math';
import { dailySeries } from './forecast';
import { analyzeSales } from './sales';
import { stockCoverLabel, inventoryIntelligence } from './stock';
import { topCustomerRequests } from './costs';

// ─── Top Opportunities ────────────────────────────────────────────────────────

/**
 * Things worth doing, each one somewhere the merchant can actually go.
 *
 * Every card used to end in a chevron and a phrase like "Order Stock" that
 * looked tappable and did nothing — the whole card was plain text. And the
 * badge meant different things on different cards: one showed money, the
 * others showed "High Revenue Boost" and "Free Up Working Capital" in the
 * same pill.
 *
 * The money shown is now gross profit, not gross revenue. Restocking a fast
 * seller was advertised at sellingPrice × units — ₦8.8m for an order that
 * costs ₦7.1m to place, so the number was mostly the merchant's own money
 * being handed back to them.
 */
export interface OpportunityCard {
  title: string;
  description: string;
  /** What it is worth, when that can be said honestly. */
  impactAmount?: number;
  impactLabel: string;
  actionLabel: string;
  /** Where tapping it goes, and what to open when it lands. */
  goTo: TabId;
  focus?: ProductFocus;
}

export function getTopOpportunities(store: StoreData): OpportunityCard[] {
  const opps: OpportunityCard[] = [];

  // 1. Things customers asked for that are not stocked.
  for (const r of topCustomerRequests(store, 2)) {
    opps.push({
      title: `Stock ${r.text}`,
      description: `Asked for ${r.count} times and not in your inventory.`,
      impactLabel: `${r.count} asked`,
      actionLabel: 'Add product',
      goTo: 'inventory',
    });
  }

  // 2. Fast sellers about to run out.
  // Already sorted by money at risk, and only items with real recent demand
  // qualify — restocking something that sold once last quarter is not an
  // opportunity, it is a way to turn cash into shelf ornaments.
  const critical = inventoryIntelligence(store)
    .filter(f => f.urgency === 'critical' && f.worthRestocking && f.restockQty > 0);
  if (critical.length > 0) {
    const item = critical[0];
    // Profit, not revenue: the cost of the order is the merchant's own cash.
    const unitProfit = Math.max(0, item.product.sellingPrice - item.product.costPrice);
    opps.push({
      title: `Restock ${item.product.name}`,
      description: `${stockCoverLabel(item)}. Order ${item.restockQty}.`,
      impactAmount: Math.round(unitProfit * item.restockQty),
      impactLabel: 'profit',
      actionLabel: 'Restock',
      goTo: 'inventory',
      focus: { productId: item.product.id, intent: 'restock', productName: item.product.name },
    });
  }

  // 3. Stock bought and never sold.
  const neverSold = analyzeSales(store).neverSold;
  if (neverSold.length > 0) {
    const p = neverSold[0];
    const tiedUp = Math.round((p.costPrice || 0) * (p.quantity || 0));
    opps.push({
      title: `Stop reordering ${p.name}`,
      description: `${p.daysInStock} days in stock, nothing sold.`,
      impactAmount: tiedUp > 0 ? tiedUp : undefined,
      impactLabel: 'tied up',
      actionLabel: 'Review',
      goTo: 'inventory',
      focus: { productId: p.id, intent: 'edit', productName: p.name },
    });
  }

  // NOTE: This used to pad the list with generic, non-personalized suggestions
  // ("Set Up Branded Receipts", "Expand to Game Services") whenever there
  // weren't enough real opportunities — the same filler for every merchant
  // regardless of what they actually sell. Removed: better to show fewer,
  // honest cards than to dilute real insights with boilerplate.

  return opps.slice(0, 4);
}

// ─── Profit Leak Detector ─────────────────────────────────────────────────────

/**
 * Two different problems, told apart.
 *
 * This used to add five numbers of five different kinds and print the total as
 * a "Leak Index": unpaid invoices, stock on the shelf at cost, a month of
 * foregone margin, a week of excess expenses, and every stock-count shortfall
 * ever recorded. On a shop earning ₦3.2m profit in thirty days it announced a
 * ₦2.19m leak, of which about ₦104,000 was actually money going astray. The
 * rest was either an asset the merchant still owns or a one-off from months
 * earlier being counted forever.
 *
 * `leaking` is money genuinely lost, all of it measured over the same thirty
 * days, and only that is totalled. `stuck` is money the merchant still has but
 * cannot spend — it needs a different action, so it is shown apart and never
 * described as a loss.
 */
export interface ProfitLeak {
  kind: 'leaking' | 'stuck';
  category: 'expense' | 'dead_stock' | 'unpaid_debt' | 'poor_margin' | 'stock_loss';
  title: string;
  description: string;
  amountLeak: number;
  recommendation: string;
}

/** Everything here is measured over the same window, so the parts can be added. */
export const LEAK_WINDOW_DAYS = 30;

/** Markup a thin-margin product is compared against. */
export const HEALTHY_MARKUP = 0.25;

export function getProfitLeaks(store: StoreData): ProfitLeak[] {
  const leaks: ProfitLeak[] = [];
  const now = Date.now();
  const windowStart = now - LEAK_WINDOW_DAYS * 86400000;
  const recentSales = store.sales.filter(sale => new Date(sale.date).getTime() >= windowStart);
  const active = store.products.filter(p => !p.discontinued);

  const soldUnits = new Map<string, number>();
  for (const sale of recentSales) {
    soldUnits.set(sale.productId, (soldUnits.get(sale.productId) || 0) + sale.quantity);
  }

  // ── Leaking: thin margins ──────────────────────────────────────────────
  // Only products that actually sold can be losing money on price. Compare
  // what each earned against what it would have earned at a healthy markup.
  let thinMarginCount = 0;
  let thinMarginLeak = 0;
  for (const p of active) {
    if (p.costPrice <= 0) continue;
    if (productMarkup(p) >= 0.15) continue;
    const sold = soldUnits.get(p.id) || 0;
    if (sold <= 0) continue;
    thinMarginCount++;
    thinMarginLeak += Math.max(0, p.costPrice * (1 + HEALTHY_MARKUP) - p.sellingPrice) * sold;
  }
  if (thinMarginLeak > 0) {
    leaks.push({
      kind: 'leaking',
      category: 'poor_margin',
      title: `${thinMarginCount} product${thinMarginCount === 1 ? '' : 's'} priced too close to cost`,
      // 25% on top of cost is a 25% markup, which is a 20% margin. The old
      // copy called it a margin while doing markup arithmetic.
      description: `At a ${Math.round(HEALTHY_MARKUP * 100)}% markup these would have earned ₦${Math.round(thinMarginLeak).toLocaleString()} more over the last ${LEAK_WINDOW_DAYS} days.`,
      amountLeak: Math.round(thinMarginLeak),
      recommendation: 'Raise these prices, or drop the lines you cannot price properly.',
    });
  }

  // ── Leaking: overheads ─────────────────────────────────────────────────
  // Was a 7-day figure standing next to 30-day ones. Same window now.
  const series = dailySeries(store, LEAK_WINDOW_DAYS);
  const revenue = series.reduce((sum, d) => sum + d.revenue, 0);
  const expenses = series.reduce((sum, d) => sum + d.expenses, 0);
  if (revenue > 0 && expenses > revenue * 0.4) {
    const excess = expenses - revenue * 0.2;
    leaks.push({
      kind: 'leaking',
      category: 'expense',
      title: 'Overheads are eating the takings',
      description: `Running costs of ₦${Math.round(expenses).toLocaleString()} took ${Math.round((expenses / revenue) * 100)}% of sales over the last ${LEAK_WINDOW_DAYS} days.`,
      amountLeak: Math.round(excess),
      recommendation: 'Check utilities, transport and salaries against what came in.',
    });
  }

  // ── Leaking: shrinkage ─────────────────────────────────────────────────
  // Only counts within the window. A shortfall from months ago used to be
  // carried in the total for the life of the shop.
  const recentShortfalls = (store.stockCountAudits || []).filter(
    a => a.variance < 0 && new Date(a.date).getTime() >= windowStart,
  );
  if (recentShortfalls.length > 0) {
    const withCost = active.filter(p => p.costPrice > 0);
    const avgCost = withCost.length
      ? withCost.reduce((sum, p) => sum + p.costPrice, 0) / withCost.length
      : 0;
    const units = recentShortfalls.reduce((sum, a) => sum + Math.abs(a.variance), 0);
    const value = recentShortfalls.reduce((sum, a) => {
      const match = store.products.find(p => p.name === a.product);
      return sum + Math.abs(a.variance) * (match?.costPrice || avgCost);
    }, 0);
    if (value > 0) {
      leaks.push({
        kind: 'leaking',
        category: 'stock_loss',
        title: 'Stock went missing between counts',
        description: `${units} unit${units === 1 ? '' : 's'} unaccounted for in the last ${LEAK_WINDOW_DAYS} days, worth ₦${Math.round(value).toLocaleString()} at cost.`,
        amountLeak: Math.round(value),
        recommendation: 'Count more often and check who can edit stock.',
      });
    }
  }

  // ── Stuck: money owed past its due date ────────────────────────────────
  // The whole receivable balance used to be called a leak, including invoices
  // raised the day before. Only what is actually late is a problem, and even
  // that is money the merchant is owed, not money lost.
  const pending = getPendingSummary(store);
  const overdue = pending.overdue.reduce((sum, p) => sum + p.balance, 0);
  if (overdue > 0) {
    // By customer, not by name, so two customers who share one are two.
    const names = countDebtors(pending.overdue);
    leaks.push({
      kind: 'stuck',
      category: 'unpaid_debt',
      title: 'Payments past their due date',
      description: `₦${Math.round(overdue).toLocaleString()} is overdue from ${names} customer${names === 1 ? '' : 's'}.`,
      amountLeak: Math.round(overdue),
      recommendation: 'Send a reminder to the oldest balances first.',
    });
  }

  // ── Stuck: capital sitting in stock that is not moving ─────────────────
  // A line that sells steadily but slowly is not dead, and counting it as a
  // total loss was most of the old number. Only stock with no sales at all in
  // the window counts, and the copy says what it is: money you still have.
  let idleValue = 0;
  let idleCount = 0;
  for (const p of active) {
    if (p.quantity <= 0 || p.costPrice <= 0) continue;
    if ((soldUnits.get(p.id) || 0) > 0) continue;
    idleValue += p.costPrice * p.quantity;
    idleCount++;
  }
  if (idleValue > 0) {
    leaks.push({
      kind: 'stuck',
      category: 'dead_stock',
      title: `${idleCount} product${idleCount === 1 ? '' : 's'} have not sold in ${LEAK_WINDOW_DAYS} days`,
      description: `₦${Math.round(idleValue).toLocaleString()} of your cash is sitting in them. It is not lost, but you cannot spend it.`,
      amountLeak: Math.round(idleValue),
      recommendation: 'Discount them, bundle them, or stop reordering them.',
    });
  }

  return leaks;
}
