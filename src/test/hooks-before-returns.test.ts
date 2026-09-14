import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * No component may return before all of its hooks have run.
 *
 * A component that returns early on some renders and not others calls a
 * different number of hooks each time, and React stops the whole app with
 * error #310 or #300. It reached a phone as a crash when switching stores: the
 * Flow button returned early for a store with its shortcut switched off, and
 * called two more hooks below that return.
 *
 * This reads every component rather than testing one, so the same mistake
 * cannot come back somewhere else. It is a careful reading, not a parser: a
 * component body runs from a `function Name(` or `const Name = (...) =>` at the
 * start of a line to the next `}` there, and a return or a hook counts when it
 * sits at the component's own top level.
 */

const START = /^(export\s+default\s+)?(export\s+)?(function\s+[A-Z]\w*\s*\(|const\s+[A-Z]\w*\s*=\s*(\([^)]*\)|[a-z]\w*)\s*=>)/;
const HOOK = /^\s{2}(const\s+[^=]+=\s*)?(use[A-Z]\w*|React\.use[A-Z]\w*)\s*[(<]/;
const RETURN = /^\s{2}(if\s*\(.*\)\s*)?return\b/;

export function hooksAfterAnEarlyReturn(source: string): { returnLine: number; hookLine: number }[] {
  const lines = source.split(/\r?\n/);
  const found: { returnLine: number; hookLine: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!START.test(lines[i])) continue;
    let firstReturn = 0;
    let j = i + 1;
    for (; j < lines.length && !lines[j].startsWith('}'); j++) {
      const line = lines[j];
      if (RETURN.test(line)) {
        // The component's own final return: nothing below it runs.
        if (line.trim().startsWith('return (')) break;
        if (!firstReturn) firstReturn = j + 1;
      } else if (firstReturn && HOOK.test(line)) {
        found.push({ returnLine: firstReturn, hookLine: j + 1 });
        break;
      }
    }
    i = j;
  }
  return found;
}

function components(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'test' ? [] : components(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('hooks come before any early return', () => {
  it('in every component in the app', () => {
    const root = process.cwd();
    const offenders = components(join(root, 'src')).flatMap(path =>
      hooksAfterAnEarlyReturn(readFileSync(path, 'utf8')).map(
        hit => `${relative(root, path)}: returns at line ${hit.returnLine}, then calls a hook at line ${hit.hookLine}`,
      ));
    expect(offenders).toEqual([]);
  });

  it('can actually spot one', () => {
    const broken = [
      'export default function Thing({ on }: { on: boolean }) {',
      '  const [a] = useState(0);',
      '  if (!on) return null;',
      '  const [b] = useState(1);',
      '  return (',
      '    <div>{a + b}</div>',
      '  );',
      '}',
    ].join('\n');
    expect(hooksAfterAnEarlyReturn(broken)).toEqual([{ returnLine: 3, hookLine: 4 }]);
  });

  it('leaves a component alone when every hook comes first', () => {
    const fine = [
      'export default function Thing({ on }: { on: boolean }) {',
      '  const [a] = useState(0);',
      '  const [b] = useState(1);',
      '  if (!on) return null;',
      '  const shown = a + b;',
      '  return (',
      '    <div>{shown}</div>',
      '  );',
      '}',
    ].join('\n');
    expect(hooksAfterAnEarlyReturn(fine)).toEqual([]);
  });
});
