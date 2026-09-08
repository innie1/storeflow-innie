import { beforeEach, describe, expect, it } from 'vitest';
import { backfillStoreIndexTypes, getStoreIndex } from '@/lib/store-data';
import { readSource } from './helpers/source';

/**
 * Somebody running a laundry, a barber shop and a restaurant off one phone had
 * nothing to tell the three apart: the switcher showed the same generic shop
 * icon for every store, and typing six characters told you which shop you had
 * opened only after it opened.
 */

const INDEX_KEY = 'storeflow_index';

describe('the index remembers what trade each shop is', () => {
  beforeEach(() => localStorage.clear());

  it('fills in the trade for entries saved before it was recorded', () => {
    localStorage.setItem(INDEX_KEY, JSON.stringify([
      { code: 'OLD001', name: 'Shine', createdAt: new Date(0).toISOString() },
    ]));
    localStorage.setItem('storeflow_OLD001', JSON.stringify({
      accessCode: 'OLD001', storeName: 'Shine', storeType: 'laundry',
    }));

    expect(backfillStoreIndexTypes()[0].businessType).toBe('laundry');
    // Written back, so the work is done once rather than on every open.
    expect(getStoreIndex()[0].businessType).toBe('laundry');
  });

  it('leaves an entry alone when the store is not on this device', () => {
    localStorage.setItem(INDEX_KEY, JSON.stringify([
      { code: 'GONE01', name: 'Missing', createdAt: new Date(0).toISOString() },
    ]));
    expect(backfillStoreIndexTypes()[0].businessType).toBeUndefined();
  });

  it('does not disturb entries that already know', () => {
    localStorage.setItem(INDEX_KEY, JSON.stringify([
      { code: 'HAS001', name: 'Cuts', createdAt: new Date(0).toISOString(), businessType: 'barber' },
    ]));
    expect(backfillStoreIndexTypes()[0].businessType).toBe('barber');
  });

  it('survives an index that is not an array of what it expects', () => {
    localStorage.setItem(INDEX_KEY, 'not json at all');
    expect(() => backfillStoreIndexTypes()).not.toThrow();
  });
});

describe('saying which shop before opening it', () => {
  const access = readSource('src/components/StoreAccess.tsx');
  const switcher = readSource('src/components/StoreSwitcher.tsx');

  it('shows the shop a typed code belongs to', () => {
    expect(access).toContain('codePreview');
    expect(access).toContain("if (code.length < 6) return null;");
  });

  /**
   * What makes naming the shop safe. The preview reads this device's own index
   * and nothing else, so a code has to have been opened on this phone before
   * it can be named — someone guessing six characters at a stranger's shop
   * gets nothing back, because a shop they have never opened is not there to
   * be found.
   */
  it('can only name a shop this device has already opened', () => {
    const block = access.slice(access.indexOf('const codePreview'), access.indexOf('const handleAccess'));
    expect(block).toContain('getStoreIndex()');
    expect(block).not.toContain('supabase');
    expect(block).toContain('if (!entry) return null;');
  });

  /**
   * Read, not loaded: loadStore mutates and persists, which typing six
   * characters has no business doing.
   */
  it('reads the index rather than loading the store to preview it', () => {
    const block = access.slice(access.indexOf('const codePreview'), access.indexOf('const handleAccess'));
    expect(block).toContain('getStoreIndex()');
    expect(block).not.toContain('loadStore(');
  });

  it('gives each store in the switcher its own trade and icon', () => {
    expect(switcher).toContain('getBusinessTemplate({ storeType: s.businessType }');
    expect(switcher).toContain('backfillStoreIndexTypes()');
  });
});
