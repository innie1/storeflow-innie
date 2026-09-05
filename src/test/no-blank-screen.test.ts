import { describe, expect, it } from 'vitest';
import { readSource } from './helpers/source';

/**
 * Clicking through the app could land you on a completely blank page, with no
 * error, nothing for the error boundary to catch, and on a phone no obvious way
 * back.
 *
 * Every screen is mounted at once and shown with
 * `<div className={tab === 'x' ? 'block' : 'hidden'}>`. There is no `else`. A
 * tab id with no matching branch does not throw — every div just stays hidden
 * and the main area renders nothing at all. TabId has more members than the
 * markup has branches, and menu group ids like 'finance' share the same type,
 * so it only takes one setTab with the wrong value.
 *
 * These keep the fallback honest: the list it checks against has to match the
 * branches that actually exist, or it would wave through a tab that renders
 * nothing.
 */

const source = () => readSource('src/pages/Index.tsx');

function mainRegion(code: string): string {
  return code.slice(code.indexOf('<main className='), code.indexOf('</main>'));
}

function branchTabs(code: string): string[] {
  const region = mainRegion(code);
  return [...new Set([...region.matchAll(/tab === '([a-z0-9-]+)'/g)].map(m => m[1]))].sort();
}

function declaredTabs(code: string): string[] {
  const block = code.slice(code.indexOf('const RENDERABLE_TABS'), code.indexOf(']);', code.indexOf('const RENDERABLE_TABS')));
  return [...new Set([...block.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]))].sort();
}

describe('no tab can render nothing', () => {
  it('declares exactly the tabs the markup renders', () => {
    const code = source();
    // If a screen is added or removed and this list is not updated, the
    // fallback would either hide a real screen or wave through a blank one.
    expect(declaredTabs(code)).toEqual(branchTabs(code));
  });

  it('renders a way out when the tab matches nothing', () => {
    const code = source();
    expect(code).toContain('!RENDERABLE_TABS.has(tab)');
    expect(code).toContain("That screen isn't available");
    expect(code).toContain("setTab('dashboard')");
  });

  it('covers the tab ids that have no screen of their own', () => {
    // These are real TabId members with no branch in the main area — 'finance'
    // is a menu group, the others are handled elsewhere or not at all. Any of
    // them reaching setTab used to blank the page.
    const declared = declaredTabs(source());
    for (const orphan of ['finance', 'more', 'profile']) {
      expect(declared, `${orphan} unexpectedly gained a branch`).not.toContain(orphan);
    }
  });
});

describe('the error boundary still offers a way back', () => {
  it('has a reload control, not just a message', () => {
    const boundary = readSource('src/components/ErrorBoundary.tsx');
    expect(boundary).toContain('Reload StoreFlow');
    expect(boundary).toContain('this.handleReload');
  });
});
