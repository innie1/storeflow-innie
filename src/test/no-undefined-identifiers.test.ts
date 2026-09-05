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
 * typecheck cannot be a gate yet. This fails on TS2304 alone — a name that does
 * not exist — which is the subset that crashes at runtime.
 */

/**
 * Names that only ever appear in type position, where TS2304 is a missing
 * ambient declaration rather than a runtime hazard. Types are erased, so these
 * cannot throw. Keep this list short and justified.
 */
const TYPE_ONLY_ALLOWED = new Set([
  'SpeechRecognition',
  'SpeechRecognitionEvent',
  'SpeechRecognitionErrorEvent',
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
    .filter(line => line.includes('TS2304'))
    .map(line => {
      const file = line.split('(')[0].trim();
      const name = (line.match(/Cannot find name '([^']+)'/) || [])[1] || '';
      return { file, name };
    })
    .filter(hit => hit.name && !TYPE_ONLY_ALLOWED.has(hit.name));
}

describe('no code references a name that does not exist', () => {
  it('has no TS2304 outside the type-only allowlist', () => {
    const hits = undefinedIdentifiers();
    const detail = hits.map(h => `${h.file}: ${h.name}`).join('\n');
    expect(hits, `these throw ReferenceError at runtime and blank the app:\n${detail}`).toEqual([]);
  }, 180_000);
});
