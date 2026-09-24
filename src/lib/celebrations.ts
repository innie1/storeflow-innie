import { useSyncExternalStore } from 'react';

/**
 * One celebration on screen at a time.
 *
 * A shop's first sale finished the setup walk in the same moment it earned
 * the first-sale milestone, and the two cards - "First Sale!" and "ready for
 * business" - were drawn on top of each other, their words overprinted into
 * something nobody could read.
 *
 * A milestone says it is showing here; the ready-for-business card waits
 * until none is. The sale gets its moment first, then the shop does.
 */

let showing = 0;
const listeners = new Set<() => void>();

function announce(): void {
  listeners.forEach(listener => { try { listener(); } catch { /* one listener must not stop the rest */ } });
}

/** Call when a milestone card appears; call what it returns when it goes. */
export function celebrationOpened(): () => void {
  showing += 1;
  announce();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    showing = Math.max(0, showing - 1);
    announce();
  };
}

export function celebrationShowing(): boolean {
  return showing > 0;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Whether a milestone card is on screen right now. */
export function useCelebrationShowing(): boolean {
  return useSyncExternalStore(subscribe, celebrationShowing, () => false);
}
