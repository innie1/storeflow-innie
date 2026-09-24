import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'supabase/functions/send-account-recovery-email/index.ts'),
  'utf8',
);

describe('recovery email trust boundary', () => {
  it('derives the destination from server-side store/profile data', () => {
    expect(source).toContain('recoveryEmailFromStore(store)');
    expect(source).toContain('ownerEmailForStore(supabase, store)');
    expect(source).toContain('.from("stores")');
    expect(source).toContain('let recipient = serverRecoveryEmail || serverOwnerEmail');
    expect(source).toContain('await sendEmail(recipient, subject, html)');
    // Legacy body.to may identify which stored recovery address the user is
    // trying to verify, but it is never passed to the mail sender directly.
    expect(source).not.toContain('sendEmail(body.to');
    expect(source).not.toContain('recipient = normalizeEmail(body.to)');
  });

  it('does not email caller supplied recovery secrets', () => {
    expect(source).not.toContain('body.emergencyRecoveryKey');
    expect(source).not.toContain('body.recoveryQuestion');
    expect(source).toContain('Passwords, recovery answers and emergency recovery keys are intentionally not included');
  });

  it('rate limits recovery mail and requires ownership for onboarding mail', () => {
    expect(source).toContain('check_rate_limit');
    expect(source).toContain('requireAuthenticatedOwner(req, supabase, store)');
    expect(source).toContain('Authentication required');
  });

  it('allows only fixed email templates and a six digit recovery code', () => {
    expect(source).toContain('allowedTypes');
    expect(source).toContain('/^\\d{6}$/.test(code)');
    expect(source).toContain('escapeHtml');
  });
});
