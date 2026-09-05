import type { StoreData } from '@/types/store';
import {
  analyzeSales,
  inventoryIntelligence,
  pricingAlerts,
  forecastHorizon,
  expenseAnalysis,
  topCustomerRequests,
  stockCoverLabel,
} from '@/lib/manager-intel';
import { productMarkup } from '@/lib/pricing-math';

/**
 * Flow Intelligence, answered from this store's own books.
 *
 * The Marketplace version of Flow used to reply with one of four hard-coded
 * strings after a fake 800ms "thinking" delay — quoting invented supplier
 * prices, forecasting an "8% jump due to supplier diesel fuel surcharge", and
 * asserting the merchant's own sales ("You sold 27 Minerals this week") without
 * reading a single row of their data.
 *
 * Everything below is computed from `store` through the existing analytics in
 * manager-intel.ts — the same functions the Manager screen uses — so an answer
 * is either grounded in real sales, stock, cost and expense records, or it says
 * plainly that there is not enough data yet. It never invents a figure.
 */

export interface FlowAnswer {
  /** The headline answer. */
  text: string;
  /** Supporting rows, each already phrased for display. */
  points: string[];
  /** What the merchant can do next, when there is an obvious action. */
  action?: string;
  /** True when the store simply has no data to answer from. */
  needsMoreData?: boolean;
}

const naira = (n: number) => '₦' + Math.round(n).toLocaleString();

/** Products at or near stock-out, most urgent first. */
function restockAnswer(store: StoreData): FlowAnswer {
  const low = inventoryIntelligence(store).filter(f => f.urgency !== 'ok');
  if (low.length === 0) {
    return {
      text: 'Nothing needs restocking right now.',
      points: ['No product is forecast to run out based on your recent sales rate.'],
    };
  }
  const critical = low.filter(f => f.urgency === 'critical');
  return {
    text: critical.length
      ? `${critical.length} ${critical.length === 1 ? 'product runs' : 'products run'} out within days.`
      : `${low.length} ${low.length === 1 ? 'product needs' : 'products need'} restocking soon.`,
    points: low.slice(0, 5).map(f =>
      `${f.product.name} — ${stockCoverLabel(f).toLowerCase()}` +
      (f.restockQty > 0 ? `, reorder around ${f.restockQty}` : '')
    ),
    action: 'Add these to your buy list before your next supplier run.',
  };
}

/** What is actually selling, and what is not. */
function movementAnswer(store: StoreData): FlowAnswer {
  const sales = analyzeSales(store);
  if (sales.fastMovers.length === 0) {
    return {
      text: 'No sales recorded in the last 30 days.',
      points: ['Record a few sales and Flow can tell you what is moving.'],
      needsMoreData: true,
    };
  }
  const points = sales.fastMovers.slice(0, 5).map(m =>
    `${m.name} — ${m.qty} sold, ${naira(m.revenue)}`
  );
  if (sales.slowMovers.length > 0) {
    const s = sales.slowMovers[0];
    points.push(`Slowest: ${s.name} — ${s.qty} sold in ${s.daysInStock} days in stock`);
  }
  if (sales.neverSold.length > 0) {
    points.push(`${sales.neverSold.length} ${sales.neverSold.length === 1 ? 'product has' : 'products have'} never sold`);
  }
  return {
    text: `Your best seller over 30 days is ${sales.fastMovers[0].name}.`,
    points,
    action: sales.neverSold.length > 0
      ? 'Consider discounting or delisting what has never sold.'
      : undefined,
  };
}

/** Margins that are losing the store money. */
function pricingAnswer(store: StoreData): FlowAnswer {
  const alerts = pricingAlerts(store);
  const bad = alerts.filter(a => a.type === 'zero_margin' || a.type === 'underpriced');
  if (bad.length === 0) {
    return {
      text: 'Your margins look healthy.',
      points: ['No product is priced at or below cost.'],
    };
  }
  const zero = bad.filter(a => a.type === 'zero_margin');
  return {
    text: zero.length
      ? `${zero.length} ${zero.length === 1 ? 'product is' : 'products are'} selling at or below cost.`
      : `${bad.length} ${bad.length === 1 ? 'product is' : 'products are'} priced below a healthy margin.`,
    points: bad.slice(0, 5).map(a =>
      `${a.product.name} — costs ${naira(a.product.costPrice)}, sells at ${naira(a.product.sellingPrice)}; ` +
      `${naira(a.suggestedPrice)} would give you 25%`
    ),
    action: 'Adjust these in Inventory to protect your margin.',
  };
}

/** Where the money is going. */
function expenseAnswer(store: StoreData): FlowAnswer {
  const e = expenseAnalysis(store);
  if (e.totalLast30 === 0) {
    return {
      text: 'No expenses recorded in the last 30 days.',
      points: ['Record your expenses and Flow can show you where the money goes.'],
      needsMoreData: true,
    };
  }
  const direction = e.trendPct > 0 ? 'up' : e.trendPct < 0 ? 'down' : 'flat';
  return {
    text: `You spent ${naira(e.totalLast30)} in the last 30 days, ${direction === 'flat' ? 'level with' : `${direction} ${Math.abs(Math.round(e.trendPct))}% on`} the 30 before.`,
    points: e.byCat.slice(0, 5).map(c =>
      `${c.category} — ${naira(c.total)} (${Math.round(c.pct)}% of spend, trending ${c.trend})`
    ),
    action: e.largestCategory ? `${e.largestCategory} is your biggest cost line.` : undefined,
  };
}

/** Near-term revenue and profit, with its own confidence. */
function forecastAnswer(store: StoreData): FlowAnswer {
  const f = forecastHorizon(store, 30);
  if (f.expectedRevenue <= 0) {
    return {
      text: 'Not enough sales history to forecast yet.',
      points: ['Flow needs a few weeks of recorded sales before it can project ahead.'],
      needsMoreData: true,
    };
  }
  return {
    text: `Next 30 days: about ${naira(f.expectedRevenue)} revenue, ${naira(f.expectedProfit)} profit.`,
    points: [
      `Confidence: ${f.confidence} (${Math.round(f.confidencePct)}%)`,
      `Expected expenses: ${naira(f.expectedExpenses)}`,
      ...(f.caveat ? [f.caveat] : []),
    ],
  };
}

/** What shoppers have actually asked this store for. */
function requestsAnswer(store: StoreData): FlowAnswer {
  const reqs = topCustomerRequests(store, 5);
  if (reqs.length === 0) {
    return {
      text: 'No customer requests recorded yet.',
      points: ['When shoppers ask for something you do not stock, log it and Flow will rank it here.'],
      needsMoreData: true,
    };
  }
  return {
    text: `Your customers have asked most for ${reqs[0].text}.`,
    points: reqs.map(r => `${r.text} — asked ${r.count} ${r.count === 1 ? 'time' : 'times'}`),
    action: 'Stocking the top request is usually the quickest win.',
  };
}

/** A named product the merchant asked about, matched against their catalogue. */
function productAnswer(store: StoreData, product: StoreData['products'][number]): FlowAnswer {
  const sales = analyzeSales(store);
  const mover = sales.fastMovers.find(m => m.name === product.name);
  const stock = inventoryIntelligence(store).find(f => f.product.id === product.id);
  const margin = product.costPrice > 0
    ? productMarkup(product) * 100
    : null;

  const points: string[] = [];
  points.push(mover ? `Sold ${mover.qty} in the last 30 days, ${naira(mover.revenue)}` : 'No sales in the last 30 days');
  points.push(`In stock: ${product.quantity}`);
  if (stock && stock.urgency !== 'ok') {
    points.push(stockCoverLabel(stock));
  }
  if (margin !== null) {
    points.push(`Costs ${naira(product.costPrice)}, sells at ${naira(product.sellingPrice)} — ${Math.round(margin)}% margin`);
  }

  return {
    text: `Here is how ${product.name} is doing.`,
    points,
    action: stock && stock.urgency === 'critical' ? `Reorder around ${stock.restockQty}.` : undefined,
  };
}

/**
 * Route a plain-language question to whichever part of the store's own data
 * answers it. Returns null only when the question matches nothing, so the
 * caller can offer suggestions rather than guess.
 */
export function askFlowMarketplace(store: StoreData, query: string): FlowAnswer | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // A product the merchant actually stocks always wins — it is the most
  // specific thing they could be asking about.
  const named = (store.products || []).find(p => {
    const name = String(p.name || '').toLowerCase();
    return name.length > 2 && q.includes(name);
  });
  if (named) return productAnswer(store, named);

  const has = (...words: string[]) => words.some(w => q.includes(w));

  if (has('restock', 'reorder', 'run out', 'running out', 'low stock', 'buy list')) return restockAnswer(store);
  if (has('price', 'pricing', 'margin', 'profit on', 'markup', 'too cheap')) return pricingAnswer(store);
  if (has('expense', 'cost', 'spending', 'spend', 'overhead')) return expenseAnswer(store);
  if (has('forecast', 'predict', 'next month', 'projection', 'expect')) return forecastAnswer(store);
  if (has('request', 'asking', 'customers want', 'demand')) return requestsAnswer(store);
  if (has('trending', 'best sell', 'bestsell', 'selling', 'fast', 'slow', 'moving', 'popular')) return movementAnswer(store);

  return null;
}

/** Questions worth offering, limited to ones this store can actually answer. */
export function flowMarketplaceSuggestions(store: StoreData): string[] {
  const out: string[] = [];
  if (inventoryIntelligence(store).some(f => f.urgency !== 'ok')) out.push('What should I restock?');
  if ((store.sales || []).length > 0) out.push('What is selling best?');
  if (pricingAlerts(store).some(a => a.type === 'zero_margin' || a.type === 'underpriced')) out.push('Are my prices right?');
  if ((store.expenses || []).length > 0) out.push('Where is my money going?');
  if ((store.customerRequests || []).length > 0) out.push('What are customers asking for?');
  if ((store.sales || []).length > 0) out.push('What should I expect next month?');
  return out.slice(0, 4);
}

export interface FlowRecommendation {
  /** Headline, always carrying a figure from this store's own records. */
  headline: string;
  /** One line of reasoning. */
  detail: string;
  /** Labelled figure worth showing prominently, when there is a real one. */
  metric?: { label: string; value: string };
}

/**
 * The single most useful thing Flow can tell this merchant right now.
 *
 * The Marketplace hero card used to read "You sold 27 Minerals this week",
 * "Nearby suppliers currently sell Mineral crates at lower prices" and
 * "Potential savings ₦4,500" — fixed text with fixed figures, shown to every
 * merchant regardless of what they sell or whether they had sold anything at
 * all. This picks the highest-value real insight instead, in priority order:
 * money being lost now, then stock about to run out, then what is working.
 */
export function flowTopRecommendation(store: StoreData): FlowRecommendation {
  // 1. Losing money on every sale is the most urgent thing there is.
  const zero = pricingAlerts(store).filter(a => a.type === 'zero_margin');
  if (zero.length > 0) {
    const worst = zero.reduce((a, b) =>
      (b.product.costPrice - b.product.sellingPrice) > (a.product.costPrice - a.product.sellingPrice) ? b : a);
    const lossPerUnit = worst.product.costPrice - worst.product.sellingPrice;
    return {
      headline: `${worst.product.name} is selling at a loss.`,
      detail: `It costs you ${naira(worst.product.costPrice)} and sells for ${naira(worst.product.sellingPrice)}. ` +
        `${naira(worst.suggestedPrice)} would put you back at a 25% margin.`,
      metric: { label: 'Lost per unit', value: naira(lossPerUnit) },
    };
  }

  // 2. About to run out of something that actually sells.
  const critical = inventoryIntelligence(store).filter(f => f.urgency === 'critical');
  if (critical.length > 0) {
    const sales = analyzeSales(store);
    const ranked = critical
      .map(f => ({ f, sold: sales.fastMovers.find(m => m.name === f.product.name)?.qty ?? 0 }))
      .sort((a, b) => b.sold - a.sold);
    const { f, sold } = ranked[0];
    return {
      headline: f.product.quantity <= 0
        ? `${f.product.name} is out of stock.`
        : `${f.product.name}: ${stockCoverLabel(f).toLowerCase()}.`,
      detail: sold > 0
        ? `You sold ${sold} in the last 30 days. Reorder around ${f.restockQty} to keep cover.`
        : `Reorder around ${f.restockQty} to keep it on the shelf.`,
      metric: { label: 'In stock', value: String(f.product.quantity) },
    };
  }

  // 3. Otherwise, what is working — with the store's own numbers.
  const sales = analyzeSales(store);
  if (sales.fastMovers.length > 0) {
    const top = sales.fastMovers[0];
    return {
      headline: `${top.name} is your best seller.`,
      detail: `${top.qty} sold in the last 30 days${sales.topDay ? `, with ${sales.topDay} your strongest day` : ''}. ` +
        `Keep it stocked and priced where it is.`,
      metric: { label: '30-day revenue', value: naira(top.revenue) },
    };
  }

  return {
    headline: 'Record a few sales to get started.',
    detail: 'Once Flow can see what you sell, it will tell you what to restock, what is losing money, and what to expect next month.',
  };
}
