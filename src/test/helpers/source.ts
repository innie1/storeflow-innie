import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * Read a project source file so a test can assert against the code we actually
 * ship.
 *
 * These assertions used to run a build-time string transform over the file
 * first, because the behaviour under test was injected by a Vite plugin at
 * build time rather than written in the file. That injection is gone -- the
 * behaviour lives in the source now -- so the tests read the real file.
 */
export function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
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
