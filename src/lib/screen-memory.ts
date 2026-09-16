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
 * per shop. A cart belongs to the shop it was built in; carrying it into
 * another shop on the same phone would put one shop's goods into another
 * shop's sale. Anything stored through this module is scoped to a shop key and
 * is invisible to every other shop.
 *
 * It is sessionStorage rather than localStorage: a cart abandoned an hour ago
 * on a phone that has been closed and reopened should not come back to life at
 * the counter the next morning.
 */

const PREFIX = 'storeflow_screen_memory_';

/** The shop a piece of remembered work belongs to. */
export function shopMemoryKey(store: { id?: string; storeId?: string; accessCode?: string } | null | undefined): string | null {
  if (!store) return null;
  const key = String(store.id || store.storeId || store.accessCode || '').trim();
  return key || null;
}

function read(shopKey: string): Record<string, unknown> {
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
