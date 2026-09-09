import { Product, StoreData } from '@/types/store';

export interface FlowGarmentCorrection {
  alias: string;
  garment: string;
  quantity?: number;
}

export interface FlowBrainMemory {
  lastIntent?: string;
  lastProductId?: string;
  lastTopic?: string;
  lastAction?: string;
  aliases: Record<string, string>;
  garmentAliases: Record<string, string>;
  pendingGarmentCorrection?: FlowGarmentCorrection;
  corrections: number;
  updatedAt: string;
}

const KEY = 'storeflow_flow_brain_v2_';
const storeKey = (store: StoreData) => KEY + (store.id || store.storeId || store.accessCode || 'default');
const cleanAlias = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function loadBrainMemory(store: StoreData): FlowBrainMemory {
  const fallback: FlowBrainMemory = { aliases: {}, garmentAliases: {}, corrections: 0, updatedAt: new Date().toISOString() };
  try {
    const raw = localStorage.getItem(storeKey(store));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      aliases: parsed.aliases || {},
      garmentAliases: parsed.garmentAliases || {},
    };
  } catch { return fallback; }
}

export function saveBrainMemory(store: StoreData, memory: FlowBrainMemory) {
  try { localStorage.setItem(storeKey(store), JSON.stringify({ ...memory, updatedAt: new Date().toISOString() })); } catch {}
}

export function rememberBrainContext(store: StoreData, patch: Partial<FlowBrainMemory>) {
  saveBrainMemory(store, { ...loadBrainMemory(store), ...patch });
}

export function learnBrainAlias(store: StoreData, alias: string, product: Product) {
  const clean = cleanAlias(alias);
  if (clean.length < 2) return;
  const memory = loadBrainMemory(store);
  memory.aliases[clean] = product.id;
  memory.lastProductId = product.id;
  memory.corrections += 1;
  saveBrainMemory(store, memory);
}

export function resolveBrainAlias(store: StoreData, alias: string): Product | null {
  const id = loadBrainMemory(store).aliases[cleanAlias(alias)];
  return id ? (store.products || []).find(p => p.id === id) || null : null;
}

/**
 * Laundry garments are price-matrix rows, not Product records, so they need
 * their own alias dictionary. It is kept in the same per-store brain bucket:
 * teaching "denm" as "Jeans" in one shop cannot affect another shop.
 */
export function learnBrainGarmentAlias(store: StoreData, alias: string, garment: string): void {
  const clean = cleanAlias(alias);
  const canonical = String(garment || '').trim();
  if (clean.length < 2 || !canonical) return;
  const memory = loadBrainMemory(store);
  memory.garmentAliases[clean] = canonical;
  memory.pendingGarmentCorrection = undefined;
  memory.corrections += 1;
  memory.lastTopic = 'laundry garment';
  memory.lastAction = 'learned garment alias';
  saveBrainMemory(store, memory);
}

export function resolveBrainGarmentAlias(store: StoreData, alias: string): string | null {
  return loadBrainMemory(store).garmentAliases[cleanAlias(alias)] || null;
}

export function rememberPendingGarmentCorrection(store: StoreData, correction: FlowGarmentCorrection): void {
  const memory = loadBrainMemory(store);
  memory.pendingGarmentCorrection = {
    ...correction,
    alias: cleanAlias(correction.alias),
    garment: String(correction.garment || '').trim(),
  };
  saveBrainMemory(store, memory);
}

export function pendingBrainGarmentCorrection(store: StoreData): FlowGarmentCorrection | null {
  return loadBrainMemory(store).pendingGarmentCorrection || null;
}

export function clearPendingGarmentCorrection(store: StoreData): void {
  const memory = loadBrainMemory(store);
  if (!memory.pendingGarmentCorrection) return;
  memory.pendingGarmentCorrection = undefined;
  saveBrainMemory(store, memory);
}
