/**
 * Reduce Motion and Compact Mode, honoured.
 *
 * Both switches sat on the Appearance screen doing nothing at all. Reduce
 * Motion matters more than it sounds: this app has a mascot that walks off the
 * screen, confetti, pulsing rings and animated counters, and somebody who asks
 * for less of that is usually asking because it makes them ill or because
 * their phone cannot keep up with it.
 *
 * Applied as classes on the document root, the same way the theme is, so one
 * switch reaches every screen without a single component having to ask.
 */

import type { StoreData } from '@/types/store';

export const REDUCE_MOTION_CLASS = 'prefers-less-motion';
export const COMPACT_CLASS = 'compact-mode';

export function applyDisplayPreferences(store: Pick<StoreData, 'managerSettings'> | null | undefined): void {
  if (typeof document === 'undefined') return;
  const settings = store?.managerSettings;
  const root = document.documentElement;

  // Absent means off for both: the app's normal state is the animated one, and
  // a shop that has never opened Appearance has not asked for anything else.
  root.classList.toggle(REDUCE_MOTION_CLASS, settings?.reduceMotion === true);
  root.classList.toggle(COMPACT_CLASS, settings?.compactMode === true);
}
