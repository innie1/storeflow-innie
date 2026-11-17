/**
 * Payday: asking the owner whether each salary was paid, and recording it.
 *
 * A salary is the one large cost a shop knows in advance - who, how much and
 * on which day - and the one it most often forgets to write down, because the
 * money goes hand to hand. Left unrecorded, the month's figures say the shop
 * kept money it paid out, and the cash in the drawer stops matching the books.
 *
 * Everything needed is already in the staff settings: the salary, and now the
 * day it is paid. On that day the owner is asked, one person at a time,
 * "Did you pay Ada her ₦40,000?". One tap on Paid records the salary as an
 * expense against that person and that month; Not yet asks again tomorrow.
 * Nothing has to be typed unless a different amount was paid.
 *
 * A salary already written down by hand counts as paid, so nobody is asked
 * twice and nothing is recorded twice.
 */

import type { ExpensePaidFrom, StaffMember, StoreData } from '@/types/store';
import { hasMonthlySalary } from '@/lib/piece-work';
import { shopStorage } from '@/lib/shop-storage';
import { addExpense } from '@/lib/store-data';

const DAY = 86400000;

/** Asked about for this long after the day. Past it, the month is let go. */
export const PAYDAY_ASK_DAYS = 14;

const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export interface PaydayDue {
  /** `${staffId}:${month}` */
  key: string;
  staffId: string;
  name: string;
  /** What the settings say this person is paid a month. */
  amount: number;
  /** "2026-11" */
  month: string;
  /** "November" */
  monthName: string;
  /** Midnight on the payday. */
  payday: number;
  /** Whole days since the payday. 0 on the day. */
  daysSince: number;
}

export interface PaydayAnswer {
  answer: 'later' | 'skip';
  /** For "later": not asked again before this. */
  until?: string;
  at: string;
}

const monthKey = (year: number, month: number) => `${year}-${String(month + 1).padStart(2, '0')}`;

/** The day of the month this person is paid, 1 to 31. Absent means the last day. */
export function payDayOf(member: Pick<StaffMember, 'payDay'>): number {
  const day = Math.round(Number(member.payDay) || 0);
  return day >= 1 && day <= 31 ? day : 31;
}

/** Midnight on this person's payday in the given month. A 31st in a short month is its last day. */
export function paydayIn(member: Pick<StaffMember, 'payDay'>, year: number, month: number): number {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(payDayOf(member), last)).getTime();
}

/** "On the 25th of every month", or "On the last day of every month". */
export function payDayInWords(member: Pick<StaffMember, 'payDay'>): string {
  const day = payDayOf(member);
  if (day === 31 || !member.payDay) return 'the last day of every month';
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `the ${day}${suffix} of every month`;
}

/** On a monthly wage, with an amount set. */
export function isSalaried(member: StaffMember): boolean {
  return hasMonthlySalary(member) && Number(member.monthlySalary) > 0 && member.role !== 'owner';
}

const wordIn = (text: string, word: string) => {
  const escaped = word.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped ? new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(text) : false;
};

/**
 * What has been recorded as paid to this person for a month.
 *
 * A salary recorded from the payday question names its person and month. One
 * written by hand - "Salary", "Ada's wage" - names neither, so a Salaries
 * expense counts when it mentions the person's first name and falls in the
 * weeks around that payday. With a single person on a wage, any salary in
 * those weeks is theirs.
 */
export function salaryRecordedFor(store: StoreData, member: StaffMember, month: string, payday: number): number {
  const salaried = (store.staffMembers || []).filter(isSalaried);
  const first = String(member.name || '').trim().split(/\s+/)[0] || '';
  let paid = 0;
  for (const expense of store.expenses || []) {
    if (expense.category !== 'Salaries') continue;
    const amount = Math.max(0, Number(expense.amount) || 0);
    if (expense.paidTo || expense.payMonth) {
      if (expense.paidTo === member.id && expense.payMonth === month) paid += amount;
      continue;
    }
    const at = new Date(String(expense.date || '')).getTime();
    if (!Number.isFinite(at) || at < payday - 10 * DAY || at > payday + 30 * DAY) continue;
    const note = String(expense.note || '');
    if ((first && wordIn(note, first)) || salaried.length === 1) paid += amount;
  }
  return paid;
}

function answersKey(accessCode: string): string {
  return `storeflow_payday_answers_${String(accessCode || '').toUpperCase()}`;
}

export function paydayAnswers(accessCode: string): Record<string, PaydayAnswer> {
  try {
    const parsed = JSON.parse(shopStorage.getItem(answersKey(accessCode)) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * "Not yet" asks again tomorrow morning; "skip" means this month is not
 * being paid and is not asked about again.
 */
export function answerPayday(accessCode: string, key: string, answer: PaydayAnswer['answer'], now: number = Date.now()): void {
  const notes = paydayAnswers(accessCode);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(6, 0, 0, 0);
  // Months long past are dropped, so the note never grows.
  const keep: Record<string, PaydayAnswer> = {};
  for (const [k, note] of Object.entries(notes)) {
    if (now - new Date(note.at).getTime() < 90 * DAY) keep[k] = note;
  }
  keep[key] = { answer, at: new Date(now).toISOString(), ...(answer === 'later' ? { until: tomorrow.toISOString() } : {}) };
  try { shopStorage.setItem(answersKey(accessCode), JSON.stringify(keep)); } catch { /* storage full: asked again, nothing lost */ }
}

/**
 * Salaries whose payday has come and that are not recorded yet, the longest
 * waiting first. This month's payday, and last month's while it is within
 * PAYDAY_ASK_DAYS, so a payday on the 30th is still asked about on the 2nd.
 */
export function paydaysDue(store: StoreData, now: number = Date.now()): PaydayDue[] {
  const answers = paydayAnswers(String(store.accessCode || ''));
  const today = new Date(now);
  const due: PaydayDue[] = [];
  for (const member of (store.staffMembers || []).filter(isSalaried)) {
    const added = new Date(String(member.addedAt || '')).getTime();
    for (const back of [1, 0]) {
      const year = today.getFullYear();
      const month = today.getMonth() - back;
      const first = new Date(year, month, 1);
      const payday = paydayIn(member, first.getFullYear(), first.getMonth());
      if (payday > now || now - payday > PAYDAY_ASK_DAYS * DAY) continue;
      // Not asked about a payday from before they joined.
      if (Number.isFinite(added) && added > payday + DAY) continue;
      const key = `${member.id}:${monthKey(first.getFullYear(), first.getMonth())}`;
      const answer = answers[key];
      if (answer?.answer === 'skip') continue;
      if (answer?.answer === 'later' && answer.until && new Date(answer.until).getTime() > now) continue;
      const monthId = monthKey(first.getFullYear(), first.getMonth());
      if (salaryRecordedFor(store, member, monthId, payday) > 0) continue;
      due.push({
        key,
        staffId: member.id,
        name: member.name,
        amount: Math.round(Number(member.monthlySalary) || 0),
        month: monthId,
        monthName: LONG[first.getMonth()],
        payday,
        daysSince: Math.max(0, Math.floor((now - payday) / DAY)),
      });
    }
  }
  return due.sort((a, b) => a.payday - b.payday);
}

/** Records the salary as paid: an expense against the person and the month. */
export function recordSalaryPaid(
  store: StoreData,
  due: PaydayDue,
  options: { amount?: number; paidFrom?: ExpensePaidFrom; now?: number } = {},
): StoreData {
  const amount = Math.max(0, Math.round(Number(options.amount ?? due.amount) || 0));
  if (amount <= 0) return store;
  const now = options.now ?? Date.now();
  return addExpense(
    store,
    {
      amount,
      category: 'Salaries',
      date: new Date(now).toISOString(),
      note: `Salary for ${due.name}, ${due.monthName}`,
      paidFrom: options.paidFrom || 'cash',
      paidTo: due.staffId,
      payMonth: due.month,
    },
    'Owner',
    'owner',
    `Recorded ${due.name}'s ${due.monthName} salary of ₦${amount.toLocaleString()} on payday`,
  );
}
