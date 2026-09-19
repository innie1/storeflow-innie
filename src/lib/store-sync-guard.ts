/** Serialize background saves and refuse to overwrite concurrent remote edits. */
const queues = new Map<string, Promise<void>>();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function mergeStoreSnapshot(base: Record<string, unknown>, next: Record<string, unknown>, remote: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...remote };
  for (const key of Object.keys(next)) {
    if (same(base[key], next[key])) continue;
    if (!same(remote[key], base[key]) && !same(remote[key], next[key])) throw new Error(`Another device changed ${key}. Your local copy is kept; reconcile the two copies before syncing.`);
    merged[key] = next[key];
  }
  return merged;
}
export function serializeStoreSync(key: string, action: () => Promise<void>): Promise<void> {
  const run = (queues.get(key) || Promise.resolve()).catch(() => {}).then(action);
  queues.set(key, run);
  void run.finally(() => { if (queues.get(key) === run) queues.delete(key); }).catch(() => {});
  return run;
}
