/**
 * A worker signed in on their own approved phone.
 *
 * The phone holds a slim copy of the shop, made by the cloud from an
 * allow-list (supabase/migrations/20261011232226_staff_sign_in.sql): the
 * price list without costs, customers without spending or debt, this
 * worker's own record without PIN or salary. Sales, expenses, balances,
 * other workers and everything of the owner's never reach it.
 *
 * The copy is kept under its own name - STAFF-<Store ID> - so it can never be
 * mistaken for, or overwrite, a real shop on the same phone. It is marked
 * `staffDevice`, which keeps it out of the shop list and the store switcher,
 * hides Switch Role, and stops it ever being sent to the cloud as a whole
 * shop: what a worker does travels as single records, through doors that
 * check who they are.
 *
 * Signing in needs the worker's PIN every time. Online, the cloud checks it
 * and gives a pass for 24 hours. Offline, the phone checks it against a
 * scrambled copy it kept at the last online sign-in - for 24 hours after
 * that, and no longer, so a revoked phone is shut out at its next check.
 */

import type { StoreData } from '@/types/store';
import { DEFAULT_MANAGER_SETTINGS } from '@/types/store';
import { rpcAheadOfTypes } from '@/integrations/supabase/client';
import { deviceKey, readJoin, writeJoin, type JoinRecord } from '@/lib/staff-join';
import { laundryPaymentsTakenHere, type PaymentTakenHere } from '@/lib/laundry-money';

const SESSION_KEY = 'storeflow_staff_session';
export const OFFLINE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface Worker {
  id: string;
  name: string;
  role: string;
  permissions?: Record<string, boolean>;
}

export interface WorkerSession {
  token: string;
  expiresAt: string;
  /** The last time the cloud said yes to this worker on this phone. */
  lastOnlineAt: string;
  /** SHA-256 of this phone's key and the PIN - never the PIN itself. */
  pinHash: string;
  worker: Worker;
  storeRef: string;
}

export type SignInResult =
  | { ok: true; store: StoreData; worker: Worker; offline: boolean }
  | { ok: false; error: string };

/** The worker copy's own name on this phone. */
export const workerAccessCode = (storeRef: string) => `STAFF-${storeRef}`;

/** A worker copy's name on this phone, from the code alone. */
export const isWorkerCode = (code: string | null | undefined) => /^STAFF-/i.test(String(code || ''));

export function isWorkerCopy(store: Pick<StoreData, 'staffDevice'> | null | undefined): boolean {
  return !!store?.staffDevice;
}

export function readWorkerSession(): WorkerSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as WorkerSession : null;
  } catch {
    return null;
  }
}

function writeWorkerSession(session: WorkerSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* private mode */ }
}

async function pinHash(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${deviceKey()}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Lists kept by id: what the cloud has wins, what only this phone has stays. */
const UNION_BY_ID = ['customers', 'pieceWork', 'staffExpenseRequests'] as const;

function unionById<T extends { id?: string }>(local: T[] | undefined, cloud: T[] | undefined): T[] {
  const fromCloud = cloud || [];
  const ids = new Set(fromCloud.map(item => item.id));
  return [...fromCloud, ...(local || []).filter(item => !ids.has(item.id))];
}

/**
 * The worker copy, from the cloud's slim view.
 *
 * Laid over what the phone already has, so work recorded here and not yet
 * sent - a customer added, an expense waiting - is not lost when the copy is
 * refreshed. Anything the view does not carry is never put back in from
 * elsewhere: the copy starts empty of money and stays that way.
 */
export function workerStoreFromView(
  view: Record<string, any>,
  record: Pick<JoinRecord, 'requestId' | 'staffId'>,
  storeRef: string,
  existing?: StoreData | null,
): StoreData {
  const accessCode = workerAccessCode(storeRef);
  const base: StoreData = existing && existing.accessCode === accessCode ? existing : {
    storeName: view.storeName || 'Shop',
    accessCode,
    products: [],
    sales: [],
    restocks: [],
    expenses: [],
    investments: [],
    createdAt: view.createdAt || new Date().toISOString(),
    simpleOnboarding: { complete: true },
  } as StoreData;

  const next: StoreData = {
    ...base,
    ...view,
    accessCode,
    // The shop's real, public Store ID - left empty, loading a shop invents
    // one. It never makes the copy a cloud shop: staffDevice stops saveStore
    // and the sync queue from ever sending it up as the shop.
    storeId: storeRef,
    staffDevice: { requestId: record.requestId, storeRef, staffId: record.staffId },
    profile: { location: '', phone: '', email: '', ...(view.profile || {}) },
    managerSettings: {
      ...DEFAULT_MANAGER_SETTINGS,
      ...(view.managerSettings || {}),
      multiDeviceSync: false,
      autoBackupsEnabled: false,
    },
  } as StoreData;
  for (const key of UNION_BY_ID) {
    (next as any)[key] = unionById((base as any)[key], view[key]);
  }
  // The cloud leaves spending and debt out of a worker's copy; the screens
  // still expect the numbers to be there, so they read as nothing.
  next.customers = (next.customers || []).map(customer => ({
    totalPurchases: 0, outstandingDebt: 0, purchaseHistory: [], loyaltyPoints: 0, visitsCount: 0, ...customer,
  }));
  return next;
}

/* ── what a worker's phone sends ────────────────────────────────────────── */

const sentKey = (code: string) => `storeflow_staff_sent_${code}`;

function readSent(code: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(sentKey(code)) || '[]')); } catch { return new Set(); }
}

function writeSent(code: string, ids: Set<string>): void {
  try { localStorage.setItem(sentKey(code), JSON.stringify([...ids])); } catch { /* private mode */ }
}

/** Everything the cloud's copy already holds counts as sent. */
export function markViewAsSent(code: string, view: Record<string, any>): void {
  const sent = readSent(code);
  for (const key of UNION_BY_ID) for (const item of (view[key] || []) as { id?: string }[]) if (item?.id) sent.add(item.id);
  writeSent(code, sent);
}

export interface Unsent {
  customers: Record<string, unknown>[];
  expenseRequests: Record<string, unknown>[];
  pieceWork: Record<string, unknown>[];
}

/**
 * What this phone recorded that the cloud has not got: new customers, this
 * worker's expenses, this worker's piece work. Only those - the cloud's door
 * takes nothing else, and decides for itself what to keep of these.
 */
export function unsentRecords(store: StoreData): Unsent {
  const sent = readSent(store.accessCode);
  const me = store.staffDevice?.staffId;
  const fresh = <T extends { id?: string }>(items: T[] | undefined) => (items || []).filter(item => item.id && !sent.has(item.id));
  return {
    customers: fresh(store.customers).map(c => ({ id: c.id, name: c.name, phone: c.phone, address: c.address })),
    expenseRequests: fresh(store.staffExpenseRequests).filter(r => r.recordedBy?.staffId === me).map(r => ({
      id: r.id, amount: r.amount, category: r.category, note: r.note, date: r.date, paidFrom: r.paidFrom,
    })),
    pieceWork: fresh(store.pieceWork).filter(w => w.workerId === me).map(w => ({
      id: w.id, clientRef: w.clientRef, tagCode: w.tagCode, customerName: w.customerName,
      task: w.task, garmentType: w.garmentType, quantity: w.quantity,
    })),
  };
}

/** Money a worker took on a bundle, as the cloud's door takes it. */
export type WorkerLaundryPayment = PaymentTakenHere;

/**
 * The money this phone took that the owner has not got.
 *
 * A worker taking a bundle in, or handing one back and being paid, records
 * it on this phone exactly as the counter phone does: an amount owed on the
 * bundle, and each payment against it. That stayed on this phone - a worker's
 * copy is never sent up as the shop - so the owner's sales and Money Owed
 * never heard of it. Each bundle's taking-in and each later payment now go
 * up once, through staff_send_payments, which checks the bundle exists and
 * that its total is never exceeded. Read from what is already saved: nothing
 * new is stored.
 */
export function unsentLaundryPayments(store: StoreData): WorkerLaundryPayment[] {
  const sent = readSent(store.accessCode);
  return laundryPaymentsTakenHere(store).filter(payment => !sent.has(payment.id)).slice(0, 50);
}

export type SendResult = { state: 'sent' | 'nothing' | 'unchanged' | 'shut_out' };

/** Send what this phone has that the cloud has not, through the worker's door. */
export async function sendWorkerRecords(store: StoreData): Promise<SendResult> {
  if (!store.staffDevice) return { state: 'nothing' };
  const unsent = unsentRecords(store);
  const payments = unsentLaundryPayments(store);
  const records = unsent.customers.length + unsent.expenseRequests.length + unsent.pieceWork.length;
  if (!records && !payments.length) return { state: 'nothing' };
  const session = readWorkerSession();
  if (!session || !navigator.onLine) return { state: 'unchanged' };
  const sent = readSent(store.accessCode);
  let any = false;

  if (records) {
    const reply = await callCloud('staff_send_records', {
      p_token: session.token, p_device_key: deviceKey(),
      p_customers: unsent.customers, p_expense_requests: unsent.expenseRequests, p_piece_work: unsent.pieceWork,
    });
    if (reply && !reply.ok && SHUT_OUT.has(reply.error)) { forgetWorkerPhone(); return { state: 'shut_out' }; }
    if (reply?.ok) {
      // The cloud has answered for every one of them: kept, or refused for a
      // reason sending again would not change (a role that may not add
      // customers, an amount that is not money). Either way, not sent again.
      for (const item of [...unsent.customers, ...unsent.expenseRequests, ...unsent.pieceWork]) sent.add(String(item.id));
      any = true;
    }
  }

  if (payments.length) {
    const reply = await callCloud('staff_send_payments', { p_token: session.token, p_device_key: deviceKey(), p_payments: payments });
    if (reply && !reply.ok && SHUT_OUT.has(reply.error)) { forgetWorkerPhone(); return { state: 'shut_out' }; }
    if (reply?.ok) {
      // Only what the cloud took: a payment on a bundle the cloud has not got
      // yet waits, and goes with the next send once the bundle is there.
      for (const id of (Array.isArray(reply.payments) ? reply.payments : [])) sent.add(String(id));
      any = true;
    }
  }

  writeSent(store.accessCode, sent);
  return { state: any ? 'sent' : 'unchanged' };
}

async function callCloud(fn: string, args: Record<string, unknown>): Promise<Record<string, any> | null> {
  try {
    const { data, error } = await rpcAheadOfTypes(fn, args);
    if (error) return null;
    return (data || null) as Record<string, any> | null;
  } catch {
    return null;
  }
}

/** The worker is no longer let in: forget the copy, the pass and the approval. */
export function forgetWorkerPhone(): void {
  const session = readWorkerSession();
  const join = readJoin();
  const ref = session?.storeRef || join?.storeRef;
  try {
    if (ref) {
      localStorage.removeItem(`storeflow_${workerAccessCode(ref)}`);
      localStorage.removeItem(sentKey(workerAccessCode(ref)));
    }
  } catch { /* private mode */ }
  writeWorkerSession(null);
  writeJoin(null);
}

const SHUT_OUT = new Set(['revoked', 'no_staff', 'not_found']);

/**
 * Sign in with the worker's PIN. Online the cloud decides; offline the phone
 * may, within 24 hours of the cloud last saying yes.
 */
export async function signInWorker(
  pin: string,
  deps: { loadCopy: (code: string) => StoreData | null; saveCopy: (store: StoreData) => void; now?: () => number } ,
): Promise<SignInResult> {
  const join = readJoin();
  if (!join || join.status !== 'authorized') return { ok: false, error: 'not_joined' };
  const now = deps.now ? deps.now() : Date.now();

  const reply = navigator.onLine
    ? await callCloud('staff_sign_in', { p_request_id: join.requestId, p_device_key: deviceKey(), p_pin: pin })
    : null;

  if (reply && reply.ok) {
    const storeRef = String(reply.store_ref || join.storeRef);
    const existing = deps.loadCopy(workerAccessCode(storeRef));
    const store = workerStoreFromView(reply.view || {}, join, storeRef, existing);
    markViewAsSent(store.accessCode, reply.view || {});
    deps.saveCopy(store);
    const worker = reply.worker as Worker;
    writeWorkerSession({
      token: reply.token, expiresAt: reply.expires_at, lastOnlineAt: new Date(now).toISOString(),
      pinHash: await pinHash(pin), worker, storeRef,
    });
    return { ok: true, store, worker, offline: false };
  }

  if (reply && !reply.ok) {
    if (SHUT_OUT.has(reply.error)) forgetWorkerPhone();
    return { ok: false, error: reply.error };
  }

  // The cloud could not be reached. The phone may let the worker in on its
  // own, for a while, with the PIN it last saw the cloud accept.
  const session = readWorkerSession();
  if (!session) return { ok: false, error: 'offline_first' };
  if (now - new Date(session.lastOnlineAt).getTime() > OFFLINE_WINDOW_MS) return { ok: false, error: 'offline_too_long' };
  if (session.pinHash !== await pinHash(pin)) return { ok: false, error: 'wrong_pin' };
  const store = deps.loadCopy(workerAccessCode(session.storeRef));
  if (!store) return { ok: false, error: 'offline_first' };
  return { ok: true, store, worker: session.worker, offline: true };
}

export type RefreshResult =
  | { state: 'fresh'; store: StoreData; worker: Worker }
  | { state: 'unchanged' }
  | { state: 'shut_out' };

/**
 * Bring the copy up to date while signed in, without asking for the PIN.
 * Returns shut_out when the phone has been revoked or the worker removed, so
 * the app can sign them out at once.
 */
export async function refreshWorkerCopy(
  deps: { loadCopy: (code: string) => StoreData | null; saveCopy: (store: StoreData) => void; now?: () => number },
): Promise<RefreshResult> {
  const session = readWorkerSession();
  const join = readJoin();
  if (!session || !join || !navigator.onLine) return { state: 'unchanged' };
  const reply = await callCloud('staff_session_view', { p_token: session.token, p_device_key: deviceKey() });
  if (!reply) return { state: 'unchanged' };
  if (!reply.ok) {
    if (SHUT_OUT.has(reply.error)) {
      forgetWorkerPhone();
      return { state: 'shut_out' };
    }
    return { state: 'unchanged' };
  }
  const storeRef = String(reply.store_ref || session.storeRef);
  const store = workerStoreFromView(reply.view || {}, join, storeRef, deps.loadCopy(workerAccessCode(storeRef)));
  markViewAsSent(store.accessCode, reply.view || {});
  deps.saveCopy(store);
  const now = deps.now ? deps.now() : Date.now();
  writeWorkerSession({ ...session, worker: reply.worker, lastOnlineAt: new Date(now).toISOString(), storeRef });
  return { state: 'fresh', store, worker: reply.worker as Worker };
}

export function signInErrorText(error: string): string {
  switch (error) {
    case 'wrong_pin': return 'That PIN is not right.';
    case 'paused': return 'Too many wrong tries. Wait an hour, or ask the owner.';
    case 'revoked': return 'The owner has removed this phone. Ask them if you need it again.';
    case 'no_staff': return 'You are no longer on this shop’s staff list.';
    case 'not_found': return 'This phone is no longer linked to the shop.';
    case 'offline_first': return 'Connect to the internet to sign in the first time.';
    case 'offline_too_long': return 'Connect to the internet to sign in. It has been more than a day.';
    case 'not_joined': return 'This phone has not joined a shop yet.';
    default: return 'Something went wrong. Try again.';
  }
}

/** How often a worker's phone asks what changed in the shop's bundles, while in front. */
export const WORKER_BUNDLES_MS = 3 * 60 * 1000;

export type BundlesResult =
  | { state: 'ok'; orders: Record<string, any>[]; asOf: string }
  | { state: 'unchanged' }
  | { state: 'shut_out' };

/**
 * The shop's laundry bundles, for a worker's phone.
 *
 * The first time, open bundles and anything finished in the last week; after
 * that, only what changed since `since` - normally nothing, a reply of a few
 * dozen bytes. The cloud leaves out each customer's private order key and
 * account id. A pass that has run out is not a reason to sign out - the PIN
 * gets a new one - but a revoked phone or a removed worker is.
 */
export async function fetchWorkerBundles(since: string | null): Promise<BundlesResult> {
  const session = readWorkerSession();
  if (!session || !navigator.onLine) return { state: 'unchanged' };
  const reply = await callCloud('staff_laundry_list', { p_token: session.token, p_device_key: deviceKey(), p_since: since });
  if (!reply) return { state: 'unchanged' };
  if (!reply.ok) {
    if (SHUT_OUT.has(reply.error)) {
      forgetWorkerPhone();
      return { state: 'shut_out' };
    }
    return { state: 'unchanged' };
  }
  return { state: 'ok', orders: Array.isArray(reply.orders) ? reply.orders : [], asOf: String(reply.as_of) };
}

/** Lay newer bundles over the ones already shown, newest first. */
export function mergeBundles(current: Record<string, any>[], incoming: Record<string, any>[]): Record<string, any>[] {
  const byId = new Map(current.map(order => [order.id, order]));
  for (const order of incoming) byId.set(order.id, order);
  return [...byId.values()].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}
