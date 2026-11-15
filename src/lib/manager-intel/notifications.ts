import { StoreData, FlowNotification } from '@/types/store';
import { getPendingSummary } from '@/lib/store-data';
import { isStoreOnboarding } from './dates';
import { analyzeSales } from './sales';
import { stockCoverLabel, inventoryIntelligence } from './stock';
import { expenseAnalysis } from './costs';
import { healthScore } from './health';
import { restockQualityNote, laundryFlowNote } from './flow-notes';
import { getWeatherInsights } from './seasonal';

/**
 * The season, said once when it starts.
 *
 * This was a card on Flow's Overview that never changed for four months at a
 * stretch: by the second visit it was furniture. A season is news on the day
 * it begins, so it is a notice now - one per season, in the bell, read once.
 * Its id carries the season and the year it began, so the next season raises
 * its own and the same one is never raised twice.
 */
export function seasonNotice(store: StoreData, now: string): FlowNotification | null {
  if (store.managerSettings?.weatherImpactEnabled === false) return null;
  const date = new Date(now);
  const insight = getWeatherInsights(store, date);
  if (!insight) return null;
  // Harmattan runs November to February: January belongs to the season that began last year.
  const began = date.getMonth() <= 1 ? date.getFullYear() - 1 : date.getFullYear();
  const slug = insight.weatherCondition.toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/[^a-z]+/g, '-');
  return {
    id: `season-${slug}-${began}`,
    icon: '✨',
    text: `${insight.weatherCondition}: ${insight.effect}`,
    tone: 'info',
    date: now,
    read: false,
    title: insight.weatherCondition,
    description: `${insight.effect} ${insight.suggestedAction}`,
  };
}

export function generateNotifications(store: StoreData): FlowNotification[] {
  if (isStoreOnboarding(store)) {
    return [];
  }
  const notes: FlowNotification[] = [];
  const now = new Date().toISOString();
  const stock = inventoryIntelligence(store);
  const analysis = analyzeSales(store);
  // Restock cost is COGS, not overspending — keep it out of the "expenses
  // spiking" trend so a healthy restock never fires an "Expense Alert".
  const ea = expenseAnalysis(store, ['Restock']);
  const h = healthScore(store);
  const pending = getPendingSummary(store);

  // Listed here as well as raised for the whole app, so this screen knows it is
  // still this week's and does not tidy it away once read.
  const flowNote = laundryFlowNote(store, now);
  if (flowNote) notes.push(flowNote);

  const season = seasonNotice(store, now);
  if (season) notes.push(season);

  stock.filter(f => f.urgency === 'critical').forEach(f => {
    notes.push({
      id: `low-${f.product.id}`,
      icon: '🚨',
      text: `${f.product.name}: ${stockCoverLabel(f)}.`,
      tone: 'danger',
      date: now,
      read: false,
      title: 'Restock Alert (Critical)',
      description: `${f.product.name}: ${stockCoverLabel(f)}.`,
      // Carries the product, so the alert opens that product rather than
      // dropping the merchant on the inventory list to find it themselves.
      actionLabel: `Open ${f.product.name}`,
      actionTab: 'inventory',
      actionParam: `product:${f.product.id}`
    });
  });
  stock.filter(f => f.urgency === 'soon').slice(0, 3).forEach(f => {
    notes.push({
      id: `soon-${f.product.id}`,
      icon: '📦',
      text: `${f.product.name}: ${stockCoverLabel(f)}.`,
      tone: 'warning',
      date: now,
      read: false,
      title: 'Restock Suggestion',
      description: `${f.product.name}: ${stockCoverLabel(f)}.`,
      actionLabel: `Open ${f.product.name}`,
      actionTab: 'inventory',
      actionParam: `product:${f.product.id}`
    });
  });
  if (ea.trendPct > 25) {
    notes.push({
      id: 'exp-spike',
      icon: '🧾',
      text: `Expenses up ${ea.trendPct.toFixed(0)}% this month. Review your ${ea.largestCategory.toLowerCase()} spending.`,
      tone: 'warning',
      date: now,
      read: false,
      title: 'Expense Alert',
      description: `Expenses up ${ea.trendPct.toFixed(0)}% this month. Review your ${ea.largestCategory.toLowerCase()} spending.`,
      actionLabel: 'View Expenses',
      actionTab: 'expenses'
    });
  }
  // Smart, per-batch restock feedback — praises healthy restocking of
  // products that sell, and only cautions when the restock actually went
  // toward dead/slow stock. Replaces the old blanket "spending is high"
  // reaction that fired on every restock regardless of what was bought.
  const restockNote = restockQualityNote(store);
  if (restockNote) notes.push(restockNote);
  if (h.overall >= 80) {
    notes.push({
      id: 'health-great',
      icon: '🌟',
      text: `Store health is ${h.overall}/100 — great job keeping things on track!`,
      tone: 'success',
      date: now,
      read: false,
      title: 'Store Thriving!',
      description: `Store health is ${h.overall}/100 — great job keeping things on track!`,
      actionLabel: 'View Report',
      actionTab: 'dashboard'
    });
  } else if (h.overall < 40) {
    notes.push({
      id: 'health-low',
      icon: '⚠️',
      text: `Store health dropped to ${h.overall}/100. Check the advice tab.`,
      tone: 'danger',
      date: now,
      read: false,
      title: 'Health Warning',
      description: `Store health dropped to ${h.overall}/100. Check the advice tab.`,
      actionLabel: 'View Advice',
      actionTab: 'dashboard'
    });
  }
  if (pending.overdue.length > 0) {
    notes.push({
      id: 'overdue',
      icon: '💳',
      text: `${pending.overdue.length} customer${pending.overdue.length > 1 ? 's are' : ' is'} overdue on payments.`,
      tone: 'warning',
      date: now,
      read: false,
      title: 'Overdue Debts',
      description: `${pending.overdue.length} customer${pending.overdue.length > 1 ? 's are' : ' is'} overdue on payments.`,
      actionLabel: 'Chase Payments',
      actionTab: 'pending'
    });
  }
  if (analysis.neverSold.length >= 5) {
    notes.push({
      id: 'dead-stock',
      icon: '😴',
      text: `${analysis.neverSold.length} products have never been sold. Consider moving them out.`,
      tone: 'info',
      date: now,
      read: false,
      title: 'Dead Stock Notice',
      description: `${analysis.neverSold.length} products have never been sold. Consider moving them out.`,
      actionLabel: 'Clean Inventory',
      actionTab: 'inventory'
    });
  }
  return notes;
}
