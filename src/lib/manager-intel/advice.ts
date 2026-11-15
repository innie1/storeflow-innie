import { StoreData, TabId } from '@/types/store';
import { shopLaundryRecords } from '@/lib/shop-laundry';
import { resolveBusinessType } from '@/lib/business-runtime';
import { laundryFlow, type FlowBundle } from '@/lib/laundry-flow';
import { getPendingSummary } from '@/lib/store-data';
import type { AutoFixSpec } from '@/lib/auto-fix';
import type { ProductFocus } from '@/lib/product-focus';
import { daysAgo, isStoreOnboarding } from './dates';
import { dailySeries } from './forecast';
import { analyzeSales } from './sales';
import { stockCoverLabel, inventoryIntelligence } from './stock';
import { expenseAnalysis, pricingAlerts } from './costs';
import { getProductInsightBadges } from './insights';
import { healthScore } from './health';
import { isServiceFirstBusiness } from '@/lib/business-runtime';

// ─── Business Advice ──────────────────────────────────────────────────────────
export interface AdviceCard {
  id: string;
  icon: string;
  title: string;
  detail: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  action?: string;
  // When set (2+ entries), the UI renders one card with a compact list
  // instead of a separate full-size card per item.
  items?: { name: string; note: string }[];
  // "Go to Action" — which tab opens the screen needed to act on this advice.
  goTo?: TabId;
  // Which product on that screen, and what the merchant is going there to do.
  // Set whenever the advice names a single product, so the destination can
  // open that product's editor rather than a list to search through.
  focus?: ProductFocus;
  // "Auto Fix" — when present, the UI offers a button that (after the
  // store-code confirmation gate) applies this exact change via
  // lib/auto-fix.ts. Omitted for advice that has no safe automatic fix.
  autoFix?: AutoFixSpec;
}

// Reads the customer-supplied cancellation reason off a marketplace order's
// notes JSON. Notes are stored as a JSON string (see customer_cancel_order
// RPC / Orders.tsx), so this defensively no-ops on anything else.
export function getCancelReason(order: any): string | null {
  if (!order?.notes || typeof order.notes !== 'string') return null;
  try {
    const meta = JSON.parse(order.notes);
    return meta?.customer_cancel_reason || null;
  } catch {
    return null;
  }
}

export function flowBundles(store: StoreData): FlowBundle[] {
  try {
    return shopLaundryRecords(String(store.accessCode || '')) as unknown as FlowBundle[];
  } catch {
    return [];
  }
}

export function generateAdvice(store: StoreData, orders: any[] = []): AdviceCard[] {
  const advice: AdviceCard[] = [];
  const h = healthScore(store);
  const stock = inventoryIntelligence(store);
  // Restocking inventory is a healthy, expected cost of doing business (you're
  // buying assets to resell for profit) — it should never itself count as
  // "overspending". Exclude it here so this only flags genuine operating-cost
  // creep (rent, utilities, salaries, etc.), not merchants restocking well.
  const ea = expenseAnalysis(store, ['Restock']);
  const analysis = analyzeSales(store);
  const pending = getPendingSummary(store);
  const series7 = dailySeries(store, 7);
  const rev7 = series7.reduce((s, d) => s + d.revenue, 0);

  // A laundry's work comes in days before its money, so being busy and being
  // paid can drift apart. Sales alone never show it: only the money is there.
  // Not on a worker's phone, which only holds the money it took itself.
  if (resolveBusinessType(store) === 'laundry' && !store.staffDevice) {
    const flow = laundryFlow(store, flowBundles(store), '30d');
    if (flow.bundles >= 3 && flow.paidShare < 50) {
      advice.push({
        id: 'laundry-clothes-not-paid',
        icon: '🧺',
        title: `Only ${flow.paidShare}% of the clothes brought in have been paid for`,
        detail: `In the last 30 days, ${flow.bundles} bundles worth ₦${Math.round(flow.broughtIn).toLocaleString()} came in, and ₦${Math.round(flow.owedOnThese).toLocaleString()} of that is still owed. ${flow.customersBrought - flow.customersPaid} of the ${flow.customersBrought} customers have not paid anything yet.`,
        priority: 'high',
        action: 'Remind customers whose clothes are ready, and take a deposit at drop-off.',
        goTo: 'laundry-records',
      });
    }
  }

  // Critical: running out of fast sellers or completely out of stock
  if (!isStoreOnboarding(store)) {
    // Only what demand justifies gets a reorder recommendation and an Auto Fix
    // purchase order; the rest is reported without a quantity, below.
    const criticalStock = stock.filter(f => f.urgency === 'critical' && f.worthRestocking).slice(0, 5);
    if (criticalStock.length === 1) {
      const f = criticalStock[0];
      const isOut = f.product.quantity === 0;
      advice.push({
        id: `cr-${f.product.id}`,
        icon: '🚨',
        title: isOut ? `Restock ${f.product.name} (Sold Out)` : `Restock ${f.product.name} NOW`,
        detail: isOut
          ? `Out of Stock: ${f.product.name} is completely sold out. Restock at least ${f.restockQty} units immediately to recover lost revenue.`
          : `${stockCoverLabel(f)}. Order at least ${f.restockQty} units.`,
        priority: 'critical',
        goTo: 'inventory',
        focus: { productId: f.product.id, productName: f.product.name, intent: 'restock' },
        autoFix: {
          type: 'generate_purchase_order',
          summary: `Create a draft purchase order for ${f.restockQty} units of ${f.product.name}`,
          payload: { items: [{ productId: f.product.id, name: f.product.name, qty: f.restockQty, costPrice: f.product.costPrice }] },
        },
      });
    } else if (criticalStock.length > 1) {
      advice.push({
        id: 'cr-group',
        icon: '🚨',
        title: `${criticalStock.length} products need restocking now`,
        detail: 'These are critically low or sold out. Restock soon to avoid losing sales.',
        priority: 'critical',
        items: criticalStock.map(f => ({
          name: f.product.name,
          note: stockCoverLabel(f, { short: true }) + (f.hasVelocity ? ` · order ${f.restockQty}` : '')
        })),
        goTo: 'inventory',
        // Group advice could not name a single product, so Open used to drop
        // the merchant on the whole inventory to work out which ones.
        focus: {
          productId: criticalStock[0].product.id,
          productIds: criticalStock.map(f => f.product.id),
          groupLabel: `${criticalStock.length} products need restocking now`,
          intent: 'restock',
        },
        autoFix: {
          type: 'generate_purchase_order',
          summary: `Create a draft purchase order covering all ${criticalStock.length} critical products`,
          payload: { items: criticalStock.map(f => ({ productId: f.product.id, name: f.product.name, qty: f.restockQty, costPrice: f.product.costPrice })) },
        },
      });
    }
  }

  // Critical: no sales this week
  if (!isStoreOnboarding(store) && rev7 === 0 && store.products.length > 0) {
    advice.push({ id: 'no-sales', icon: '⚠️', title: 'No sales recorded this week', detail: 'Record sales to unlock predictions and keep your store health score accurate.', priority: 'critical' });
  }

  // High: large outstanding debts
  if (pending.totalOwed > rev7 * 0.3) {
    advice.push({ id: 'debt', icon: '💳', title: 'Chase outstanding payments', detail: `₦${pending.totalOwed.toLocaleString()} owed by ${pending.customerCount} ${pending.customerCount === 1 ? 'customer' : 'customers'}${pending.overdue.length ? `, ${pending.overdue.length} past the day they promised` : ''}. Collecting it puts the money in your hands.`, priority: 'high', goTo: 'pending' });
  }

  // Medium/High: customers cancelling orders — surface the count and, when
  // available, the most common reason so the store owner can act on it
  // rather than just seeing "Cancelled" with no context.
  if (!isStoreOnboarding(store) && orders.length > 0) {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const recentCancellations = orders.filter(o =>
      (o.status || '').trim().toLowerCase() === 'cancelled' &&
      new Date(o.created_at || o.updated_at || 0).getTime() >= sevenDaysAgo
    );
    if (recentCancellations.length >= 2) {
      const reasonCounts = new Map<string, number>();
      recentCancellations.forEach(o => {
        const reason = getCancelReason(o);
        if (reason) reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
      });
      const topReason = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      advice.push({
        id: 'order-cancellations',
        icon: '❌',
        title: `${recentCancellations.length} order${recentCancellations.length === 1 ? '' : 's'} cancelled this week`,
        detail: topReason
          ? `Most common reason: "${topReason[0]}" (${topReason[1]} of ${recentCancellations.length}). Worth looking into.`
          : `Check the Orders tab for details — no reasons were given for these cancellations.`,
        priority: recentCancellations.length >= 5 ? 'high' : 'medium'
      });
    }
  }

  // High: soaring expenses
  if (ea.trendPct > 20 && ea.totalLast30 > 0) {
    advice.push({ id: 'exp-rise', icon: '🧾', title: `${ea.largestCategory} spending up ${ea.trendPct.toFixed(0)}%`, detail: `Your ${ea.largestCategory.toLowerCase()} expenses grew significantly this month. Review and cut where possible.`, priority: 'high' });
  }

  // High: underpriced products
  const alerts = pricingAlerts(store);
  const underpriced = alerts.filter(a => a.type === 'underpriced').slice(0, 1);
  underpriced.forEach(a => {
    advice.push({
      id: `price-${a.product.id}`, icon: '📈', title: `Raise price on ${a.product.name}`,
      detail: `Currently ${(a.currentMarkup * 100).toFixed(0)}% on top of cost. Suggest ₦${a.suggestedPrice.toLocaleString()} — adds ₦${a.expectedLift.toLocaleString()} per unit.`,
      priority: 'high',
      goTo: 'inventory',
      focus: { productId: a.product.id, productName: a.product.name, intent: 'edit' },
      autoFix: {
        type: 'update_price',
        summary: `Set ${a.product.name}'s price to ₦${a.suggestedPrice.toLocaleString()} (from ₦${a.product.sellingPrice.toLocaleString()})`,
        payload: { productId: a.product.id, newPrice: a.suggestedPrice },
      },
    });
  });

  // Medium: restock soon
  if (!isStoreOnboarding(store)) {
    const soonAll = stock.filter(f => f.urgency === 'soon');
    const soonStock = soonAll.filter(f => f.worthRestocking).slice(0, 5);

    // Everything low or gone that demand does not justify reordering, in one
    // place. These were listed as "order 10" each and bundled into the Auto Fix
    // purchase order — the exact move that turns working capital into stock
    // nobody is buying.
    const deadStock = stock.filter(f => !f.worthRestocking).slice(0, 6);
    if (deadStock.length > 0) {
      advice.push({
        id: 'stock-no-demand',
        icon: '🗃️',
        title: deadStock.length === 1
          ? `${deadStock[0].product.name} is low, but not selling`
          : `${deadStock.length} products are low, but not selling`,
        detail: 'Low or sold out with no sales in the last 14 days. Reordering these ties up cash — decide case by case, or clear what you already have.',
        priority: 'low',
        items: deadStock.map(f => ({
          name: f.product.name,
          note: f.product.quantity <= 0 ? 'Sold out · never sold' : `${f.product.quantity} left · no recent sales`,
        })),
        goTo: 'inventory',
        focus: {
          productId: deadStock[0].product.id,
          productIds: deadStock.map(f => f.product.id),
          groupLabel: deadStock.length === 1 ? `${deadStock[0].product.name} is not selling` : `${deadStock.length} products are not selling`,
          intent: 'view',
        },
      });
    }

    if (soonStock.length === 1) {
      const f = soonStock[0];
      advice.push({
        id: `soon-${f.product.id}`, icon: '📦', title: `Order ${f.product.name} this week`,
        detail: `${stockCoverLabel(f)}. Restock ${f.restockQty} units to avoid a gap.`,
        priority: 'medium',
        goTo: 'inventory',
        focus: { productId: f.product.id, productName: f.product.name, intent: 'restock' },
        autoFix: {
          type: 'generate_purchase_order',
          summary: `Create a draft purchase order for ${f.restockQty} units of ${f.product.name}`,
          payload: { items: [{ productId: f.product.id, name: f.product.name, qty: f.restockQty, costPrice: f.product.costPrice }] },
        },
      });
    } else if (soonStock.length > 1) {
      advice.push({
        id: 'soon-group',
        icon: '📦',
        title: `${soonStock.length} products to order this week`,
        detail: 'Running low but not urgent yet — plan a restock order soon.',
        priority: 'medium',
        items: soonStock.map(f => ({ name: f.product.name, note: stockCoverLabel(f, { short: true }) + (f.hasVelocity ? ` · order ${f.restockQty}` : '') })),
        goTo: 'inventory',
        focus: {
          productId: soonStock[0].product.id,
          productIds: soonStock.map(f => f.product.id),
          groupLabel: `${soonStock.length} products to order this week`,
          intent: 'restock',
        },
        autoFix: {
          type: 'generate_purchase_order',
          summary: `Create a draft purchase order covering all ${soonStock.length} products`,
          payload: { items: soonStock.map(f => ({ productId: f.product.id, name: f.product.name, qty: f.restockQty, costPrice: f.product.costPrice })) },
        },
      });
    }
  }

  // Medium: fast-selling products with no reorder level set — Auto Fix can
  // set one to a sensible 7-day-supply default in one tap.
  const missingReorder = store.products
    .filter(p => !p.discontinued && !p.isService && p.reorderLevel == null)
    .map(p => {
      const sold14 = store.sales.filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(13)).reduce((s, sale) => s + sale.quantity, 0);
      const perDay = sold14 / 14;
      return { product: p, perDay, suggested: Math.max(1, Math.ceil(perDay * 7)) };
    })
    .filter(x => x.perDay > 0)
    .sort((a, b) => b.perDay - a.perDay)
    .slice(0, 5);
  if (missingReorder.length >= 2) {
    advice.push({
      id: 'reorder-levels',
      icon: '🔔',
      title: `${missingReorder.length} fast sellers have no reorder level set`,
      detail: `Setting a reorder level triggers a restock alert automatically instead of you noticing stock is low by chance.`,
      priority: 'medium',
      items: missingReorder.map(x => ({ name: x.product.name, note: `suggest ${x.suggested}` })),
      goTo: 'inventory',
      autoFix: {
        type: 'adjust_reorder_level',
        summary: `Set reorder levels (≈7 days of stock) on ${missingReorder.length} products`,
        payload: { items: missingReorder.map(x => ({ productId: x.product.id, reorderLevel: x.suggested })) },
      },
    });
  }

  // Medium: co-purchase opportunity
  if (analysis.coPurchases.length > 0) {
    const cp = analysis.coPurchases[0];
    advice.push({ id: 'copurchase', icon: '🛒', title: 'Bundle opportunity', detail: `Customers often buy ${cp.a} and ${cp.b} together (${cp.count}x). Stock them near each other and consider a combo deal.`, priority: 'medium' });
  }

  // Medium: never-sold products tying up capital
  if (analysis.neverSold.length >= 3) {
    const targets = analysis.neverSold.slice(0, 5);
    advice.push({
      id: 'dead-stock', icon: '😴', title: `${analysis.neverSold.length} products never sold`,
      detail: `${analysis.neverSold.slice(0, 2).map(p => p.name).join(', ')} and others have never sold. Consider discounting or replacing with faster movers.`,
      priority: 'medium',
      goTo: 'inventory',
      autoFix: {
        type: 'create_promotion',
        summary: `Apply a 15% promo price to ${targets.length} never-sold product${targets.length === 1 ? '' : 's'} for 14 days`,
        payload: { productIds: targets.map(p => p.id), discountPct: 15, days: 14, reason: 'Clearing dead stock' },
      },
    });
  }

  // Low: long-dormant products worth archiving — separate from the
  // never-sold discount advice above; this is for products that DID sell
  // once but have gone quiet for a long time, where discounting is less
  // useful than just getting them off the active list.
  const dormantLong = getProductInsightBadges(store, 60).filter(b => b.label === 'Dormant Product');
  if (dormantLong.length > 0 && dormantLong.length <= 4) {
    dormantLong.forEach(b => {
      advice.push({
        id: `archive-${b.productId}`,
        focus: { productId: b.productId, productName: b.productName, intent: 'edit' },
        icon: '🗄️',
        title: `Consider archiving ${b.productName}`,
        detail: `${b.explain} Archiving hides it from active inventory without deleting its sales history.`,
        priority: 'low',
        goTo: 'inventory',
        autoFix: {
          type: 'archive_product',
          summary: `Archive ${b.productName} (mark as discontinued)`,
          payload: { productId: b.productId },
        },
      });
    });
  }

  // Low: health is great
  if (h.overall >= 80) {
    advice.push({ id: 'great', icon: '🌟', title: 'Your store is thriving', detail: `Health score: ${h.overall}/100. Keep maintaining stock levels and expense control.`, priority: 'low' });
  }

  // Low: set a savings goal
  if (!store.savingsGoal) {
    advice.push({ id: 'save', icon: '💰', title: 'Set a savings goal', detail: isServiceFirstBusiness(store) ? 'Saving even 5% of what comes in each week builds a safety net for rent, repairs and emergencies.' : 'Saving even 5% of revenue weekly builds a safety net for rent, restocking, and emergencies.', priority: 'low' });
  }

  return advice.sort((a, b) => {
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return rank[a.priority] - rank[b.priority];
  });
}
