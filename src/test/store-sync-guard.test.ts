import { describe, expect, it } from 'vitest';
import { mergeStoreSnapshot, serializeStoreSync } from '@/lib/store-sync-guard';

describe('store sync concurrency guard', () => {
  it('preserves unrelated remote fields while applying local changes', () => {
    expect(mergeStoreSnapshot({ sales: [], name: 'Old' }, { sales: [{ id: 'sale' }], name: 'Old' }, { sales: [], name: 'New' })).toEqual({ sales: [{ id: 'sale' }], name: 'New' });
  });
  it('refuses to overwrite another device’s sale or stock changes', () => {
    expect(() => mergeStoreSnapshot({ sales: [] }, { sales: [{ id: 'local' }] }, { sales: [{ id: 'remote' }] })).toThrow('Another device');
  });
  it('allows retry after the same data reached the server', () => {
    expect(mergeStoreSnapshot({ sales: [] }, { sales: [1] }, { sales: [1] })).toEqual({ sales: [1] });
  });
  it('serializes one store without blocking a different store', async () => {
    const events: string[] = []; let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = serializeStoreSync('a', async () => { events.push('a-start'); await gate; events.push('a-end'); });
    const second = serializeStoreSync('a', async () => { events.push('a-next'); });
    await serializeStoreSync('b', async () => { events.push('b'); });
    expect(events).toContain('b'); expect(events).not.toContain('a-next');
    release(); await Promise.all([first, second]);
    expect(events.indexOf('a-end')).toBeLessThan(events.indexOf('a-next'));
  });
});
