import { StoreData, Product } from '@/types/store';
import { getLowStockThreshold } from '@/lib/settings';
import { daysAgo } from './dates';

// ─── Inventory Intelligence ───────────────────────────────────────────────────
export interface StockForecast {
  product: Product;
  perDay: number;
  /**
   * Days of cover at the recent sales rate. Infinity when nothing has sold in
   * the window — there is no rate to divide by. Check `hasVelocity` before
   * showing this to anyone; formatting it directly is what produced
   * "Infinityd left · order 10" on the advice cards.
   */
  daysLeft: number;
  /** False when the product has not sold at all in the last 14 days. */
  hasVelocity: boolean;
  /**
   * Whether reordering is justified by demand.
   *
   * A product sitting on the shelf with no sales for a fortnight is not short
   * of stock, it is short of buyers; reordering converts cash into more dead
   * stock. One that sold out is the exception — it shows no recent sales
   * precisely because there was nothing left to sell, so its own history
   * decides.
   */
  worthRestocking: boolean;
  restockQty: number;
  urgency: 'critical' | 'soon' | 'ok';
  /** Profit on one unit, at the current prices. */
  unitProfit: number;
  /**
   * Profit the shop stops earning for each day this product is unavailable —
   * demand times margin.
   *
   * Ranking used to be days-of-cover alone, which says nothing about whether
   * running out matters. A sold-out product scored 0 days left whether it
   * shifts twenty a day at a good margin or sold one unit last quarter, so
   * the two sat side by side at the top of the restock list.
   */
  dailyProfitAtRisk: number;
}

/**
 * How much cover is left, in words, for anywhere this is shown to a merchant.
 *
 * A product can be low on stock and still have no demand behind it. Saying
 * "Infinity days left" was the visible bug; the quieter one was implying a
 * restock quantity for something that has not sold in a fortnight.
 */
export function stockCoverLabel(f: StockForecast, opts?: { short?: boolean }): string {
  const short = opts?.short === true;
  if (f.product.quantity <= 0) {
    return f.worthRestocking ? 'Sold out' : (short ? 'Sold out · never sold' : 'Sold out, and it has never sold');
  }
  if (!f.hasVelocity) return short ? 'Not selling' : 'Low stock, but nothing sold in the last 14 days';
  const days = Math.max(0, Math.floor(f.daysLeft));
  if (days === 0) return short ? 'Runs out today' : 'Running out today';
  return short ? `${days}d left` : `About ${days} day${days === 1 ? '' : 's'} of stock left`;
}

/** Sorts soonest-to-run-out first. Infinity - Infinity is NaN, which makes a
 *  comparator inconsistent, so equal values are compared, not subtracted. */
export function byDaysLeft(a: StockForecast, b: StockForecast) {
  if (a.daysLeft === b.daysLeft) return 0;
  return a.daysLeft < b.daysLeft ? -1 : 1;
}

/**
 * Products worth reordering first, then by what each day without them costs.
 *
 * A product nobody is buying is never urgent however empty the shelf is, so it
 * sorts below everything that is actually moving rather than being dropped —
 * the merchant can still see it is out.
 */
export function byMoneyAtRisk(a: StockForecast, b: StockForecast) {
  if (a.worthRestocking !== b.worthRestocking) return a.worthRestocking ? -1 : 1;
  if (a.dailyProfitAtRisk !== b.dailyProfitAtRisk) return b.dailyProfitAtRisk - a.dailyProfitAtRisk;
  return byDaysLeft(a, b);
}

// Shared by inventoryIntelligence() (restock suggestions) AND healthScore()
// (inventory factor) so the two features are always computed from the same
// numbers and can never disagree about whether a product's stock is fine.
// Unlike inventoryIntelligence(), this does NOT filter out 'ok' products —
// callers that need "what's low" should filter the result themselves.
/** How far back a sale still counts as evidence that a product sells. */
export const RECENT_DEMAND_DAYS = 60;

export function computeStockForecasts(store: StoreData): StockForecast[] {
  const threshold = getLowStockThreshold();
  return store.products
    .filter(p => !p.discontinued)
    .map(p => {
      const sold14 = store.sales
        .filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(13))
        .reduce((sum, s) => sum + s.quantity, 0);
      const sold60 = store.sales
        .filter(s => s.productId === p.id && new Date(s.date) >= daysAgo(RECENT_DEMAND_DAYS - 1))
        .reduce((sum, s) => sum + s.quantity, 0);
      const perDay = sold14 / 14;
      const hasVelocity = perDay > 0;
      // This asked whether the product had EVER sold, so one sale months back
      // made a sold-out item a standing priority for the life of the shop.
      // Demand has to be recent to count as demand.
      const soldRecently = sold60 > 0;
      const worthRestocking = hasVelocity || (p.quantity <= 0 && soldRecently);
      const daysLeft = p.quantity === 0 ? 0 : (hasVelocity ? Math.floor(p.quantity / perDay) : Infinity);
      // A sold-out product shows no recent sales precisely because there was
      // nothing left to sell, so its longer-run rate is the honest one.
      const demandPerDay = hasVelocity
        ? perDay
        : (p.quantity <= 0 && soldRecently ? sold60 / RECENT_DEMAND_DAYS : 0);
      // Fourteen days of cover plus a fifth. Nothing is suggested for a product
      // with no demand behind it — that used to default to a flat 10 units.
      const restockQty = demandPerDay > 0 ? Math.max(1, Math.ceil(demandPerDay * 14 * 1.2)) : 0;
      const unitProfit = Math.max(0, (p.sellingPrice || 0) - (p.costPrice || 0));
      const dailyProfitAtRisk = demandPerDay * unitProfit;

      let urgency: StockForecast['urgency'] = 'ok';
      if (p.quantity === 0) {
        urgency = 'critical';
      } else if (daysLeft <= 3 || p.quantity <= Math.max(1, Math.floor(threshold / 2))) {
        urgency = 'critical';
      } else if (daysLeft <= 7 || p.quantity <= threshold) {
        urgency = 'soon';
      }

      return { product: p, perDay, daysLeft, hasVelocity, worthRestocking, restockQty, urgency, unitProfit, dailyProfitAtRisk };
    });
}

/**
 * Restock candidates, worst first.
 *
 * Sorting on days-of-cover alone put anything at zero stock at the top,
 * regardless of whether it sells — so a product that shifted one unit last
 * quarter outranked a fast mover with three days left. Demand that is real and
 * recent comes first, then the money lost per day it stays unavailable, and
 * cover is only the tie-breaker.
 */
export function inventoryIntelligence(store: StoreData): StockForecast[] {
  return computeStockForecasts(store)
    .filter(f => f.urgency !== 'ok')
    .sort(byMoneyAtRisk);
}
