import { beforeEach, describe, expect, it } from 'vitest';
import { beginWork, resetWorkInProgress, workInProgress } from '@/lib/work-in-progress';
import { readSource } from './helpers/source';

/**
 * Why installed apps were stuck on an old version.
 *
 * Reported from the field: "the installed apps are the ones still suffering
 * from old UI". They were, and the reason is that the browser only looks for a
 * new service worker on navigation. An app on the home screen does not
 * navigate - it is resumed from the app switcher, the same document as
 * yesterday - so the check never ran, and a shop stayed on whatever build it
 * installed with however many times we deployed.
 *
 * Nothing about that is visible in a browser tab, which navigates constantly,
 * which is why it survived so long.
 */

const main = readSource('src/main.tsx');
const sw = readSource('src/sw.ts');
const intake = readSource('src/components/laundry/LaundryWalkInIntakeV2.tsx');

describe('the app asks whether there is a new version', () => {
  it('does not rely on a navigation that an installed app never makes', () => {
    expect(main).toContain('registration.update()');
  });

  it('asks again when the app comes back to the foreground', () => {
    // The moment an installed app most looks like a fresh launch, and least is
    // one.
    // Ends at the apply logic, not at the first .catch - there is one inside
    // the callback itself.
    const registered = main.slice(main.indexOf('onRegisteredSW'), main.indexOf('let pending'));
    expect(registered).toContain('visibilitychange');
    expect(registered).toContain('!document.hidden');
  });

  it('and on a timer, for an app left open all day behind a counter', () => {
    expect(main).toContain('CHECK_EVERY_MS');
    expect(main).toContain('setInterval');
  });
});

describe('applying it costs nobody their work', () => {
  it('waits for the app to be in the background', () => {
    /*
     * This used to reload the instant a new worker took over. Checking as
     * often as we now do, that would eventually land mid-intake: customer at
     * the counter, twelve shirts counted into a form, screen goes blank.
     */
    const apply = main.slice(main.indexOf('const applyWhenSafe'), main.indexOf('navigator.serviceWorker?.addEventListener'));
    expect(apply).toContain('if (!document.hidden) return;');
    expect(apply).toContain('if (workInProgress()) return;');
  });

  it('tries again the next time the app is hidden rather than giving up', () => {
    // A version that could not be applied once must not be lost.
    expect(main).toContain('document.addEventListener("visibilitychange", applyWhenSafe)');
  });

  it('reloads at most once', () => {
    expect(main).toContain('if (reloaded || !pending) return;');
  });
});

describe('what counts as work in progress', () => {
  beforeEach(() => resetWorkInProgress());

  it('is nothing, to start with', () => {
    expect(workInProgress()).toBe(false);
  });

  it('is something while a screen says so', () => {
    const done = beginWork();
    expect(workInProgress()).toBe(true);
    done();
    expect(workInProgress()).toBe(false);
  });

  it('survives two screens being open at once', () => {
    // The first to close must not clear the second, or a reload lands on a
    // form that is still open.
    const first = beginWork();
    const second = beginWork();
    first();
    expect(workInProgress()).toBe(true);
    second();
    expect(workInProgress()).toBe(false);
  });

  it('ignores a release that arrives twice', () => {
    /*
     * React runs effect cleanups more than once in development, and a count
     * that drifted below what is really open would let the app reload over a
     * live form - the exact thing this exists to prevent.
     */
    const first = beginWork();
    const second = beginWork();
    first();
    first();
    expect(workInProgress()).toBe(true);
    second();
    expect(workInProgress()).toBe(false);
  });

  it('is declared by the laundry intake, which holds an unsaved bundle', () => {
    expect(intake).toContain('beginWork()');
  });
});

describe('a cold start reaches the network', () => {
  it('does not give up after two seconds', () => {
    /*
     * An installed app cold-starts with the radio still waking up. Two seconds
     * routinely elapsed before the network answered, and the shop was handed
     * yesterday's shell - which points at yesterday's scripts, which are also
     * cached, so the whole old app booted looking perfectly fine.
     */
    expect(sw).not.toContain('networkTimeoutSeconds: 2');
    expect(sw).toContain('networkTimeoutSeconds: 5');
  });

  it('still falls back to the cache, so the shop opens when the light is out', () => {
    // The timeout only governs a connection that is present and slow. With no
    // network at all the fetch fails at once and the cache answers.
    expect(sw).toContain('NetworkFirst');
    expect(sw).toContain("cacheName: 'html'");
  });
});
