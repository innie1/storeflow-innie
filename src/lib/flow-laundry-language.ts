const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

export interface FlowLaundryGarmentMatch {
  garment: string;
  quantity: number;
  matchedText: string;
  start: number;
  end: number;
  score: number;
}

export function normalizeFlowLaundryText(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/t[\s-]?shirt/g, 'tshirt')
    .replace(/bed[\s-]?sheet/g, 'bedsheet')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function singularWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes') || word.endsWith('ches') || word.endsWith('shes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function compactSingular(value: string): string {
  return normalizeFlowLaundryText(value).split(' ').map(singularWord).join(' ');
}

const COMMON_EQUIVALENTS: Record<string, string[]> = {
  jeans: ['jean'],
  jean: ['jeans'],
  shorts: ['short'],
  short: ['shorts'],
  trousers: ['trouser', 'pants', 'pant'],
  trouser: ['trousers', 'pants', 'pant'],
  tshirt: ['tee', 't shirt'],
  bedsheet: ['bed sheet', 'bed sheets', 'bedsheets'],
  singlet: ['vest'],
};

function garmentAliases(garment: string): string[] {
  const canonical = normalizeFlowLaundryText(garment);
  const singular = compactSingular(garment);
  const aliases = new Set<string>([canonical, singular]);
  for (const alias of COMMON_EQUIVALENTS[canonical] || []) aliases.add(normalizeFlowLaundryText(alias));
  for (const alias of COMMON_EQUIVALENTS[singular] || []) aliases.add(normalizeFlowLaundryText(alias));
  return [...aliases].filter(Boolean).sort((a, b) => b.length - a.length);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + cost);
      diagonal = saved;
    }
  }
  return prev[b.length];
}

function similarity(a: string, b: string): number {
  const left = normalizeFlowLaundryText(a);
  const right = normalizeFlowLaundryText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const longest = Math.max(left.length, right.length);
  return longest ? 1 - editDistance(left, right) / longest : 0;
}

function quantityBefore(text: string, start: number): number {
  const before = text.slice(Math.max(0, start - 22), start);
  const words = Object.keys(NUMBER_WORDS).join('|');
  const match = before.match(new RegExp(`(?:^|\\s)(\\d+|${words})\\s*(?:x|pcs?|pieces?)?\\s*$`, 'i'));
  if (!match) return 1;
  const raw = match[1].toLowerCase();
  const number = NUMBER_WORDS[raw] || Number(raw);
  return Number.isFinite(number) && number > 0 ? number : 1;
}

function overlaps(matches: FlowLaundryGarmentMatch[], start: number, end: number): boolean {
  return matches.some(match => start < match.end && end > match.start);
}

/**
 * Resolve laundry garments from ordinary speech without requiring exact DB spelling.
 *
 * It first finds catalog-derived aliases (including singular/plural and a very
 * small set of common laundry synonyms), then fuzzy-matches leftover words.
 * This deliberately uses only the current shop's garmentTypes as the source of
 * truth: Flow cannot invent a garment the merchant does not offer.
 */
export function matchFlowLaundryGarments(text: string, garmentTypes: string[]): FlowLaundryGarmentMatch[] {
  const q = normalizeFlowLaundryText(text);
  if (!q || !garmentTypes.length) return [];
  const padded = ` ${q} `;
  const matches: FlowLaundryGarmentMatch[] = [];

  const candidates = garmentTypes.flatMap(garment => garmentAliases(garment).map(alias => ({ garment, alias })))
    .sort((a, b) => b.alias.length - a.alias.length);

  for (const candidate of candidates) {
    let from = 0;
    while (from < padded.length) {
      const rawIndex = padded.indexOf(` ${candidate.alias} `, from);
      if (rawIndex < 0) break;
      const start = Math.max(0, rawIndex);
      const end = start + candidate.alias.length;
      if (!overlaps(matches, start, end)) {
        matches.push({
          garment: candidate.garment,
          quantity: quantityBefore(q, start),
          matchedText: candidate.alias,
          start,
          end,
          score: 1,
        });
      }
      from = rawIndex + candidate.alias.length + 1;
    }
  }

  // Fuzzy pass for a single misspelled/short word such as "bedshet". Exact
  // matches above always win, and short 1-3 letter words are not guessed.
  const tokenPattern = /\b[a-z][a-z0-9]{3,}\b/g;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(q))) {
    const word = token[0];
    const start = token.index;
    const end = start + word.length;
    if (overlaps(matches, start, end)) continue;
    if (NUMBER_WORDS[word]) continue;

    let best: { garment: string; score: number } | null = null;
    for (const garment of garmentTypes) {
      for (const alias of garmentAliases(garment)) {
        if (alias.includes(' ')) continue;
        const score = similarity(word, alias);
        if (!best || score > best.score) best = { garment, score };
      }
    }
    if (best && best.score >= 0.78) {
      matches.push({ garment: best.garment, quantity: quantityBefore(q, start), matchedText: word, start, end, score: best.score });
    }
  }

  // One garment can have several equivalent aliases in the same position.
  // Keep only the earliest/best occurrence per physical mention, while still
  // allowing the same garment to be spoken twice in different positions.
  return matches
    .sort((a, b) => a.start - b.start || b.score - a.score || b.matchedText.length - a.matchedText.length)
    .filter((match, index, all) => !all.slice(0, index).some(previous => previous.start === match.start && previous.end === match.end));
}
