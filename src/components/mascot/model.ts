import { StoreData } from '@/types/store';

// Flow — StoreFlow's interactive mascot.
// Pure SVG + CSS animations, offline-friendly, highly responsive.

/** Flow glances at a low shelf at most this often. */
export const LOW_STOCK_PEEK_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export const LOW_STOCK_PEEK_KEY = 'storeflow_low_stock_peek_at';

export type MascotMood =
  | 'idle'
  | 'happy'
  | 'thinking'
  | 'warning'
  | 'celebrating'
  | 'sleeping'
  | 'confident'
  | 'neutral'
  | 'concerned'
  | 'worried'
  | 'angry'
  | 'resting'
  | 'bathing'
  | 'offline-umbrella'
  | 'yawn-stretch'
  // Set in six places (notification tones, the camera easter egg) and already
  // rendered by the glow switch, but never declared here. The merchant build
  // does not typecheck, so it worked at runtime and only ever showed up as
  // six type errors.
  | 'excited'
  // Flow glancing over a shelf at something running out. The drawing and its
  // keyframes were built and then never reachable: nothing anywhere could set
  // this mood, so the comparison that renders it was always false.
  | 'low-stock-peek';

export interface MascotProps {
  size?: number;
  mood?: MascotMood;
  className?: string;
  animate?: boolean;
  store?: StoreData;
  role?: string;
  // Lets a parent screen (e.g. the Create/Access Store flow) make Flow say
  // something contextual. Pass a new string (or bump externalMessageKey) to
  // trigger it — same speech bubble system Flow already uses internally.
  externalMessage?: string | null;
  externalMessageKey?: string | number;
  externalMessageMood?: MascotMood | null;
  externalMessageDuration?: number;
}

/**
 * How far down the viewport is actually covered by a fixed or sticky header
 * at horizontal position `x`.
 *
 * Bubble placement used to assume a flat 90px of app header. That header is
 * real on the dashboard but absent on the setup screen, where subtracting it
 * turned the space above Flow negative, lost "above" every time, and dropped
 * the bubble into the 12px gap below him -- on top of the StoreFlow wordmark.
 * Measure the obstruction rather than assuming one.
 */
export function obstructedTop(x: number, self: HTMLElement): number {
  if (typeof document.elementFromPoint !== 'function') return 0;
  const probeX = Math.max(1, Math.min(x, window.innerWidth - 1));
  let blocked = 0;
  for (let y = 4; y <= 140; y += 12) {
    const hit = document.elementFromPoint(probeX, y);
    if (!hit || hit === self || self.contains(hit) || hit.contains(self)) continue;
    for (let el: Element | null = hit; el && el !== document.body; el = el.parentElement) {
      const pos = window.getComputedStyle(el).position;
      if (pos === 'fixed' || pos === 'sticky') {
        // Its real bottom edge, not the probe step, or the answer would be
        // short by up to one step and tuck the bubble under the header.
        blocked = Math.max(blocked, el.getBoundingClientRect().bottom);
        break;
      }
    }
  }
  // A full-screen fixed overlay would otherwise push the bubble off the
  // bottom of the screen; no header is worth more than this.
  return Math.min(blocked, window.innerHeight * 0.4);
}

export const getActivityDuration = (act: string): number => {
  switch (act) {
    case 'sync-fistpump': return 550;
    case 'refund-wince': return 380;
    case 'counting-cash':
    case 'order-doorbell-ears':
    case 'goal-trophy-lift':
    case 'staff-wave':
      return 1800;
    case 'listening-music': return 10000;
    case 'soccer-ball': return 7000;
    case 'staring-phone': return 8000;
    case 'reading-book': return 8000;
    case 'drinking-water': return 6000;
    case 'shaking-clock': return 5000;
    case 'walking-off-left':
    case 'walking-off-right':
    case 'walking-off':
      return 5000;
    default: return 5000;
  }
};
