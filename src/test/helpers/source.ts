import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * The folder that holds a file's parts, if it has one.
 *
 * A big screen or module keeps its entry file where it always was - so nothing
 * that imports it changes - and its pieces in a folder beside it, named after
 * it in kebab case: `components/Settings.tsx` and `components/settings/`,
 * `pages/Index.tsx` and `pages/index/`, `lib/manager-intel.ts` and
 * `lib/manager-intel/`. See docs/code-structure.md.
 */
function partsFolder(file: string): string | null {
  const base = path.basename(file).replace(/\.(tsx?|jsx?)$/, '');
  const folder = path.join(path.dirname(file), base.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase());
  return fs.existsSync(folder) && fs.statSync(folder).isDirectory() ? folder : null;
}

function filesUnder(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) return filesUnder(full);
      return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
    });
}

/**
 * Read a project source file so a test can assert against the code we actually
 * ship - together with its parts, when it has been split into a folder.
 *
 * Moving a section of a screen into its own file is tidying, not a change in
 * behaviour, so a test that checks the screen still says something should go
 * on finding it there. The entry file comes first, then each part in name
 * order.
 */
export function readSource(relativePath: string): string {
  const file = path.join(ROOT, relativePath);
  const own = fs.readFileSync(file, 'utf8');
  const folder = partsFolder(file);
  if (!folder) return own;
  return [own, ...filesUnder(folder).map(part => fs.readFileSync(part, 'utf8'))].join('\n');
}

/** Count non-overlapping occurrences of a literal substring. */
export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) throw new Error('countOccurrences needs a non-empty needle');
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}
