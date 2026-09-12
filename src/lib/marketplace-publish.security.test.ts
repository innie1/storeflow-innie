import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const publishSource = readFileSync(new URL('./marketplace-publish.ts', import.meta.url), 'utf8');
const hardeningMigration = readFileSync(
  new URL('../../supabase/migrations/20260912114000_remove_plaintext_store_credentials.sql', import.meta.url),
  'utf8',
);

describe('merchant cloud credential boundary', () => {
  it('publishes only with Supabase Auth, never the local owner password', () => {
    expect(publishSource).toContain("supabase.auth.getSession()");
    expect(publishSource).toContain("rpc('publish_storefront_authenticated'");
    expect(publishSource).not.toContain('p_owner_password');
    expect(publishSource).not.toContain('managerSettings?.ownerPassword');
  });

  it('purges and continuously scrubs plaintext owner credentials', () => {
    expect(hardeningMigration).toContain('new.owner_password := null');
    expect(hardeningMigration).toContain("- 'ownerPassword'");
    expect(hardeningMigration).toContain("- 'emergencyRecoveryKey'");
    expect(hardeningMigration).toContain("- 'recoveryAnswer'");
    expect(hardeningMigration).toContain('trg_scrub_store_cloud_secrets');
  });

  it('removes public stores access and makes the legacy publisher Auth-only', () => {
    expect(hardeningMigration).toContain('drop policy if exists "Allow public SELECT on stores"');
    expect(hardeningMigration).toContain('drop policy if exists "Allow public INSERT on stores"');
    expect(hardeningMigration).toContain('revoke select, insert, update, delete on public.stores from anon');
    expect(hardeningMigration).toContain('security invoker');
    expect(hardeningMigration).toContain('grant execute on function public.publish_storefront_from_owner');
    expect(hardeningMigration).toContain('to authenticated');
  });
});
