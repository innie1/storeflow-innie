/**
 * Finding a garment in a long list, and spotting when a new one is really an
 * old one under a longer name.
 *
 * A shop that has been running a while ends up with thirty or forty clothing
 * types, and the intake grid shows all of them at once. Worse, "Other clothing
 * type" only matched an existing name letter for letter, so typing "Shirt with
 * Emma" quietly created a second kind of shirt — and then the price list, the
 * counts and every report treated the two as unrelated.
 */

/** Words that carry no identity in a garment name. */
const FILLER = new Set(['with', 'and', 'for', 'the', 'a', 'an', 'of', 'in', 'no', 'size']);

function normalise(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Crude singular, so "shirts" and "shirt" are the same word. */
function singular(word: string): string {
  if (word.length > 3 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('es') && !word.endsWith('ses')) return word.slice(0, -2);
  if (word.length > 2 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * The words that identify a garment.
 *
 * Anything under three letters is dropped: a stray "s" or "m" carries no
 * meaning and matching on one is how a question about the shop once resolved
 * to a bottle of soft drink.
 */
export function garmentWords(name: string): string[] {
  return normalise(name)
    .split(' ')
    .filter(word => word.length >= 3 && !FILLER.has(word))
    .map(singular);
}

/** Letters of `needle` appearing in order in `hay`, and how tightly. */
function subsequenceDensity(hay: string, needle: string): number {
  let at = 0;
  let first = -1;
  for (const letter of needle) {
    const found = hay.indexOf(letter, at);
    if (found === -1) return 0;
    if (first === -1) first = found;
    at = found + 1;
  }
  const span = at - first;
  return span > 0 ? needle.length / span : 0;
}

/**
 * Edit distance counting a swap of two neighbours as one mistake.
 *
 * Plain Levenshtein charges two for a transposition, which put "shrit" and
 * "shorts" the same distance from "shirt" - so admitting the typo also
 * admitted an unrelated garment. Fingers swap letters constantly; that is one
 * slip, not two.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, i) => i)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(rows[i - 1][j - 1] + cost, rows[i - 1][j] + 1, row[j - 1] + 1);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j], rows[i - 2][j - 2] + 1);
      }
    }
    rows.push(row);
  }
  return rows[a.length][b.length];
}

/**
 * How well a garment answers what was typed. 0 means it does not.
 *
 * Substring and prefix alone were not enough: an attendant typing "shr" for
 * Shirt — dropping vowels is how people type on a phone at a counter — got an
 * empty grid and a prompt to add a garment that was already there. Letters in
 * order, and a tolerance for a slipped letter, both count now.
 */
export function garmentMatchScore(garment: string, needle: string): number {
  const hay = normalise(garment);
  if (!hay || !needle) return 0;
  const words = hay.split(' ');

  if (words.some(word => word.startsWith(needle))) return 100;
  if (hay.includes(needle)) return 90;
  // One letter is not enough to guess from; anything matches something.
  if (needle.length < 2) return 0;

  let best = 0;
  for (const word of words) {
    const density = subsequenceDensity(word, needle);
    if (density > 0) {
      // Starting on the same letter is a much stronger signal than not.
      best = Math.max(best, (word[0] === needle[0] ? 60 : 40) + density * 20);
    }
    // A slipped, swapped or doubled letter. One mistake in a short word, two
    // once there is enough word for two to still mean the same thing - any
    // looser and "shorts" starts answering for "shirt".
    const allowed = Math.max(word.length, needle.length) >= 7 ? 2 : 1;
    if (word.length >= 4 && needle.length >= 4 && editDistance(word, needle) <= allowed) {
      best = Math.max(best, 50);
    }
  }
  if (best === 0 && subsequenceDensity(hay, needle) > 0) best = 30;
  return best;
}

/**
 * Narrow a list of garments to what the attendant is typing, best first.
 *
 * Matches a whole name, any word starting with the query, and — since people
 * drop letters — the letters in order: "tro" finds Trouser, "shr" finds Shirt.
 */
export function filterGarments(garments: string[], query: string): string[] {
  const needle = normalise(query);
  if (!needle) return garments;
  return garments
    .map(garment => ({ garment, score: garmentMatchScore(garment, needle) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.garment.length - b.garment.length))
    .map(entry => entry.garment);
}

/**
 * The garment an entry is probably a longer name for, if any.
 *
 * "Shirt with Emma" against a list holding "Shirt" returns "Shirt": every word
 * that identifies the existing garment is present in what was typed. It works
 * the other way too, so typing "Shirt" when only "Shirt Long Sleeve" exists
 * offers that.
 *
 * An exact name is not a suggestion — the caller adds to it outright — so it
 * returns null rather than asking a question with one answer.
 */
export function findSimilarGarment(garments: string[], candidate: string): string | null {
  const wanted = garmentWords(candidate);
  if (!wanted.length) return null;

  const exact = normalise(candidate);
  let best: { garment: string; shared: number } | null = null;

  for (const garment of garments) {
    if (normalise(garment) === exact) return null;
    const words = garmentWords(garment);
    if (!words.length) continue;

    const existingInCandidate = words.every(word => wanted.includes(word));
    const candidateInExisting = wanted.every(word => words.includes(word));
    if (!existingInCandidate && !candidateInExisting) continue;

    const shared = words.filter(word => wanted.includes(word)).length;
    if (!best || shared > best.shared) best = { garment, shared };
  }

  return best?.garment || null;
}
