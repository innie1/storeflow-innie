/**
 * A worker's own phone joining a shop, and the owner letting it in.
 *
 * The worker gives the shop's permanent Store ID and their own staff PIN; the
 * owner approves and reads them a 6-digit code; the phone is then authorized
 * for that shop and that worker. Nothing here ever touches the owner's email,
 * password or recovery details. The cloud side is
 * supabase/migrations/20261011220000_staff_device_join.sql, which keeps the
 * phone's key and the code only as hashes and checks the PIN itself.
 *
 * Not the 6-letter access code: that is also the password for deleting
 * sales, expenses and products, so it is never something to hand a worker.
 * The Store ID is already public - it is on the customer QR code.
 */

import { rpcAheadOfTypes } from '@/integrations/supabase/client';

const DEVICE_KEY = 'storeflow_device_key';
const JOIN_KEY = 'storeflow_staff_join';

export type JoinStatus = 'pending' | 'approved' | 'authorized' | 'rejected' | 'revoked';

export interface StaffMatch {
  staff_id: string;
  name: string;
  role: string;
}

/** What this phone remembers about its request, so leaving and coming back resumes it. */
export interface JoinRecord {
  requestId: string;
  storeRef: string;
  storeName: string;
  staffId: string;
  staffName: string;
  staffRole?: string;
  status: JoinStatus;
}

export interface DeviceRow {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_role?: string;
  device_label?: string;
  status: JoinStatus;
  requested_at: string;
  decided_at?: string;
  authorized_at?: string;
  last_seen_at?: string;
  code_live?: boolean;
  code_expires_at?: string;
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; tries_left?: number };

/**
 * This phone's own secret, made once and kept.
 *
 * The cloud holds only its hash, so it is how a phone proves it is the one
 * that asked - and, once approved, the one that was let in.
 */
export function deviceKey(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing && existing.length >= 32) return existing;
  } catch { /* private mode: a key for this visit only */ }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  try { localStorage.setItem(DEVICE_KEY, key); } catch { /* see above */ }
  return key;
}

/** A name for this phone the owner will recognise: "Samsung SM-A366B", "iPhone". */
export async function deviceLabel(): Promise<string> {
  const nav = navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string; platform?: string }> } };
  try {
    const hints = await nav.userAgentData?.getHighEntropyValues?.(['model', 'platform']);
    if (hints?.model) return hints.model.startsWith('SM-') ? `Samsung ${hints.model}` : hints.model;
  } catch { /* not offered by this browser */ }
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  const android = ua.match(/Android [\d.]+; ([^;)]+)/);
  if (android && android[1].trim() !== 'K') return android[1].trim().startsWith('SM-') ? `Samsung ${android[1].trim()}` : android[1].trim();
  if (/Android/.test(ua)) return 'Android phone';
  if (/Windows/.test(ua)) return 'Windows computer';
  if (/Mac OS/.test(ua)) return 'Mac';
  return 'This phone';
}

export function readJoin(): JoinRecord | null {
  try {
    const raw = localStorage.getItem(JOIN_KEY);
    return raw ? JSON.parse(raw) as JoinRecord : null;
  } catch {
    return null;
  }
}

export function writeJoin(record: JoinRecord | null): void {
  try {
    if (record) localStorage.setItem(JOIN_KEY, JSON.stringify(record));
    else localStorage.removeItem(JOIN_KEY);
  } catch { /* private mode */ }
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error } = await rpcAheadOfTypes(fn, args);
    if (error) return { ok: false, error: 'offline' };
    return (data || { ok: false, error: 'offline' }) as Result<T>;
  } catch {
    return { ok: false, error: 'offline' };
  }
}

export const normaliseStoreRef = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

/* ── the worker's phone ─────────────────────────────────────────────────── */

export function identifyWorker(storeRef: string, pin: string) {
  return call<{ store_name: string; matches: StaffMatch[] }>('staff_join_identify', {
    p_store_ref: normaliseStoreRef(storeRef), p_pin: pin.trim(), p_device_key: deviceKey(),
  });
}

export function requestAccess(storeRef: string, pin: string, staffId: string, label: string) {
  return call<{ request_id: string; status: JoinStatus; store_name: string; staff_name: string; staff_role?: string }>('staff_join_request', {
    p_store_ref: normaliseStoreRef(storeRef), p_pin: pin.trim(), p_staff_id: staffId, p_device_key: deviceKey(), p_device_label: label,
  });
}

export function joinStatus(requestId: string) {
  return call<{ status: JoinStatus; code_ready: boolean; store_name: string; staff_name: string; staff_role?: string }>('staff_join_status', {
    p_request_id: requestId, p_device_key: deviceKey(),
  });
}

export function redeemCode(requestId: string, code: string) {
  return call<{ status: JoinStatus; staff_id: string; staff_name: string }>('staff_join_redeem', {
    p_request_id: requestId, p_device_key: deviceKey(), p_code: code.replace(/\D/g, ''),
  });
}

/** What to tell a worker when the cloud says no. */
export function joinErrorText(error: string, triesLeft?: number): string {
  switch (error) {
    case 'not_found': return 'StoreFlow cannot find this shop online. Check the Store ID with the owner - if it is right, the owner needs to turn on Cloud Sync first.';
    case 'wrong_pin': return 'That PIN is not right for this shop.';
    case 'paused': return 'Too many wrong tries. Wait an hour, or ask the owner.';
    case 'too_many': return 'This shop has too many requests waiting. Ask the owner to clear them.';
    case 'wrong_code': return `That code is not right.${triesLeft !== undefined ? ` ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left.` : ''}`;
    case 'expired': return 'That code has run out. Ask the owner for a new one.';
    case 'no_code': return 'There is no code to use. Ask the owner to approve again for a new one.';
    case 'bad_device': return 'This phone could not make its key. Try another browser.';
    case 'offline': return 'Could not reach StoreFlow. Check the internet and try again.';
    default: return 'Something went wrong. Try again.';
  }
}

/* ── the owner ──────────────────────────────────────────────────────────── */

export function listDevices(storeRef: string) {
  return call<{ devices: DeviceRow[] }>('staff_device_list', { p_store_ref: storeRef });
}

export function approveDevice(requestId: string) {
  return call<{ code: string; expires_at: string }>('staff_device_approve', { p_request_id: requestId });
}

export function rejectDevice(requestId: string) {
  return call<Record<string, never>>('staff_device_reject', { p_request_id: requestId });
}

/**
 * Take a phone back. Its next check with the cloud is answered "revoked" and
 * the app signs it out; to come back it has to ask to join again.
 */
export function revokeDevice(requestId: string) {
  return call<{ revoked: number }>('staff_device_revoke', { p_request_id: requestId });
}

/** Every phone one worker has in this shop: a lost phone, or they have left. */
export function revokeAllDevices(storeRef: string, staffId: string) {
  return call<{ revoked: number }>('staff_device_revoke_all', { p_store_ref: storeRef, p_staff_id: staffId });
}

/**
 * The link an invite QR opens: the app's own front door with the Store ID
 * filled in. It holds no secret - the owner still approves the phone and
 * gives it a code - so a photo of it shared around lets nobody in.
 */
export function inviteLink(storeRef: string, origin: string = window.location.origin): string {
  return `${origin}/?join=${encodeURIComponent(normaliseStoreRef(storeRef))}`;
}

/** The Store ID an invite link brought, if this page was opened from one. */
export function inviteStoreRef(search: string = window.location.search): string {
  const ref = normaliseStoreRef(new URLSearchParams(search).get('join') || '');
  return /^[A-Z0-9-]{4,24}$/.test(ref) ? ref : '';
}

/** "Seen 5 min ago": how recently the phone last reached the cloud. */
export function lastSeen(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return 'Not seen yet';
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return 'Seen just now';
  if (minutes < 60) return `Seen ${minutes} min ago`;
  if (minutes < 24 * 60) return `Seen ${Math.floor(minutes / 60)} h ago`;
  return `Seen ${new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

/*
 * An invite waiting to be answered.
 *
 * The link was read by the opening screen, which only shows on a phone with
 * no shop open - and even then only for the moment before an open shop
 * finished loading, after which the shop replaced it and the invite was gone.
 * So a phone with any shop open landed in that shop as if nothing had been
 * scanned. The link is now taken out of the address bar once, at start-up,
 * and kept for this visit until somebody answers it: the opening screen
 * offers Join a Store, and an open shop asks first whether to leave it.
 */
const INVITE_KEY = 'storeflow_pending_invite';

/** Called once at start-up, before anything is drawn. */
export function captureInviteFromUrl(): void {
  try {
    if (!new URLSearchParams(window.location.search).has('join')) return;
    const ref = inviteStoreRef();
    if (ref) window.sessionStorage.setItem(INVITE_KEY, ref);
    const url = new URL(window.location.href);
    url.searchParams.delete('join');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* private mode: the link simply does nothing */ }
}

/** The Store ID an unanswered invite names, or ''. */
export function pendingInvite(): string {
  try {
    return inviteStoreRef(`?join=${encodeURIComponent(window.sessionStorage.getItem(INVITE_KEY) || '')}`);
  } catch {
    return '';
  }
}

export function clearInvite(): void {
  try { window.sessionStorage.removeItem(INVITE_KEY); } catch { /* private mode */ }
}

/** "482 731": easier to read out loud. */
export const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
