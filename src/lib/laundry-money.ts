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
  /**
   * What the customer handed over right now. May be more than the amount due;
   * the difference is change and must never become revenue.
   */
  amountPaid: number;
  /** When the bundle is promised, so an unpaid balance has a due date. */
  promisedFor?: string;
  at?: string;
}

const money = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * One payment at the counter, separated into what was tendered, what belongs
 * to the job, and what must be handed back as change.
 */
export interface LaundryPaymentSettlement {
  tendered: number;
  applied: number;
  change: number;
  paidAfter: number;
  balance: number;
}

export function settleLaundryPayment(total: number, tendered: number, paidBefore = 0): LaundryPaymentSettlement {
  const safeTotal = money(Math.max(0, Number(total) || 0));
  const safePaidBefore = Math.min(safeTotal, money(Math.max(0, Number(paidBefore) || 0)));
  const safeTendered = money(Math.max(0, Number(tendered) || 0));
  const remaining = money(Math.max(0, safeTotal - safePaidBefore));
  const applied = money(Math.min(remaining, safeTendered));
  const paidAfter = money(Math.min(safeTotal, safePaidBefore + applied));
  const change = money(Math.max(0, safeTendered - applied));
  const balance = money(Math.max(0, safeTotal - paidAfter));

  return { tendered: safeTendered, applied, change, paidAfter, balance };
}

/**
 * What the customer physically handed over on the latest overpayment, so every
 * screen can show the same tender/change pair after the intake sheet closes.
 *
 * Existing records already keep this in the payment event note, so this also
 * works for bundles saved before this helper existed.
 */
export interface LaundryTenderSummary {
  tendered: number;
  applied: number;
  change: number;
  at: string;
}

export function laundryTenderSummary(store: StoreData, clientRefOrTag: string): LaundryTenderSummary | null {
  const key = String(clientRefOrTag || '').trim();
  if (!key) return null;
  const upper = key.toUpperCase();

  const entry = (store.pendingPayments || []).find(payment =>
    payment.id === `laundry-${key}`
    || (payment.items || []).some(item => String(item.productName || '').toUpperCase().includes(upper))
    || (payment.events || []).some(event => String(event.note || '').toUpperCase().includes(upper)),
  );
  if (!entry) return null;

  const events = [...(entry.events || [])].reverse();
  for (const event of events) {
    const note = String(event.note || '');
    const match = note.match(/₦([\d,]+(?:\.\d+)?)\s+tendered,\s*₦([\d,]+(?:\.\d+)?)\s+change/i);
    if (!match) continue;
    const tendered = money(Number(match[1].replace(/,/g, '')));
    const change = money(Number(match[2].replace(/,/g, '')));
    if (!(tendered > 0) || !(change > 0)) continue;
    return {
      tendered,
      applied: money(Number(event.amount) || Math.max(0, tendered - change)),
      change,
      at: event.date,
    };
  }

  return null;
}

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
  const settlement = settleLaundryPayment(total, paying, paidBefore);
  const paidNow = settlement.paidAfter;
  const actuallyTaken = settlement.applied;

  let next = store;

  if (actuallyTaken > 0) {
    const sale: Sale = {
      id: `laundry-${input.clientRef}-${at}`,
      productId: input.serviceId,
      productName: `${input.serviceName} · ${input.tagCode}`,
      quantity: 1,
      unitPrice: actuallyTaken,
      total: actuallyTaken,
      profit: actuallyTaken,
      date: at,
      pendingPaymentId: `laundry-${input.clientRef}`,
      channel: 'in_store',
    };
    next = { ...next, sales: [...(next.sales || []), sale] };
  }

  const balance = settlement.balance;
  const event = actuallyTaken > 0
    ? [{
        date: at,
        amount: actuallyTaken,
        note: settlement.change > 0
          ? `${input.tagCode} payment — ₦${settlement.tendered.toLocaleString()} tendered, ₦${settlement.change.toLocaleString()} change`
          : `${input.tagCode} payment`,
      }]
    : [];

  const entry: PendingPayment = {
    id: `laundry-${input.clientRef}`,
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
  next = { ...next, pendingPayments: [...others, entry] };

  return next;
}

/** What is still owed on a bundle, or 0 when it is settled or unknown. */
export function laundryBalance(store: StoreData, clientRef: string): number {
  const entry = (store.pendingPayments || []).find(item => item.id === `laundry-${clientRef}`);
  return entry ? money(entry.balance) : 0;
}
