export interface ProductAttributes {
  size?: 'Big' | 'Small' | 'Medium';
  container?: 'PET' | 'Bottle' | 'Can';
  package?: 'Carton' | 'Pack' | 'Roll' | 'Sachet';
}

/**
 * Normalizes a product name by removing or separating descriptive words
 * into core product names and attribute records.
 */
export function extractCoreProduct(name: string): { core: string; attributes: ProductAttributes } {
  const lower = name.toLowerCase();
  const attributes: ProductAttributes = {};

  // Size detection
  if (lower.includes('big')) attributes.size = 'Big';
  else if (lower.includes('small')) attributes.size = 'Small';
  else if (lower.includes('medium')) attributes.size = 'Medium';

  // Container detection
  if (lower.includes('pet')) attributes.container = 'PET';
  else if (lower.includes('bottle') || lower.includes('glass')) attributes.container = 'Bottle';
  else if (lower.includes('can')) attributes.container = 'Can';

  // Package detection
  if (lower.includes('carton') || lower.includes('ctn')) attributes.package = 'Carton';
  else if (lower.includes('pack')) attributes.package = 'Pack';
  else if (lower.includes('sachet')) attributes.package = 'Sachet';
  else if (lower.includes('roll')) attributes.package = 'Roll';

  // Remove descriptive words from name to extract core brand/product family name
  const stopWords = [
    'big', 'small', 'medium', 'bottle', 'pet', 'pack', 'carton', 'ctn', 
    'sachet', 'roll', 'can', 'half', '½', '1/2', 'new', 'old', 'glass'
  ];

  // Split string into words and filter out stopWords
  let words = name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w && !stopWords.includes(w) && w.length > 1);

  let core = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  if (!core) {
    core = name.trim(); // fallback if name is completely made of stopWords
  }

  return {
    core,
    attributes
  };
}

/**
 * Computes Levenshtein and Jaccard word overlaps for similarity scoring
 */
export function getSimilarity(s1: string, s2: string): number {
  // 1. Conflict Check: Extract volumes/weights to see if they differ (e.g. 50cl vs 35cl, 1kg vs 2kg)
  const extractSizeConf = (s: string) => {
    const match = s.match(/(\d+(?:\.\d+)?)\s*(?:cl|l|g|kg|ml|pcs|pack|sachet|s)/i);
    return match ? match[0].toLowerCase().replace(/\s+/g, '') : null;
  };
  const sz1 = extractSizeConf(s1);
  const sz2 = extractSizeConf(s2);
  if (sz1 && sz2 && sz1 !== sz2) {
    return 0; // Conflicting sizes -> must keep separate
  }

  // 2. Clean and tokenise strings, dropping small stop words and sizes
  const clean = (s: string) => {
    return s.toLowerCase()
      .replace(/(\d+(?:\.\d+)?)\s*(?:cl|l|g|kg|ml|pcs|pack|sachet|s)/gi, '') // strip sizes
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 1 && !['and', 'with', 'for', 'of', 'in', 'the'].includes(w));
  };

  const w1 = clean(s1);
  const w2 = clean(s2);
  if (w1.length === 0 || w2.length === 0) return 0;

  // Word Overlap Jaccard Index
  const intersect = w1.filter(w => w2.includes(w));
  const union = Array.from(new Set([...w1, ...w2]));
  const overlap = intersect.length / union.length;

  // Levenshtein word similarity
  const l1 = w1.join(' ');
  const l2 = w2.join(' ');
  const len = Math.max(l1.length, l2.length);
  if (len === 0) return 1.0;

  let track = Array(l2.length + 1).fill(null).map(() => Array(l1.length + 1).fill(null));
  for (let i = 0; i <= l1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= l2.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= l2.length; j += 1) {
    for (let i = 1; i <= l1.length; i += 1) {
      const indicator = l1[i - 1] === l2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }
  const dist = track[l2.length][l1.length];
  const levSim = (len - dist) / len;

  return Math.max(overlap, levSim);
}
