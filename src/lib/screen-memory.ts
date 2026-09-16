/**
 * What a screen is allowed to remember while it is not on screen.
 *
 * Every screen in the app used to be mounted at once and hidden with CSS, so
 * anything half-done - a cart with four items in it, a search someone had
 * typed - survived a trip to another screen by accident. Only the active
 * screen is mounted now, which is what makes the app start quickly, and that
 * accident is gone with it.
 *
 * So the few things worth keeping are kept on purpose, here, and they are kept
 * against one shop in one trade. A cart belongs to the shop it was built in;
 * carrying it into another shop on the same phone would put one shop's goods
 * into another shop's sale. The trade is part of that boundary as well, and for
 * the same reason: a shop changed from a provision store to a laundry gets
 * different screens with different meanings, and a cart of goods left over from
 * the provision store has no business turning up in the laundry's till. It is
 * the same boundary the mounted screen itself is keyed by - workspaceKeyFor is
 * this function - so what is mounted and what is remembered can never drift
 * apart.
 *
 * It is sessionStorage rather than localStorage: a cart abandoned an hour ago
 * on a phone that has been closed and reopened should not come back to life at
 * the counter the next morning.
 */

import type { StoreData } from '@/types/store';
import { resolveBusinessType } from '@/lib/business-runtime';

const PREFIX = 'storeflow_screen_memory_';

/** The trade, from the one place that decides what a shop is. */
export function shopMemoryTrade(store: Partial<StoreData> | null | undefined): string {
  return String(resolveBusinessType(store));
}

/**
 * The shop and trade a piece of remembered work belongs to.
 *
 * Null when there is no shop to belong to, so nothing is stored at all rather
 * than stored somewhere anonymous that the next shop could read.
 */
export function shopMemoryKey(store: Partial<StoreData> | null | undefined): string | null {
  if (!store) return null;
  const shop = String(store.id || store.storeId || store.accessCode || '').trim();
  if (!shop) return null;
  return `${shop}:${shopMemoryTrade(store)}`;
}

/**
 * Throw away anything left under the old shop-only keys.
 *
 * Memory used to be kept against the shop alone, so a draft written before
 * this change cannot say which trade it was made in. Guessing would mean
 * handing a provision store's cart to the same shop's laundry till, which is
 * the thing this boundary exists to prevent. These are half-finished drafts
 * from the session that is still open, never recorded data, so dropping them
 * costs somebody a re-typed cart at worst.
 */
function dropAmbiguousLegacyMemory(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      // Every key written since carries `shop:trade`; one without a trade is
      // from before and cannot be placed.
      if (!key.slice(PREFIX.length).includes(':')) stale.push(key);
    }
    stale.forEach(key => sessionStorage.removeItem(key));
  } catch { /* private mode: there was nothing to read anyway */ }
}

function read(shopKey: string): Record<string, unknown> {
  dropAmbiguousLegacyMemory();
  try {
    const raw = sessionStorage.getItem(PREFIX + shopKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    // Private mode, a full quota, or something else's data under our key.
    return {};
  }
}

function write(shopKey: string, memory: Record<string, unknown>): void {
  dropAmbiguousLegacyMemory();
  try {
    if (Object.keys(memory).length === 0) sessionStorage.removeItem(PREFIX + shopKey);
    else sessionStorage.setItem(PREFIX + shopKey, JSON.stringify(memory));
  } catch { /* nothing remembered is worth breaking a sale over */ }
}

/**
 * What this shop had half-done under this name, or null.
 *
 * Null rather than undefined so a caller can tell "nothing was kept" from
 * "something was kept and it was empty".
 */
export function recallDraft<T>(shopKey: string | null, name: string): T | null {
  if (!shopKey) return null;
  const value = read(shopKey)[name];
  return (value === undefined ? null : value as T);
}

/** Keep this shop's half-done work under this name. */
export function rememberDraft(shopKey: string | null, name: string, value: unknown): void {
  if (!shopKey) return;
  const memory = read(shopKey);
  memory[name] = value;
  write(shopKey, memory);
}

/** It is finished or abandoned; stop keeping it. */
export function forgetDraft(shopKey: string | null, name: string): void {
  if (!shopKey) return;
  const memory = read(shopKey);
  if (!(name in memory)) return;
  delete memory[name];
  write(shopKey, memory);
}

/** Everything this one shop was keeping, gone. */
export function forgetShopMemory(shopKey: string | null): void {
  if (!shopKey) return;
  try { sessionStorage.removeItem(PREFIX + shopKey); } catch { /* private mode */ }
}

/**
 * Where a screen was scrolled to, per shop and per screen.
 *
 * Kept separate from drafts so that clearing one does not clear the other, and
 * so a screen can be given back its place in a long list without having to
 * know anything about what else it was remembering.
 */
export function rememberScroll(shopKey: string | null, screen: string, y: number): void {
  if (!shopKey) return;
  rememberDraft(shopKey, 'scroll:' + screen, Math.max(0, Math.round(y)));
}

export function recallScroll(shopKey: string | null, screen: string): number {
  const y = recallDraft<number>(shopKey, 'scroll:' + screen);
  return typeof y === 'number' && y > 0 ? y : 0;
}
