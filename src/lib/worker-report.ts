/**
 * A worker's own report: everything one person did over a stretch of days.
 *
 * At the end of the week a worker used to type out from memory what she took
 * in, what she was paid and what she spent, and send it on WhatsApp. The app
 * already knows all of it, each piece with her name on it: the bundles she
 * recorded, every move along the wash she made, the money she took and how,
 * the expenses she put in and the piece work she claimed. This gathers it for
 * one person and one stretch, and writes it as a message.
 *
 * Two ways to send it, from the same figures: a summary with the totals, or
 * the full breakdown with every line, its date and time. The totals at the
 * top of the full breakdown are the summary, word for word, so the two can
 * never disagree.
 *
 * Only what was recorded under that person's own sign-in is theirs. Anything
 * put in on somebody else's phone carries that person's name instead.
 */

import type { StoreData } from '@/types/store';
import type { LocalLaundryRecord } from '@/lib/laundry-offline';

const DAY = 86400000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type ReportRange = 'this-week' | 'last-week' | 'this-month' | 'custom';
export type ReportDetail = 'summary' | 'full';

export interface ReportWindow {
  from: number;
  /** Exclusive. */
  to: number;
  /** "Mon 16 Nov – Wed 18 Nov". */
  label: string;
}

export interface ReportPerson {
  id?: string;
  name: string;
  role?: string;
}

export interface ReportBundle {
  at: number;
  clientRef: string;
  tagCode: string;
  customerName: string;
  service: string;
  pieces: number;
  total: number;
}

export interface ReportPayment {
  at: number;
  tagCode: string;
  customerName: string;
  amount: number;
  cash: number;
  transfer: number;
  /** Neither cash nor transfer was said. */
  notRecorded: number;
}

export interface ReportMove {
  at: number;
  stage: string;
  tagCode: string;
  customerName: string;
}

export interface ReportExpense {
  at: number;
  what: string;
  amount: number;
  status: 'approved' | 'waiting' | 'rejected';
}

export interface WorkerReport {
  person: ReportPerson;
  window: ReportWindow;
  takenIn: ReportBundle[];
  takenInValue: number;
  takenInPieces: number;
  payments: ReportPayment[];
  money: { total: number; cash: number; transfer: number; notRecorded: number };
  moves: ReportMove[];
  /** How many moves of each kind, in the order the wash goes. */
  moveCounts: { stage: string; label: string; count: number }[];
  expenses: ReportExpense[];
  /** Approved and waiting; a rejected one was not spent from the shop. */
  expensesTotal: number;
  pieceWork: { pieces: number; approved: number; waiting: number; entries: number } | null;
  /** Nothing at all in the stretch. */
  empty: boolean;
}

// ─── The stretch ──────────────────────────────────────────────────────────────

const startOfDay = (at: number) => { const d = new Date(at); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (at: number, days: number) => { const d = new Date(at); d.setDate(d.getDate() + days); return d.getTime(); };
const mondayOf = (at: number) => addDays(startOfDay(at), -((new Date(at).getDay() + 6) % 7));

export function shortDay(at: number): string {
  const d = new Date(at);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function clockTime(at: number): string {
  const d = new Date(at);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const h12 = hours % 12 || 12;
  return `${h12}:${String(minutes).padStart(2, '0')}${hours < 12 ? 'am' : 'pm'}`;
}

/** "2026-11-16" as midnight that day, here. */
function dayFromKey(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

/**
 * This week is Monday up to now; last week is Monday to Sunday; this month is
 * the 1st up to now. Picked dates run from the first day's morning to the end
 * of the last day, either way round.
 */
export function reportWindow(range: ReportRange, now: number = Date.now(), custom?: { from: string; to: string }): ReportWindow {
  let from: number;
  let to: number;
  if (range === 'last-week') {
    to = mondayOf(now);
    from = addDays(to, -7);
  } else if (range === 'this-month') {
    const d = new Date(now);
    from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    to = now + 1;
  } else if (range === 'custom') {
    const a = dayFromKey(custom?.from || '') ?? startOfDay(now);
    const b = dayFromKey(custom?.to || '') ?? a;
    from = Math.min(a, b);
    to = addDays(Math.max(a, b), 1);
  } else {
    from = mondayOf(now);
    to = now + 1;
  }
  const lastDay = Math.min(to - 1, now);
  const label = startOfDay(from) === startOfDay(lastDay) ? shortDay(from) : `${shortDay(from)} – ${shortDay(lastDay)}`;
  return { from, to, label };
}

// ─── Gathering it ─────────────────────────────────────────────────────────────

const sameName = (a: unknown, b: unknown) => {
  const x = String(a || '').trim().toLowerCase();
  return !!x && x === String(b || '').trim().toLowerCase();
};
const timeOf = (value: unknown) => {
  const at = new Date(String(value || '')).getTime();
  return Number.isFinite(at) ? at : 0;
};
const round = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const STAGE_LABELS: Record<string, string> = {
  washing: 'Started washing',
  drying: 'Put to dry',
  ironing: 'Ironing',
  folding: 'Folding',
  ready: 'Made ready',
  collected: 'Handed back',
};
const STAGE_ORDER = ['washing', 'drying', 'ironing', 'folding', 'ready', 'collected'];

export function workerReport(
  store: StoreData,
  bundles: Pick<LocalLaundryRecord, 'clientRef' | 'tagCode' | 'customerName' | 'serviceName' | 'pieceCount' | 'total' | 'createdAt' | 'recordedByName' | 'stageHistory'>[],
  person: ReportPerson,
  window: ReportWindow,
): WorkerReport {
  const inWindow = (at: number) => at >= window.from && at < window.to;
  const byRef = new Map(bundles.map(bundle => [bundle.clientRef, bundle]));

  // The clothes this person took in.
  const takenIn: ReportBundle[] = bundles
    .filter(bundle => sameName(bundle.recordedByName, person.name) && inWindow(timeOf(bundle.createdAt)))
    .map(bundle => ({
      at: timeOf(bundle.createdAt),
      clientRef: bundle.clientRef,
      tagCode: String(bundle.tagCode || '').toUpperCase(),
      customerName: String(bundle.customerName || 'Walk-in customer'),
      service: String(bundle.serviceName || ''),
      pieces: Number(bundle.pieceCount) || 0,
      total: Math.max(0, Number(bundle.total) || 0),
    }))
    .sort((a, b) => a.at - b.at);

  // Each move along the wash this person made.
  const moves: ReportMove[] = [];
  for (const bundle of bundles) {
    for (const step of bundle.stageHistory || []) {
      if (!STAGE_LABELS[step.stage] || !sameName(step.by, person.name)) continue;
      const at = timeOf(step.at);
      if (!inWindow(at)) continue;
      moves.push({ at, stage: step.stage, tagCode: String(bundle.tagCode || '').toUpperCase(), customerName: String(bundle.customerName || 'Walk-in customer') });
    }
  }
  moves.sort((a, b) => a.at - b.at);
  const moveCounts = STAGE_ORDER
    .map(stage => ({ stage, label: STAGE_LABELS[stage], count: moves.filter(move => move.stage === stage).length }))
    .filter(row => row.count > 0);

  // The money this person took, and how.
  const debts = new Map((store.pendingPayments || []).map(entry => [entry.id, entry]));
  const payments: ReportPayment[] = [];
  for (const sale of store.sales || []) {
    if (!sameName((sale as { recordedByName?: string }).recordedByName, person.name)) continue;
    const at = timeOf(sale.date);
    const amount = round(Math.max(0, Number(sale.total) || 0));
    if (!inWindow(at) || amount <= 0) continue;
    const ref = String(sale.pendingPaymentId || '').replace(/^laundry-/, '');
    const bundle = byRef.get(ref);
    const debt = sale.pendingPaymentId ? debts.get(sale.pendingPaymentId) : undefined;
    const fromName = String(sale.productName || '').split(' · ');
    let cash = 0, transfer = 0, notRecorded = 0;
    if (sale.paymentMethod === 'cash') cash = amount;
    else if (sale.paymentMethod === 'transfer' || sale.paymentMethod === 'pos') transfer = amount;
    else if (sale.paymentMethod === 'mixed' && sale.paymentAllocation) {
      cash = round(Math.min(amount, Number(sale.paymentAllocation.cash) || 0));
      transfer = round(amount - cash);
    } else notRecorded = amount;
    payments.push({
      at,
      tagCode: String(bundle?.tagCode || fromName[1] || '').toUpperCase(),
      customerName: String(bundle?.customerName || debt?.customerName || (sale as { customerName?: string }).customerName || fromName[0] || 'Customer'),
      amount, cash, transfer, notRecorded,
    });
  }
  payments.sort((a, b) => a.at - b.at);
  const money = payments.reduce((sum, payment) => ({
    total: round(sum.total + payment.amount),
    cash: round(sum.cash + payment.cash),
    transfer: round(sum.transfer + payment.transfer),
    notRecorded: round(sum.notRecorded + payment.notRecorded),
  }), { total: 0, cash: 0, transfer: 0, notRecorded: 0 });

  // The spending this person put in. A request and the book entry it became are one expense.
  const mine = (recorder?: { staffId?: string; name?: string }) =>
    !!recorder && ((person.id && recorder.staffId === person.id) || sameName(recorder.name, person.name));
  const spending: ReportExpense[] = [];
  const counted = new Set<string>();
  for (const request of store.staffExpenseRequests || []) {
    if (!mine(request.recordedBy)) continue;
    const at = timeOf(request.date) || timeOf(request.recordedAt);
    if (!inWindow(at)) continue;
    if (request.expenseId) counted.add(request.expenseId);
    spending.push({
      at,
      what: String(request.note || request.category),
      amount: Math.max(0, Number(request.amount) || 0),
      status: request.status === 'approved' ? 'approved' : request.status === 'rejected' ? 'rejected' : 'waiting',
    });
  }
  for (const expense of store.expenses || []) {
    if (counted.has(expense.id) || !mine(expense.recordedBy) || expense.recordedBy?.role === 'owner') continue;
    const at = timeOf(expense.date);
    if (!inWindow(at)) continue;
    spending.push({ at, what: String(expense.note || expense.category), amount: Math.max(0, Number(expense.amount) || 0), status: 'approved' });
  }
  spending.sort((a, b) => a.at - b.at);
  const expensesTotal = spending.filter(item => item.status !== 'rejected').reduce((sum, item) => sum + item.amount, 0);

  // Piece work claimed, and how much of it the owner has approved.
  const claims = (store.pieceWork || []).filter(entry =>
    ((person.id && entry.workerId === person.id) || sameName(entry.workerName, person.name)) && inWindow(timeOf(entry.at)));
  const pieceWork = claims.length
    ? {
        pieces: claims.reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0),
        approved: claims.filter(entry => entry.approved).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
        waiting: claims.filter(entry => !entry.approved).reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
        entries: claims.length,
      }
    : null;

  return {
    person,
    window,
    takenIn,
    takenInValue: takenIn.reduce((sum, bundle) => sum + bundle.total, 0),
    takenInPieces: takenIn.reduce((sum, bundle) => sum + bundle.pieces, 0),
    payments,
    money,
    moves,
    moveCounts,
    expenses: spending,
    expensesTotal,
    pieceWork,
    empty: !takenIn.length && !payments.length && !moves.length && !spending.length && !pieceWork,
  };
}

// ─── The message ──────────────────────────────────────────────────────────────

const naira = (value: number) => `₦${Math.round(value).toLocaleString()}`;
const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString()} ${count === 1 ? one : many}`;
const when = (at: number) => `${shortDay(at)}, ${clockTime(at)}`;

/** "Cash ₦27,000 · Transfer ₦12,000", with what was not said only when there is some. */
export function methodLine(money: WorkerReport['money']): string {
  return [
    `Cash ${naira(money.cash)}`,
    `Transfer ${naira(money.transfer)}`,
    money.notRecorded > 0 ? `Not recorded ${naira(money.notRecorded)}` : '',
  ].filter(Boolean).join(' · ');
}

/**
 * The totals, one line each. The summary is exactly these; the full breakdown
 * puts each one at the head of its section, so the two always agree.
 */
export function reportTotals(report: WorkerReport): { key: string; heading: string; line: string; extra?: string }[] {
  const rows: { key: string; heading: string; line: string; extra?: string }[] = [];
  if (report.takenIn.length) {
    rows.push({ key: 'in', heading: 'Clothes taken in', line: `${plural(report.takenIn.length, 'bundle')} · ${plural(report.takenInPieces, 'piece')} · ${naira(report.takenInValue)}` });
  }
  if (report.payments.length) {
    rows.push({ key: 'money', heading: 'Money taken', line: `${naira(report.money.total)} from ${plural(report.payments.length, 'payment')}`, extra: methodLine(report.money) });
  }
  if (report.moveCounts.length) {
    rows.push({ key: 'work', heading: 'Work done', line: report.moveCounts.map(row => `${row.label} ${row.count}`).join(' · ') });
  }
  if (report.expenses.length) {
    const waiting = report.expenses.filter(item => item.status === 'waiting').length;
    rows.push({ key: 'spent', heading: 'Expenses', line: `${naira(report.expensesTotal)} from ${plural(report.expenses.length, 'expense')}${waiting ? ` · ${waiting} waiting for approval` : ''}` });
  }
  if (report.pieceWork) {
    rows.push({ key: 'pieces', heading: 'Piece work', line: `${plural(report.pieceWork.pieces, 'piece')} · ${naira(report.pieceWork.approved)} approved${report.pieceWork.waiting > 0 ? ` · ${naira(report.pieceWork.waiting)} waiting` : ''}` });
  }
  return rows;
}

export function workerReportMessage(store: Pick<StoreData, 'storeName'>, report: WorkerReport, detail: ReportDetail): string {
  const lines: string[] = [
    `*${detail === 'full' ? 'Work report' : 'Work summary'}: ${report.person.name}*`,
    [String(store.storeName || '').trim(), report.window.label].filter(Boolean).join(' · '),
  ];
  if (report.empty) {
    lines.push('', 'Nothing recorded under my name in this time.');
    return lines.join('\n');
  }

  for (const total of reportTotals(report)) {
    lines.push('', `*${total.heading}:* ${total.line}`);
    if (total.extra) lines.push(total.extra);
    if (detail !== 'full') continue;
    if (total.key === 'in') {
      for (const b of report.takenIn) lines.push(`• ${when(b.at)} · ${b.tagCode || 'No code'} · ${b.customerName} · ${plural(b.pieces, 'piece')} · ${naira(b.total)}`);
    } else if (total.key === 'money') {
      for (const p of report.payments) {
        const how = p.cash && p.transfer ? `cash ${naira(p.cash)} + transfer ${naira(p.transfer)}` : p.cash ? 'cash' : p.transfer ? 'transfer' : 'not recorded';
        lines.push(`• ${when(p.at)} · ${[p.tagCode, p.customerName].filter(Boolean).join(' · ')} · ${naira(p.amount)} · ${how}`);
      }
    } else if (total.key === 'work') {
      for (const m of report.moves) lines.push(`• ${when(m.at)} · ${STAGE_LABELS[m.stage]} · ${[m.tagCode, m.customerName].filter(Boolean).join(' · ')}`);
    } else if (total.key === 'spent') {
      for (const e of report.expenses) lines.push(`• ${shortDay(e.at)} · ${e.what} · ${naira(e.amount)} · ${e.status === 'waiting' ? 'waiting for approval' : e.status}`);
    }
  }
  lines.push('', '_From StoreFlow_');
  return lines.join('\n');
}

/** Days in the stretch, for "over 3 days". */
export function windowDays(window: ReportWindow): number {
  return Math.max(1, Math.round((startOfDay(window.to - 1) - startOfDay(window.from)) / DAY) + 1);
}
