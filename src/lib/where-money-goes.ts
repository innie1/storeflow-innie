/**
 * Where a service shop's money goes, in the shop's own terms.
 *
 * The card under this name was written for a shop that sells goods: it
 * looked for products priced too close to cost and stock gone missing, and
 * for everything else said "overheads are eating the takings - check
 * utilities, transport and salaries". A laundry has no products and no stock,
 * so it was told nothing it could act on.
 *
 * What a laundry spends on is known and short: soap, light, fuel, water, the
 * people who do the work, and the rent. Each is named the way the shop names
 * it, measured against the money that came in over the same days, and given
 * the one detail that makes it checkable - what it comes to a piece, how many
 * times it was bought, what it costs a day whether or not clothes come.
 *
 * Rent and salaries are counted at what a month of them costs even when the
 * payment has not been recorded yet, and marked as such. Left out until paid,
 * the two largest costs a shop has would vanish from the picture for most of
 * every month.
 */

import type { Expense, StoreData } from '@/types/store';
import { receivedBetween } from '@/lib/money-figures';
import { isStockPurchase } from '@/lib/store-data';
import { monthlyRent } from '@/lib/rent';
import { consumableKey, consumablePace, utilityKey, utilityPace } from '@/lib/cost-estimator';
import { approvedLabourBetween, PIECE_WORK_CATEGORY } from '@/lib/piece-work';
import { shopLaundryRecords } from '@/lib/shop-laundry';

const DAY = 86400000;

export interface MoneyRow {
  key: string;
  /** In the shop's words: "Detergent", "Light", "Rent". */
  label: string;
  amount: number;
  /** Of every ₦100 that came in, how much went here. Null when nothing came in. */
  per100: number | null;
  /** The one detail that makes the figure checkable. */
  detail: string;
  /** Owed whether or not any clothes come in. */
  fixed: boolean;
  /** Some of it is a month's commitment not yet recorded as paid. */
  partlyDue: boolean;
}

export interface WhereMoneyGoes {
  days: number;
  /** Money received over the window. */
  received: number;
  /** Everything below, added up. */
  spent: number;
  /** received less spent. Negative when more went out than came in. */
  left: number;
  /** Of every ₦100 that came in, how much went on running the shop. */
  per100: number | null;
  /** Largest first. */
  rows: MoneyRow[];
  /** Pieces taken in over the window, which the per-piece details are worked from. */
  pieces: number;
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const cap = (text: string) => (text ? `${text[0].toUpperCase()}${text.slice(1)}` : text);
const times = (count: number) => (count === 1 ? 'bought once' : `bought ${count} times`);

export function whereMoneyGoes(store: StoreData, days: number = 30, now: number = Date.now()): WhereMoneyGoes {
  const from = now - days * DAY;
  const inWindow = (value: unknown) => {
    const at = new Date(String(value || '')).getTime();
    return Number.isFinite(at) && at >= from && at <= now;
  };

  const accessCode = String(store.accessCode || '');
  let pieces = 0;
  try {
    for (const record of accessCode ? shopLaundryRecords(accessCode) : []) {
      if (inWindow(record.createdAt)) pieces += Number(record.pieceCount) || 0;
    }
  } catch { /* no bundles readable */ }

  const received = receivedBetween(store, from, now + 1);

  // What was recorded as spent, grouped by the thing it was spent on.
  const groups = new Map<string, { label: string; amount: number; count: number; kind: 'soap' | 'bill' | 'rent' | 'salary' | 'other' }>();
  const add = (key: string, label: string, kind: 'soap' | 'bill' | 'rent' | 'salary' | 'other', expense: Expense) => {
    const group = groups.get(key) || { label, amount: 0, count: 0, kind };
    group.amount += Math.max(0, Number(expense.amount) || 0);
    group.count += 1;
    groups.set(key, group);
  };
  for (const expense of store.expenses || []) {
    if (!inWindow(expense.date) || isStockPurchase(expense)) continue;
    // Piece work is counted when the work is approved, below - not when it is paid.
    if (expense.category === PIECE_WORK_CATEGORY) continue;
    if (expense.category === 'Consumables') {
      const key = consumableKey(store, expense);
      // "ariel x 7" is seven packs of Ariel: the count is not part of its name.
      add(`soap:${key}`, cap(key.replace(/\s+[x×]\s*\d+$/i, '')), 'soap', expense);
    } else if (expense.category === 'Utilities') {
      const key = utilityKey(expense);
      add(`bill:${key}`, key === 'electricity' ? 'Light' : cap(key), 'bill', expense);
    } else if (expense.category === 'Rent' || (/\brent\b/i.test(String(expense.note || '')) && expense.category !== 'Salaries')) {
      add('rent', 'Rent', 'rent', expense);
    } else if (expense.category === 'Salaries') {
      add('salaries', 'Salaries', 'salary', expense);
    } else {
      add(`other:${expense.category}`, String(expense.category), 'other', expense);
    }
  }

  const share = (amount: number) => (received > 0 ? (amount / received) * 100 : null);
  const aPiece = (amount: number) => (pieces >= 10 ? `About ${naira(amount / pieces)} for every piece taken in.` : '');
  const soapPaces = consumablePace(store);
  const billPaces = utilityPace(store);
  const rows: MoneyRow[] = [];

  for (const [key, group] of groups) {
    if (group.kind === 'rent' || group.kind === 'salary') continue;
    let detail = '';
    if (group.kind === 'soap') {
      const pace = soapPaces.find(entry => `soap:${entry.key}` === key);
      detail = pace?.perPiece
        ? `${cap(times(group.count))}. It works out at about ${naira(pace.perPiece)} for every piece washed.`
        : `${cap(times(group.count))}. I will know what it costs a piece once a lot has run out and you buy again.`;
    } else if (group.kind === 'bill') {
      const pace = billPaces.find(entry => `bill:${entry.key}` === key);
      detail = pace?.perPiece
        ? `${group.count === 1 ? 'One payment' : `${group.count} payments`}. About ${naira(pace.perPiece)} for every piece.`
        : `${group.count === 1 ? 'One payment' : `${group.count} payments`}. ${aPiece(group.amount)}`.trim();
    } else {
      detail = `${group.count === 1 ? 'One payment' : `${group.count} payments`}.`;
    }
    rows.push({ key, label: group.label, amount: group.amount, per100: share(group.amount), detail, fixed: false, partlyDue: false });
  }

  // The people paid by the piece: what was approved, which is when it was owed.
  const labour = approvedLabourBetween(store, from, now + 1);
  if (labour > 0) {
    const approved = (store.pieceWork || []).filter(entry => entry.approved && inWindow(entry.at));
    const done = approved.reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
    const workers = new Set(approved.map(entry => entry.workerId)).size;
    rows.push({
      key: 'piece-work', label: 'Piece-work pay', amount: labour, per100: share(labour),
      detail: `${done.toLocaleString()} ${done === 1 ? 'piece' : 'pieces'} of work by ${workers} ${workers === 1 ? 'worker' : 'workers'}, counted when you approved it.`,
      fixed: false, partlyDue: false,
    });
  }

  // Rent: a month of it, whether or not the payment has been recorded yet.
  const scale = days / 30;
  const rentPaid = groups.get('rent')?.amount || 0;
  const rent = store.profile?.rent;
  const rentDue = rent?.isRented && Number(rent.amount) > 0 ? monthlyRent(rent) * scale : 0;
  const rentAmount = Math.max(rentPaid, rentDue);
  if (rentAmount > 0) {
    rows.push({
      key: 'rent', label: 'Rent', amount: rentAmount, per100: share(rentAmount),
      detail: `${naira(rentAmount / days)} a day, whether or not clothes come in.${rentPaid < rentDue ? ' From the rent on your shop profile, not yet recorded as paid.' : ''}`,
      fixed: true, partlyDue: rentPaid < rentDue,
    });
  }

  // Salaries: what the staff on a wage cost a month.
  const salaried = (store.staffMembers || []).filter(member => Number((member as { monthlySalary?: number }).monthlySalary) > 0);
  const payroll = salaried.reduce((sum, member) => sum + (Number((member as { monthlySalary?: number }).monthlySalary) || 0), 0) * scale;
  const salariesPaid = groups.get('salaries')?.amount || 0;
  const salaryAmount = Math.max(salariesPaid, payroll);
  if (salaryAmount > 0) {
    rows.push({
      key: 'salaries', label: 'Salaries', amount: salaryAmount, per100: share(salaryAmount),
      detail: `${salaried.length ? `${salaried.length} ${salaried.length === 1 ? 'person' : 'people'} on a monthly wage. ` : ''}${naira(salaryAmount / days)} a day.${salariesPaid < payroll ? ' Part of it is not yet recorded as paid.' : ''}`,
      fixed: true, partlyDue: salariesPaid < payroll,
    });
  }

  rows.sort((a, b) => b.amount - a.amount);
  const spent = rows.reduce((sum, row) => sum + row.amount, 0);
  return {
    days,
    received,
    spent,
    left: received - spent,
    per100: received > 0 ? (spent / received) * 100 : null,
    rows: rows.map(row => ({ ...row, amount: Math.round(row.amount) })),
    pieces,
  };
}

/** "Of every ₦100 that came in, ₦64 went on running the shop and ₦36 was left." */
export function whereMoneyGoesSentence(report: WhereMoneyGoes): string {
  if (report.spent <= 0) return 'No spending recorded in this time. Record what you spend and I can show where it goes.';
  if (report.per100 === null) return `${naira(report.spent)} went out and no money came in over the last ${report.days} days.`;
  const out = Math.round(report.per100);
  if (out >= 100) {
    return `More went out than came in: ${naira(report.spent)} spent against ${naira(report.received)} received over the last ${report.days} days.`;
  }
  return `Of every ₦100 that came in, ₦${out} went on running the shop and ₦${100 - out} was left.`;
}
