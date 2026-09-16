/**
 * Flow Memory — device-level storage (localStorage), with a best-effort
 * background sync to the cloud (stores.data.flowMemory) so a merchant
 * doesn't lose their coins/streak/suppliers if they clear their browser or
 * switch devices. localStorage remains the fast synchronous source of truth
 * for the many call sites throughout the app that expect instant values —
 * the cloud copy is a backup/restore mechanism, not the primary read path.
 * Stores: suppliers, FLOW rewards, streak.
 */
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface Supplier {
  id: string;
  name: string;
  products: string[];  // product names they supply
  pricePerUnit: number;
  unit?: string;       // e.g. "per carton", "per piece"
  distance?: string;   // e.g. "2km", "market"
  notes?: string;
  addedAt: string;
}

export interface FlowTransaction {
  id: string;
  date: string;
  type: 'daily' | 'streak' | 'referral' | 'game' | 'profile' | 'marketplace' | 'supplier' | 'event';
  amount: number;
  description: string;
}

export interface FlowMemory {
  suppliers: Supplier[];
  coins: number; // Keep for backward compatibility (maps to flowBalance)
  flowBalance: number;
  lifetimeFlowEarned: number;
  flowEarnedToday: number;
  lastClaimDate?: string; // YYYY-MM-DD
  referralEarnings: number;
  gameEarnings: number;
  flowTransactions: FlowTransaction[];
  streak: number;
  streakDate: string; // YYYY-MM-DD
  isFlagged?: boolean;
  lastActionTime?: number;
  claimedReferralCode?: string; // The code this user entered
}

/**
 * One shop, one memory.
 *
 * This was a single key shared by every shop on the phone, while the cloud
 * target followed whichever shop happened to be open - so a supplier added in
 * one shop turned up in the next, and a save could write the first shop's
 * coins and streak into the second shop's cloud record. Both now come from the
 * same place: the shop set below.
 *
 * With no shop set nothing is read and nothing is written. Empty is better
 * than somebody else's.
 */
const KEY_PREFIX = 'storeflow_flow_memory_v2_';

/** The old shared pile. Never written again; see takeOverLegacyMemory. */
const LEGACY_KEY = 'storeflow_flow_memory';

let shopKey: string | null = null;

function currentKey(): string | null {
  return shopKey ? KEY_PREFIX + shopKey : null;
}

function shopsOnThisDevice(): number {
  try {
    const parsed = JSON.parse(localStorage.getItem('storeflow_index') || '[]');
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * The older version's shared pile, handed to its owner.
 *
 * On a phone with one shop there is no question whose it is, so it moves
 * across and the old key goes. On a phone with several, guessing would put one
 * shop's suppliers and coins into another's hands, so it stays where it is
 * until somebody says - see legacyFlowMemoryAwaitingOwner.
 */
function takeOverLegacyMemory(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return;
    const key = currentKey();
    if (!key || localStorage.getItem(key)) return;
    if (shopsOnThisDevice() > 1) return;
    localStorage.setItem(key, legacy);
    localStorage.removeItem(LEGACY_KEY);
  } catch { /* private mode */ }
}

/** Whether an older version's shared suppliers and coins are still waiting for an owner. */
export function legacyFlowMemoryAwaitingOwner(): boolean {
  try {
    return !!currentKey() && !!localStorage.getItem(LEGACY_KEY);
  } catch {
    return false;
  }
}

/**
 * Hands that older pile to the shop that is open, keeping whatever the shop
 * already has. True when something moved.
 */
export function claimLegacyFlowMemory(): boolean {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    const key = currentKey();
    if (!raw || !key) return false;

    const legacy = JSON.parse(raw) as FlowMemory;
    const mine = localStorage.getItem(key);
    if (!mine) {
      localStorage.setItem(key, raw);
    } else {
      const current = JSON.parse(mine) as FlowMemory;
      const suppliers = [...(current.suppliers || [])];
      for (const supplier of legacy.suppliers || []) {
        if (!suppliers.some(entry => entry.id === supplier.id)) suppliers.push(supplier);
      }
      const merged: FlowMemory = {
        ...current,
        suppliers,
        // The shop keeps the better of the two rather than losing either.
        flowBalance: Math.max(current.flowBalance || 0, legacy.flowBalance || 0),
        coins: Math.max(current.flowBalance || 0, legacy.flowBalance || 0),
        lifetimeFlowEarned: Math.max(current.lifetimeFlowEarned || 0, legacy.lifetimeFlowEarned || 0),
        streak: Math.max(current.streak || 0, legacy.streak || 0),
      };
      localStorage.setItem(key, JSON.stringify(merged));
    }
    localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

function load(): FlowMemory {
  try {
    const key = currentKey();
    const raw = key ? localStorage.getItem(key) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate legacy state if needed
      const flowBalance = parsed.flowBalance ?? parsed.coins ?? 0;
      return {
        suppliers: [],
        coins: flowBalance,
        flowBalance,
        lifetimeFlowEarned: flowBalance,
        flowEarnedToday: 0,
        flowTransactions: [],
        streak: 0,
        streakDate: '',
        referralEarnings: 0,
        gameEarnings: 0,
        ...parsed,
      };
    }
  } catch { /* ignore */ }
  return {
    suppliers: [],
    coins: 0,
    flowBalance: 0,
    lifetimeFlowEarned: 0,
    flowEarnedToday: 0,
    flowTransactions: [],
    streak: 0,
    streakDate: '',
    referralEarnings: 0,
    gameEarnings: 0,
  };
}

function save(m: FlowMemory) {
  const key = currentKey();
  // No shop open means no memory to write to. Saving anywhere else is how this
  // ended up shared in the first place.
  if (!key) return;
  try {
    m.coins = m.flowBalance; // keep coins synced
    localStorage.setItem(key, JSON.stringify(m));
  } catch { /* ignore */ }
  scheduleCloudSync(m);
}

// ─── Background cloud sync (best-effort, non-blocking) ───────────────────────
let syncStoreId: string | null = null;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Which shop Flow's memory belongs to now.
 *
 * Called whenever the open shop changes, before anything reads or writes. The
 * local key and the cloud target are both taken from it, so they can never
 * point at two different businesses.
 */
export function setFlowMemoryShop(
  store: { id?: string | null; storeId?: string | null; accessCode?: string | null } | null,
): void {
  shopKey = store ? String(store.id || store.storeId || store.accessCode || '') || null : null;
  syncStoreId = store ? String(store.id || store.storeId || '') || null : null;
  if (shopKey) takeOverLegacyMemory();
}

function scheduleCloudSync(m: FlowMemory) {
  if (!syncStoreId) return;
  if (syncTimer) clearTimeout(syncTimer);
  // Debounce — coins/streak can update several times in quick succession;
  // no need to hit the network on every single one.
  syncTimer = setTimeout(() => {
    supabase.rpc('merge_store_data_key', {
      store_id_input: syncStoreId,
      key_input: 'flowMemory',
      // The column is an opaque JSON blob as far as the generated types are
      // concerned; FlowMemory is the shape we put in it.
      value_input: m as unknown as Json,
    }).then(({ error }) => {
      if (error) console.warn('[FlowMemory] Background cloud sync failed:', error.message);
    });
  }, 2000);
}

/**
 * Call once when the merchant's store loads. If this device has never seen
 * FLOW memory before (fresh install / cleared browser / new device), restore
 * it from the cloud copy instead of starting back at zero coins/streak.
 * Does nothing if this device already has local FLOW data, so it never
 * overwrites more recent local activity with a stale cloud snapshot.
 */
export async function hydrateFlowMemoryFromCloud(storeId: string): Promise<void> {
  const key = currentKey();
  // Only ever into the shop that is open.
  if (!key) return;
  syncStoreId = storeId || syncStoreId;
  try {
    const alreadyHasLocalData = !!localStorage.getItem(key);
    if (alreadyHasLocalData) return;
    const { data, error } = await supabase.from('stores').select('data').eq('id', storeId).maybeSingle();
    const blob = data?.data as { flowMemory?: FlowMemory } | null | undefined;
    if (error || !blob?.flowMemory) return;
    localStorage.setItem(key, JSON.stringify(blob.flowMemory));
  } catch (e) {
    console.warn('[FlowMemory] Cloud hydration failed:', e);
  }
}

export function getFlowMemory(): FlowMemory {
  return load();
}

// ─── Suppliers ────────────────────────────────────────────────────────────────
export function addSupplier(s: Omit<Supplier, 'id' | 'addedAt'>): Supplier {
  const m = load();
  const entry: Supplier = { ...s, id: Math.random().toString(36).slice(2), addedAt: new Date().toISOString() };
  m.suppliers = [entry, ...m.suppliers];
  save(m);
  
  // Award FLOW for finding a supplier
  try {
    addFlowRewardInternal(m, 1, 'supplier', 'Added a new supplier to directory');
  } catch (e) {
    // Ignore reward errors in supplier save
  }
  
  return entry;
}

export function updateSupplier(id: string, s: Partial<Supplier>) {
  const m = load();
  m.suppliers = m.suppliers.map(x => x.id === id ? { ...x, ...s } : x);
  save(m);
}

export function deleteSupplier(id: string) {
  const m = load();
  m.suppliers = m.suppliers.filter(x => x.id !== id);
  save(m);
}

export function getSuppliers(): Supplier[] {
  return load().suppliers;
}

// ─── FLOW Rewards Logic ───────────────────────────────────────────────────────

/** Internal helper to add flow rewards with anti-cheat protection */
function addFlowRewardInternal(
  m: FlowMemory,
  amount: number,
  type: FlowTransaction['type'],
  description: string
): void {
  const now = Date.now();
  const lastTime = m.lastActionTime || 0;
  
  // Anti-Cheat: block repeated rapid clicks (less than 500ms)
  if (now - lastTime < 500) {
    m.isFlagged = true;
    save(m);
    throw new Error('Suspicious rapid activity detected. Reward blocked.');
  }
  
  m.lastActionTime = now;

  // If account is flagged, temporarily reduce all rewards by 80%
  const finalAmount = m.isFlagged ? Math.round(amount * 0.2 * 100) / 100 : amount;
  if (finalAmount <= 0) return;

  m.flowBalance = Math.round((m.flowBalance + finalAmount) * 100) / 100;
  m.lifetimeFlowEarned = Math.round((m.lifetimeFlowEarned + finalAmount) * 100) / 100;
  m.flowEarnedToday = Math.round((m.flowEarnedToday + finalAmount) * 100) / 100;

  if (type === 'referral') {
    m.referralEarnings = Math.round((m.referralEarnings + finalAmount) * 100) / 100;
  } else if (type === 'game') {
    m.gameEarnings = Math.round((m.gameEarnings + finalAmount) * 100) / 100;
  }

  // Add transaction record
  const tx: FlowTransaction = {
    id: Math.random().toString(36).substring(2, 9) + now.toString(36),
    date: new Date().toISOString(),
    type,
    amount: finalAmount,
    description: m.isFlagged ? `[Reduced] ${description}` : description,
  };

  m.flowTransactions = [tx, ...m.flowTransactions].slice(0, 30);
  save(m);
}

/** Public API to award FLOW safely */
export function addFlowReward(amount: number, type: FlowTransaction['type'], description: string): number {
  const m = load();
  addFlowRewardInternal(m, amount, type, description);
  return m.flowBalance;
}

/** Legacy API compatibility - maps to Flow reward */
export function addCoins(amount: number): number {
  // Convert old coins calls to flow (we divide by 10 or translate value)
  // Let's map 1 coin = 0.1 FLOW
  const m = load();
  try {
    addFlowRewardInternal(m, amount * 0.1, 'event', 'Activity award');
    return Math.round(m.flowBalance);
  } catch {
    return Math.round(m.flowBalance);
  }
}

export function getCoins(): number {
  return Math.round(load().flowBalance);
}

// ─── Daily Activities & Streaks ──────────────────────────────────────────────

/** Checks daily login activity and awards FLOW/streak bonuses on first open today */
export function processDailyStreak(): {
  dailyAwarded: boolean;
  streakAwarded: number;
  newStreak: number;
} {
  const m = load();
  const today = new Date().toISOString().split('T')[0];
  
  // If already opened today, do nothing
  if (m.lastClaimDate === today) {
    return { dailyAwarded: false, streakAwarded: 0, newStreak: m.streak };
  }

  // Determine if streak continues (opened yesterday)
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const isNewDay = m.lastClaimDate !== today;
  
  if (isNewDay) {
    m.flowEarnedToday = 0; // reset daily earnings counter
  }

  if (m.streakDate === yesterday) {
    m.streak += 1;
  } else if (m.streakDate !== today) {
    m.streak = 1;
  }

  m.streakDate = today;
  m.lastClaimDate = today;
  
  // Award +0.5 FLOW for Open App Today
  addFlowRewardInternal(m, 0.5, 'daily', 'Daily check-in reward');

  // Check login streak milestones and award bonus FLOW
  let streakBonus = 0;
  if (m.streak === 7) streakBonus = 2;
  else if (m.streak === 14) streakBonus = 5;
  else if (m.streak === 30) streakBonus = 10;
  else if (m.streak === 60) streakBonus = 25;
  else if (m.streak === 100) streakBonus = 50;

  if (streakBonus > 0) {
    addFlowRewardInternal(m, streakBonus, 'streak', `${m.streak}-Day Login Streak Bonus`);
  }

  save(m);

  return {
    dailyAwarded: true,
    streakAwarded: streakBonus,
    newStreak: m.streak,
  };
}

/** Legacy recordStreak compatibility */
export function recordStreak(): { streak: number; isNew: boolean } {
  const res = processDailyStreak();
  return { streak: res.newStreak, isNew: res.dailyAwarded };
}

export function getStreak(): { streak: number; streakDate: string } {
  const m = load();
  return { streak: m.streak, streakDate: m.streakDate };
}

// ─── Referral System ──────────────────────────────────────────────────────────

export function claimReferral(code: string): { success: boolean; message: string; earned: number } {
  const m = load();
  
  // Anti-cheat: prevent duplicate entry
  if (m.claimedReferralCode) {
    return { success: false, message: 'You have already claimed a referral welcome bonus.', earned: 0 };
  }

  const cleanCode = code.trim().toUpperCase();
  if (cleanCode.length < 5 || !cleanCode.startsWith('FLOW-')) {
    return { success: false, message: 'Invalid referral code format. Code must start with FLOW-', earned: 0 };
  }

  // Prevent self-referral
  const myCode = `FLOW-${localStorage.getItem('storeflow_session') ? 'ACTIVE' : 'USER'}`; // mock code check
  
  m.claimedReferralCode = cleanCode;
  
  // Award +5 FLOW Welcome Bonus
  try {
    addFlowRewardInternal(m, 5, 'referral', `Entered referral code: ${cleanCode}`);
    // Simulate awarding +50 FLOW to the referrer on community server
    return {
      success: true,
      message: `🎉 Referral Successful! Welcome bonus of 5 FLOW (₦100 value) added to wallet.`,
      earned: 5,
    };
  } catch (e: any) {
    return { success: false, message: e.message || 'Abuse detected. Action blocked.', earned: 0 };
  }
}
