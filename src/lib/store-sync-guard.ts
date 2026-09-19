/** Serialize background saves and refuse to overwrite concurrent remote edits. */
const queues = new Map<string, Promise<unknown>>();
export const FINANCIAL_FIELDS = ['products', 'sales', 'pendingPayments', 'customers', 'cashBalance', 'bankBalance', 'inventoryMovements', 'expenses', 'restocks', 'investments', 'trash'] as const;
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a).filter(key => (a as any)[key] !== undefined); const right = Object.keys(b).filter(key => (b as any)[key] !== undefined);
  return left.length === right.length && left.every(key => Object.prototype.hasOwnProperty.call(b, key) && same((a as any)[key], (b as any)[key]));
}
export function mergeStoreSnapshot(base: Record<string, unknown>, next: Record<string, unknown>, remote: Record<string, unknown>): Record<string, unknown> {
  // Stock, money and their ledgers form one transaction, even when a field
  // happens to have the same numeric result on two competing devices.
  if (FINANCIAL_FIELDS.some(key => !same(base[key], next[key])) &&
      !FINANCIAL_FIELDS.every(key => same(base[key], remote[key])) &&
      !FINANCIAL_FIELDS.every(key => same(next[key], remote[key]))) {
    throw new Error('Another device changed stock or payments. Your local records are kept for review.');
  }
  const merged = { ...remote };
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (same(base[key], next[key])) continue;
    if (!same(remote[key], base[key]) && !same(remote[key], next[key])) throw new Error(`Another device changed ${key}. Your local copy is kept; reconcile the two copies before syncing.`);
    if (key in next) merged[key] = next[key]; else delete merged[key];
  }
  return merged;
}
export function serializeStoreSync<T>(key: string, action: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) || Promise.resolve()).catch(() => {}).then(action);
  queues.set(key, run);
  void run.finally(() => { if (queues.get(key) === run) queues.delete(key); }).catch(() => {});
  return run;
}
