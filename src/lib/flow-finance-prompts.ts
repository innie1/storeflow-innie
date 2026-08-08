import { FlowFinanceSnapshot, FlowRestockSuggestion } from './flow-finance';

const money = (value: number) => `₦${Math.round(value || 0).toLocaleString()}`;

export function financeSummary(snapshot: FlowFinanceSnapshot): string {
  return [
    `Revenue: ${money(snapshot.revenue)}`,
    `Gross profit: ${money(snapshot.grossProfit)}`,
    `Expenses: ${money(snapshot.operatingExpenses)}`,
    `Net profit: ${money(snapshot.netProfit)}`,
    `Still owed: ${money(snapshot.pendingBalance)}`,
  ].join(' • ');
}

export function restockSummary(items: FlowRestockSuggestion[]): string {
  if (!items.length) return 'Your current stock levels are above their reorder levels. Nothing needs urgent restocking.';
  const shown = items.slice(0, 5).map(item => `${item.productName} (${item.currentStock} left, suggest ${item.suggestedQuantity})`);
  const more = items.length > shown.length ? ` +${items.length - shown.length} more` : '';
  return `I found ${items.length} item${items.length === 1 ? '' : 's'} to review: ${shown.join(', ')}${more}.`;
}
