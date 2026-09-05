import { Product } from '@/types/store';

/**
 * Margin and markup, defined once.
 *
 * The app used the word "margin" for two different formulas. manager-intel,
 * both dashboards and the marketplace intel divided profit by COST — that is
 * markup. SmartRestockEngine, the Sell screen, the buy list and the Get Advice
 * report divided by SELLING PRICE — that is margin. On the same product the two
 * disagree, and both were shown to the merchant as "margin": at ₦70,000 cost
 * and ₦87,500 selling, one screen said 25% and another said 20%.
 *
 * The formulas were not the problem — the pricing advice genuinely wants
 * markup, because every price it suggests is built as cost × (1 + target), and
 * "what do I add on top of what I paid" is how a shopkeeper prices. Only the
 * naming was wrong. So both live here, each under its own name, and callers
 * say which they mean.
 */

/** Profit as a share of the selling price. The accounting definition. */
export function marginRatio(sellingPrice: number, costPrice: number): number {
  if (!sellingPrice || sellingPrice <= 0) return 0;
  return (sellingPrice - costPrice) / sellingPrice;
}

/** Profit as a share of what was paid for it — what you added on top. */
export function markupRatio(sellingPrice: number, costPrice: number): number {
  if (!costPrice || costPrice <= 0) return 0;
  return (sellingPrice - costPrice) / costPrice;
}

export const productMargin = (p: Pick<Product, 'sellingPrice' | 'costPrice'>) =>
  marginRatio(p.sellingPrice, p.costPrice);

export const productMarkup = (p: Pick<Product, 'sellingPrice' | 'costPrice'>) =>
  markupRatio(p.sellingPrice, p.costPrice);

/** Cash profit on one unit. The figure a shopkeeper actually acts on. */
export const unitProfit = (p: Pick<Product, 'sellingPrice' | 'costPrice'>) =>
  p.sellingPrice - p.costPrice;

/** "20% margin · 25% markup" — both, so neither can be mistaken for the other. */
export function describePricing(p: Pick<Product, 'sellingPrice' | 'costPrice'>): string {
  return `${Math.round(productMargin(p) * 100)}% margin · ${Math.round(productMarkup(p) * 100)}% markup`;
}
