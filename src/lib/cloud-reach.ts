/**
 * Cloud calls somebody is standing at the counter waiting for.
 *
 * The Supabase data client retries a failed read three more times, waiting
 * 1, 2 and 4 seconds between tries. That suits a background job; it does not
 * suit a sale. On a line that drops requests, Save Sale sat for seven seconds
 * or more before it gave up and saved the sale on the phone anyway - and on a
 * line that hangs rather than fails, each try waited as long as the browser
 * cared to.
 *
 * So a check the counter waits on is asked once, with a short limit. When the
 * cloud cannot be reached, that is remembered for half a minute and the next
 * sales do not ask at all: they are written down here and sent when the line
 * comes back, which is what happens to them either way.
 */

/** How long the counter waits for a cloud check before saving on the phone. */
export const COUNTER_WAIT_MS = 5000;
/** How long an unreachable cloud is left alone before it is asked again. */
const QUIET_MS = 30_000;

let unreachableUntil = 0;

/** A signal that aborts the request after the given time. */
export function counterDeadline(ms = COUNTER_WAIT_MS): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Whether an error means the cloud was not reached, rather than that it
 * answered. A database refusal carries a PostgREST or Postgres code; a dropped
 * line, a timeout, or a gateway turning the request away does not.
 */
export function cloudNotReached(error: any): boolean {
  if (!error) return false;
  if (error.name === 'AbortError' || error.name === 'TimeoutError' || error.name === 'TypeError') return true;
  const code = String(error.code || '');
  if (!code) return true;
  return /^PGRST00[0-2]$/.test(code);
}

export function noteCloudUnreachable(): void {
  unreachableUntil = Date.now() + QUIET_MS;
}

export function noteCloudReached(): void {
  unreachableUntil = 0;
}

export function cloudRecentlyUnreachable(): boolean {
  return Date.now() < unreachableUntil;
}

/** Back online: whatever was in the way may be gone, so ask again. */
if (typeof window !== 'undefined') window.addEventListener('online', noteCloudReached);

/**
 * Whether this phone holds a signed-in cloud session, without waiting on the
 * network for it. Committing a sale needs one - the cloud refuses a commit
 * from nobody - so without it there is nothing to ask.
 */
export async function hasCloudSession(): Promise<boolean> {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const session = await Promise.race([
      supabase.auth.getSession().then(({ data }) => data.session),
      // Refreshing an expired session goes to the network; it gets the same limit.
      new Promise<null>(resolve => setTimeout(() => resolve(null), COUNTER_WAIT_MS)),
    ]);
    return !!session?.user;
  } catch {
    return false;
  }
}
