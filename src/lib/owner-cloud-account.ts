/**
 * The owner's cloud account, made from the email and password they already
 * typed while securing a new shop.
 *
 * Quick Setup asked for an owner password and a recovery email, then kept the
 * shop on the phone alone. Nothing reached the cloud until the owner found
 * Settings > Security > Multi-device Cloud Sync and typed the same details a
 * second time - and until then a worker's invite found no shop at all. Now the
 * details given once open the account, and the shop's ordinary sync takes it
 * up from there (see store-cloud-sync: it uploads any shop with a Store ID as
 * soon as there is a signed-in account to send it to).
 *
 * Never a reason to stop the shop being made: every failure here leaves a
 * working shop on the phone and says what to do later.
 */

import { supabase } from '@/integrations/supabase/client';

export type OwnerAccountResult =
  /** A new account, signed in. */
  | 'created'
  /** The email already had an account and this password opened it. */
  | 'signed_in'
  /** The email has an account with another password. */
  | 'email_taken'
  /** The account was made but waits for the owner to confirm the email. */
  | 'confirm_email'
  /** No answer from the cloud. */
  | 'offline'
  | 'failed';

/** Supabase's own minimum, so the owner password can be the account's too. */
export const OWNER_ACCOUNT_MIN_PASSWORD = 6;

const WAIT_MS = 15000;

function withinWait<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), WAIT_MS)),
  ]);
}

const alreadyRegistered = (error: { code?: string; message?: string }) =>
  error.code === 'user_already_exists' || error.code === 'email_exists' || /already (been )?registered|already exists/i.test(error.message || '');

const unreachable = (error: unknown) =>
  /timeout|fetch|network|load failed/i.test(String((error as { message?: string })?.message || error));

/** The owner's profile row, which the shop's sync looks up to upload it. */
async function ensureProfile(authUserId: string, email: string, fullName: string): Promise<void> {
  const { data: existing } = await supabase.from('profiles').select('id').eq('auth_user_id', authUserId).maybeSingle();
  if (existing) return;
  const { error } = await supabase.from('profiles').insert({ auth_user_id: authUserId, email, full_name: fullName, role: 'owner' });
  if (error) throw error;
}

export async function connectOwnerAccount(email: string, password: string, fullName: string): Promise<OwnerAccountResult> {
  const address = email.trim();
  const name = fullName.trim() || address.split('@')[0] || 'Owner';
  if (!address || password.length < OWNER_ACCOUNT_MIN_PASSWORD) return 'failed';
  try {
    const { data, error } = await withinWait(supabase.auth.signUp({ email: address, password }));
    if (error) {
      if (!alreadyRegistered(error)) return unreachable(error) ? 'offline' : 'failed';
      const signedIn = await withinWait(supabase.auth.signInWithPassword({ email: address, password }));
      if (signedIn.error || !signedIn.data.user) return unreachable(signedIn.error) ? 'offline' : 'email_taken';
      await withinWait(ensureProfile(signedIn.data.user.id, address, name));
      return 'signed_in';
    }
    if (!data.user) return 'failed';
    // With email confirmation on there is no session yet, so nothing can be
    // written as this owner; the profile is made at their first sign-in.
    if (!data.session) return 'confirm_email';
    await withinWait(ensureProfile(data.user.id, address, name));
    return 'created';
  } catch (error) {
    return unreachable(error) ? 'offline' : 'failed';
  }
}

/** What the owner is told once the shop opens. */
export function ownerAccountMessage(result: OwnerAccountResult): { text: string; tone: 'success' | 'info' | 'error' } {
  switch (result) {
    case 'created':
    case 'signed_in':
      return { text: 'Store secured and backed up online. Workers can now join from their own phones.', tone: 'success' };
    case 'confirm_email':
      return { text: 'Store secured. Open the email we sent you to finish your online backup.', tone: 'info' };
    case 'email_taken':
      return { text: 'Store saved on this phone. That email already has an account with another password - connect it in Settings > Security > Multi-device Cloud Sync.', tone: 'info' };
    case 'offline':
      return { text: 'Store saved on this phone. No internet right now - turn on Multi-device Cloud Sync in Settings > Security when you are online.', tone: 'info' };
    default:
      return { text: 'Store saved on this phone. Turn on Multi-device Cloud Sync in Settings > Security to back it up online.', tone: 'info' };
  }
}
