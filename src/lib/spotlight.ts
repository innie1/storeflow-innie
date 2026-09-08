/**
 * "The thing you just tapped is this one."
 *
 * A small ring in the corner of the home screen says how the month is going.
 * Tapping it takes you to the full figures - but landing on a page of cards
 * with no idea which one you were sent to is not an answer, it is a second
 * question. So the card that was meant flashes when you arrive.
 *
 * Deliberately one-shot and short. It exists to connect two things somebody
 * just did, and once the connection is made a card that keeps glowing is a
 * card that is broken.
 */

const KEY = 'storeflow_spotlight';

/** How long the arrived-at card stays lit: long enough to find and read, not
 *  long enough to become part of the furniture. */
export const SPOTLIGHT_MS = 3800;

export const SPOTLIGHT_SIGNAL = 'storeflow:spotlight';

/**
 * Ask for a card to be lit.
 *
 * Both stored and broadcast, and it has to be both. Every tab in this app is
 * mounted at once and hidden with CSS, so the card being asked for has usually
 * been on the page since the app opened - its mount-time check ran long before
 * anybody tapped anything, and a stored flag alone would sit there unread.
 * The broadcast reaches the card that is already there; the stored copy covers
 * the case where it genuinely has not mounted yet.
 */
export function requestSpotlight(id: string): void {
  try { sessionStorage.setItem(KEY, id); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent(SPOTLIGHT_SIGNAL, { detail: id })); } catch { /* no window */ }
}

/**
 * Whether this card was the one asked for - and clears the request as it
 * answers, so a later visit to the same page does not flash again.
 */
export function claimSpotlight(id: string): boolean {
  try {
    if (sessionStorage.getItem(KEY) !== id) return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

/** The class that does the lighting, so every spotlit card looks the same. */
export const SPOTLIGHT_CLASS = 'spotlight-lit';

/**
 * Bring the card into view as well as lighting it.
 *
 * Lighting a card the merchant cannot see is the same as not lighting it, and
 * the page it lands on is long enough that the answer is often below the fold.
 */
export function scrollSpotlightIntoView(element: HTMLElement | null): void {
  if (!element) return;
  try {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch {
    element.scrollIntoView();
  }
}
