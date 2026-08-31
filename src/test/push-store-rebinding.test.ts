import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('merchant background push subscription', () => {
  it('validates that the browser endpoint belongs to the currently selected store', () => {
    const source = fs.readFileSync('src/lib/push-notifications.ts', 'utf8');

    expect(source).toMatch(/getPushSubscriptionState\(storeId\?: string\)/);
    expect(source).toMatch(/storeId && data\.store_id !== storeId/);
    expect(source).toMatch(/getPushSubscriptionState\(storeId\)/);
    expect(source).toMatch(/upsert\([\s\S]*store_id: storeId[\s\S]*onConflict: 'endpoint'/);
  });
});
