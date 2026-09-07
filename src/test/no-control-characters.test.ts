import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No stray control characters in source.
 *
 * A regex written through a shell-quoted script had its `\b` word boundaries
 * collapsed into literal backspace bytes (0x08). The file compiled, the build
 * passed, every existing test passed — and the regex could never match
 * anything, so a whole feature silently did nothing. It took a debugging
 * session to find, twice, because a backspace is invisible in every editor and
 * every diff.
 *
 * The same collapse turns `\t`, `\r`, `\f` and `\v` into control bytes. This
 * catches the whole family the moment it happens.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

/** Tab and newline are legitimate; the rest of C0 is not. */
const FORBIDDEN = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('source files are free of control characters', () => {
  it('has no literal backspace, vertical tab or form feed anywhere', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const text = fs.readFileSync(file, 'utf8');
      if (!FORBIDDEN.test(text)) continue;

      text.split('\n').forEach((line, index) => {
        const match = FORBIDDEN.exec(line);
        if (!match) return;
        const code = match[0].charCodeAt(0).toString(16).padStart(2, '0');
        offenders.push(
          `${path.relative(ROOT, file)}:${index + 1} — U+00${code.toUpperCase()}`
          + (code === '08' ? ' (a \\b that collapsed into a backspace)' : ''),
        );
      });
    }

    expect(offenders).toEqual([]);
  });
});
