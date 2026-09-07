/**
 * When a bundle is due, in words an attendant can read at a glance.
 *
 * The card showed one of two things: the literal `toLocaleString()` of the
 * promised time — "9/8/2026, 7:04:00 AM", which is a lot to parse on a phone
 * mid-shift — or, once that time had passed, the single word "Overdue".
 *
 * "Overdue" is the problem. On a busy morning every late bundle carried the
 * same badge, so the attendant could not tell one that missed its slot by an
 * hour from one that has been sitting since Tuesday. The list is sorted worst
 * first, which helps, but only if you trust the order rather than what you can
 * read.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface DueLabel {
  text: string;
  /** How much attention it deserves, for the caller to colour. */
  tone: 'late' | 'soon' | 'later';
}

function plural(value: number, unit: string) {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/** Clock time, no date: "7am", "5:30pm". */
function clock(at: Date) {
  const hours = at.getHours();
  const minutes = at.getMinutes();
  const suffix = hours < 12 ? 'am' : 'pm';
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${twelve}${suffix}` : `${twelve}:${String(minutes).padStart(2, '0')}${suffix}`;
}

/** Whether two moments fall on the same calendar day. */
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * `promisedAt` is null when no time was promised, in which case there is
 * nothing to say and the caller should show no badge at all.
 */
export function describeDue(promisedAt: number | null, now = Date.now()): DueLabel | null {
  if (promisedAt === null || !Number.isFinite(promisedAt)) return null;

  const at = new Date(promisedAt);
  const diff = promisedAt - now;

  // ── Already late ────────────────────────────────────────────────────────
  if (diff < 0) {
    const late = -diff;
    // Under an hour is still "just now" to a shop; anything more should say
    // how much, because that is what decides which bundle to pick up first.
    if (late < HOUR) return { text: `${Math.max(1, Math.round(late / MINUTE))}m late`, tone: 'late' };
    if (late < DAY) return { text: `${Math.round(late / HOUR)}h late`, tone: 'late' };
    return { text: `${plural(Math.round(late / DAY), 'day')} late`, tone: 'late' };
  }

  // ── Due shortly ─────────────────────────────────────────────────────────
  if (diff < HOUR) return { text: `Due in ${Math.max(1, Math.round(diff / MINUTE))}m`, tone: 'soon' };

  const today = new Date(now);
  if (sameDay(at, today)) return { text: `Due ${clock(at)}`, tone: 'soon' };

  const tomorrow = new Date(now + DAY);
  if (sameDay(at, tomorrow)) return { text: `Due tomorrow ${clock(at)}`, tone: 'later' };

  // Further out: the day is what matters, not the minute.
  const days = Math.round(diff / DAY);
  if (days <= 6) {
    return { text: `Due ${at.toLocaleDateString(undefined, { weekday: 'short' })} ${clock(at)}`, tone: 'later' };
  }
  return { text: `Due ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`, tone: 'later' };
}
