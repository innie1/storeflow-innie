/**
 * Shrinks store photos that predate the upload downscaler.
 *
 * New uploads go through src/lib/downscale-image.ts and land at a few tens of
 * kB. Photos uploaded before that shipped are still stored at full size inside
 * stores.data, and stores.data is fetched whole every time a merchant opens
 * their store — which is what exhausted the project's egress quota.
 *
 * This applies the same treatment to the rows already in the database: longest
 * edge 256px, WebP, quality 0.82. It is idempotent — a photo already under the
 * threshold is skipped — and it never touches a row it cannot re-encode.
 *
 * Usage:
 *   npm i -D sharp                     (one-off; not a runtime dependency)
 *   node scripts/downscale-store-photos.mjs --dry-run
 *   node scripts/downscale-store-photos.mjs
 *   node scripts/downscale-store-photos.mjs --from-backup
 *
 * --from-backup reads the original out of public.store_photo_backup instead of
 * out of stores.data, and writes the downscaled result back into the store.
 * That is the path to use if the oversized photo was cleared from the live row
 * to stop the egress bleeding before this could be run.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY in the environment. The anon key cannot
 * update other people's stores, which is correct and should stay that way.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const MAX_EDGE = 256;
const QUALITY = 82;
/** Anything at or under this is already small enough to leave alone. */
const SKIP_UNDER_CHARS = 100_000;

const DRY_RUN = process.argv.includes('--dry-run');
const FROM_BACKUP = process.argv.includes('--from-backup');

function readEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(line => line.includes('=') && !line.trim().startsWith('#'))
      .map(line => {
        const eq = line.indexOf('=');
        return [
          line.slice(0, eq).trim(),
          line.slice(eq + 1).trim().replace(/^["']|["']$/g, ''),
        ];
      }),
  );
}

const env = { ...readEnvFile(), ...process.env };
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('VITE_SUPABASE_URL is not set.');
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY is not set. Updating another merchant\'s store\n' +
    'requires it; the publishable key is correctly not allowed to.',
  );
  process.exit(1);
}

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.error('sharp is not installed. Run:  npm i -D sharp');
  process.exit(1);
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

/** Roughly how many bytes a data URL occupies once stored. */
function dataUrlBytes(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return dataUrl.length;
  return Math.round((dataUrl.length - comma - 1) * 0.75);
}

const kb = n => `${(n / 1024).toFixed(1)} kB`;

async function api(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 402) {
      throw new Error(
        'The project API is restricted (402, egress quota). Nothing can be read\n' +
        'or written until service is restored. The originals are already safe in\n' +
        'public.store_photo_backup; re-run this once the API is back.',
      );
    }
    throw new Error(`${res.status} ${body.slice(0, 300)}`);
  }
  return res;
}

/**
 * Re-encodes one data URL. Returns null when the bytes cannot be decoded, so
 * an unreadable photo is left exactly as it was rather than destroyed.
 */
async function downscale(dataUrl) {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const input = Buffer.from(dataUrl.slice(comma + 1), 'base64');
  try {
    const out = await sharp(input)
      .rotate()                       // honour EXIF orientation before resizing
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    return `data:image/webp;base64,${out.toString('base64')}`;
  } catch (err) {
    console.error(`  could not re-encode: ${err.message}`);
    return null;
  }
}

const rows = await (await api('stores?select=id,store_id,business_name,data')).json();

/**
 * Each job is one store plus the original bytes to re-encode. Normally those
 * bytes are the photo currently on the row; with --from-backup they come from
 * store_photo_backup, so a row whose photo was cleared can still be restored.
 */
let jobs;
if (FROM_BACKUP) {
  const backups = await (await api('store_photo_backup?select=store_id,photo')).json();
  const byStoreId = new Map(backups.map(b => [b.store_id, b.photo]));
  jobs = rows
    .filter(r => byStoreId.has(r.store_id))
    .map(r => ({ row: r, original: byStoreId.get(r.store_id) }));
  console.log(`${backups.length} backed-up photo(s), ${jobs.length} matched to a store.\n`);
} else {
  jobs = rows
    .filter(r => typeof r?.data?.profile?.photo === 'string'
              && r.data.profile.photo.length > SKIP_UNDER_CHARS)
    .map(r => ({ row: r, original: r.data.profile.photo }));
  console.log(`${rows.length} stores, ${jobs.length} with an oversized photo.\n`);
}

let savedBytes = 0;
let changed = 0;

for (const { row, original: before } of jobs) {
  const label = `${row.store_id || row.id} (${row.business_name || 'unnamed'})`;
  process.stdout.write(`${label}: ${kb(dataUrlBytes(before))} -> `);

  const after = await downscale(before);
  if (!after) {
    console.log('skipped');
    continue;
  }
  if (!FROM_BACKUP && after.length >= before.length) {
    console.log('already small enough, skipped');
    continue;
  }

  console.log(kb(dataUrlBytes(after)));
  savedBytes += dataUrlBytes(before) - dataUrlBytes(after);
  changed++;

  if (DRY_RUN) continue;

  // Only the photo is rewritten; the rest of the store document is untouched.
  const nextData = { ...row.data, profile: { ...(row.data.profile || {}), photo: after } };
  await api(`stores?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ data: nextData }),
  });
}

console.log(
  `\n${DRY_RUN ? 'Would rewrite' : 'Rewrote'} ${changed} photo(s), ` +
  `freeing about ${kb(savedBytes)} per full store fetch.`,
);
if (DRY_RUN) console.log('Dry run — nothing was written.');
