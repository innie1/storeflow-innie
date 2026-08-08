import { Product, StoreData, TabId } from '@/types/store';

/**
 * Flow Brain
 *
 * A completely local, deterministic command/intent layer for FlowChat.
 * No API, model, network request, or external service is used here.
 *
 * The brain has four jobs:
 * 1. Understand what the merchant is trying to do.
 * 2. Resolve product names against the real store catalog (including aliases).
 * 3. Turn the store data into useful business context and priorities.
 * 4. Return a safe, structured plan that the UI can execute/confirm.
 *
 * Keep execution in the UI/store-data layer. This module decides WHAT should
 * happen; it does not mutate the store by itself.
 */

export type FlowIntent =
  | 'store_overview'
  | 'product_lookup'
  | 'sell'
  | 'add_product'
  | 'edit_product'
  | 'restock'
  | 'mark_out_of_stock'
  | 'discount'
  | 'remove_product'
  | 'inventory'
  | 'pricing'
  | 'sales'
  | 'slow_products'
  | 'customers'
  | 'expenses'
  | 'cash'
  | 'improvement'
  | 'navigation'
  | 'settings'
  | 'help'
  | 'unknown';

export interface ProductMatch {
  product: Product;
  score: number;
  matchedBy: 'exact' | 'alias' | 'word' | 'fuzzy';
}

export interface FlowPlan {
  intent: FlowIntent;
  confidence: number;
  product?: ProductMatch;
  productName?: string;
  quantity?: number;
  amount?: number;
  percentage?: number;
  tab?: TabId;
  fields?: Partial<Pick<Product, 'name' | 'costPrice' | 'sellingPrice' | 'quantity' | 'category'>>;
  needsConfirmation: boolean;
  reason: string;
}

export interface StoreSnapshot {
  productCount: number;
  activeProductCount: number;
  stockUnits: number;
  outOfStock: Product[];
  lowStock: Product[];
  revenue30: number;
  revenue7: number;
  previousRevenue7: number;
  profit30: number;
  profit7: number;
  sales30: number;
  unitsSold30: number;
  expenses30: number;
  pendingDebt: number;
  topSellers: { product: Product; units: number; revenue: number }[];
  deadStock: Product[];
  underpriced: Product[];
}

export interface FlowPriority {
  level: 'urgent' | 'important' | 'opportunity';
  title: string;
  detail: string;
  productId?: string;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'my', 'me', 'please', 'product', 'item', 'store',
  'stock', 'inventory', 'now', 'today', 'please', 'for', 'of', 'to', 'on',
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value: string): string[] {
  return normalize(value).split(' ').filter(Boolean).filter(t => !STOP_WORDS.has(t));
}

function editDistance(a: string, b: string): number {
  const aa = normalize(a);
  const bb = normalize(b);
  if (!aa) return bb.length;
  if (!bb) return aa.length;
  const prev = Array.from({ length: bb.length + 1 }, (_, i) => i);
  for (let i = 1; i <= aa.length; i++) {
    const cur = [i];
    for (let j = 1; j <= bb.length; j++) {
      cur[j] = aa[i - 1] === bb[j - 1]
        ? prev[j - 1]
        : Math.min(prev[j - 1] + 1, prev[j] + 1, cur[j - 1] + 1);
    }
    for (let j = 0; j < cur.length; j++) prev[j] = cur[j];
  }
  return prev[bb.length];
}

function similarity(a: string, b: string): number {
  const aa = normalize(a);
  const bb = normalize(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.includes(bb) || bb.includes(aa)) return 0.92;
  const ta = new Set(tokens(aa));
  const tb = new Set(tokens(bb));
  const overlap = [...ta].filter(x => tb.has(x)).length;
  const union = new Set([...ta, ...tb]).size || 1;
  const jaccard = overlap / union;
  const maxLen = Math.max(aa.length, bb.length);
  const fuzzy = maxLen ? 1 - editDistance(aa, bb) / maxLen : 0;
  return Math.max(jaccard * 0.9, fuzzy * 0.8);
}

function productNames(product: Product): string[] {
  return [product.name, ...(product.voiceAliases || [])].filter(Boolean);
}

/** Resolve a merchant's wording to the real catalog item. */
export function resolveProduct(store: StoreData, query: string): ProductMatch | null {
  const q = normalize(query);
  if (!q) return null;
  let best: ProductMatch | null = null;

  for (const product of store.products || []) {
    for (const name of productNames(product)) {
      const n = normalize(name);
      if (n === q) return { product, score: 1, matchedBy: name === product.name ? 'exact' : 'alias' };

      const score = similarity(q, n);
      const wordMatch = tokens(q).length > 0 && tokens(q).every(t => tokens(n).includes(t));
      const finalScore = wordMatch ? Math.max(score, 0.94) : score;
      if (!best || finalScore > best.score) {
        best = {
          product,
          score: finalScore,
          matchedBy: wordMatch ? 'word' : 'fuzzy',
        };
      }
    }
  }

  // Avoid dangerous guesses. A product should be considered resolved only
  // when the match is genuinely strong.
  return best && best.score >= 0.68 ? best : null;
}

function numberAfter(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(value)) return value;
    }
  }
  return undefined;
}

function extractProductText(text: string): string | null {
  const patterns = [
    /^(?:how is|how's|tell me about|what about|show me)\s+(.+?)(?:\s+(?:doing|performing|selling))?\??$/i,
    /^(?:sell|sale|restock|receive|add|remove|delete|edit|update|change|discount|mark)\s+(?:\d+\s+)?(.+?)\s*$/i,
    /^(.+?)\s+(?:performance|sales|stock|price|pricing)\??$/i,
  ];
  for (const pattern of patterns) {
    const match = text.trim().match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

const NAVIGATION: Array<{ words: string[]; tab: TabId }> = [
  { words: ['dashboard', 'home', 'overview'], tab: 'dashboard' },
  { words: ['inventory', 'stock', 'products'], tab: 'inventory' },
  { words: ['sell', 'sales', 'pos'], tab: 'sales' },
  { words: ['history', 'sales history'], tab: 'history' },
  { words: ['expenses', 'expense'], tab: 'expenses' },
  { words: ['settings', 'setting'], tab: 'settings' },
  { words: ['orders', 'order'], tab: 'orders' },
  { words: ['customers', 'customer'], tab: 'customers' },
  { words: ['suppliers', 'supplier'], tab: 'suppliers' },
  { words: ['goals', 'goal'], tab: 'goals' },
  { words: ['finance', 'finances'], tab: 'finance' },
  { words: ['reports', 'report'], tab: 'reports' },
  { words: ['staff', 'employees', 'team'], tab: 'staff' },
  { words: ['cash drawer', 'cash'], tab: 'cash-drawer' },
  { words: ['wishlist', 'wish list'], tab: 'wishlist' },
  { words: ['profile'], tab: 'profile' },
];

function navigationFor(text: string): TabId | undefined {
  const q = normalize(text);
  if (!/^(open|go to|show|take me to|navigate to)\b/.test(q)) return undefined;
  return NAVIGATION.find(n => n.words.some(word => q.includes(word)))?.tab;
}

function parseFields(text: string): Partial<Pick<Product, 'name' | 'costPrice' | 'sellingPrice' | 'quantity' | 'category'>> {
  const fields: Partial<Pick<Product, 'name' | 'costPrice' | 'sellingPrice' | 'quantity' | 'category'>> = {};
  const clean = text.trim();
  const name = clean.match(/(?:name|called)\s*[:=]?\s*([^,;]+?)(?=\s+(?:cost|price|sell|selling|qty|quantity|category)\b|[,;]|$)/i);
  const cost = clean.match(/(?:cost|buy|buying)\s*(?:price)?\s*[:=]?\s*₦?([\d,]+(?:\.\d+)?)/i);
  const selling = clean.match(/(?:sell|selling)\s*(?:price)?\s*[:=]?\s*₦?([\d,]+(?:\.\d+)?)/i);
  const quantity = clean.match(/(?:qty|quantity|stock)\s*[:=]?\s*(\d+)/i);
  const category = clean.match(/category\s*[:=]?\s*([^,;]+)$/i);
  if (name) fields.name = name[1].trim();
  if (cost) fields.costPrice = Number(cost[1].replace(/,/g, ''));
  if (selling) fields.sellingPrice = Number(selling[1].replace(/,/g, ''));
  if (quantity) fields.quantity = Number(quantity[1]);
  if (category) fields.category = category[1].trim();
  return fields;
}

/** Convert natural-ish local text into a safe action plan. */
export function understand(store: StoreData, raw: string): FlowPlan {
  const text = raw.trim();
  const q = normalize(text);
  const productQuery = extractProductText(text);
  const product = productQuery ? resolveProduct(store, productQuery) : null;
  const nav = navigationFor(text);

  if (!q) return { intent: 'unknown', confidence: 0, needsConfirmation: false, reason: 'empty input' };
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(q)) {
    return { intent: 'store_overview', confidence: 0.95, needsConfirmation: false, reason: 'greeting should surface a useful store snapshot' };
  }
  if (nav) return { intent: 'navigation', confidence: 0.99, tab: nav, needsConfirmation: false, reason: 'explicit navigation command' };
  if (/\b(?:dark|light|system)\s+mode\b|\bturn (?:on|off) voice\b/.test(q)) {
    return { intent: 'settings', confidence: 0.98, needsConfirmation: false, reason: 'reversible local setting change' };
  }
  if (/^(?:what|how).*\b(?:store|business)\b|\bhow'?s my store\b|\bmy store\b.*\b(?:doing|performance|health)\b/.test(q)) {
    return { intent: 'store_overview', confidence: 0.99, needsConfirmation: false, reason: 'merchant asked for business-level context, not a product lookup' };
  }
  if (/\b(?:what should i|what do i need to)\s+restock\b|\brestock\b.*\b(?:suggest|recommend|need)\b/.test(q)) {
    return { intent: 'inventory', confidence: 0.96, needsConfirmation: false, reason: 'merchant wants a restock recommendation' };
  }
  if (/\b(?:what'?s|what is)\s+(?:not selling|slow|dead)\b|\bslow (?:moving|sellers?)\b|\bdead stock\b/.test(q)) {
    return { intent: 'slow_products', confidence: 0.96, needsConfirmation: false, reason: 'merchant wants slow/dead inventory analysis' };
  }
  if (/\b(?:pricing|price|margin|underpriced|overpriced)\b/.test(q) && !/\b(?:discount|off)\b/.test(q)) {
    return { intent: 'pricing', confidence: 0.9, product: product || undefined, productName: productQuery || undefined, needsConfirmation: false, reason: 'merchant is asking for pricing intelligence' };
  }
  if (/\b(?:sales|revenue|selling|sold)\b/.test(q) && /\b(?:how|why|what|show|today|week|month)\b/.test(q)) {
    return { intent: 'sales', confidence: 0.88, product: product || undefined, productName: productQuery || undefined, needsConfirmation: false, reason: 'merchant wants sales performance' };
  }
  if (/\b(?:customers?|buyers?)\b/.test(q)) return { intent: 'customers', confidence: 0.9, needsConfirmation: false, reason: 'customer/business relationship query' };
  if (/\b(?:expense|expenses|spending|costs?)\b/.test(q)) return { intent: 'expenses', confidence: 0.9, needsConfirmation: false, reason: 'expense query' };
  if (/\b(?:cash|balance|money in the business|bank)\b/.test(q)) return { intent: 'cash', confidence: 0.88, needsConfirmation: false, reason: 'cash/balance query' };
  if (/\b(?:improve|improvement|grow|growth|idea|ideas|advice|recommend)\b/.test(q)) return { intent: 'improvement', confidence: 0.92, needsConfirmation: false, reason: 'merchant wants actionable growth advice' };

  const saleQty = numberAfter(text, [/(?:sell|sold|sale)\s+(?:me\s+)?(\d+)\s+/i, /(?:\bx\s*)(\d+)\b/i]);
  if (/^(?:sell|i sold|record sale)\b/i.test(text)) {
    return {
      intent: 'sell', confidence: product ? 0.96 : 0.78, product, productName: productQuery || undefined,
      quantity: saleQty || 1, needsConfirmation: true,
      reason: product ? 'sale command resolved to a real catalog item' : 'sale needs a product before execution',
    };
  }

  const restockQty = numberAfter(text, [/\b(?:restock|receive|add)\s+(.+?)\s+(?:by\s+)?(\d+)\b/i]);
  if (/\b(?:restock|receive)\b/.test(q)) {
    return { intent: 'restock', confidence: product ? 0.97 : 0.78, product, productName: productQuery || undefined, quantity: restockQty || 1, needsConfirmation: true, reason: 'restocking changes inventory and may spend money' };
  }
  if (/\b(?:mark|set)\b.*\b(?:out of stock|sold out)\b/.test(q)) {
    return { intent: 'mark_out_of_stock', confidence: product ? 0.97 : 0.78, product, productName: productQuery || undefined, quantity: 0, needsConfirmation: false, reason: 'inventory availability change is reversible and non-financial' };
  }
  const discount = numberAfter(text, [/\b(\d{1,2})\s*%\s*(?:off|discount)\b/i]);
  if (discount !== undefined || /\bdiscount\b|\boff\b/.test(q)) {
    return { intent: 'discount', confidence: product ? 0.97 : 0.78, product, productName: productQuery || undefined, percentage: discount, needsConfirmation: true, reason: 'changing a customer price requires confirmation' };
  }
  if (/\b(?:add|create)\b.*\b(?:product|item)\b/.test(q)) {
    return { intent: 'add_product', confidence: 0.96, fields: parseFields(text), needsConfirmation: true, reason: 'adding a product changes the catalog' };
  }
  if (/\b(?:edit|update|change)\b.*\b(?:product|item|price|stock|category)\b/.test(q)) {
    return { intent: 'edit_product', confidence: product ? 0.95 : 0.76, product, productName: productQuery || undefined, fields: parseFields(text), needsConfirmation: true, reason: 'editing catalog data should be confirmed' };
  }
  if (/\b(?:remove|delete|discontinue)\b.*\b(?:product|item)\b/.test(q)) {
    return { intent: 'remove_product', confidence: product ? 0.95 : 0.76, product, productName: productQuery || undefined, needsConfirmation: true, reason: 'destructive catalog action' };
  }
  if (product) return { intent: 'product_lookup', confidence: product.score, product, productName: product.product.name, needsConfirmation: false, reason: 'input resolved to a known product' };

  return { intent: 'help', confidence: 0.55, needsConfirmation: false, reason: 'no safe command match; answer with store-aware help instead of claiming a product is missing' };
}

function daysAgo(date: string | Date, days: number): boolean {
  const d = new Date(date).getTime();
  return Number.isFinite(d) && d >= Date.now() - days * 86400000;
}

function revenue(sales: StoreData['sales'], days: number): number {
  return sales.filter(s => daysAgo(s.date, days)).reduce((sum, s) => sum + s.total, 0);
}

function profit(sales: StoreData['sales'], days: number): number {
  return sales.filter(s => daysAgo(s.date, days)).reduce((sum, s) => sum + s.profit, 0);
}

/** One cheap, reusable snapshot so every answer starts from the same store truth. */
export function snapshot(store: StoreData): StoreSnapshot {
  const active = (store.products || []).filter(p => !p.discontinued);
  const threshold = store.managerSettings?.minStockThreshold ?? store.managerSettings?.criticalStockThreshold ?? 5;
  const sales30 = (store.sales || []).filter(s => daysAgo(s.date, 30));
  const sales7 = sales30.filter(s => daysAgo(s.date, 7));
  const previous7 = sales30.filter(s => {
    const t = new Date(s.date).getTime();
    return t >= Date.now() - 14 * 86400000 && t < Date.now() - 7 * 86400000;
  });
  const unitsByProduct = new Map<string, number>();
  const revenueByProduct = new Map<string, number>();
  for (const sale of sales30) {
    unitsByProduct.set(sale.productId, (unitsByProduct.get(sale.productId) || 0) + sale.quantity);
    revenueByProduct.set(sale.productId, (revenueByProduct.get(sale.productId) || 0) + sale.total);
  }
  const topSellers = active
    .map(product => ({ product, units: unitsByProduct.get(product.id) || 0, revenue: revenueByProduct.get(product.id) || 0 }))
    .filter(x => x.units > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const deadStock = active
    .filter(p => (unitsByProduct.get(p.id) || 0) === 0 && p.quantity > 0)
    .sort((a, b) => b.quantity * b.costPrice - a.quantity * a.costPrice)
    .slice(0, 10);
  const underpriced = active.filter(p => p.sellingPrice > 0 && p.costPrice > 0 && (p.sellingPrice - p.costPrice) / p.sellingPrice < 0.15);
  const outOfStock = active.filter(p => p.quantity <= 0);
  const lowStock = active.filter(p => p.quantity > 0 && p.quantity <= threshold);
  const stockUnits = active.reduce((sum, p) => sum + Math.max(0, p.quantity || 0), 0);
  const expenses30 = (store.expenses || []).filter(e => daysAgo(e.date, 30)).reduce((sum, e) => sum + e.amount, 0);
  const pendingDebt = (store.pendingPayments || []).filter(p => p.status === 'pending').reduce((sum, p) => sum + Math.max(0, p.balance), 0);

  return {
    productCount: (store.products || []).length,
    activeProductCount: active.length,
    stockUnits,
    outOfStock,
    lowStock,
    revenue30: revenue(store.sales || [], 30),
    revenue7: revenue(store.sales || [], 7),
    previousRevenue7: previous7.reduce((sum, s) => sum + s.total, 0),
    profit30: profit(store.sales || [], 30),
    profit7: profit(store.sales || [], 7),
    sales30: sales30.length,
    unitsSold30: sales30.reduce((sum, s) => sum + s.quantity, 0),
    expenses30,
    pendingDebt,
    topSellers,
    deadStock,
    underpriced,
  };
}

/** Ranked recommendations — the assistant's local "what should I do next?" brain. */
export function priorities(store: StoreData): FlowPriority[] {
  const s = snapshot(store);
  const result: FlowPriority[] = [];
  const weekGrowth = s.previousRevenue7 > 0 ? (s.revenue7 - s.previousRevenue7) / s.previousRevenue7 : 0;

  for (const p of s.outOfStock.slice(0, 5)) {
    const sold = (store.sales || []).filter(x => x.productId === p.id && daysAgo(x.date, 30)).reduce((sum, x) => sum + x.quantity, 0);
    result.push({ level: sold >= 5 ? 'urgent' : 'important', title: `Restock ${p.name}`, detail: sold > 0 ? `${sold} units sold in 30 days and stock is now zero.` : `${p.name} is unavailable; decide whether to restock or discontinue it.`, productId: p.id });
  }
  for (const p of s.lowStock.slice(0, 5)) {
    if (result.some(x => x.productId === p.id)) continue;
    const sold = (store.sales || []).filter(x => x.productId === p.id && daysAgo(x.date, 30)).reduce((sum, x) => sum + x.quantity, 0);
    result.push({ level: sold >= 5 ? 'urgent' : 'important', title: `Watch ${p.name}`, detail: `Only ${p.quantity} left${sold ? ` after ${sold} sold in 30 days` : ''}.`, productId: p.id });
  }
  for (const p of s.underpriced.slice(0, 5)) {
    const margin = p.sellingPrice > 0 ? ((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100 : 0;
    result.push({ level: 'opportunity', title: `Review ${p.name}'s price`, detail: `Current gross margin is only ${margin.toFixed(0)}%. Check competitors and your target margin before changing it.`, productId: p.id });
  }
  for (const p of s.deadStock.slice(0, 5)) {
    result.push({ level: 'opportunity', title: `Move ${p.name}`, detail: `No units sold in the last 30 days while ${p.quantity} remain. Consider a promotion, bundle, or discontinuation.`, productId: p.id });
  }
  if (s.pendingDebt > 0) result.push({ level: 'important', title: 'Collect outstanding payments', detail: `₦${s.pendingDebt.toLocaleString()} is currently owed by customers.` });
  if (weekGrowth < -0.15 && s.revenue7 > 0) result.push({ level: 'important', title: 'Investigate the sales drop', detail: `Revenue is down ${Math.abs(weekGrowth * 100).toFixed(0)}% versus the previous 7 days. Check stockouts, pricing changes and your best sellers.` });
  if (result.length === 0) result.push({ level: 'opportunity', title: 'Improve your best sellers', detail: s.topSellers[0] ? `${s.topSellers[0].product.name} is your strongest seller over 30 days. Protect its stock and test a small margin improvement before changing slower products.` : 'Start recording sales consistently. Flow will learn which products and categories deserve more attention.' });

  const rank = { urgent: 0, important: 1, opportunity: 2 } as const;
  return result.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, 10);
}

export function storeBrief(store: StoreData): string {
  const s = snapshot(store);
  const p = priorities(store)[0];
  const weekChange = s.previousRevenue7 > 0 ? ((s.revenue7 - s.previousRevenue7) / s.previousRevenue7) * 100 : null;
  const lines = [
    `**${store.storeName || 'Your store'}**`,
    `${s.activeProductCount} active products · ${s.stockUnits} units in stock`,
    `Last 7 days: ₦${s.revenue7.toLocaleString()} revenue · ₦${s.profit7.toLocaleString()} profit${weekChange === null ? '' : ` · ${weekChange >= 0 ? '+' : ''}${weekChange.toFixed(0)}% vs previous 7 days`}`,
    `Last 30 days: ₦${s.revenue30.toLocaleString()} revenue · ${s.unitsSold30} units sold · ₦${s.expenses30.toLocaleString()} expenses`,
    `${s.outOfStock.length} out of stock · ${s.lowStock.length} low stock · ${s.deadStock.length} with no sale in 30 days`,
    s.pendingDebt > 0 ? `Customer debt: ₦${s.pendingDebt.toLocaleString()}` : 'Customer debt: none outstanding',
    p ? `**Next best action:** ${p.title} — ${p.detail}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export function productBrief(product: Product, store: StoreData): string {
  const sales = (store.sales || []).filter(s => s.productId === product.id);
  const last30 = sales.filter(s => daysAgo(s.date, 30));
  const units30 = last30.reduce((sum, s) => sum + s.quantity, 0);
  const revenue30 = last30.reduce((sum, s) => sum + s.total, 0);
  const margin = product.sellingPrice > 0 ? ((product.sellingPrice - product.costPrice) / product.sellingPrice) * 100 : 0;
  const aliases = product.voiceAliases?.length ? ` · also known as ${product.voiceAliases.join(', ')}` : '';
  return `**${product.name}**${aliases}\nStock: ${product.quantity} · Sold (30d): ${units30} · Revenue (30d): ₦${revenue30.toLocaleString()} · Margin: ${margin.toFixed(0)}%\nCost: ₦${product.costPrice.toLocaleString()} · Selling: ₦${product.sellingPrice.toLocaleString()}${product.promoPrice ? ` · Promo: ₦${product.promoPrice.toLocaleString()}` : ''}`;
}
