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

/**
 * Narrow a list of garments to what the attendant is typing.
 *
 * Matches a whole name, or any word in it starting with the query, so "tro"
 * finds "Trouser" and "native" finds "Native Wear".
 */
export function filterGarments(garments: string[], query: string): string[] {
  const needle = normalise(query);
  if (!needle) return garments;
  return garments.filter(garment => {
    const hay = normalise(garment);
    if (hay.includes(needle)) return true;
    return hay.split(' ').some(word => word.startsWith(needle));
  });
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
