import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), 'src/lib/flow-operating-engine.ts');
const source = readFileSync(file, 'utf8');

// The orders response contains an apostrophe inside a single-quoted fallback string.
// Keep the runtime response identical while making the TypeScript parser happy.
const broken = ":'I don't see any orders recorded in this store yet.';}";
const fixed = ':"I don\\'t see any orders recorded in this store yet.";}';

if (!source.includes(broken)) {
  // Already fixed, or the source has changed. Do not mutate anything unnecessarily.
  process.exit(0);
}

writeFileSync(file, source.replace(broken, fixed), 'utf8');
console.log('Fixed Flow orders response syntax.');
