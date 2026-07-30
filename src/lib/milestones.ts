import { StoreData } from '@/types/store';
import { saveStore } from '@/lib/store-data';

export type MilestoneTier = 'small' | 'medium' | 'large' | 'epic';

export interface MilestoneDef {
  id: string;
  threshold: number;
  tier: MilestoneTier;
  title: string;
  subtitle: string;
  emoji: string;
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

// Returns the highest newly-crossed, not-yet-celebrated milestone, or null.
// Call this right after recordSale() — if it returns non-null, show
// MilestoneCelebration, then call markMilestoneReached to stop it repeating.
export function checkNewMilestone(store: StoreData): MilestoneDef | null {
  const totalSales = store.sales.length;
  const reached = new Set(store.milestonesReached || []);
  const candidates = SALES_MILESTONES.filter(m => totalSales >= m.threshold && !reached.has(m.id));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.threshold - a.threshold)[0];
}

export function markMilestoneReached(store: StoreData, milestoneId: string): StoreData {
  const updated: StoreData = {
    ...store,
    milestonesReached: [...(store.milestonesReached || []), milestoneId],
  };
  saveStore(updated);
  return updated;
}
