import { useEffect } from 'react';

/**
 * Stops the page behind an overlay from scrolling.
 *
 * Overlays cover the screen but the document underneath stays scrollable, so a
 * swipe anywhere that is not itself a scrollable part of the overlay scrolls
 * the page behind it. Close the overlay and you are somewhere else entirely.
 *
 * Locks are reference counted: overlays stack (a sheet opening a confirm
 * dialog), and the page must stay locked until the last one closes.
 */

let lockCount = 0;
let restoreScrollY = 0;

function applyLock() {
  const body = document.body;
  const root = document.documentElement;

  restoreScrollY = window.scrollY || root.scrollTop || 0;

  // Hiding the scrollbar reclaims its width, which shifts the whole layout
  // sideways under the overlay. Hold the space it was using.
  const scrollbar = window.innerWidth - root.clientWidth;
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

  // Which element actually scrolls depends on the page: the viewport takes its
  // overflow from <html>, or from <body> when <html> is `visible`. Set both so
  // the lock does not depend on which one it happens to be.
  body.style.overflow = 'hidden';
  root.style.overflow = 'hidden';

  // A scroll that reaches the end of a scrollable area inside the overlay
  // otherwise chains outwards and moves the page behind it.
  body.style.overscrollBehavior = 'contain';
}

function releaseLock() {
  const body = document.body;
  const root = document.documentElement;

  body.style.overflow = '';
  root.style.overflow = '';
  body.style.overscrollBehavior = '';
  body.style.paddingRight = '';

  // Some browsers clamp the offset while the container is hidden, so put the
  // reader back where they were rather than at the top. Guarded because this
  // runs in effect cleanup, where a throw would take the unmount down with it.
  try { window.scrollTo(0, restoreScrollY); } catch {}
}

export function useBodyScrollLock(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked) return;

    lockCount++;
    if (lockCount === 1) applyLock();

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) releaseLock();
    };
  }, [isLocked]);
}

/**
 * Emergency unlock — used on route/tab changes, where an overlay can be
 * unmounted without its cleanup having run.
 */
export function forceUnlockBodyScroll() {
  if (typeof document === 'undefined') return;
  const wasLocked = lockCount > 0;
  lockCount = 0;
  if (wasLocked) releaseLock();
  else {
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }
}
