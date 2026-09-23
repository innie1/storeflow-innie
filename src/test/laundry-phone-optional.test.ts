import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { readSource } from './helpers/source';

/**
 * A bundle with no phone number reaches the cloud.
 *
 * The counter takes a walk-in who will not give a number - it has to, or the
 * attendant goes back to the paper book - but create_laundry_walkin_v2 refused
 * every such bundle, so it lived only on the phone that took it in.
 *
 * The migration patches the live function in place rather than restating it.
 * These run its edits against this repo's own copy of the function, the way
 * the database will, so a copy that drifts from what the edits expect fails
 * here rather than on the day somebody applies it.
 */

const migrations = readdirSync('supabase/migrations');
const file = migrations.find(name => name.endsWith('_laundry_bundle_phone_optional.sql'));
const migration = file ? readSource(`supabase/migrations/${file}`) : '';
const original = readSource('supabase/migrations/20260830110000_enrich_laundry_operations.sql');

const edits = [...migration.matchAll(/\(\$\$([\s\S]*?)\$\$,\s*\$\$([\s\S]*?)\$\$\)/g)]
  .map(([, anchor, replacement]) => ({ anchor, replacement }));

const occurrences = (text: string, part: string) => text.split(part).length - 1;
const patched = edits.reduce((text, edit) => text.split(edit.anchor).join(edit.replacement), original);

describe('the migration that lets a bundle have no phone', () => {
  it('exists, and makes the four edits it describes', () => {
    expect(file, 'no migration file').toBeTruthy();
    expect(edits).toHaveLength(4);
  });

  it('finds each line it changes exactly once in the function it patches', () => {
    for (const edit of edits) expect(occurrences(original, edit.anchor), edit.anchor).toBe(1);
  });

  it('refuses to change anything when a line is missing or repeated', () => {
    expect(migration).toContain('<> 1 then');
    expect(migration).toContain('raise exception');
    // The check runs before the swap, inside the loop, and the new function is
    // only created once every edit has passed it.
    expect(migration.indexOf('<> 1 then')).toBeLessThan(migration.indexOf('v_def := replace('));
    expect(migration.indexOf('end loop;')).toBeLessThan(migration.indexOf('execute v_def;'));
  });

  it('targets the function the app calls, by its full signature', () => {
    expect(migration).toContain(
      "'public.create_laundry_walkin_v2(text,text,text,text,text,text,text,text,numeric,numeric,text,jsonb)'::regprocedure",
    );
  });

  it('deletes and drops nothing', () => {
    const lower = migration.toLowerCase();
    for (const word of ['delete from', 'truncate', 'drop ', 'alter table']) expect(lower).not.toContain(word);
  });
});

describe('the function once patched', () => {
  it('no longer refuses a bundle for having no number', () => {
    expect(patched).not.toContain('Customer phone number is required');
  });

  it('stores no number as NULL, which no phone lookup can match', () => {
    // '' would equal every other blank. NULL equals nothing.
    expect(patched).toContain("v_phone := nullif(trim(coalesce(p_customer_phone,'')),'');");
    expect(patched).toContain("v_store.id, trim(p_customer_name), v_phone, v_tag, 'Accepted',");
    expect(patched).not.toContain('trim(p_customer_phone)');
    expect(patched).toMatch(/v_phone text;/);
  });

  it('still refuses a number that was given but is too short', () => {
    // A mistyped number sends somebody's clothes updates to a stranger.
    expect(patched).toContain("if v_phone is not null and length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7 then raise exception 'Customer phone number is invalid'; end if;");
  });

  it('reads the typed number in one place only', () => {
    // The signature, and the line that cleans it. Anything else reading the raw
    // parameter would bypass the NULL.
    expect(occurrences(patched, 'p_customer_phone')).toBe(2);
  });
});
