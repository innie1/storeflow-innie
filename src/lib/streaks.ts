import { StoreData, StreakData, StreakReward } from '@/types/store';

// Days that unlock a reward. Add more further out (60, 90, 120...) as you like —
// nothing else needs to change, the reward pool below is picked at random each time.
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 365];

export interface StreakRewardItem {
  id: string;
  name: string;
}

// The reward pool. Keep this list growing — items are picked at random per
// milestone and never repeat for the same store until the pool runs out.
export const STREAK_REWARD_POOL: StreakRewardItem[] = [
  { id: 'glasses', name: 'Round Glasses' },
  { id: 'soccer-ball', name: 'Soccer Ball' },
  { id: 'phone', name: 'Smartphone' },
  { id: 'headphones', name: 'Headphones' },
  { id: 'watch', name: 'Wrist Watch' },
  { id: 'camera', name: 'Camera' },
  { id: 'backpack', name: 'Backpack' },
  { id: 'trophy', name: 'Gold Trophy' },
  { id: 'guitar', name: 'Guitar' },
];

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

function pickRandomReward(alreadyWon: string[]): StreakRewardItem {
  const available = STREAK_REWARD_POOL.filter(i => !alreadyWon.includes(i.id));
  const pool = available.length > 0 ? available : STREAK_REWARD_POOL; // pool exhausted — allow repeats rather than stop rewarding
  return pool[Math.floor(Math.random() * pool.length)];
}

// Call this once per app open. Returns the store unchanged (same reference)
// if nothing needs to update, so callers can skip a save/re-render.
export function runStreakCheck(store: StoreData): StoreData {
  const today = todayLocal();
  const prev: StreakData = store.streak || {
    count: 0,
    longestCount: 0,
    lastOpenDate: '',
    claimedMilestones: [],
    rewards: [],
  };

  if (prev.lastOpenDate === today) return store; // already counted today

  const gap = prev.lastOpenDate ? daysBetween(prev.lastOpenDate, today) : null;
  const nextCount = gap === 1 ? prev.count + 1 : 1; // consecutive day vs. broken streak (gap===null covers first-ever open)

  const next: StreakData = {
    ...prev,
    count: nextCount,
    longestCount: Math.max(prev.longestCount, nextCount),
    lastOpenDate: today,
    pendingReveal: null,
  };

  if (STREAK_MILESTONES.includes(nextCount) && !prev.claimedMilestones.includes(nextCount)) {
    const item = pickRandomReward(prev.rewards.map(r => r.itemId));
    const reward: StreakReward = { day: nextCount, itemId: item.id, wonAt: new Date().toISOString() };
    next.claimedMilestones = [...prev.claimedMilestones, nextCount];
    next.rewards = [...prev.rewards, reward];
    next.pendingReveal = reward;
  }

  return { ...store, streak: next };
}

function nextMilestoneAfter(count: number): number | null {
  return STREAK_MILESTONES.find(m => m > count) ?? null;
}

// Flow's line when a streak day (not a reward day) is reached. Picks one at random.
export function getStreakLine(count: number): string {
  const next = nextMilestoneAfter(count);
  const lines = [
    `Day ${count} in a row. Look at you go.`,
    `${count} days straight! I'm keeping count too, you know.`,
    next ? `Streak's at ${count}. ${next - count} more day${next - count === 1 ? '' : 's'} till your next surprise.` : `${count} days. I'm honestly impressed.`,
    `Back again on day ${count}. This is becoming a habit — a good one.`,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

// Flow's line the moment a reward unlocks. References the day count and,
// where there's a next milestone, teases it — matches the "let's see what
// you get on day 7" pattern.
export function getRewardLine(reward: StreakReward, itemName: string): string {
  const next = nextMilestoneAfter(reward.day);
  const lines = [
    `${reward.day} days! You got me a ${itemName.toLowerCase()}.${next ? ` Let's see what shows up on day ${next}...` : ''}`,
    `Whoa — day ${reward.day} streak and I just got a ${itemName.toLowerCase()} out of it.${next ? ` Come back for day ${next}.` : ''}`,
    `That's ${reward.day} days straight. Reward unlocked: ${itemName}.${next ? ` Day ${next} is next up.` : ''}`,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}
