/**
 * Paying for pieces actually done, on jobs that actually exist.
 *
 * A laundry's ironing is very often done by somebody who comes in when there
 * is work, irons forty shirts and goes home. They are not on a wage, and
 * treating them as one makes the shop's figures wrong in both directions: it
 * charges for a salary that is not paid, and it hides what the pieces really
 * cost.
 *
 * The rule that shapes everything here is that a worker cannot invent work.
 * They do not type "40 shirts"; they pick the task, then a real customer's
 * job, then the items on that job that still need doing - and only up to how
 * many are actually there. Forty shirts nobody brought in cannot be claimed,
 * and the same shirt cannot be claimed twice.
 *
 * Two separate ideas are kept apart on purpose:
 *
 *   Claimed   - the worker says they did it. Costs nothing yet.
 *   Approved  - the owner agrees. Now it is owed, and now it counts as a cost.
 *
 * And approval, not payment, is what makes it a cost. The work was done and
 * the money is owed the moment the owner agrees; whether it has left the
 * drawer yet is a separate question, answered by the payments below.
 */

import type { PieceRate, PieceWorkEntry, StaffMember, StoreData, WorkerPayment } from '@/types/store';
import { getLocalLaundryRecords, type LocalLaundryRecord } from '@/lib/laundry-offline';
/*
 * These return a new store rather than saving one. Persisting is the caller's
 * job - the same way recordLaundryPayment works - which keeps the rules here
 * testable without a whole shop around them.
 */
import { addExpense } from '@/lib/store-data';

/** The stages a shop pays somebody by the piece to do. */
export const WORK_TASKS: { id: string; label: string }[] = [
  { id: 'washing', label: 'Washing' },
  { id: 'drying', label: 'Drying' },
  { id: 'ironing', label: 'Ironing' },
  { id: 'folding', label: 'Folding' },
];

/** The rate that applies to anything not named specifically. */
export const ANY_GARMENT = '*';

/** Money the shop pays its per-piece workers. Variable: it scales with pieces. */
export const PIECE_WORK_CATEGORY = 'Piece work' as const;

const DAY = 86400000;

const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export function isPerPieceWorker(staff: Pick<StaffMember, 'payType'>): boolean {
  return staff.payType === 'per_piece';
}

/**
 * What this worker earns for one of these, on this task.
 *
 * The specific rate wins over the catch-all, so a shop can say "ironing,
 * anything, fifty" and then set native wear to a hundred without listing
 * every other garment it owns.
 */
export function pieceRate(staff: Pick<StaffMember, 'pieceRates'>, task: string, garmentType: string): number {
  const rates = staff.pieceRates || [];
  const exact = rates.find(rate => rate.task === task && rate.garmentType.toLowerCase() === garmentType.toLowerCase());
  if (exact) return Math.max(0, Number(exact.rate) || 0);
  const any = rates.find(rate => rate.task === task && rate.garmentType === ANY_GARMENT);
  return any ? Math.max(0, Number(any.rate) || 0) : 0;
}

export function setPieceRate(rates: PieceRate[] | undefined, next: PieceRate): PieceRate[] {
  const kept = (rates || []).filter(
    rate => !(rate.task === next.task && rate.garmentType.toLowerCase() === next.garmentType.toLowerCase()),
  );
  // A rate of zero is a removal, not a rate: it would silently record free work.
  if (!(Number(next.rate) > 0)) return kept;
  return [...kept, { ...next, rate: money(next.rate) }];
}

/* ── What is left to do ─────────────────────────────────────────────────── */

export interface RemainingItem {
  garmentType: string;
  /** How many are on the job. */
  total: number;
  /** How many still need this task doing. */
  remaining: number;
}

/** Every claim already made against one job and task. */
function claimedOn(store: Pick<StoreData, 'pieceWork'>, clientRef: string, task: string): Map<string, number> {
  const claimed = new Map<string, number>();
  for (const entry of store.pieceWork || []) {
    if (entry.clientRef !== clientRef || entry.task !== task) continue;
    const key = entry.garmentType.toLowerCase();
    claimed.set(key, (claimed.get(key) || 0) + (Number(entry.quantity) || 0));
  }
  return claimed;
}

/**
 * The items on this job that still need this task.
 *
 * Counts rather than individual rows, because that is how a bundle is
 * recorded: "6 shirts" is one line with a quantity, not six things. Claiming
 * three of the six leaves three, which is the same guarantee - nobody can
 * claim more shirts than the customer brought.
 */
export function remainingForTask(
  store: Pick<StoreData, 'pieceWork'>,
  record: Pick<LocalLaundryRecord, 'clientRef' | 'garments'>,
  task: string,
): RemainingItem[] {
  const claimed = claimedOn(store, record.clientRef, task);
  return (record.garments || [])
    .map(garment => {
      const total = Math.max(0, Number(garment.quantity) || 0);
      const done = claimed.get(garment.garmentType.toLowerCase()) || 0;
      return { garmentType: garment.garmentType, total, remaining: Math.max(0, total - done) };
    })
    .filter(item => item.remaining > 0);
}

/**
 * The jobs a worker can pick from for this task.
 *
 * Only jobs still in the shop - once a bundle has been collected there is
 * nothing left to iron, and offering it invites a claim on work that either
 * did not happen or was already claimed.
 */
export function openJobsForTask(store: StoreData, task: string): { record: LocalLaundryRecord; items: RemainingItem[] }[] {
  const accessCode = String(store.accessCode || '');
  if (!accessCode) return [];

  return getLocalLaundryRecords(accessCode)
    .filter(record => record.workflowStage !== 'collected')
    .map(record => ({ record, items: remainingForTask(store, record, task) }))
    .filter(job => job.items.length > 0);
}

/* ── Claiming, approving, correcting ────────────────────────────────────── */

export interface WorkClaim {
  worker: StaffMember;
  record: Pick<LocalLaundryRecord, 'clientRef' | 'tagCode' | 'customerName' | 'garments'>;
  task: string;
  /** garmentType -> how many of them. */
  items: { garmentType: string; quantity: number }[];
}

/**
 * Record what a worker says they did.
 *
 * Every line is clamped to what is actually left, so a claim can never exceed
 * the job - not by mistake, and not otherwise. A line that clamps to zero is
 * dropped rather than saved as an empty claim.
 */
export function recordPieceWork(store: StoreData, claim: WorkClaim, at: Date = new Date()): StoreData {
  const remaining = new Map(
    remainingForTask(store, claim.record, claim.task).map(item => [item.garmentType.toLowerCase(), item.remaining]),
  );

  const entries: PieceWorkEntry[] = [];
  for (const item of claim.items) {
    const left = remaining.get(item.garmentType.toLowerCase()) || 0;
    const quantity = Math.min(Math.max(0, Math.floor(Number(item.quantity) || 0)), left);
    if (quantity <= 0) continue;

    const rate = pieceRate(claim.worker, claim.task, item.garmentType);
    entries.push({
      id: `pw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      workerId: claim.worker.id,
      workerName: claim.worker.name,
      clientRef: claim.record.clientRef,
      tagCode: claim.record.tagCode,
      customerName: claim.record.customerName,
      task: claim.task,
      garmentType: item.garmentType,
      quantity,
      rate,
      amount: money(rate * quantity),
      at: at.toISOString(),
      approved: false,
    });
  }

  if (!entries.length) return store;

  return { ...store, pieceWork: [...entries, ...(store.pieceWork || [])] };
}

export function approvePieceWork(store: StoreData, ids: string[], at: Date = new Date()): StoreData {
  const wanted = new Set(ids);
  return {
    ...store,
    pieceWork: (store.pieceWork || []).map(entry =>
      wanted.has(entry.id) && !entry.approved
        ? { ...entry, approved: true, approvedAt: at.toISOString() }
        : entry,
    ),
  };
}

/**
 * Take a claim back.
 *
 * Removed rather than marked, so the pieces return to the job and can be
 * claimed properly - a wrong claim that stayed on the record would leave those
 * shirts permanently un-ironable by anybody.
 */
export function removePieceWork(store: StoreData, id: string): StoreData {
  return { ...store, pieceWork: (store.pieceWork || []).filter(entry => entry.id !== id) };
}

/* ── What a worker is owed ──────────────────────────────────────────────── */

export interface WorkerEarnings {
  piecesToday: number;
  earnedToday: number;
  earnedThisWeek: number;
  /** By task, today, so somebody can see what they spent the day doing. */
  todayByTask: { task: string; pieces: number; amount: number }[];
  /** Everything approved, ever. */
  approvedTotal: number;
  /** Claimed and waiting for the owner. Not owed yet. */
  awaitingApproval: number;
  paid: number;
  /** Approved less paid. What the shop owes right now. */
  balance: number;
}

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function workerEarnings(store: StoreData, workerId: string, now: number = Date.now()): WorkerEarnings {
  const dayStart = startOfDay(now);
  const weekStart = dayStart - 6 * DAY;

  let piecesToday = 0;
  let earnedToday = 0;
  let earnedThisWeek = 0;
  let approvedTotal = 0;
  let awaitingApproval = 0;
  const byTask = new Map<string, { pieces: number; amount: number }>();

  for (const entry of store.pieceWork || []) {
    if (entry.workerId !== workerId) continue;
    const at = new Date(entry.at).getTime();
    const amount = Number(entry.amount) || 0;

    if (!entry.approved) {
      awaitingApproval += amount;
      continue;
    }

    approvedTotal += amount;
    if (Number.isFinite(at) && at >= weekStart) earnedThisWeek += amount;
    if (Number.isFinite(at) && at >= dayStart) {
      piecesToday += Number(entry.quantity) || 0;
      earnedToday += amount;
      const current = byTask.get(entry.task) || { pieces: 0, amount: 0 };
      byTask.set(entry.task, {
        pieces: current.pieces + (Number(entry.quantity) || 0),
        amount: current.amount + amount,
      });
    }
  }

  const paid = (store.workerPayments || [])
    .filter(payment => payment.workerId === workerId)
    .reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);

  return {
    piecesToday,
    earnedToday: money(earnedToday),
    earnedThisWeek: money(earnedThisWeek),
    todayByTask: Array.from(byTask.entries())
      .map(([task, totals]) => ({ task, ...totals, amount: money(totals.amount) }))
      .sort((a, b) => b.amount - a.amount),
    approvedTotal: money(approvedTotal),
    awaitingApproval: money(awaitingApproval),
    paid: money(paid),
    // Never negative: an overpayment is something to settle at the counter,
    // not a number that makes the shop look owed money by its own worker.
    balance: Math.max(0, money(approvedTotal - paid)),
  };
}

/**
 * Hand money over.
 *
 * Recorded twice on purpose, and they are different facts: the payment goes in
 * the worker's payroll history, and an expense comes out of the shop's cash so
 * the books show the money leaving. The expense is a variable category, so it
 * never lands in the month's fixed costs beside the rent - per-piece labour
 * rises and falls with the washing, which is the whole point of it.
 */
export function payWorker(
  store: StoreData,
  worker: Pick<StaffMember, 'id' | 'name'>,
  amount: number,
  note?: string,
  at: Date = new Date(),
): StoreData {
  const value = money(Math.max(0, Number(amount) || 0));
  if (value <= 0) return store;

  const payment: WorkerPayment = {
    id: `wp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    workerId: worker.id,
    workerName: worker.name,
    amount: value,
    at: at.toISOString(),
    note: note?.trim() || undefined,
  };

  let next: StoreData = { ...store, workerPayments: [payment, ...(store.workerPayments || [])] };
  next = addExpense(next, {
    amount: value,
    category: PIECE_WORK_CATEGORY,
    date: at.toISOString(),
    note: `${worker.name} — piece work${note?.trim() ? ` (${note.trim()})` : ''}`,
  });
  return next;
}

/* ── What it costs the shop ─────────────────────────────────────────────── */

/**
 * Approved labour in a window, which is the real cost of doing the work.
 *
 * Approval is the moment the money is owed, so this is what the costing reads
 * - not the payments. Reading payments instead would tell a shop that pieces
 * cost nothing all month and everything on payday, and would price the work
 * wrong on both days.
 *
 * The payments are still recorded as expenses so the cash is right; the
 * estimator leaves that category alone precisely so this is not counted twice.
 */
export function approvedLabourBetween(store: Pick<StoreData, 'pieceWork'>, from: number, to: number): number {
  return money((store.pieceWork || []).reduce((sum, entry) => {
    if (!entry.approved) return sum;
    const at = new Date(entry.at).getTime();
    if (!Number.isFinite(at) || at < from || at >= to) return sum;
    return sum + (Number(entry.amount) || 0);
  }, 0));
}

/** Claims the owner has not looked at yet, oldest first. */
export function pendingClaims(store: Pick<StoreData, 'pieceWork'>): PieceWorkEntry[] {
  return (store.pieceWork || [])
    .filter(entry => !entry.approved)
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function taskLabel(task: string): string {
  return WORK_TASKS.find(item => item.id === task)?.label || task;
}
