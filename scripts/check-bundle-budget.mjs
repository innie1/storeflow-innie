#!/usr/bin/env node
/**
 * What a phone downloads before it can show anything.
 *
 * The app was one file of JavaScript - 3,802 kB, 1,031 kB compressed - because
 * every screen was imported at the top of Index and mounted at once. Splitting
 * the screens out brought the startup file to 1,448 kB, 421 kB compressed, and
 * this is what stops it creeping back: one plain import of a big screen in
 * Index or in pages/screens would quietly undo it, and nothing else in the
 * build would complain.
 *
 * Run after a build: `npm run bundle:check`. The same numbers are checked by
 * src/test/bundle-budget.test.ts whenever a build is present.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

/** Measured 16 September 2026 at 421 kB; the room above is for ordinary growth. */
export const ENTRY_GZIP_BUDGET_KB = 550;
export const ENTRY_RAW_BUDGET_KB = 1900;
/** Before the split there was one. Screens that must not be in the startup file. */
export const SCREENS_THAT_MUST_BE_SEPARATE = ['Settings', 'Manager', 'Inventory', 'Marketplace'];

export function measureBundle(assetsDir) {
  const files = readdirSync(assetsDir).filter(name => name.endsWith('.js'));
  const sized = files.map(name => {
    const bytes = readFileSync(join(assetsDir, name));
    return { name, rawKb: bytes.length / 1024, gzipKb: gzipSync(bytes).length / 1024 };
  });
  const entry = sized.find(file => /^index-[^.]*\.js$/.test(file.name));
  return { entry, chunks: sized };
}

export function budgetProblems(measured) {
  const problems = [];
  const { entry, chunks } = measured;

  if (!entry) {
    problems.push('no startup chunk (index-*.js) in the build at all');
    return problems;
  }
  if (entry.gzipKb > ENTRY_GZIP_BUDGET_KB) {
    problems.push(`the startup file is ${entry.gzipKb.toFixed(1)} kB compressed, over the ${ENTRY_GZIP_BUDGET_KB} kB budget`);
  }
  if (entry.rawKb > ENTRY_RAW_BUDGET_KB) {
    problems.push(`the startup file is ${entry.rawKb.toFixed(1)} kB, over the ${ENTRY_RAW_BUDGET_KB} kB budget`);
  }
  if (chunks.length < 15) {
    problems.push(`only ${chunks.length} chunks: the screens are not being split out`);
  }
  for (const screen of SCREENS_THAT_MUST_BE_SEPARATE) {
    const has = chunks.some(chunk => chunk.name.startsWith(`${screen}-`));
    if (!has) problems.push(`${screen} has no chunk of its own - it is back in the startup file`);
  }
  return problems;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const assetsDir = join(process.cwd(), 'dist', 'assets');
  if (!existsSync(assetsDir)) {
    console.error('No build to check. Run `npm run build` first.');
    process.exit(1);
  }
  const measured = measureBundle(assetsDir);
  const { entry, chunks } = measured;
  console.log(`startup file: ${entry ? `${entry.rawKb.toFixed(1)} kB (${entry.gzipKb.toFixed(1)} kB compressed)` : 'missing'}`);
  console.log(`chunks: ${chunks.length}`);
  const biggest = [...chunks].sort((a, b) => b.gzipKb - a.gzipKb).slice(0, 8);
  for (const chunk of biggest) {
    console.log(`  ${chunk.name.padEnd(42)} ${chunk.gzipKb.toFixed(1).padStart(7)} kB compressed`);
  }
  const problems = budgetProblems(measured);
  if (problems.length > 0) {
    console.error('\nOver budget:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log('\nWithin budget.');
}
