import type { Customer, PieceWorkEntry, StaffExpenseRequest, StoreData } from '@/types/store';
import { rpcAheadOfTypes } from '@/integrations/supabase/client';
import { settleArrivedStaffExpenses } from '@/lib/staff-expenses';
import { storeRefOf } from '@/lib/device-request-watch';

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

export interface Arrived {
  customers?: Customer[];
  staffExpenseRequests?: StaffExpenseRequest[];
  pieceWork?: PieceWorkEntry[];
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
  try { localStorage.setItem(sinceKey(code), String(reply.as_of)); } catch { /* private mode */ }
  return result.added ? result.store : null;
}
