import type { Customer, PieceWorkEntry, StaffExpenseRequest, StoreData } from '@/types/store';
import { rpcAheadOfTypes } from '@/integrations/supabase/client';
import { settleArrivedStaffExpenses } from '@/lib/staff-expenses';
import { storeRefOf } from '@/lib/device-request-watch';
import { recordLaundryPayment } from '@/lib/laundry-money';

/**
 * What workers sent from their own phones, brought onto the owner's.
 *
 * Their new customers, their expenses and their piece-work claims go into
 * the shop in the cloud through staff_send_records, which decides what is
 * kept (supabase/migrations/20261012131342_staff_records_and_record_merge).
 * The owner's phone collects them here - only what arrived since it last
 * asked, so normally nothing - and adds each one it does not already have.
 * Expenses are then settled by the shop's own rule: straight into the book,
 * or waiting for Approve with a notification.
 */

const sinceKey = (code: string) => `storeflow_staff_records_since_${code}`;

/** Money a worker took on a bundle, as store_staff_records_since sends it. */
export interface ArrivedPayment {
  id: string;
  kind: 'intake' | 'payment';
  clientRef: string;
  amount: number;
  at: string;
  staffName?: string;
  total?: number;
  tagCode?: string;
  customerName?: string;
  customerPhone?: string;
  serviceId?: string;
  serviceName?: string;
  promisedFor?: string;
}

export interface Arrived {
  customers?: Customer[];
  staffExpenseRequests?: StaffExpenseRequest[];
  pieceWork?: PieceWorkEntry[];
  payments?: ArrivedPayment[];
}

/** How many booked ids are remembered: each payment arrives once, near the last ask. */
const APPLIED_KEPT = 300;

/**
 * Book the money workers took on their own phones, once each.
 *
 * The same booking the counter phone makes (recordLaundryPayment): the money
 * is a sale the day it changed hands, and what is left is owed on the bundle
 * in Money Owed. Named, so the owner can see who took it. A bundle taken in
 * with nothing paid still lands, as what that customer owes.
 */
export function addArrivedPayments(store: StoreData, payments: ArrivedPayment[] | undefined): { store: StoreData; added: number } {
  const applied = new Set(store.appliedStaffPayments || []);
  const fresh = (payments || [])
    .filter(payment => payment?.id && payment.clientRef && !applied.has(payment.id))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (!fresh.length) return { store, added: 0 };

  let next = store;
  const booked: string[] = [];
  for (const payment of fresh) {
    booked.push(payment.id);
    const amount = Math.max(0, Number(payment.amount) || 0);
    const owedHere = (next.pendingPayments || []).some(entry => entry.id === `laundry-${payment.clientRef}`);
    // Taken in with nothing paid, on a bundle this phone already owes on: nothing new.
    if (payment.kind === 'intake' && amount <= 0 && owedHere) continue;
    next = recordLaundryPayment(next, {
      clientRef: payment.clientRef,
      tagCode: String(payment.tagCode || payment.clientRef.slice(0, 8)).toUpperCase(),
      customerName: payment.customerName || 'Walk-in Customer',
      customerPhone: payment.customerPhone,
      serviceId: payment.serviceId || 'laundry',
      serviceName: payment.serviceName || 'Laundry',
      total: Number(payment.total) || 0,
      amountPaid: amount,
      promisedFor: payment.promisedFor,
      at: payment.at,
      takenBy: payment.staffName,
    });
  }
  next = { ...next, appliedStaffPayments: [...(store.appliedStaffPayments || []), ...booked].slice(-APPLIED_KEPT) };
  return { store: next, added: booked.length };
}

/** Add what is not here yet. Nothing already on this phone is touched. */
export function addArrivedRecords(store: StoreData, arrived: Arrived, now: Date = new Date()): { store: StoreData; added: number } {
  const missing = <T extends { id: string }>(have: T[] | undefined, incoming: T[] | undefined) => {
    const ids = new Set((have || []).map(item => item.id));
    return (incoming || []).filter(item => item?.id && !ids.has(item.id));
  };
  const customers = missing(store.customers, arrived.customers);
  const requests = missing(store.staffExpenseRequests, arrived.staffExpenseRequests);
  const piece = missing(store.pieceWork, arrived.pieceWork);
  const added = customers.length + requests.length + piece.length;
  if (!added) return { store, added: 0 };

  let next: StoreData = {
    ...store,
    customers: [...customers, ...(store.customers || [])],
    staffExpenseRequests: [...requests, ...(store.staffExpenseRequests || [])],
    pieceWork: [...piece, ...(store.pieceWork || [])],
  };
  next = settleArrivedStaffExpenses(next, requests.map(request => request.id), now);
  return { store: next, added };
}

/** Ask the cloud what workers added since last time. Null when there is nothing to add. */
export async function collectStaffRecords(store: StoreData): Promise<StoreData | null> {
  const code = store.accessCode;
  let since: string | null = null;
  try { since = localStorage.getItem(sinceKey(code)); } catch { /* private mode */ }
  let reply: Record<string, any> | null = null;
  try {
    const { data, error } = await rpcAheadOfTypes('store_staff_records_since', { p_store_ref: storeRefOf(store), p_since: since });
    if (!error) reply = data as Record<string, any>;
  } catch { /* offline */ }
  if (!reply?.ok) return null;
  const result = addArrivedRecords(store, reply as Arrived);
  const paid = addArrivedPayments(result.store, (reply as Arrived).payments);
  try { localStorage.setItem(sinceKey(code), String(reply.as_of)); } catch { /* private mode */ }
  return result.added || paid.added ? paid.store : null;
}
