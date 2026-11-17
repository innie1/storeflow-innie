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

// ─── Week by week, and the change on every row ────────────────────────────────

/** Midnight on the Monday of the week holding `at`. */
function mondayOf(at: number): Date {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7);
  return date;
}

/**
 * The same figures by week, Monday to Sunday, for somebody watching closer
 * than a month at a time. Weeks before the shop's first job are left out.
 */
export function averageJobByWeek(
  jobs: { at: string; value: number; pieces?: number }[],
  weeks: number = 8,
  now: number = Date.now(),
): MonthAverage[] {
  const thisMonday = mondayOf(now);
  const rows: (MonthAverage & { start: number; end: number })[] = [];
  for (let back = weeks - 1; back >= 0; back -= 1) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - back * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const sunday = new Date(end);
    sunday.setDate(sunday.getDate() - 1);
    const dates = `${start.getDate()} ${SHORT[start.getMonth()]} – ${sunday.getDate()} ${SHORT[sunday.getMonth()]}`;
    rows.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
      label: back === 0 ? 'This week' : back === 1 ? 'Last week' : dates,
      name: back === 0 ? 'this week' : back === 1 ? 'last week' : `the week of ${start.getDate()} ${SHORT[start.getMonth()]}`,
      jobs: 0, pieces: 0, value: 0, average: null, perPiece: null,
      current: back === 0,
      start: start.getTime(), end: end.getTime(),
    });
  }

  for (const job of jobs) {
    const at = new Date(job.at).getTime();
    if (!Number.isFinite(at) || at > now) continue;
    const row = rows.find(week => at >= week.start && at < week.end);
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

export interface AverageWithChange extends MonthAverage {
  /**
   * Against the last earlier stretch that had jobs. Null on the first row, and
   * on a row with no jobs of its own.
   */
  change: { difference: number; percent: number; against: string } | null;
}

/**
 * Every row with how it moved on the one before.
 *
 * An average is a rate, not a total, so a week or month still running can be
 * set against a finished one as it stands: half a week of jobs has the same
 * kind of average as a whole one. What it cannot have is the same weight, so
 * each row keeps its job count beside it.
 */
export function withAverageChanges(rows: MonthAverage[]): AverageWithChange[] {
  let last: MonthAverage | null = null;
  return rows.map(row => {
    const before = last;
    if (row.average !== null) last = row;
    if (row.average === null || !before || !before.average) return { ...row, change: null };
    const difference = row.average - before.average;
    return { ...row, change: { difference, percent: (difference / before.average) * 100, against: before.name } };
  });
}
