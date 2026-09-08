/**
 * What a service shop buys and uses up.
 *
 * A laundry's real costs are soap, bleach, starch, softener and — in Nigeria,
 * usually the second-biggest line after rent — diesel. None of it had anywhere
 * to go. The only category that fitted was "Other", which told the owner
 * nothing, or "Restock", which would have been actively wrong.
 *
 * Wrong because the app deliberately keeps stock purchases out of profit: a
 * retailer who buys goods still owns them, so the money moved rather than
 * left. Detergent does leave. It is consumed doing the work, which makes it a
 * genuine cost of trading, and it has to reduce profit or the shop's margin is
 * a fiction. See `isStockPurchase` in store-data for the other half of that
 * rule.
 */

import type { Expense, StoreData, SupplyItem } from '@/types/store';

/**
 * A starting list, not a fixed one. Every shop buys something the next one
 * does not, so these are only what appears before anybody types anything.
 */
export const DEFAULT_SUPPLIES: { name: string; unit: string }[] = [
  { name: 'Detergent', unit: 'bag' },
  { name: 'Bleach', unit: 'litre' },
  { name: 'Starch', unit: 'bag' },
  { name: 'Fabric softener', unit: 'litre' },
  { name: 'Diesel', unit: 'litre' },
  { name: 'Cooking gas', unit: 'kg' },
  { name: 'Water', unit: 'tank' },
  { name: 'Nylon bags', unit: 'pack' },
];

export const CONSUMABLES_CATEGORY = 'Consumables' as const;

export function getSupplies(store: Pick<StoreData, 'supplies'>): SupplyItem[] {
  return Array.isArray(store.supplies) ? store.supplies : [];
}

/**
 * The list to show, which is the shop's own once it has one and the starting
 * list before that. A brand new laundry should not open an empty screen and
 * have to invent the word "detergent" before it can report running out.
 */
export function supplyList(store: Pick<StoreData, 'supplies'>): SupplyItem[] {
  const own = getSupplies(store);
  if (own.length) return own;
  return DEFAULT_SUPPLIES.map((entry, index) => ({
    id: `seed_${index}_${entry.name.toLowerCase().replace(/\W+/g, '_')}`,
    name: entry.name,
    unit: entry.unit,
  }));
}

export function supplyId(): string {
  return `sup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Supplies somebody has flagged as run out, oldest complaint first. */
export function lowSupplies(store: Pick<StoreData, 'supplies'>): SupplyItem[] {
  return supplyList(store)
    .filter(item => !!item.lowSince)
    .sort((a, b) => String(a.lowSince).localeCompare(String(b.lowSince)));
}

/**
 * Raise or clear the "we have run out" flag.
 *
 * Deliberately takes no money and returns no money, so it can be offered to an
 * attendant who has no permission to see costs.
 */
export function reportSupplyLow(
  store: StoreData,
  supply: SupplyItem,
  low: boolean,
  reportedBy?: string,
): StoreData {
  /*
   * A seeded supply has never been saved, so the first report is what writes
   * the list down — and it has to write the whole starting list, not only the
   * item being flagged. Saving just that one left a shop that reported running
   * out of detergent looking at a screen with detergent on it and nothing
   * else.
   */
  const base = getSupplies(store).length ? getSupplies(store) : supplyList(store);
  const known = base.some(item => item.id === supply.id);
  const next = known ? base : [...base, supply];

  return {
    ...store,
    supplies: next.map(item =>
      item.id === supply.id
        ? {
            ...item,
            lowSince: low ? item.lowSince || new Date().toISOString() : undefined,
            lowReportedBy: low ? reportedBy || item.lowReportedBy : undefined,
          }
        : item,
    ),
  };
}

export interface SupplyPurchase {
  supply: SupplyItem;
  amount: number;
  note?: string;
}

/**
 * Book a supply purchase as an ordinary operating expense.
 *
 * It goes through the same expense list as rent and salaries on purpose. That
 * is what makes it reach profit, the cash balance and every overspending
 * figure without any of them needing to learn a new concept.
 */
export function buildSupplyExpense(purchase: SupplyPurchase): Expense {
  const label = purchase.supply.unit
    ? `${purchase.supply.name} (${purchase.supply.unit})`
    : purchase.supply.name;
  return {
    id: `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    amount: Math.max(0, Number(purchase.amount) || 0),
    category: CONSUMABLES_CATEGORY,
    date: new Date().toISOString(),
    note: purchase.note ? `${label} — ${purchase.note}` : label,
    source: 'manual',
  };
}

/** Buying it clears the complaint, and records what it cost and when. */
export function markSupplyPurchased(store: StoreData, purchase: SupplyPurchase): StoreData {
  const cleared = reportSupplyLow(store, purchase.supply, false);
  return {
    ...cleared,
    supplies: getSupplies(cleared).map(item =>
      item.id === purchase.supply.id
        ? {
            ...item,
            lastPurchasedAt: new Date().toISOString(),
            lastPurchaseCost: Math.max(0, Number(purchase.amount) || 0),
          }
        : item,
    ),
    expenses: [...(store.expenses || []), buildSupplyExpense(purchase)],
  };
}

export function isConsumableExpense(expense: Pick<Expense, 'category'>): boolean {
  return expense.category === CONSUMABLES_CATEGORY;
}

/** What the shop has spent on supplies over the last `days` days. */
export function consumablesSpend(store: Pick<StoreData, 'expenses'>, days = 30): number {
  const since = Date.now() - days * 86400000;
  return (store.expenses || [])
    .filter(expense => isConsumableExpense(expense) && new Date(expense.date).getTime() >= since)
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
}

/**
 * What one job costs the shop in supplies.
 *
 * The number a laundry owner cannot get any other way, and the one that says
 * whether the price on the board still works. Withheld rather than guessed:
 * with only a couple of jobs on the books, dividing by them produces a
 * confident figure built on nothing.
 */
export const MIN_JOBS_FOR_UNIT_COST = 5;

export function costPerJob(
  store: Pick<StoreData, 'expenses'>,
  jobsInPeriod: number,
  days = 30,
): number | null {
  if (!Number.isFinite(jobsInPeriod) || jobsInPeriod < MIN_JOBS_FOR_UNIT_COST) return null;
  const spend = consumablesSpend(store, days);
  if (spend <= 0) return null;
  return Math.round(spend / jobsInPeriod);
}
