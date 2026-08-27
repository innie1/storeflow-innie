import type { Product } from '@/types/store';

export interface FlowShirtDraftItem {
  raw: string;
  quantity: number;
  product: Product | null;
  name: string;
  priceGuess: number | null;
  confidence: 'exact' | 'close' | 'new';
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
};

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function words(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1]
        : 1 + Math.min(previous[j], current[j - 1], previous[j - 1]);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

function findProduct(name: string, products: Product[]): { product: Product; confidence: 'exact' | 'close' } | null {
  const query = norm(name);
  if (!query) return null;

  const exact = products.find(product => {
    if (norm(product.name) === query) return true;
    return (product.voiceAliases || []).some(alias => norm(alias) === query);
  });
  if (exact) return { product: exact, confidence: 'exact' };

  const queryWords = words(name);
  let best: { product: Product; score: number } | null = null;
  for (const product of products) {
    const candidate = norm(product.name);
    if (!candidate) continue;
    let score = 99;
    if (candidate.includes(query) || query.includes(candidate)) {
      const ratio = Math.min(candidate.length, query.length) / Math.max(candidate.length, query.length);
      if (ratio >= 0.55) score = 1 - ratio;
    }

    const candidateWords = words(product.name);
    if (queryWords.length && queryWords.every(queryWord => candidateWords.some(candidateWord => candidateWord === queryWord || candidateWord.startsWith(queryWord)))) {
      score = Math.min(score, 0.75);
    }

    const distance = lev(candidate, query);
    const maxDistance = Math.max(1, Math.min(3, Math.ceil(Math.max(candidate.length, query.length) / 4)));
    if (distance <= maxDistance) score = Math.min(score, 1 + distance / 10);

    if (score < (best?.score ?? 99)) best = { product, score };
  }

  return best ? { product: best.product, confidence: 'close' } : null;
}

function parseQuantity(token: string | undefined): number | null {
  if (!token) return null;
  if (/^\d+$/.test(token)) return Math.max(1, Number(token));
  return WORD_NUMBERS[token.toLowerCase()] || null;
}

function splitCommands(text: string): string[] {
  return text
    .replace(/\n+/g, ',')
    .replace(/\s+(?:plus|also)\s+/gi, ',')
    .replace(/\s+and\s+/gi, ',')
    .split(/[,;]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

export function parseFlowShirtText(text: string, products: Product[]): FlowShirtDraftItem[] {
  const results: FlowShirtDraftItem[] = [];

  for (const raw of splitCommands(text)) {
    let tokens = raw.replace(/₦/g, ' ').replace(/\bnaira\b/gi, ' ').split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;

    let quantity = 1;
    const leadingQuantity = parseQuantity(tokens[0]);
    if (leadingQuantity !== null) {
      quantity = leadingQuantity;
      tokens = tokens.slice(1);
    }

    tokens = tokens.filter(token => !['sell', 'sold', 'selling', 'add', 'item', 'items', 'x'].includes(token.toLowerCase()));

    let priceGuess: number | null = null;
    const priceMarkerIndex = tokens.findIndex(token => ['for', 'at', '@'].includes(token.toLowerCase()));
    if (priceMarkerIndex >= 0 && tokens[priceMarkerIndex + 1]) {
      const candidate = Number(tokens[priceMarkerIndex + 1].replace(/[^0-9.]/g, ''));
      if (Number.isFinite(candidate) && candidate >= 0) priceGuess = candidate;
      tokens = tokens.slice(0, priceMarkerIndex);
    } else if (tokens.length > 1) {
      const last = tokens[tokens.length - 1].replace(/[^0-9.]/g, '');
      if (/^\d+(?:\.\d+)?$/.test(last)) {
        const candidate = Number(last);
        if (Number.isFinite(candidate)) {
          priceGuess = candidate;
          tokens = tokens.slice(0, -1);
        }
      }
    }

    const cleanName = tokens.join(' ').trim();
    if (!cleanName) continue;
    const match = findProduct(cleanName, products);
    results.push({
      raw,
      quantity,
      product: match?.product || null,
      name: match?.product.name || cleanName.replace(/\b\w/g, letter => letter.toUpperCase()),
      priceGuess,
      confidence: match?.confidence || 'new',
    });
  }

  return results;
}

export function createFlowShirtCode(now = Date.now()): string {
  const time = now.toString(36).toUpperCase().slice(-4);
  const random = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(2, 6).padEnd(4, 'X');
  return `FS-${time}${random}`;
}
