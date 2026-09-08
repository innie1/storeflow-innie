/**
 * What each thing the shop sells actually earns, and what to do about it.
 *
 * A price set once at opening and never revisited is the commonest quiet loss
 * in a small business: rent rises, detergent rises, the price does not, and
 * the shop works harder every month for less. Nobody notices, because no
 * single job looks wrong.
 *
 * Three rules this follows, because an advisor that breaks them is worse than
 * none:
 *
 * It never changes a price. It proposes, shows the arithmetic, and waits.
 *
 * It says when it does not know. Below enough evidence it reports that it is
 * still learning rather than reasoning from three sales, because a confident
 * recommendation built on nothing is how somebody talks themselves into a
 * price change that costs them customers.
 *
 * It does not pretend to measure demand. Whether a lower price would sell more
 * cannot be known from a shop's own sales history - you only ever see the
 * prices actually charged. So a quiet service is raised as a question for the
 * owner, never as a recommendation to cut.
 */

import type { Product, StoreData } from '@/types/store';
import { getLocalLaundryRecords } from '@/lib/laundry-offline';
import { isServiceFirstBusiness } from '@/lib/business-runtime';
import { monthWindow, breakEven } from '@/lib/laundry-breakeven';
import { estimateUnitCost } from '@/lib/cost-estimator';

/**
 * Enough sales that a margin means something.
 *
 * Below this the shop is still learning what things cost it, and the advisor
 * says so rather than reasoning from a handful of jobs.
 */
export const MIN_SALES_TO_ADVISE = 12;

/** A margin below this share of the price is thin enough to be worth saying. */
const THIN_MARGIN = 0.25;

export type AdviceKind = 'losing' | 'thin' | 'healthy' | 'quiet' | 'learning';

export interface PriceAdvice {
  productId: string;
  name: string;
  kind: AdviceKind;
  price: number;
  /** What one costs the shop. Null when it is not known. */
  unitCost: number | null;
  /** Price less cost. Null when the cost is not known. */
  margin: number | null;
  /** Sold this month. */
  volume: number;
  /** The sentence explaining the finding. */
  why: string;
  /** A price worth considering, or null when none is being proposed. */
  suggested: number | null;
  /** What the suggestion would have been worth at this month's volume. */
  monthlyImpact: number | null;
}

export interface AdvisorState {
  /** True while there is not yet enough trade to reason from. */
  learning: boolean;
  /** How many sales have been seen, against what is needed. */
  seen: number;
  needed: number;
  advice: PriceAdvice[];
  /** What the shop uses up per piece, when a service business. */
  unitCost: number | null;
}

/*
 * Suggestions round up, never to nearest.
 *
 * Rounding to nearest landed the suggested price a hair under the threshold it
 * was calculated to clear: the advisor proposed 204, the owner accepted it,
 * and it immediately called that same price thin - a complaint with no remedy,
 * about its own advice. Found by accepting one.
 */
const round = (value: number) => Math.round(value);
const suggestPrice = (cost: number) => Math.ceil(cost / (1 - THIN_MARGIN));

/** Everything the shop currently offers. */
function sellable(store: StoreData): Product[] {
  return (store.products || []).filter(product => !product.discontinued);
}

/**
 * How many of each thing were sold this month.
 *
 * A laundry's work is in its own records rather than in sales, and it is
 * counted in pieces: one shirt is one, a bundle of twenty is twenty.
 */
function monthlyVolume(store: StoreData): Map<string, number> {
  const volume = new Map<string, number>();
  const window = monthWindow();
  const within = (value: unknown) => {
    const time = new Date(String(value || '')).getTime();
    return Number.isFinite(time) && time >= window.start && time < window.end;
  };

  for (const sale of store.sales || []) {
    if (!within((sale as any).date)) continue;
    for (const item of (sale as any).items || []) {
      const id = String(item.productId || '');
      if (id) volume.set(id, (volume.get(id) || 0) + (Number(item.quantity) || 0));
    }
  }

  const accessCode = String(store.accessCode || '');
  for (const record of accessCode ? getLocalLaundryRecords(accessCode) : []) {
    if (!within(record.createdAt)) continue;
    const id = String(record.serviceId || '');
    if (id) volume.set(id, (volume.get(id) || 0) + (Number(record.pieceCount) || 0));
  }

  return volume;
}

/**
 * What one unit costs the shop.
 *
 * A retailer knows exactly: it is on the product. A service shop does not buy
 * its work in, so the cost is what it uses up doing it - derived from real
 * consumable spending over real pieces, shared across everything it does,
 * because nothing records which soap went on which shirt.
 */
function unitCostFor(store: StoreData, product: Product, sharedCost: number | null): number | null {
  const own = Number(product.costPrice || 0);
  if (own > 0) return own;
  return sharedCost;
}

export function pricingAdvice(store: StoreData): AdvisorState {
  const shared = isServiceFirstBusiness(store) ? estimateUnitCost(store).perPiece : null;
  const volume = monthlyVolume(store);
  const seen = Array.from(volume.values()).reduce((sum, count) => sum + count, 0);
  const products = sellable(store);

  if (seen < MIN_SALES_TO_ADVISE) {
    return {
      learning: true,
      seen,
      needed: MIN_SALES_TO_ADVISE,
      unitCost: shared,
      advice: products.map(product => ({
        productId: String(product.id),
        name: product.name,
        kind: 'learning' as const,
        price: Number(product.sellingPrice || 0),
        unitCost: unitCostFor(store, product, shared),
        margin: null,
        volume: volume.get(String(product.id)) || 0,
        why: `Still learning what this costs you. ${MIN_SALES_TO_ADVISE - seen} more sales and I can tell you whether the price works.`,
        suggested: null,
        monthlyImpact: null,
      })),
    };
  }

  const state = breakEven(store);

  const advice: PriceAdvice[] = products.map(product => {
    const id = String(product.id);
    const price = Number(product.sellingPrice || 0);
    const cost = unitCostFor(store, product, shared);
    const sold = volume.get(id) || 0;
    const margin = cost === null ? null : price - cost;

    if (cost === null || price <= 0) {
      return {
        productId: id, name: product.name, kind: 'learning', price, unitCost: cost,
        margin: null, volume: sold,
        why: 'No cost recorded for this yet, so I cannot say whether the price works.',
        suggested: null, monthlyImpact: null,
      };
    }

    /*
     * Losing money on every one. The strongest thing this can say, and the
     * only case where the suggested price is arithmetic rather than judgement:
     * it is what covers the cost with a quarter left over.
     */
    if (margin! <= 0) {
      const suggested = suggestPrice(cost);
      return {
        productId: id, name: product.name, kind: 'losing', price, unitCost: cost,
        margin, volume: sold,
        why: `Each one costs you about ₦${round(cost).toLocaleString()} and you charge ₦${round(price).toLocaleString()}. You lose money on every one.`,
        suggested,
        monthlyImpact: sold > 0 ? (suggested - price) * sold : null,
      };
    }

    if (margin! / price < THIN_MARGIN) {
      const suggested = suggestPrice(cost);
      return {
        productId: id, name: product.name, kind: 'thin', price, unitCost: cost,
        margin, volume: sold,
        why: `₦${round(margin!).toLocaleString()} of every ₦${round(price).toLocaleString()} is yours. The rest is what it costs to do.`,
        suggested: suggested > price ? suggested : null,
        monthlyImpact: sold > 0 && suggested > price ? (suggested - price) * sold : null,
      };
    }

    /*
     * Sold nothing this month. Raised as a question, never as a suggestion to
     * cut: whether a lower price would sell more cannot be known from a shop's
     * own history, because it only ever contains the prices actually charged.
     */
    if (sold === 0) {
      return {
        productId: id, name: product.name, kind: 'quiet', price, unitCost: cost,
        margin, volume: 0,
        why: 'Nobody has bought this yet this month. Worth asking whether customers know you offer it.',
        suggested: null, monthlyImpact: null,
      };
    }

    return {
      productId: id, name: product.name, kind: 'healthy', price, unitCost: cost,
      margin, volume: sold,
      why: `₦${round(margin!).toLocaleString()} of every ₦${round(price).toLocaleString()} is yours${state.target > 0 ? ', which is helping cover the month' : ''}.`,
      suggested: null, monthlyImpact: null,
    };
  });

  // Worst first: money being lost, then thin, then quiet, then the rest.
  const rank: Record<AdviceKind, number> = { losing: 0, thin: 1, quiet: 2, healthy: 3, learning: 4 };
  advice.sort((a, b) => rank[a.kind] - rank[b.kind] || b.volume - a.volume);

  return { learning: false, seen, needed: MIN_SALES_TO_ADVISE, unitCost: shared, advice };
}

/**
 * What a price would be worth, without changing anything.
 *
 * At this month's volume, which is stated wherever it is shown: it is the only
 * honest basis available, and it is not a forecast. Whether selling more or
 * fewer at the new price is exactly what cannot be known from this data.
 */
export function simulatePrice(item: PriceAdvice, newPrice: number): {
  margin: number | null;
  monthlyChange: number | null;
  marginShare: number | null;
} {
  const price = Math.max(0, Number(newPrice) || 0);
  const margin = item.unitCost === null ? null : price - item.unitCost;
  return {
    margin,
    marginShare: margin === null || price <= 0 ? null : margin / price,
    monthlyChange: item.volume > 0 ? (price - item.price) * item.volume : null,
  };
}
