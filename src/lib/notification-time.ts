/**
 * When something happened, said the same way everywhere.
 *
 * The notification tray printed the phone's own default - "11/13/2026 · 02:58
 * PM" on most phones, month first - while the rest of the app writes dates
 * the way they are said here: "Mon 9 Nov". Today's alerts give the time,
 * yesterday's say so, and anything older gives the day.
 */

const DAY = 86_400_000;

function startOfDay(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export function isToday(value: string | number | Date, now: number = Date.now()): boolean {
  const at = new Date(value).getTime();
  return Number.isFinite(at) && startOfDay(at) === startOfDay(now);
}

/** "2:58 pm", "Yesterday, 2:58 pm", "Mon 9 Nov" or "9 Nov 2025". */
export function describeWhen(value: string | number | Date, now: number = Date.now()): string {
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return '';
  const time = new Date(at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([AP]M)$/i, (_, half: string) => ` ${half.toLowerCase()}`);
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY);
  if (days <= 0) return time;
  if (days === 1) return `Yesterday, ${time}`;
  const sameYear = new Date(at).getFullYear() === new Date(now).getFullYear();
  return new Date(at).toLocaleDateString('en-GB', sameYear
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '');
}
