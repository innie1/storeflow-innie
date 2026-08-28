export type FlowAnimationId =
  | 'happy-jump'
  | 'money-rain'
  | 'victory-dance'
  | 'sleepy-stretch'
  | 'magic-spin'
  | 'rocket-boost'
  | 'confetti-pop'
  | 'cool-glasses';

export interface FlowAnimationDefinition {
  id: FlowAnimationId;
  name: string;
  subtitle: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic';
  unlockHint: string;
}

export const FLOW_ANIMATIONS: FlowAnimationDefinition[] = [
  { id: 'happy-jump', name: 'Happy Jump', subtitle: 'Flow jumps for joy.', icon: '✨', rarity: 'common', unlockHint: 'A lucky streak moment' },
  { id: 'money-rain', name: 'Money Rain', subtitle: 'Flow celebrates a great business day.', icon: '💰', rarity: 'rare', unlockHint: 'Keep building your streak' },
  { id: 'victory-dance', name: 'Victory Dance', subtitle: 'Flow breaks into a little celebration.', icon: '🕺', rarity: 'rare', unlockHint: 'Reach a streak milestone' },
  { id: 'sleepy-stretch', name: 'Sleepy Stretch', subtitle: 'Flow wakes up and stretches.', icon: '😴', rarity: 'common', unlockHint: 'Open StoreFlow on a new day' },
  { id: 'magic-spin', name: 'Magic Spin', subtitle: 'Flow spins with a little sparkle.', icon: '🪄', rarity: 'epic', unlockHint: 'A very lucky reward' },
  { id: 'rocket-boost', name: 'Rocket Boost', subtitle: 'Flow blasts off into the day.', icon: '🚀', rarity: 'epic', unlockHint: 'A special streak reward' },
  { id: 'confetti-pop', name: 'Confetti Pop', subtitle: 'Flow throws a tiny celebration.', icon: '🎉', rarity: 'rare', unlockHint: 'Complete a business milestone' },
  { id: 'cool-glasses', name: 'Cool Flow', subtitle: 'Flow puts on his shades.', icon: '😎', rarity: 'common', unlockHint: 'Tap Flow and keep exploring' },
];

const KEY = 'storeflow_flow_animation_collection_v1';
const FIRST_UNLOCK = 'happy-jump' as FlowAnimationId;

function read(): FlowAnimationId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((id): id is FlowAnimationId => FLOW_ANIMATIONS.some(a => a.id === id)) : [];
  } catch { return []; }
}

function write(ids: FlowAnimationId[]) {
  try { localStorage.setItem(KEY, JSON.stringify(Array.from(new Set(ids)))); } catch {}
}

export function getUnlockedFlowAnimations(): FlowAnimationId[] {
  const current = read();
  if (current.length) return current;
  write([FIRST_UNLOCK]);
  return [FIRST_UNLOCK];
}

export function isFlowAnimationUnlocked(id: FlowAnimationId): boolean {
  return getUnlockedFlowAnimations().includes(id);
}

export function unlockFlowAnimation(id: FlowAnimationId): boolean {
  if (!FLOW_ANIMATIONS.some(a => a.id === id)) return false;
  const current = getUnlockedFlowAnimations();
  if (current.includes(id)) return false;
  write([...current, id]);
  window.dispatchEvent(new CustomEvent('storeflow:flow-animation-unlocked', { detail: { id } }));
  return true;
}

export function unlockRandomFlowAnimation(): FlowAnimationDefinition | null {
  const unlocked = new Set(getUnlockedFlowAnimations());
  const candidates = FLOW_ANIMATIONS.filter(a => !unlocked.has(a.id));
  if (!candidates.length) return null;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  unlockFlowAnimation(picked.id);
  return picked;
}

export function playFlowAnimation(id: FlowAnimationId): boolean {
  if (!isFlowAnimationUnlocked(id)) return false;
  window.dispatchEvent(new CustomEvent('storeflow:flow-animation', { detail: { id } }));
  return true;
}

export function animationDefinition(id: FlowAnimationId) {
  return FLOW_ANIMATIONS.find(a => a.id === id) || null;
}

export function maybeRewardRandomAnimation(count: number): FlowAnimationDefinition | null {
  // Keep rewards occasional: never more than one reward per calendar day.
  const dayKey = `${KEY}_reward_${new Date().toISOString().slice(0, 10)}`;
  try {
    if (localStorage.getItem(dayKey) === '1') return null;
    const chance = count > 0 && (count % 3 === 0 || Math.random() < 0.08);
    if (!chance) return null;
    const reward = unlockRandomFlowAnimation();
    if (reward) localStorage.setItem(dayKey, '1');
    return reward;
  } catch { return null; }
}
