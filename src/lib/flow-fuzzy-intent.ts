import type { OperatingIntent } from '@/lib/flow-operating-engine';

/**
 * Understands a question that was typed badly.
 *
 * Intent detection is a ladder of exact-word regexes — `\bbest sellers?\b`,
 * `\bprofit\b`, `\bwhat's low\b`. They are precise and cheap, and they match
 * nothing at all if a letter is out of place. "wats low", "best seler",
 * "profitt", "how is my stor" all fell past every rung and landed on the help
 * text, which is the single most common way a merchant is told Flow does not
 * understand them.
 *
 * This runs only after the exact ladder has failed, so it costs nothing on the
 * common path and cannot steal a match from a rule that was already sure. It
 * compares each word typed against a small vocabulary per intent and takes the
 * best, provided it is close enough to be worth acting on.
 */

/** Words that mean an intent, kept short — one strong word beats five weak. */
const VOCABULARY: Array<[OperatingIntent, string[]]> = [
  ['store_overview', ['store', 'business', 'shop', 'overview', 'doing', 'health', 'performance']],
  ['inventory',      ['low', 'stock', 'restock', 'inventory', 'reorder', 'finished', 'empty']],
  ['best_sellers',   ['bestsellers', 'sellers', 'selling', 'best', 'top', 'popular']],
  ['slow_products',  ['slow', 'dead', 'idle', 'stuck', 'moving']],
  ['profit',         ['profit', 'margin', 'markup', 'earning', 'gain']],
  ['sales',          ['sales', 'revenue', 'sold', 'takings', 'turnover']],
  ['pricing',        ['price', 'pricing', 'prices', 'underpriced', 'cheap', 'expensive']],
  ['customers',      ['customer', 'customers', 'debt', 'owing', 'credit', 'buyer']],
  ['expenses',       ['expense', 'expenses', 'spending', 'spent', 'cost', 'costs']],
  ['finance',        ['finance', 'cashflow', 'money', 'loan', 'investment', 'withdrawal']],
  ['orders',         ['order', 'orders', 'delivery', 'pickup']],
  ['recommendations',['recommend', 'suggest', 'advice', 'improve', 'fix', 'should']],
  ['settings',       ['settings', 'theme', 'dark', 'light', 'notification']],
  ['help',           ['help', 'commands', 'what']],
];

/**
 * How close a word has to be. 0.72 accepts one wrong letter in a short word
 * and two in a long one; below that, unrelated words start matching.
 */
const MIN_SCORE = 0.72;

/** Words too common to carry meaning — matching on these would guess wildly. */
const STOP = new Set([
  'the', 'a', 'an', 'my', 'me', 'i', 'is', 'are', 'was', 'do', 'does', 'did',
  'can', 'you', 'show', 'tell', 'give', 'get', 'how', 'and', 'or', 'to', 'of',
  'in', 'on', 'for', 'it', 'that', 'this', 'please', 'now', 'today',
]);

const norm = (v: string) =>
  v.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : Math.min(prev[j - 1] + 1, prev[j] + 1, cur[j - 1] + 1);
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 1 for identical, 0 for nothing in common. */
export function wordSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // A short typo is a bigger proportion of a short word, so very short words
  // are only accepted on an exact or prefix match.
  if (a.length <= 3 || b.length <= 3) return a === b ? 1 : (b.startsWith(a) || a.startsWith(b) ? 0.8 : 0);
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

export interface FuzzyIntentMatch {
  intent: OperatingIntent;
  confidence: number;
  /** The word that was typed, and what it was taken to mean. */
  matched: string;
  meant: string;
}

/**
 * Best guess at what a mistyped question was asking, or null when nothing is
 * close enough to act on. Never returns 'unknown' — a guess it cannot make is
 * no guess.
 */
export function fuzzyIntent(raw: string): FuzzyIntentMatch | null {
  const words = norm(raw).split(' ').filter(w => w && !STOP.has(w));
  if (words.length === 0) return null;

  let best: FuzzyIntentMatch | null = null;
  for (const [intent, vocabulary] of VOCABULARY) {
    for (const term of vocabulary) {
      for (const word of words) {
        const score = wordSimilarity(word, term);
        if (score < MIN_SCORE) continue;
        if (!best || score > best.confidence) {
          best = { intent, confidence: score, matched: word, meant: term };
        }
      }
    }
  }
  return best;
}
