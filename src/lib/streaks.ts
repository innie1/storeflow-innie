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

function currentMonthLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function pushOpenedDate(dates: string[] | undefined, today: string): string[] {
  const list = [...(dates || [])];
  if (!list.includes(today)) list.push(today);
  // Keep last 14 days only — the UI only ever shows a 7-day week row, 14 gives headroom.
  return list.slice(-14);
}

// Call this once per app open. Returns the store unchanged (same reference)
// if nothing needs to update, so callers can skip a save/re-render.
export function runStreakCheck(store: StoreData): StoreData {
  const today = todayLocal();
  const thisMonth = currentMonthLocal();
  const prev: StreakData = store.streak || {
    count: 0,
    longestCount: 0,
    lastOpenDate: '',
    claimedMilestones: [],
    rewards: [],
    freezesAvailable: 0,
    freezeGrantedMonth: '',
    freezesUsedDates: [],
    openedDates: [],
  };

  // Grant one free freeze per calendar month, capped at 1 stored at a time.
  const freezesAvailable = prev.freezeGrantedMonth === thisMonth
    ? (prev.freezesAvailable ?? 0)
    : Math.min(1, (prev.freezesAvailable ?? 0) + 1);
  const freezeGrantedMonth = thisMonth;

  if (prev.lastOpenDate === today) {
    // Already counted today — but still persist a freeze grant / opened-date log update if needed.
    if (freezeGrantedMonth === prev.freezeGrantedMonth) return store;
    return { ...store, streak: { ...prev, freezesAvailable, freezeGrantedMonth } };
  }

  const gap = prev.lastOpenDate ? daysBetween(prev.lastOpenDate, today) : null;
  const missedADay = gap !== null && gap > 1;

  let nextCount: number;
  let freezeConsumedToday = false;
  let remainingFreezes = freezesAvailable;

  if (gap === 1 || gap === null) {
    // Consecutive day, or very first-ever open.
    nextCount = prev.count + 1 || 1;
  } else if (missedADay && remainingFreezes > 0) {
    // Missed a day, but a freeze covers it — streak survives.
    nextCount = prev.count;
    remainingFreezes -= 1;
    freezeConsumedToday = true;
  } else {
    // Missed a day, no freeze available — resets.
    nextCount = 1;
  }

  const next: StreakData = {
    ...prev,
    count: nextCount,
    longestCount: Math.max(prev.longestCount, nextCount),
    lastOpenDate: today,
    pendingReveal: null,
    freezesAvailable: remainingFreezes,
    freezeGrantedMonth,
    freezesUsedDates: freezeConsumedToday ? [...(prev.freezesUsedDates || []), today] : (prev.freezesUsedDates || []),
    freezeConsumedToday,
    openedDates: pushOpenedDate(prev.openedDates, today),
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

export function nextMilestoneAfter(count: number): number | null {
  return STREAK_MILESTONES.find(m => m > count) ?? null;
}

// One entry per of the last 7 calendar days (oldest first), Monday-first week
// like the reference design (M T W T F S S). Used by the streak dropdown panel.
export interface WeekLogDay {
  label: string;   // 'M', 'T', 'W'...
  date: string;     // YYYY-MM-DD
  opened: boolean;
  isToday: boolean;
  isFuture: boolean;
}

export function getWeekLog(streak: StreakData | undefined): WeekLogDay[] {
  const opened = new Set(streak?.openedDates || []);
  const today = new Date();
  // Find this week's Monday (getDay(): 0=Sun..6=Sat)
  const dow = today.getDay();
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayStr = todayLocal();

  return labels.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;
    return {
      label,
      date: dateStr,
      opened: opened.has(dateStr),
      isToday: dateStr === todayStr,
      isFuture: dateStr > todayStr,
    };
  });
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

// Flow's line when a missed day was covered by a streak freeze instead of resetting.
export function getFreezeUsedLine(count: number): string {
  const lines = [
    `Used a streak freeze to save your ${count}-day run — you had this one coming.`,
    `Missed a day, but your freeze covered it. ${count} days still standing.`,
    `That's what the freeze is for. ${count}-day streak, still alive.`,
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
