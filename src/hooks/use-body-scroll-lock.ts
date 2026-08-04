import { useEffect } from 'react';

let lockCount = 0;

export function useBodyScrollLock(isLocked: boolean = true) {
  useEffect(() => {
    if (!isLocked) return;

    lockCount++;
    document.body.style.overflow = 'hidden';

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        document.body.style.overflow = '';
      }
    };
  }, [isLocked]);
}

/**
 * Emergency unlock helper — forces scroll restoration if all modals are closed or on route/tab change
 */
export function forceUnlockBodyScroll() {
  lockCount = 0;
  document.body.style.overflow = '';
}
