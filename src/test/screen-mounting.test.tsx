import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { useEffect, useState, type ReactNode } from 'react';
import { readSource } from './helpers/source';
import { screensForTab, SCREEN_LOADERS, resetPreloadedScreens, preloadScreens, type ScreenName } from '@/pages/screens';
import { beginWork, resetWorkInProgress, subscribeWorkInProgress, workInProgress } from '@/lib/work-in-progress';
import type { TabId } from '@/types/store';

/**
 * The app used to mount all thirty-one screens at once and hide thirty of them
 * with CSS. A shopkeeper opening it to record one bundle paid, at startup, for
 * the marketplace, the academy, the games screens and the whole of Settings -
 * a megabyte of compressed JavaScript before the first screen could appear,
 * and the same work again on every switch between shops.
 *
 * Only the screen being looked at is mounted now. These say so, and they are
 * what stops the old shape quietly coming back: a single plain import of a
 * screen in Index, or one more hidden div, would undo it.
 */

const indexSource = () => readSource('src/pages/Index.tsx');
const screensSource = () => readSource('src/pages/screens.ts');

describe('one tab shows one screen', () => {
  it('names at most two screens for any tab, and one for nearly all', () => {
    const shape = { simpleMode: false, serviceFirst: false, laundry: true, games: true };
    const tabs = Object.keys(SCREEN_TABS) as TabId[];

    for (const tab of tabs) {
      const screens = screensForTab(tab, shape);
      expect(screens.length, `${tab} mounts ${screens.length} screens`).toBeLessThanOrEqual(2);
    }

    // Only the home screen pairs two, and only because a per-piece worker's
    // own record sits above whichever home screen the shop uses.
    const pairs = tabs.filter(tab => screensForTab(tab, shape).length === 2);
    expect(pairs).toEqual(['dashboard']);
  });

  it('shows the home screen the shop actually uses, not both', () => {
    expect(screensForTab('dashboard', { simpleMode: true })).toEqual(['MyPieceWork', 'SimpleModeHome']);
    expect(screensForTab('dashboard', { simpleMode: false })).toEqual(['MyPieceWork', 'Dashboard']);
  });

  it('gives a laundry its price list screen and a shop with goods the inventory', () => {
    expect(screensForTab('inventory', { serviceFirst: true })).toEqual(['LaundryPricingSetup']);
    expect(screensForTab('inventory', { serviceFirst: false })).toEqual(['Inventory']);
  });

  it('mounts no games screen in a shop that is not a game centre', () => {
    for (const tab of ['games-dashboard', 'games-history', 'games-analytics', 'games-settings'] as TabId[]) {
      expect(screensForTab(tab, { games: false })).toEqual([]);
      expect(screensForTab(tab, { games: true })).toHaveLength(1);
    }
  });

  it('mounts no laundry workspace in a shop that is not a laundry', () => {
    expect(screensForTab('laundry-records', { laundry: false })).toEqual([]);
    expect(screensForTab('laundry-records', { laundry: true })).toEqual(['LaundryWorkspace']);
  });

  it('knows how to fetch every screen it names', () => {
    const shape = { simpleMode: false, serviceFirst: false, laundry: true, games: true };
    const named = new Set<ScreenName>();
    for (const tab of Object.keys(SCREEN_TABS) as TabId[]) {
      screensForTab(tab, shape).forEach(name => named.add(name));
      screensForTab(tab, { ...shape, simpleMode: true, serviceFirst: true }).forEach(name => named.add(name));
    }
    for (const name of named) {
      expect(SCREEN_LOADERS[name], `${name} has no loader`).toBeTypeOf('function');
    }
  });
});

describe('the screens are fetched, not bundled in', () => {
  it('has no plain import of a screen in Index', () => {
    const code = indexSource();
    // The registry is the only way in. A plain `import Settings from
    // '@/components/Settings'` here would put the largest screen in the app
    // back into the startup bundle however the screen itself is rendered.
    const screenImports = [...code.matchAll(/^import\s+(\w+)\s+from\s+'@\/components\/([^']+)'/gm)]
      .map(match => ({ name: match[1], path: match[2] }))
      .filter(entry => (Object.keys(SCREEN_LOADERS) as string[]).includes(entry.name));
    expect(screenImports).toEqual([]);
  });

  it('fetches every screen through a dynamic import', () => {
    const code = screensSource();
    for (const name of Object.keys(SCREEN_LOADERS)) {
      // Matched at the start of its own line. Anywhere in the line and
      // `Settings:` also matches inside `GamesSettings:`, so a screen quietly
      // bundled back in would be waved through by its own neighbour.
      const wanted = `${name}: () => import(`;
      const found = code.split(/\r?\n/).some(line => line.trim().startsWith(wanted));
      expect(found, `${name} is not fetched dynamically`).toBe(true);
    }
    // A plain import in the registry would defeat the whole thing.
    expect(code).not.toMatch(/^import\s+\w+\s+from\s+'@\/components\//m);
  });

  it('does not import the session helpers from the Settings screen', () => {
    // They are read at startup to decide whether a shop is already open. While
    // they lived in Settings, that read alone pulled the biggest screen in the
    // app into the startup bundle.
    expect(indexSource()).not.toMatch(/from\s+'@\/components\/Settings'/);
  });

  it('no longer hides screens with CSS', () => {
    const code = indexSource();
    const hidden = [...code.matchAll(/tab === '[a-z0-9-]+' \? 'block' : 'hidden'/g)];
    expect(hidden).toEqual([]);
  });

  it('starts each screen at most once when asked to fetch ahead', () => {
    resetPreloadedScreens();
    const started: string[] = [];
    const loaders = SCREEN_LOADERS as unknown as Record<string, () => Promise<unknown>>;
    const realDiary = loaders.Diary;
    loaders.Diary = () => { started.push('Diary'); return Promise.resolve({ default: () => null }); };
    try {
      preloadScreens(['Diary']);
      preloadScreens(['Diary']);
      preloadScreens(['Diary']);
      expect(started).toEqual(['Diary']);
    } finally {
      loaders.Diary = realDiary;
      resetPreloadedScreens();
    }
  });
});

/**
 * The keep-alive exception, and its limit.
 *
 * A screen holding a form somebody is halfway through - an intake with twelve
 * shirts counted into it - has to survive the counter tapping Orders to check
 * a name. That is the only screen allowed to stay mounted while something else
 * is on screen, and only while the form is open.
 */

function Screen({ name, onMount, onUnmount }: { name: string; onMount: (n: string) => void; onUnmount: (n: string) => void }) {
  useEffect(() => {
    onMount(name);
    return () => onUnmount(name);
  }, [name, onMount, onUnmount]);
  return <div data-testid={`screen-${name}`}>{name}</div>;
}

/** The same rule Index applies, small enough to test on its own. */
function Workspace({ tab, mounted, children }: { tab: string; mounted: (tab: string) => ReactNode; children?: ReactNode }) {
  const [unsavedWorkOpen, setUnsavedWorkOpen] = useState(false);
  const [heldTab, setHeldTab] = useState<string | null>(null);

  useEffect(() => subscribeWorkInProgress(() => setUnsavedWorkOpen(workInProgress())), []);
  useEffect(() => {
    if (unsavedWorkOpen) {
      setHeldTab(previous => previous ?? tab);
      return;
    }
    setHeldTab(previous => (previous && previous !== tab ? null : previous));
  }, [unsavedWorkOpen, tab]);

  return (
    <div>
      {heldTab && (
        <div key={`screen:${heldTab}`} className={tab === heldTab ? 'block' : 'hidden'}>{mounted(heldTab)}</div>
      )}
      {tab !== heldTab && <div key={`screen:${tab}`}>{mounted(tab)}</div>}
      {children}
    </div>
  );
}

describe('only the active screen stays mounted', () => {
  let mounts: string[] = [];
  let unmounts: string[] = [];
  const onMount = (n: string) => { mounts.push(n); };
  const onUnmount = (n: string) => { unmounts.push(n); };
  const mountedScreen = (tab: string) => <Screen name={tab} onMount={onMount} onUnmount={onUnmount} />;

  beforeEach(() => {
    mounts = [];
    unmounts = [];
    resetWorkInProgress();
  });
  afterEach(() => { cleanup(); resetWorkInProgress(); });

  it('mounts one screen and unmounts it when another is opened', () => {
    const view = render(<Workspace tab="dashboard" mounted={mountedScreen} />);
    expect(mounts).toEqual(['dashboard']);

    view.rerender(<Workspace tab="settings" mounted={mountedScreen} />);
    expect(unmounts).toEqual(['dashboard']);
    expect(mounts).toEqual(['dashboard', 'settings']);
    expect(screen.queryByTestId('screen-dashboard')).toBeNull();
    expect(screen.getByTestId('screen-settings')).toBeTruthy();
  });

  it('holds a screen with unsaved work, and lets it go once the work is done', () => {
    const view = render(<Workspace tab="laundry-records" mounted={mountedScreen} />);
    // Wrapped, because the screen itself says "somebody is mid-form" from
    // inside React; the app never learns about it between two renders.
    let finish: () => void = () => {};
    act(() => { finish = beginWork(); });

    // Away to another screen mid-intake: the form stays mounted, hidden.
    view.rerender(<Workspace tab="orders" mounted={mountedScreen} />);
    expect(unmounts).toEqual([]);
    expect(screen.getByTestId('screen-laundry-records')).toBeTruthy();
    expect(screen.getByTestId('screen-orders')).toBeTruthy();
    // Exactly two: the one being looked at and the one holding the form.
    expect(document.querySelectorAll('[data-testid^="screen-"]')).toHaveLength(2);

    // Back to it, and the same instance is still there - not a fresh one.
    view.rerender(<Workspace tab="laundry-records" mounted={mountedScreen} />);
    expect(mounts.filter(name => name === 'laundry-records')).toHaveLength(1);

    // The intake is recorded, and they move on. Now it goes.
    act(() => finish());
    view.rerender(<Workspace tab="laundry-records" mounted={mountedScreen} />);
    // Still on it, so it is not pulled out from under them. Orders, which
    // they passed through, is long gone - that is the point of the change.
    expect(unmounts).not.toContain('laundry-records');
    view.rerender(<Workspace tab="orders" mounted={mountedScreen} />);
    expect(unmounts).toContain('laundry-records');
    expect(document.querySelectorAll('[data-testid^="screen-"]')).toHaveLength(1);
  });

  it('never holds more than one screen, however many are visited', () => {
    const view = render(<Workspace tab="laundry-records" mounted={mountedScreen} />);
    let finish: () => void = () => {};
    act(() => { finish = beginWork(); });
    for (const tab of ['orders', 'inventory', 'customers', 'settings', 'manager']) {
      view.rerender(<Workspace tab={tab} mounted={mountedScreen} />);
      expect(document.querySelectorAll('[data-testid^="screen-"]')).toHaveLength(2);
    }
    act(() => finish());
    view.rerender(<Workspace tab="diary" mounted={mountedScreen} />);
    expect(document.querySelectorAll('[data-testid^="screen-"]')).toHaveLength(1);
  });
});

/** Every tab the app can render, so a new one cannot slip past these. */
const SCREEN_TABS: Record<string, true> = {
  dashboard: true, orders: true, 'laundry-records': true, inventory: true, sales: true,
  expenses: true, manager: true, pending: true, history: true, roi: true,
  settings: true, marketplace: true, customers: true, suppliers: true, goals: true,
  diary: true, documents: true, academy: true, achievements: true, wishlist: true,
  staff: true, 'cash-drawer': true, 'communication-center': true, 'qr-hub': true,
  'games-dashboard': true, 'games-history': true, 'games-analytics': true, 'games-settings': true,
};
