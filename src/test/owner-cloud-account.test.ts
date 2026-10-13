import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSource } from './helpers/source';

const signUp = vi.fn();
const signInWithPassword = vi.fn();
const profileFound = vi.fn();
const profileInsert = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { signUp: (...a: unknown[]) => signUp(...a), signInWithPassword: (...a: unknown[]) => signInWithPassword(...a) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => profileFound() }) }),
      insert: (row: unknown) => profileInsert(row),
    }),
  },
}));

import { connectOwnerAccount, ownerAccountMessage } from '@/lib/owner-cloud-account';

/**
 * The email and password an owner gives while securing a new shop open its
 * online account, so the shop is backed up - and findable by workers'
 * phones - without a second trip to Settings.
 */

const user = { id: 'auth-1' };

beforeEach(() => {
  [signUp, signInWithPassword, profileFound, profileInsert].forEach(fn => fn.mockReset());
  profileFound.mockResolvedValue({ data: null, error: null });
  profileInsert.mockResolvedValue({ error: null });
});

describe('the owner account made while securing a shop', () => {
  it('signs up and makes the profile the shop sync looks for', async () => {
    signUp.mockResolvedValue({ data: { user, session: { user } }, error: null });
    expect(await connectOwnerAccount(' faith@shop.ng ', 'secret1', 'Faith')).toBe('created');
    expect(signUp).toHaveBeenCalledWith({ email: 'faith@shop.ng', password: 'secret1' });
    expect(profileInsert).toHaveBeenCalledWith({ auth_user_id: 'auth-1', email: 'faith@shop.ng', full_name: 'Faith', role: 'owner' });
  });

  it('uses the account the email already has when the password opens it, without a second profile', async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: 'user_already_exists', message: 'User already registered' } });
    signInWithPassword.mockResolvedValue({ data: { user }, error: null });
    profileFound.mockResolvedValue({ data: { id: 'p1' }, error: null });
    expect(await connectOwnerAccount('faith@shop.ng', 'secret1', 'Faith')).toBe('signed_in');
    expect(profileInsert).not.toHaveBeenCalled();
  });

  it('leaves an account with another password alone', async () => {
    signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'User already registered' } });
    signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } });
    expect(await connectOwnerAccount('faith@shop.ng', 'secret1', 'Faith')).toBe('email_taken');
  });

  it('says so when the email still has to be confirmed', async () => {
    signUp.mockResolvedValue({ data: { user, session: null }, error: null });
    expect(await connectOwnerAccount('faith@shop.ng', 'secret1', 'Faith')).toBe('confirm_email');
    expect(profileInsert).not.toHaveBeenCalled();
  });

  it('never throws: no internet is an answer, not a crash', async () => {
    signUp.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await connectOwnerAccount('faith@shop.ng', 'secret1', 'Faith')).toBe('offline');
  });

  it('does not try with a password the account would refuse', async () => {
    expect(await connectOwnerAccount('faith@shop.ng', '1234', 'Faith')).toBe('failed');
    expect(signUp).not.toHaveBeenCalled();
  });

  it('tells the owner where things stand in plain words', () => {
    expect(ownerAccountMessage('created')).toMatchObject({ tone: 'success' });
    expect(ownerAccountMessage('created').text).toMatch(/workers can now join/i);
    expect(ownerAccountMessage('offline').text).toMatch(/Multi-device Cloud Sync/);
    expect(ownerAccountMessage('email_taken').text).toMatch(/another password/);
  });
});

describe('the Secure Your Store step', () => {
  const source = readSource('src/components/StoreAccess.tsx');

  it('opens the account with the details it already asked for, and turns Cloud Sync on', () => {
    expect(source).toContain('await connectOwnerAccount(recoveryEmail, ownerPassword.trim()');
    expect(source).toMatch(/multiDeviceSync: online \|\|/);
  });
});
