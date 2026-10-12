/** Serialize background saves and refuse to overwrite concurrent remote edits. */
const queues = new Map<string, Promise<unknown>>();
export const FINANCIAL_FIELDS = ['products', 'sales', 'pendingPayments', 'customers', 'cashBalance', 'bankBalance', 'walletBalance', 'inventoryMovements', 'expenses', 'restocks', 'investments', 'trash'] as const;
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a).filter(key => (a as any)[key] !== undefined); const right = Object.keys(b).filter(key => (b as any)[key] !== undefined);
  return left.length === right.length && left.every(key => Object.prototype.hasOwnProperty.call(b, key) && same((a as any)[key], (b as any)[key]));
}
/**
 * Merged record by record, by id, rather than whole: two phones adding
 * customers, expense requests or piece-work claims at once both keep theirs.
 * The same rule as the cloud's merge_inventory_snapshot
 * (supabase/migrations/20261012131342_staff_records_and_record_merge.sql).
 */
export const RECORD_FIELDS = ['customers', 'staffExpenseRequests', 'pieceWork'] as const;
const MERGE_FINANCIAL = FINANCIAL_FIELDS.filter(key => !(RECORD_FIELDS as readonly string[]).includes(key));

type Rec = { id?: string };
export function mergeRecordsById(base: unknown, next: unknown, remote: unknown, key: string): Rec[] {
  const b = Array.isArray(base) ? base as Rec[] : [];
  const n = Array.isArray(next) ? next as Rec[] : [];
  let result = Array.isArray(remote) ? [...remote as Rec[]] : [];
  if ([...b, ...n, ...result].some(item => !item?.id)) {
    if (!same(b, n) && !same(result, b) && !same(result, n)) throw new Error(`Another device changed ${key}. Your local copy is kept; reconcile the two copies before syncing.`);
    return same(b, n) ? result : n;
  }
  for (const id of new Set([...b, ...n].map(item => item.id!))) {
    const was = b.find(item => item.id === id);
    const now = n.find(item => item.id === id);
    if (same(was, now)) continue;
    const there = result.find(item => item.id === id);
    if (!same(there, was) && !same(there, now)) throw new Error(`Another device changed the same record in ${key}. Your local copy is kept; reconcile the two copies before syncing.`);
    const at = result.findIndex(item => item.id === id);
    if (!now) { if (at >= 0) result.splice(at, 1); }
    else if (at >= 0) result[at] = now;
    else result = [now, ...result];
  }
  return result;
}

export function mergeStoreSnapshot(base: Record<string, unknown>, next: Record<string, unknown>, remote: Record<string, unknown>): Record<string, unknown> {
  // Stock, money and their ledgers form one transaction, even when a field
  // happens to have the same numeric result on two competing devices.
  if (MERGE_FINANCIAL.some(key => !same(base[key], next[key])) &&
      !MERGE_FINANCIAL.every(key => same(base[key], remote[key])) &&
      !MERGE_FINANCIAL.every(key => same(next[key], remote[key]))) {
    throw new Error('Another device changed stock or payments. Your local records are kept for review.');
  }
  const merged = { ...remote };
  for (const key of new Set([...Object.keys(base), ...Object.keys(next)])) {
    if (same(base[key], next[key])) continue;
    if ((RECORD_FIELDS as readonly string[]).includes(key)) {
      merged[key] = mergeRecordsById(base[key], next[key], remote[key], key);
      continue;
    }
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
