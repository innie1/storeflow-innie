import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readStoreSignal, signalFromStore, invalidateStoreSignal, EMPTY_SIGNAL } from '@/lib/mascot-store-signal';
import { readSource } from './helpers/source';
import type { StoreData } from '@/types/store';

/**
 * The mascot is decorative, and it was the heaviest thing on the screen.
 *
 * It called loadStore() on a 5-second interval, in every mounted instance,
 * even when the live store had been handed to it as a prop. loadStore is not a
 * read: it re-parses the whole record, runs scheduled savings deductions,
 * re-syncs product performance and writes the store index back to
 * localStorage. Measured in the running app with three mascots on the home
 * screen: 9 reads and 77 kB of JSON parsed every 15 seconds, on the same main
 * thread the animation runs on. On a multi-megabyte store that is tens of
 * megabytes of parsing a minute.
 */

const storeWith = (over: Partial<StoreData> = {}): StoreData => ({
  id: 's1',
  storeId: 'SF-T',
  storeName: 'T',
  accessCode: 'FLOWT1',
  storeType: 'provision',
  products: [],
  sales: [],
  createdAt: new Date(0).toISOString(),
  ...over,
} as StoreData);

beforeEach(() => {
  localStorage.clear();
  invalidateStoreSignal();
});

describe('reading the mascot signal from a store already in memory', () => {
  it('takes the hours and manager flag straight off the object', () => {
    const store = storeWith({
      profile: { openingTime: '08:00', closingTime: '20:00' } as any,
      managerSettings: { enabled: false } as any,
      sales: [{ id: 'a' }, { id: 'b' }] as any,
    });
    expect(signalFromStore(store)).toEqual({
      openingTime: '08:00',
      closingTime: '20:00',
      managerEnabled: false,
      salesCount: 2,
    });
  });

  it('treats a store with no manager settings as enabled', () => {
    expect(signalFromStore(storeWith()).managerEnabled).toBe(true);
  });
});

describe('falling back to storage', () => {
  it('returns nothing useful when there is no session, without throwing', () => {
    expect(readStoreSignal()).toEqual(EMPTY_SIGNAL);
  });

  it('reads the active store when there is one', () => {
    localStorage.setItem('storeflow_session', JSON.stringify({ accessCode: 'flowt1' }));
    localStorage.setItem('storeflow_FLOWT1', JSON.stringify(storeWith({
      profile: { openingTime: '09:00', closingTime: '18:00' } as any,
    })));

    const signal = readStoreSignal();
    expect(signal.openingTime).toBe('09:00');
    expect(signal.closingTime).toBe('18:00');
  });

  it('parses once for many callers rather than once each', () => {
    localStorage.setItem('storeflow_session', JSON.stringify({ accessCode: 'FLOWT1' }));
    localStorage.setItem('storeflow_FLOWT1', JSON.stringify(storeWith({
      profile: { closingTime: '18:00' } as any,
    })));

    // jsdom exposes getItem on the localStorage instance, not the prototype.
    const spy = vi.spyOn(localStorage, 'getItem');
    // Ten mascots asking at once is the real case — a screen can hold several.
    for (let i = 0; i < 10; i++) readStoreSignal();
    const storeReads = spy.mock.calls.filter(c => c[0] === 'storeflow_FLOWT1').length;
    spy.mockRestore();

    expect(storeReads).toBe(1);
  });

  it('survives a corrupt record instead of taking the screen down', () => {
    localStorage.setItem('storeflow_session', JSON.stringify({ accessCode: 'FLOWT1' }));
    localStorage.setItem('storeflow_FLOWT1', '{ not json');
    expect(readStoreSignal()).toEqual(EMPTY_SIGNAL);
  });
});

describe('the mascot does not go behind its own props', () => {
  const source = () => readSource('src/components/Mascot.tsx');

  it('never calls loadStore, which mutates and persists', () => {
    // loadStore runs scheduled savings deductions and writes the store index.
    // A decorative component has no business doing either, twelve times a
    // minute, per instance.
    //
    // Comments are stripped first: the one explaining this names loadStore.
    const code = source()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/loadStore\s*\(/);
    expect(code).not.toContain("from '@/lib/store-data'");
  });

  it('uses the store it was handed instead of re-reading it', () => {
    expect(source()).toContain('signalFromStore(store)');
  });

  it('does not poll every couple of seconds any more', () => {
    const s = source();
    expect(s).not.toContain('setInterval(checkRole, 2000)');
    expect(s).not.toContain('setInterval(fetchHours, 5000)');
  });

  it('stops its idle animation timers while the app is off screen', () => {
    const s = source();
    // Four idle loops — breathing, glasses, posture, random activity. Each is
    // purely cosmetic, so none should run for a tab nobody is looking at.
    const guarded = s.split('setInterval(').filter(chunk => chunk.slice(0, 400).includes('document.hidden')).length;
    expect(guarded).toBeGreaterThanOrEqual(4);
  });
});
