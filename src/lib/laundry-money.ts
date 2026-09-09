import type { PendingPayment, Sale, StoreData } from '@/types/store';

/**
 * Money on a laundry bundle.
 *
 * Nothing here existed. Intake worked out a total and showed it, and that was
 * the end of it: no payment was ever captured, at drop-off or at collection,
 * and no sale was ever written. So a shop could take in forty bundles, hand
 * them all back, and the app would report revenue of nothing — and hold no
 * record of who still owed.
 *
 * Two rules shape all of this:
 *
 *   Money is booked when it changes hands, not when the work is promised or
 *   handed over. A deposit is revenue the day it is taken; the balance is
 *   revenue the day it is paid. That is true whether a shop takes everything
 *   up front, everything on collection, or something in between, so no shop
 *   has to be asked which it does.
 *
 *   What is still owed is owed to the shop, not to the laundry screen. An
 *   unpaid balance becomes an ordinary pending payment, so it shows up in
 *   Money Owed and in the outstanding totals beside every other debt.
 */

/** A shop can require part of the price at drop-off, so clothes are collected. */
export interface LaundryDepositRule {
  /** 0 means take whatever the customer offers, including nothing. */
  percent: number;
}

export function getLaundryDepositRule(store: StoreData): LaundryDepositRule {
  const raw = (store as any).laundryPricing?.depositPercent;
  const percent = Number(raw);
  if (!Number.isFinite(percent) || percent <= 0) return { percent: 0 };
  return { percent: Math.min(100, Math.round(percent)) };
}

export function setLaundryDepositRule(store: StoreData, percent: number): StoreData {
  const safe = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
  return {
    ...store,
    laundryPricing: { ...((store as any).laundryPricing || {}), depositPercent: safe },
  } as StoreData;
}

/** The least a customer may pay at drop-off, rounded to whole naira. */
export function requiredDeposit(store: StoreData, total: number): number {
  const { percent } = getLaundryDepositRule(store);
  if (percent <= 0 || !Number.isFinite(total) || total <= 0) return 0;
  // Never ask for more than the job costs.
  return Math.min(Math.round(total), Math.ceil((total * percent) / 100));
}

export interface LaundryPaymentInput {
  /** Identifies the bundle, so a later payment can find the same debt. */
  clientRef: string;
  tagCode: string;
  customerName: string;
  customerPhone?: string;
  serviceId: string;
  serviceName: string;
  /** Whose debt this is, by internal customer id. See PendingPayment. */
  customerId?: string;
  /** The whole price of the bundle, whatever has been paid so far. */
  total: number;
  /** What is being handed over right now. May be zero. */
  amountPaid: number;
  /** When the bundle is promised, so an unpaid balance has a due date. */
  promisedFor?: string;
  at?: string;
}

const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Records a payment against a bundle, and keeps the debt in step.
 *
 * Safe to call more than once for the same bundle: a second payment adds to
 * the first rather than replacing it, and the pending payment is settled and
 * closed once the whole price has been covered.
 */
export function recordLaundryPayment(store: StoreData, input: LaundryPaymentInput): StoreData {
  const total = money(input.total);
  const paying = money(input.amountPaid);
  const at = input.at || new Date().toISOString();
  if (total <= 0) return store;

  const pendingList = store.pendingPayments || [];
  const existing = pendingList.find(entry => entry.id === `laundry-${input.clientRef}`);
  const paidBefore = existing ? money(existing.paid) : 0;
  const paidNow = Math.min(total, money(paidBefore + paying));
  const actuallyTaken = money(paidNow - paidBefore);

  let next = store;

  // ── Revenue, for the money actually taken now ───────────────────────────
  if (actuallyTaken > 0) {
    const sale: Sale = {
      id: `laundry-${input.clientRef}-${at}`,
      productId: input.serviceId,
      productName: `${input.serviceName} · ${input.tagCode}`,
      quantity: 1,
      unitPrice: actuallyTaken,
      total: actuallyTaken,
      // A laundry service has no stock behind it, so what comes in is what is
      // earned. Booking a cost here would invent one.
      profit: actuallyTaken,
      date: at,
      pendingPaymentId: `laundry-${input.clientRef}`,
      channel: 'in_store',
    };
    next = { ...next, sales: [...(next.sales || []), sale] };
  }

  // ── What is still owed ──────────────────────────────────────────────────
  const balance = money(total - paidNow);
  const event = actuallyTaken > 0
    ? [{ date: at, amount: actuallyTaken, note: `${input.tagCode} payment` }]
    : [];

  const entry: PendingPayment = {
    id: `laundry-${input.clientRef}`,
    // Kept if it was ever known: a later part-payment must not quietly
    // detach the debt from the customer it belongs to.
    customerId: input.customerId || existing?.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    items: [{
      productId: input.serviceId,
      productName: `${input.serviceName} · ${input.tagCode}`,
      quantity: 1,
      unitPrice: total,
    }],
    total,
    paid: paidNow,
    balance,
    dueDate: input.promisedFor,
    createdAt: existing?.createdAt || at,
    status: balance <= 0 ? 'paid' : 'pending',
    events: [...(existing?.events || []), ...event],
  } as PendingPayment;

  const others = pendingList.filter(item => item.id !== entry.id);
  // A settled bundle keeps its record — it is history, and the events on it
  // are how the shop can show what was paid and when.
  next = { ...next, pendingPayments: [...others, entry] };

  return next;
}

/** What is still owed on a bundle, or 0 when it is settled or unknown. */
export function laundryBalance(store: StoreData, clientRef: string): number {
  const entry = (store.pendingPayments || []).find(item => item.id === `laundry-${clientRef}`);
  return entry ? money(entry.balance) : 0;
}
