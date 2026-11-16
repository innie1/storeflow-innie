// ─── The average job, month by month ──────────────────────────────────────────

// Written out, because a browser's own short names differ: "Sep" on one phone, "Sept" on another.
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface MonthAverage {
  /** "2026-11". */
  key: string;
  /** "Nov", or "Nov 2025" for a month in another year. */
  label: string;
  /** The month's full name, for a sentence: "November". */
  name: string;
  jobs: number;
  pieces: number;
  /** What those jobs were priced at, paid or not. */
  value: number;
  /** value ÷ jobs. Null in a month with no jobs. */
  average: number | null;
  /** value ÷ pieces. Null when no pieces were counted. */
  perPiece: number | null;
  /** The month still running, so its figures will move. */
  current: boolean;
}

/**
 * What one job is worth, and whether that is going up or down.
 *
 * Takings can rise because more customers came or because each one brought
 * more, and the two call for different things. The average job separates
 * them: a month with more jobs at the same average is more customers; the same
 * jobs at a higher average is bigger bundles or better prices.
 *
 * A job is one drop-off, priced at what it was charged, counted in the month
 * it was brought in whether or not it has been paid. Paid-or-not is a separate
 * question with its own screens; mixing it in here would make a month look
 * like smaller jobs when it was only slower payers.
 *
 * Months before the shop's first job are left out rather than shown as zero,
 * so a shop two months old does not see four empty months of "decline".
 */
export function averageJobByMonth(
  jobs: { at: string; value: number; pieces?: number }[],
  months: number = 6,
  now: number = Date.now(),
): MonthAverage[] {
  const today = new Date(now);
  const rows: (MonthAverage & { start: number; end: number })[] = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const start = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const end = new Date(today.getFullYear(), today.getMonth() - back + 1, 1);
    const sameYear = start.getFullYear() === today.getFullYear();
    rows.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      label: sameYear ? SHORT[start.getMonth()] : `${SHORT[start.getMonth()]} ${start.getFullYear()}`,
      name: LONG[start.getMonth()],
      jobs: 0, pieces: 0, value: 0, average: null, perPiece: null,
      current: back === 0,
      start: start.getTime(), end: end.getTime(),
    });
  }

  for (const job of jobs) {
    const at = new Date(job.at).getTime();
    if (!Number.isFinite(at) || at > now) continue;
    const row = rows.find(month => at >= month.start && at < month.end);
    if (!row) continue;
    row.jobs += 1;
    row.value += Math.max(0, Number(job.value) || 0);
    row.pieces += Math.max(0, Number(job.pieces) || 0);
  }

  const first = rows.findIndex(row => row.jobs > 0);
  if (first < 0) return [];
  return rows.slice(first).map(({ start: _start, end: _end, ...row }) => ({
    ...row,
    average: row.jobs > 0 ? row.value / row.jobs : null,
    perPiece: row.pieces > 0 ? row.value / row.pieces : null,
  }));
}

export interface AverageJobChange {
  /** The last finished month with jobs, to measure this month against. */
  against: MonthAverage;
  /** This month's average less that month's. */
  difference: number;
  /** As a share of that month's average, -1 to ... */
  share: number;
}

/** This month's average job against the last month that had any. */
export function averageJobChange(months: MonthAverage[]): AverageJobChange | null {
  const current = months[months.length - 1];
  if (!current || !current.current || current.average === null) return null;
  const against = [...months].slice(0, -1).reverse().find(month => month.average !== null);
  if (!against || !against.average) return null;
  const difference = current.average - against.average;
  return { against, difference, share: difference / against.average };
}
