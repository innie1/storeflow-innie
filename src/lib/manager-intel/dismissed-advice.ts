import { AdviceCard } from './advice';

// ─── Advice Feedback ────────────────────────────────────────────────────────
// generateAdvice() already re-evaluates live off current data every call, so
// a resolved problem naturally stops producing its card — no caching to go
// stale. What was missing: a way to say "I saw this, not useful for me"
// for something that's still technically true (e.g. the merchant knows
// about the underpriced item and has chosen not to change it). Dismissals
// expire after 14 days so a real Auto Fix or manual change elsewhere isn't
// the only way a suppressed card can come back.
export const DISMISS_KEY = 'storeflow_dismissed_advice';

export const DISMISS_DAYS = 14;

export function readDismissed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function dismissAdvice(id: string) {
  const map = readDismissed();
  map[id] = new Date().toISOString();
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(map)); } catch {}
}

export function markAdviceHelpful(id: string) {
  // Helpful feedback doesn't need to change future output — the card was
  // already correct — but recording it keeps a signal available for future
  // tuning without pretending there's a learning model doing something with
  // it today.
  try {
    const key = 'storeflow_advice_helpful_count';
    const n = Number(localStorage.getItem(key) || '0');
    localStorage.setItem(key, String(n + 1));
  } catch {}
}

export function filterDismissedAdvice(cards: AdviceCard[]): AdviceCard[] {
  const dismissed = readDismissed();
  const cutoff = Date.now() - DISMISS_DAYS * 86400000;
  return cards.filter(c => {
    const at = dismissed[c.id];
    if (!at) return true;
    return new Date(at).getTime() < cutoff;
  });
}
