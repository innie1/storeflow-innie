import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { budgetProblems, measureBundle, ENTRY_GZIP_BUDGET_KB } from '../../scripts/check-bundle-budget.mjs';

/**
 * What the phone downloads before it can show anything.
 *
 * Before the screens were split out this was one file: 3,802 kB, 1,031 kB
 * compressed, every screen in the app, parsed and run before the first one
 * could appear. Afterwards the startup file is 1,448 kB, 421 kB compressed,
 * and each screen is fetched when it is opened.
 *
 * Nothing in an ordinary build would complain if that came undone - a single
 * plain import of a big screen in Index would put it back and the build would
 * still pass. This is the complaint. It reads whatever build is on disk, so it
 * only runs after `npm run build`; CI runs the same check through
 * `npm run bundle:check` as a step after the build, where it is not optional.
 */

const assetsDir = join(process.cwd(), 'dist', 'assets');
const built = existsSync(assetsDir);

describe.skipIf(!built)('the startup bundle stays split', () => {
  it('keeps the startup file under its budget', () => {
    const measured = measureBundle(assetsDir);
    expect(measured.entry, 'no index-*.js in the build').toBeTruthy();
    expect(measured.entry!.gzipKb).toBeLessThanOrEqual(ENTRY_GZIP_BUDGET_KB);
  });

  it('gives the big screens chunks of their own', () => {
    const measured = measureBundle(assetsDir);
    expect(budgetProblems(measured)).toEqual([]);
  });

  it('is far smaller than the single file it replaced', () => {
    // The whole app used to arrive at once, compressed to 1,031 kB.
    const measured = measureBundle(assetsDir);
    expect(measured.entry!.gzipKb).toBeLessThan(1031 * 0.7);
  });
});

describe.skipIf(built)('the bundle budget', () => {
  it('is checked against a build, and there is none here', () => {
    // Left visible rather than silent: a green run with nothing built is not
    // evidence that the bundle is within budget.
    expect(built).toBe(false);
  });
});
