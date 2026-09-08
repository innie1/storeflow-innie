/**
 * Which turnarounds this shop actually gives.
 *
 * The row offered twelve hours, one day, two days, three days and a week, in
 * that order, for ever. A shop that says "tomorrow" to nearly every customer
 * still had to reach past twelve hours to get there, and the custom button —
 * the one you need when somebody asks for Tuesday afternoon — sat behind a row
 * that had to be scrolled.
 *
 * So the shop's own habit orders it. What gets used comes first; what has
 * never been used gives up its place once there are enough real answers to
 * fill the row.
 */

const KEY_PREFIX = 'storeflow_laundry_due_usage_';

export interface DueChip {
  label: string;
  hours: number;
}

/** Enough chips to cover a shop's real range, few enough that Custom stays in reach. */
export const MAX_DUE_CHIPS = 4;

function storageKey(accessCode: string): string {
  return `${KEY_PREFIX}${String(accessCode || '').toUpperCase()}`;
}

export function readDueUsage(accessCode: string): Record<string, number> {
  if (!accessCode) return {};
  try {
    const raw = localStorage.getItem(storageKey(accessCode));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Counted when a bundle is actually saved, not when a chip is tapped. */
export function recordDueChoice(accessCode: string, hours: number): void {
  if (!accessCode || !Number.isFinite(hours) || hours <= 0) return;
  try {
    const usage = readDueUsage(accessCode);
    const key = String(Math.round(hours));
    usage[key] = (Number(usage[key]) || 0) + 1;
    localStorage.setItem(storageKey(accessCode), JSON.stringify(usage));
  } catch {
    // A preference that cannot be saved must never stop a bundle being taken in.
  }
}

/**
 * The chips to show, most-used first.
 *
 * Two things are protected from being dropped however unused they are: the
 * turnaround currently selected, because a chip vanishing from under the
 * choice you just made is alarming; and the shop's saved custom one, which was
 * typed in deliberately and is the whole reason it was kept.
 *
 * Ties hold the original order, so a shop that has recorded nothing yet sees
 * the familiar row rather than an arbitrary shuffle.
 */
export function orderedDueChips(
  accessCode: string,
  presets: DueChip[],
  options: { custom?: number | null; selected?: number | null; limit?: number } = {},
): DueChip[] {
  const usage = readDueUsage(accessCode);
  const limit = options.limit ?? MAX_DUE_CHIPS;

  const all: DueChip[] = [...presets];
  if (options.custom && !all.some(chip => chip.hours === options.custom)) {
    all.push({ label: describeDueHours(options.custom), hours: options.custom });
  }

  const rank = new Map(presets.map((chip, index) => [chip.hours, index]));
  const used = (chip: DueChip) => Number(usage[String(chip.hours)]) || 0;

  const sorted = [...all].sort((a, b) => {
    const byUse = used(b) - used(a);
    if (byUse !== 0) return byUse;
    const left = rank.has(a.hours) ? rank.get(a.hours)! : Number.MAX_SAFE_INTEGER;
    const right = rank.has(b.hours) ? rank.get(b.hours)! : Number.MAX_SAFE_INTEGER;
    return left - right;
  });

  const kept: DueChip[] = [];
  const mustKeep = (chip: DueChip) =>
    (options.selected != null && chip.hours === options.selected)
    || (options.custom != null && chip.hours === options.custom);

  for (const chip of sorted) {
    if (kept.length < limit || mustKeep(chip)) kept.push(chip);
  }
  return kept;
}

/** "2 days", "36 hours" — the same words the presets use. */
export function describeDueHours(hours: number): string {
  const value = Math.round(Number(hours) || 0);
  if (value <= 0) return '';
  if (value % 168 === 0) {
    const weeks = value / 168;
    return `${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  if (value % 24 === 0) {
    const days = value / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${value} hour${value === 1 ? '' : 's'}`;
}
