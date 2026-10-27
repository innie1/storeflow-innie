/**
 * Keeping a worker's phone joined.
 *
 * Everything that makes a worker's phone "approved" lives in the browser's
 * storage for this site (staff-join.ts, deviceKey). Lose that and the phone
 * is a stranger to the cloud. Two ways it is lost, and what this does:
 *
 *   - The browser clears it to make room, or a cleaner app does. Chrome can be
 *     asked to keep a site's data; it usually agrees for an installed app or
 *     one used often. Asked once the phone is approved, and at each sign-in.
 *   - The app is opened somewhere else. A link tapped in WhatsApp, Facebook or
 *     Instagram opens in that app's own browser, whose storage is its own -
 *     join there and the phone is approved only there, and the next time it
 *     is opened from Chrome it has never been seen. The join screen says so
 *     and offers to open in Chrome first.
 */

/** Ask the browser not to clear this site's data. Never throws. */
export async function keepPhoneData(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * The app a link was opened inside, when it is not a real browser: its
 * storage is not Chrome's, so a phone joined here is joined only here.
 */
export function inAppBrowser(ua: string = navigator.userAgent): string {
  if (/WhatsApp/i.test(ua)) return 'WhatsApp';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/Telegram/i.test(ua)) return 'Telegram';
  // Android's bare web view ("; wv)") is what an app shows a page in.
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return 'another app';
  return '';
}

/**
 * This page, opened in Chrome on Android. Elsewhere there is no link that
 * does it, and the screen says to use the menu instead.
 */
export function openInChromeLink(href: string = window.location.href, ua: string = navigator.userAgent): string {
  if (!/Android/i.test(ua)) return '';
  try {
    const url = new URL(href);
    return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;end`;
  } catch {
    return '';
  }
}
