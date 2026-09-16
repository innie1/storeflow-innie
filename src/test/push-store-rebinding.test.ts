import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

/**
 * The toggle has to answer for the shop you are in.
 *
 * It used to ask a different question - "is this device in the table at all?"
 * - and a device saved for another shop answered yes, so the toggle said on
 * while nothing arrived. That is still what this is about. What changed
 * underneath it is that a device can now be saved for more than one shop, so
 * the question is put to the database with the endpoint *and* the shop,
 * instead of reading the one row a device was allowed and comparing after.
 *
 * The behaviour itself is covered in push-per-shop.test.ts, which runs these
 * paths against a stubbed database.
 */

describe('merchant background push subscription', () => {
  it('validates that the browser endpoint belongs to the currently selected store', () => {
    const source = fs.readFileSync('src/lib/push-notifications.ts', 'utf8');

    expect(source).toMatch(/getPushSubscriptionState\(storeId\?: string\)/);
    expect(source).toMatch(/if \(storeId\) query = query\.eq\('store_id', storeId\)/);
    expect(source).toMatch(/getPushSubscriptionState\(storeId\)/);
    expect(source).toMatch(/upsert\(row, \{ onConflict: 'store_id,endpoint' \}\)/);
  });

  it('no longer reads one row for the device and compares afterwards', () => {
    const source = fs.readFileSync('src/lib/push-notifications.ts', 'utf8');
    // With a row per shop there is no single row to read: that comparison
    // would have started throwing the moment a second shop was added.
    expect(source).not.toMatch(/data\.store_id !== storeId/);
  });
});
