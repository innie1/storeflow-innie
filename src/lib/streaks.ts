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

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  // Keep last 90 days of history for scrollable streak logging
  return list.slice(-90);
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
  // Duolingo-style rule: a freeze only saves you if exactly ONE day was
  // missed (gap === 2, i.e. yesterday was skipped). Miss two or more days
  // in a row and the streak resets even if a freeze is sitting in reserve —
  // freezes aren't meant to cover open-ended absences.
  const oneDayMissed = gap === 2;

  let nextCount: number;
  let freezeConsumedToday = false;
  let remainingFreezes = freezesAvailable;

  if (gap === 1 || gap === null) {
    // Consecutive day, or very first-ever open.
    nextCount = prev.count + 1 || 1;
  } else if (oneDayMissed && remainingFreezes > 0) {
    // Exactly one day missed, and a freeze covers it — streak survives.
    nextCount = prev.count;
    remainingFreezes -= 1;
    freezeConsumedToday = true;
  } else {
    // Either no freeze available for a single missed day, or two+ days
    // missed (freezes don't cover that) — streak resets.
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
    // Freeze protects the day that was actually missed (day after last open),
    // not "today" — recording it on today made the calendar show the wrong
    // day as frozen and the real missed day as "skipped". Capped at 90 like
    // openedDates so this array doesn't grow forever.
    freezesUsedDates: freezeConsumedToday
      ? [...(prev.freezesUsedDates || []), addDays(prev.lastOpenDate, 1)].slice(-90)
      : (prev.freezesUsedDates || []),
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

export interface StreakLogDay {
  label: string;       // 'Mon', 'Tue'...
  shortDay: string;    // 'M', 'T', 'W'...
  date: string;        // 'YYYY-MM-DD'
  dayNum: number;      // 1..31
  status: 'completed' | 'skipped' | 'frozen' | 'today_pending' | 'today_completed' | 'future';
  isToday: boolean;
  isFuture: boolean;
}

export function getStreakLog(
  streak: StreakData | undefined,
  daysBack = 14,
  daysAhead = 4,
  accountCreatedAt?: string
): StreakLogDay[] {
  const opened = new Set(streak?.openedDates || []);
  const frozen = new Set(streak?.freezesUsedDates || []);
  const today = new Date();
  const todayStr = todayLocal();
  const dayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayLabelsLetter = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  let accountCreatedDateStr: string | null = null;
  if (accountCreatedAt) {
    const d = new Date(accountCreatedAt);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      accountCreatedDateStr = `${y}-${m}-${day}`;
    }
  }

  // Earliest day we actually have a record for. Anything before this
  // never had an account running — so it's skipped entirely, not marked.
  const openedSorted = [...opened].sort();
  const earliestKnownDate = accountCreatedDateStr || openedSorted[0] || streak?.lastOpenDate || todayStr;

  const days: StreakLogDay[] = [];

  for (let i = -daysBack; i <= daysAhead; i++) {
    const d = new Date();
    d.setDate(today.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;

    if (dateStr < earliestKnownDate) continue; // don't show pre-account days at all

    const isToday = dateStr === todayStr;
    const isFuture = dateStr > todayStr;
    let status: StreakLogDay['status'];

    if (isFuture) {
      status = 'future';
    } else if (isToday) {
      status = (opened.has(dateStr) || streak?.lastOpenDate === dateStr) ? 'today_completed' : 'today_pending';
    } else if (frozen.has(dateStr)) {
      status = 'frozen';
    } else if (opened.has(dateStr)) {
      status = 'completed';
    } else {
      status = 'skipped';
    }

    const dow = d.getDay();
    days.push({
      label: dayNamesShort[dow],
      shortDay: dayLabelsLetter[dow],
      date: dateStr,
      dayNum: d.getDate(),
      status,
      isToday,
      isFuture,
    });
  }

  return days;
}

// One entry per of the last 7 calendar days (oldest first), Monday-first week
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
