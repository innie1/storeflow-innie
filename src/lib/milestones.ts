import { StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';

export type MilestoneTier = 'small' | 'medium' | 'large' | 'epic';

/** What a threshold is counted against. */
export type MilestoneMetric = 'sales' | 'revenue';

export interface MilestoneDef {
  id: string;
  threshold: number;
  tier: MilestoneTier;
  title: string;
  subtitle: string;
  emoji: string;
  /** Defaults to 'sales', which is what every threshold used to mean. */
  metric?: MilestoneMetric;
}

// Ordered small -> epic. Tier controls how big the celebration animation is —
// see MilestoneCelebration.tsx. Add more thresholds here any time; nothing
// else needs to change, the detector just picks up new entries automatically.
export const SALES_MILESTONES: MilestoneDef[] = [
  { id: 'sales_1', threshold: 1, tier: 'small', title: 'First Sale!', subtitle: "You're officially in business.", emoji: '🎉' },
  { id: 'sales_10', threshold: 10, tier: 'small', title: '10 Sales!', subtitle: 'The momentum is building.', emoji: '🔥' },
  { id: 'sales_25', threshold: 25, tier: 'medium', title: '25 Sales!', subtitle: "You're getting the hang of this.", emoji: '⭐' },
  { id: 'sales_50', threshold: 50, tier: 'medium', title: '50 Sales!', subtitle: 'Halfway to a hundred.', emoji: '🚀' },
  { id: 'sales_100', threshold: 100, tier: 'large', title: '100 Sales!', subtitle: 'Triple digits — this is a real business.', emoji: '💯' },
  { id: 'sales_250', threshold: 250, tier: 'large', title: '250 Sales!', subtitle: 'Consistent, and it shows.', emoji: '🏆' },
  { id: 'sales_500', threshold: 500, tier: 'epic', title: '500 Sales!', subtitle: "You're a seasoned pro now.", emoji: '👑' },
  { id: 'sales_1000', threshold: 1000, tier: 'epic', title: '1,000 Sales!', subtitle: 'Four digits of hustle. Incredible.', emoji: '🌟' },
  { id: 'sales_2500', threshold: 2500, tier: 'epic', title: '2,500 Sales!', subtitle: "You've built something real.", emoji: '💎' },
  { id: 'sales_5000', threshold: 5000, tier: 'epic', title: '5,000 Sales!', subtitle: 'Legend status.', emoji: '🎆' },
];

/**
 * Money taken, all-time.
 *
 * Counting sales alone missed the number a shop owner actually watches. Ten
 * sales and ten thousand naira are different achievements, and only one of
 * them was ever celebrated — so passing ₦1,000,000 went by in silence.
 */
export const REVENUE_MILESTONES: MilestoneDef[] = [
  { id: 'revenue_10k', metric: 'revenue', threshold: 10_000, tier: 'small', title: 'First ₦10,000!', subtitle: 'The first real money through the door.', emoji: '💵' },
  { id: 'revenue_50k', metric: 'revenue', threshold: 50_000, tier: 'medium', title: '₦50,000!', subtitle: 'Five times where you started.', emoji: '💰' },
  { id: 'revenue_100k', metric: 'revenue', threshold: 100_000, tier: 'large', title: 'First ₦100,000!', subtitle: 'Six figures through your shop.', emoji: '🏆' },
  { id: 'revenue_300k', metric: 'revenue', threshold: 300_000, tier: 'large', title: '₦300,000!', subtitle: 'Three hundred thousand. This is working.', emoji: '📈' },
  { id: 'revenue_500k', metric: 'revenue', threshold: 500_000, tier: 'epic', title: '₦500,000!', subtitle: 'Halfway to a million.', emoji: '👑' },
  { id: 'revenue_1m', metric: 'revenue', threshold: 1_000_000, tier: 'epic', title: '₦1,000,000!', subtitle: 'One million naira. You built this.', emoji: '🎆' },
  { id: 'revenue_5m', metric: 'revenue', threshold: 5_000_000, tier: 'epic', title: '₦5,000,000!', subtitle: 'Five million. Remember the first sale?', emoji: '💎' },
];

export const ALL_MILESTONES: MilestoneDef[] = [...SALES_MILESTONES, ...REVENUE_MILESTONES];

/** Everything the shop has ever taken. */
export function lifetimeRevenue(store: StoreData): number {
  return (store.sales || []).reduce((total, sale) => total + Number(sale.total || 0), 0);
}

function valueFor(store: StoreData, metric: MilestoneMetric): number {
  return metric === 'revenue' ? lifetimeRevenue(store) : (store.sales || []).length;
}

// Returns the highest newly-crossed, not-yet-celebrated milestone, or null.
// Call this right after a sale is recorded — if it returns non-null, show
// MilestoneCelebration, then call markMilestoneReached to stop it repeating.
//
// Money outranks a count when both are crossed at once: passing ₦1,000,000 is
// the bigger moment than the sale that happened to carry you there.
export function checkNewMilestone(store: StoreData): MilestoneDef | null {
  const reached = new Set(store.milestonesReached || []);
  const candidates = ALL_MILESTONES.filter(
    milestone => !reached.has(milestone.id)
      && valueFor(store, milestone.metric || 'sales') >= milestone.threshold,
  );
  if (candidates.length === 0) return null;
  const rank: Record<MilestoneTier, number> = { small: 0, medium: 1, large: 2, epic: 3 };
  return candidates.sort((a, b) => {
    if (rank[a.tier] !== rank[b.tier]) return rank[b.tier] - rank[a.tier];
    const aMoney = (a.metric || 'sales') === 'revenue';
    const bMoney = (b.metric || 'sales') === 'revenue';
    if (aMoney !== bMoney) return aMoney ? -1 : 1;
    return b.threshold - a.threshold;
  })[0];
}

export function markMilestoneReached(store: StoreData, milestoneId: string): StoreData {
  const updated: StoreData = {
    ...store,
    milestonesReached: [...(store.milestonesReached || []), milestoneId],
    // When, as well as whether — so the dashboard can keep wearing a big win
    // for a few days instead of it vanishing with the popup.
    milestoneLog: [
      ...(store.milestoneLog || []),
      { id: milestoneId, at: new Date().toISOString() },
    ],
  };
  saveStore(updated);
  return updated;
}

/** How long the dashboard keeps wearing a big win. */
export const CELEBRATION_DAYS = 5;

/**
 * The win the dashboard should still be dressed up for, if any.
 *
 * The celebration used to last four seconds, and then the shop looked exactly
 * as it had before. Large and epic milestones now leave the dashboard wearing
 * a ribbon for a few days, so the owner sees it every time they open the app
 * and never has anything to dismiss.
 */
export function activeCelebration(store: StoreData, now = Date.now()): MilestoneDef | null {
  const log = store.milestoneLog || [];
  if (!log.length) return null;
  const cutoff = now - CELEBRATION_DAYS * 24 * 60 * 60 * 1000;

  let best: { def: MilestoneDef; at: number } | null = null;
  for (const entry of log) {
    const at = new Date(entry.at).getTime();
    if (!Number.isFinite(at) || at < cutoff || at > now) continue;
    const def = ALL_MILESTONES.find(milestone => milestone.id === entry.id);
    // Small and medium wins get their moment and then get out of the way.
    if (!def || (def.tier !== 'large' && def.tier !== 'epic')) continue;
    if (!best || at > best.at) best = { def, at };
  }
  return best?.def || null;
}

/**
 * Whether the falling confetti should run again for this viewer today.
 *
 * Once a day, not on every render: the point is a lift when the app opens, not
 * a page that will not settle. Kept per device, so it never touches store data.
 */
export function shouldRainToday(milestoneId: string, now = new Date()): boolean {
  const key = `storeflow_celebration_seen_${milestoneId}`;
  const today = now.toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(key) === today) return false;
    localStorage.setItem(key, today);
  } catch {
    // Private mode: better to show it than to suppress it.
  }
  return true;
}
