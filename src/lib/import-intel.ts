import { StoreData, LearnedProduct } from '../types/store';

// Hardcoded Nigerian Product Dictionary translations
export interface DictionaryEntry {
  officialName: string;
  aliases: string[];
}

export const NIGERIAN_PRODUCT_DICTIONARY: DictionaryEntry[] = [
  { officialName: 'Coca-Cola PET 50cl', aliases: ['big coke', 'large coke', 'coke 50cl', 'coke pet 50cl', '50cl coke'] },
  { officialName: 'Coca-Cola PET 35cl', aliases: ['small coke', 'mini coke', 'coke 35cl', 'coke pet 35cl', '35cl coke'] },
  { officialName: 'Coca-Cola Glass Bottle', aliases: ['bottle coke', 'glass coke', 'coke bottle'] },
  { officialName: 'Pepsi PET 50cl', aliases: ['big pepsi', 'pepsi 50cl', 'pepsi pet'] },
  { officialName: 'Fanta PET 50cl', aliases: ['big fanta', 'fanta 50cl', 'fanta pet'] },
  { officialName: 'Sprite PET 50cl', aliases: ['big sprite', 'sprite 50cl', 'sprite pet'] },
  { officialName: 'Hollandia Carton', aliases: ['hollandia ctn', 'hollandia carton', 'hollandia case'] },
  { officialName: 'Indomie Noodles Pack', aliases: ['indomie', 'indomie pack', 'indomie noodles'] },
  { officialName: 'Peak Milk Sachet', aliases: ['peak sachet', 'peak milk sachet', 'peak milk packet'] },
  { officialName: 'Munch It Biscuit', aliases: ['munch it', 'munchit'] }
];

export interface InterpretResult {
  officialName: string;
  parsedFraction?: 'half_carton' | 'half_pack' | 'half_roll';
  qtyMultiplier: number;
}

/**
 * Interprets product name and extracts fractions & dictionary official names
 */
export function interpretProductName(rawName: string): InterpretResult {
  let name = rawName.trim();
  const lower = name.toLowerCase();
  
  let parsedFraction: 'half_carton' | 'half_pack' | 'half_roll' | undefined;
  let qtyMultiplier = 1.0;

  // Fraction detection
  const halfCartonWords = ['½ carton', 'half ctn', 'half carton', '1/2 carton', '1/2 ctn', '½ ctn'];
  const halfPackWords = ['½ pack', 'half pack', '1/2 pack', '½ pk', '1/2 pk', 'half pk'];
  const halfRollWords = ['½ roll', 'half roll', '1/2 roll'];

  if (halfCartonWords.some(w => lower.includes(w))) {
    parsedFraction = 'half_carton';
    qtyMultiplier = 0.5;
  } else if (halfPackWords.some(w => lower.includes(w))) {
    parsedFraction = 'half_pack';
    qtyMultiplier = 0.5;
  } else if (halfRollWords.some(w => lower.includes(w))) {
    parsedFraction = 'half_roll';
    qtyMultiplier = 0.5;
  }

  // Strip fraction descriptors from the name to improve dictionary matching
  let cleanedName = name;
  const allFractionWords = [...halfCartonWords, ...halfPackWords, ...halfRollWords];
  for (const word of allFractionWords) {
    if (cleanedName.toLowerCase().includes(word)) {
      const rx = new RegExp(word.replace('/', '\\/'), 'gi');
      cleanedName = cleanedName.replace(rx, '');
    }
  }
  // Remove trailing/leading spaces or punctuation left over
  cleanedName = cleanedName.replace(/^[\s,;.-]+|[\s,;.-]+$/g, '').trim();

  // Try matching against Nigerian Product Dictionary
  const cleanedLower = cleanedName.toLowerCase();
  let officialName = cleanedName;

  for (const entry of NIGERIAN_PRODUCT_DICTIONARY) {
    if (entry.aliases.some(alias => cleanedLower === alias || cleanedLower.includes(alias))) {
      officialName = entry.officialName;
      break;
    }
  }

  // Clean up standard carton abbreviations for non-matched items
  if (officialName === cleanedName) {
    let replaced = cleanedName;
    if (lower.includes('ctn')) replaced = replaced.replace(/ctn/gi, 'Carton');
    if (lower.includes('pet')) replaced = replaced.replace(/pet/gi, 'PET Bottle');
    if (lower.includes('sachet')) replaced = replaced.replace(/sachet/gi, 'Sachet');
    if (lower.includes('pack')) replaced = replaced.replace(/pack/gi, 'Pack');
    officialName = replaced.trim();
  }

  return {
    officialName,
    parsedFraction,
    qtyMultiplier
  };
}

/**
 * Searches the store memory database for pre-learned supplier naming styles or general product names
 */
export function lookupStoreMemory(
  store: StoreData,
  rawItemName: string,
  supplierName?: string
): LearnedProduct | undefined {
  const cleanName = rawItemName.trim().toLowerCase();
  const list = store.learnedProducts || [];

  // 1. Try matching by supplier + alias
  if (supplierName) {
    const cleanSupplier = supplierName.trim().toLowerCase();
    const match = list.find(lp => {
      const isAliasMatch = lp.aliasUsed && lp.aliasUsed.toLowerCase() === cleanName;
      const isSupplierMatch = lp.supplier && lp.supplier.toLowerCase() === cleanSupplier;
      return isAliasMatch && isSupplierMatch;
    });
    if (match) return match;
  }

  // 2. Try matching by alias or officialName generally
  const matchAlias = list.find(lp => {
    return (lp.aliasUsed && lp.aliasUsed.toLowerCase() === cleanName) || 
      lp.name.toLowerCase() === cleanName;
  });
  
  return matchAlias;
}
