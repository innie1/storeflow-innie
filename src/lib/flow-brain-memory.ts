import { Product, StoreData } from '@/types/store';

export interface FlowBrainMemory {
  lastIntent?: string;
  lastProductId?: string;
  lastTopic?: string;
  lastAction?: string;
  aliases: Record<string, string>;
  corrections: number;
  updatedAt: string;
}

const KEY = 'storeflow_flow_brain_v2_';
const storeKey = (store: StoreData) => KEY + (store.id || store.storeId || store.accessCode || 'default');

export function loadBrainMemory(store: StoreData): FlowBrainMemory {
  const fallback: FlowBrainMemory = { aliases: {}, corrections: 0, updatedAt: new Date().toISOString() };
  try {
    const raw = localStorage.getItem(storeKey(store));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return { ...fallback, ...parsed, aliases: parsed.aliases || {} };
  } catch { return fallback; }
}

export function saveBrainMemory(store: StoreData, memory: FlowBrainMemory) {
  try { localStorage.setItem(storeKey(store), JSON.stringify({ ...memory, updatedAt: new Date().toISOString() })); } catch {}
}

export function rememberBrainContext(store: StoreData, patch: Partial<FlowBrainMemory>) {
  saveBrainMemory(store, { ...loadBrainMemory(store), ...patch });
}

export function learnBrainAlias(store: StoreData, alias: string, product: Product) {
  const clean = alias.trim().toLowerCase();
  if (clean.length < 2) return;
  const memory = loadBrainMemory(store);
  memory.aliases[clean] = product.id;
  memory.lastProductId = product.id;
  memory.corrections += 1;
  saveBrainMemory(store, memory);
}

export function resolveBrainAlias(store: StoreData, alias: string): Product | null {
  const id = loadBrainMemory(store).aliases[alias.trim().toLowerCase()];
  return id ? (store.products || []).find(p => p.id === id) || null : null;
}
