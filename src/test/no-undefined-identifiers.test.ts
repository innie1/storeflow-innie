import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';

/**
 * Guards the one compiler error that always becomes a blank screen.
 *
 * `npm run build` is `vite build` — esbuild strips types without checking them,
 * so a reference to a name that does not exist compiles happily and throws
 * ReferenceError the moment that line runs. React unmounts the tree, and since
 * every screen is mounted as a hidden div rather than thrown away, the merchant
 * gets an empty page.
 *
 * Three of these were live at once:
 *   - `margin is not defined` in manager-intel, after a rename missed a use
 *   - `showToast is not defined` in Wishlist, never imported
 *   - `pendingDeleteId` / `confirmDeleteGoal` in Goals, where a ConfirmModal
 *     had been pasted into the wrong component in the same file
 *
 * The repo carries a large backlog of other type errors, so the whole
 * typecheck cannot be a gate yet. This fails on the two codes that mean the
 * same thing — a name that does not exist — which is the subset that crashes
 * at runtime.
 *
 * TS2552 was missing from this gate, and something slipped through it:
 * `setViewStack` was deleted from Settings as apparently-unused state while
 * four calls to it remained. TypeScript reports that as TS2552 rather than
 * TS2304 purely because it can suggest a similar name nearby, which says
 * nothing about how dangerous it is. setView is how every row on the Settings
 * page navigates, so the first tap anywhere threw and the whole page went
 * dead. Both codes are checked now.
 */

/**
 * Names that only ever appear in type position, where TS2304 is a missing
 * ambient declaration rather than a runtime hazard. Types are erased, so these
 * cannot throw. Keep this list short and justified.
 */
/** TS2304 and TS2552 both mean "this name does not exist". */
const MISSING_NAME_CODES = ['TS2304', 'TS2552'];

const TYPE_ONLY_ALLOWED = new Set<string>([
  // Previously needed by VoiceSell.tsx, which was an unused duplicate of
  // SimpleVoiceSell and has been deleted. Kept empty rather than removed so
  // the next genuinely type-only case has an obvious home.
]);

function undefinedIdentifiers(): { file: string; name: string }[] {
  let output = '';
  try {
    execSync('npx tsc --noEmit -p tsconfig.app.json', { encoding: 'utf8', stdio: 'pipe' });
  } catch (err: any) {
    output = `${err.stdout || ''}${err.stderr || ''}`;
  }

  return output
    .split('\n')
    .filter(line => MISSING_NAME_CODES.some(code => line.includes(code)))
    .map(line => {
      const file = line.split('(')[0].trim();
      // TS2552 appends "Did you mean 'x'?", so take the first quoted name only.
      const name = (line.match(/Cannot find name '([^']+)'/) || [])[1] || '';
      return { file, name };
    })
    .filter(hit => hit.name && !TYPE_ONLY_ALLOWED.has(hit.name));
}

describe('no code references a name that does not exist', () => {
  it('has no missing-name error outside the type-only allowlist', () => {
    const hits = undefinedIdentifiers();
    const detail = hits.map(h => `${h.file}: ${h.name}`).join('\n');
    expect(hits, `these throw ReferenceError at runtime and blank the app:\n${detail}`).toEqual([]);
  }, 180_000);
});

describe('the gate itself covers both spellings of the same fault', () => {
  it('does not check only TS2304', () => {
    // The whole point: TypeScript picks between the two codes based on whether
    // it can suggest a nearby name, which has nothing to do with severity.
    expect(MISSING_NAME_CODES).toContain('TS2304');
    expect(MISSING_NAME_CODES).toContain('TS2552');
  });
});
