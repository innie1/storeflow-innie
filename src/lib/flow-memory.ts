/**
 * Flow Memory — shared device-level storage (NOT per store).
 * Stores: suppliers, coins, streak.
 * All data lives in localStorage under 'storeflow_flow_memory'.
 */

export interface Supplier {
  id: string;
  name: string;
  products: string[];  // product names they supply
  pricePerUnit: number;
  unit?: string;       // e.g. "per carton", "per piece"
  distance?: string;   // e.g. "2km", "market"
  notes?: string;
  addedAt: string;
}

export interface FlowMemory {
  suppliers: Supplier[];
  coins: number;
  streak: number;
  streakDate: string;  // ISO date of last streak update
  lastAdviceDate?: string;
}

const KEY = 'storeflow_flow_memory';

function load(): FlowMemory {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { suppliers: [], coins: 0, streak: 0, streakDate: '', ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { suppliers: [], coins: 0, streak: 0, streakDate: '' };
}

function save(m: FlowMemory) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

export function getFlowMemory(): FlowMemory { return load(); }

export function addSupplier(s: Omit<Supplier, 'id' | 'addedAt'>): Supplier {
  const m = load();
  const entry: Supplier = { ...s, id: Math.random().toString(36).slice(2), addedAt: new Date().toISOString() };
  m.suppliers = [entry, ...m.suppliers];
  save(m); return entry;
}

export function updateSupplier(id: string, s: Partial<Supplier>) {
  const m = load();
  m.suppliers = m.suppliers.map(x => x.id === id ? { ...x, ...s } : x);
  save(m);
}

export function deleteSupplier(id: string) {
  const m = load();
  m.suppliers = m.suppliers.filter(x => x.id !== id);
  save(m);
}

export function getSuppliers(): Supplier[] { return load().suppliers; }

/** Add coins. Returns new total. */
export function addCoins(amount: number): number {
  const m = load();
  m.coins = Math.max(0, m.coins + amount);
  save(m);
  return m.coins;
}

export function getCoins(): number { return load().coins; }

/** Record today's streak. Returns { streak, isNew } where isNew = first update today. */
export function recordStreak(): { streak: number; isNew: boolean } {
  const m = load();
  const today = new Date().toISOString().split('T')[0];
  if (m.streakDate === today) return { streak: m.streak, isNew: false };
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  m.streak = m.streakDate === yesterday ? m.streak + 1 : 1;
  m.streakDate = today;
  save(m);
  return { streak: m.streak, isNew: true };
}

export function getStreak(): { streak: number; streakDate: string } {
  const m = load();
  return { streak: m.streak, streakDate: m.streakDate };
}
