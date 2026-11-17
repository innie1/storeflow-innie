import type { StoreData } from '@/types/store';
import { cloudBundleBalance } from '@/lib/laundry-money';
import { parseLaundryRecordMetadata } from '@/lib/laundry-workspace';

/*
 * What a customer is sent, and only that.
 *
 * These messages named the worker who took the clothes in and the worker who
 * received each payment. That is the shop's own record - who to ask when a
 * figure is questioned - and it has no business in a customer's chat: it puts
 * staff names in front of strangers and reads like a page from the shop's
 * book, not a message to a person. The record of who did what is still kept,
 * on the bundle's own page and its ticket.
 *
 * Every message is laid out the same way, so a customer who gets three of
 * them learns where to look: a greeting, one sentence saying what this is,
 * the laundry code in bold, the details, one line on what to do next, and the
 * shop's name and address.
 */

export type LaundryMessageKind = 'received' | 'processing' | 'ready' | 'reminder' | 'completed';

export interface LaundryWhatsAppPayload {
  phone: string;
  message: string;
  url: string;
  kind: LaundryMessageKind;
}

export function normalizeWhatsAppPhone(phone: string, defaultCountryCode = '234'): string {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = defaultCountryCode + digits.slice(1);
  return digits;
}

function money(value: unknown): string {
  return `₦${Math.max(0, Number(value) || 0).toLocaleString()}`;
}

/** The shop's name in bold, then where it is and how to reach it. WhatsApp shows *this* as bold. */
export function shopSignature(store: Pick<StoreData, 'storeName' | 'profile'>): string[] {
  const profile = store.profile;
  return [
    `*${String(store.storeName || '').trim()}*`,
    profile?.location ? String(profile.location).trim() : '',
    profile?.phone ? `Tel: ${String(profile.phone).trim()}` : '',
  ].filter(line => line && line !== '**');
}

/** "Hello Ada," - and plain "Hello," for a walk-in nobody took a name from. */
export function customerGreeting(name: unknown): string {
  const clean = String(name || '').trim();
  return clean && !/^(walk-in customer|customer)$/i.test(clean) ? `Hello ${clean},` : 'Hello,';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Wednesday 18 November, 5pm". Written out, so it reads the same on every phone. */
export function dayAndTime(at: number): string {
  const date = new Date(at);
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  const clock = `${twelve}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}${hours < 12 ? 'am' : 'pm'}`;
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}, ${clock}`;
}

/**
 * When the shop promised it for - only a time the shop actually gave, and only
 * while it is still ahead. A promise already missed is not something to put
 * in front of the customer again.
 */
function readyByLine(meta: Record<string, any>): string[] {
  const at = Date.parse(String(meta.promised_for || ''));
  return Number.isFinite(at) && at > Date.now() ? [`Ready by: ${dayAndTime(at)}`] : [];
}

/**
 * What the bundle costs and where the money stands, with no names in it.
 *
 * "Paid" and "to pay" are said only when the shop's record knows. Where
 * nothing is known about payment, the total is given and nothing is claimed.
 */
function moneyLines(store: StoreData, order: any, clientRef: string, options: { total?: boolean; collected?: boolean } = {}): string[] {
  const total = Math.max(0, Number(order?.total) || 0);
  if (!(total > 0)) return [];
  const entry = (store.pendingPayments || []).find(item => item.id === `laundry-${clientRef}`);
  const balance = cloudBundleBalance(store, clientRef, order || {}) ?? (entry ? Math.max(0, Number(entry.balance) || 0) : null);
  const lines = options.total === false ? [] : [`Total: ${money(total)}`];
  if (balance === null) return lines;
  if (balance <= 0) return [...lines, 'Paid in full'];
  const paid = Math.max(0, total - balance);
  return [
    ...lines,
    ...(paid > 0 ? [`Paid: ${money(paid)}`] : []),
    `${options.collected ? 'Still to pay' : 'To pay on collection'}: ${money(balance)}`,
  ];
}

/** One entry per kind of garment, so the message can lay them out itself. */
function garmentLines(order: any, meta: Record<string, any>): { name: string; quantity: number }[] {
  const lines = Array.isArray(meta.garment_lines) ? meta.garment_lines : [];
  if (lines.length) {
    return lines.map((item: any) => ({
      name: String(item.garmentType || item.garment_type || 'Item'),
      quantity: Math.max(1, Number(item.quantity) || 1),
    }));
  }
  return (order?.order_items || [])
    .filter((item: any) => !item?.metadata?.charge_line)
    .map((item: any) => ({
      name: String(item.item_name || item.product_name || 'Item'),
      quantity: Math.max(1, Number(item.quantity) || 1),
    }));
}

/**
 * The items, as a list a customer can actually check against their bag.
 *
 * This used to be one run-on line — "Items (6): 1 Shirt, 1 Trouser, 1 T-shirt,
 * 1 Nicker / Shorts, 1 Gown / Dress, 1 Skirt" — which wrapped across four
 * lines on a phone and had to be read word by word to count. WhatsApp has no
 * columns or tables to lay it out with (proportional font, no table markup),
 * so a numbered list down the message is the format that scans: the number on
 * the left is the count, and each garment sits on its own line.
 *
 * A quantity is only shown when there is more than one, because "1 ×" on every
 * line of a six-line list is noise.
 */
function formatItemBlock(order: any, meta: Record<string, any>, pieces: number): string[] {
  const lines = garmentLines(order, meta);
  const heading = `*Items — ${pieces} piece${pieces === 1 ? '' : 's'}*`;

  if (!lines.length) {
    const summary = meta.garment_summary ? String(meta.garment_summary) : '';
    return summary ? [heading, summary] : [heading];
  }

  return [
    heading,
    ...lines.map((item, index) => (
      item.quantity > 1
        ? `${index + 1}. ${item.name} ×${item.quantity}`
        : `${index + 1}. ${item.name}`
    )),
    // A blank line, so the total does not run straight on from the last item.
    '',
  ];
}

function determineKind(order: any): LaundryMessageKind {
  const stage = String(order?.workflow_stage || order?.status || '').toLowerCase().replace(/[_-]/g, ' ');
  const updatedAt = new Date(order?.updated_at || order?.created_at || Date.now()).getTime();
  const ageDays = Math.max(0, (Date.now() - updatedAt) / 86_400_000);

  if (stage.includes('complete') || stage.includes('collect') || stage.includes('delivered')) return 'completed';
  if (stage.includes('ready')) return ageDays >= 7 ? 'reminder' : 'ready';
  if (
    stage.includes('prepar') || stage.includes('process') || stage.includes('wash') ||
    stage.includes('dry') || stage.includes('iron') || stage.includes('fold') || stage.includes('quality')
  ) return 'processing';
  return 'received';
}

export function buildLaundryWhatsAppPayload(store: StoreData, order: any): LaundryWhatsAppPayload | null {
  const phone = normalizeWhatsAppPhone(order?.customer_phone || '');
  if (!phone) return null;

  const meta = parseLaundryRecordMetadata(order);
  const kind = determineKind(order);
  const tag = String(meta.tag_code || meta.receipt_number || order?.order_number || '').toUpperCase();
  const service = String(meta.service_name || 'Laundry service');
  const pieces = Number(meta.garment_count || 0) || (order?.order_items || []).reduce((sum: number, item: any) => {
    if (item?.metadata?.charge_line) return sum;
    return sum + Math.max(0, Number(item?.quantity) || 0);
  }, 0);
  const shop = String(store.storeName || 'our shop');
  const clientRef = String(order?._localClientRef || order?.client_ref || meta.client_ref || '');
  const code = tag ? [`*Laundry code: ${tag}*`] : [];
  const count = pieces > 0 ? [`${pieces} piece${pieces === 1 ? '' : 's'}`] : [];
  const lines: string[] = [customerGreeting(order?.customer_name), ''];

  if (kind === 'received') {
    lines.push(
      `Thank you for choosing ${shop}. We have received your laundry.`,
      '',
      ...code,
      `Service: ${service}`,
      ...readyByLine(meta),
      '',
      ...formatItemBlock(order, meta, pieces),
      ...moneyLines(store, order, clientRef),
      '',
      'We will message you when it is ready.',
    );
  } else if (kind === 'processing') {
    lines.push(
      `Your laundry is currently being processed at ${shop}.`,
      '',
      ...code,
      `Service: ${service}`,
      ...count,
      ...readyByLine(meta),
      '',
      'We will message you when it is ready.',
    );
  } else if (kind === 'ready') {
    lines.push(
      `Good news! Your laundry is ready for pickup at ${shop}.`,
      '',
      ...code,
      '',
      ...formatItemBlock(order, meta, pieces),
      ...moneyLines(store, order, clientRef),
      '',
      'Please bring or mention your laundry code when you come.',
    );
  } else if (kind === 'reminder') {
    lines.push(
      `A friendly reminder from ${shop}: your laundry is still ready for collection.`,
      '',
      ...code,
      ...count,
      ...moneyLines(store, order, clientRef, { total: false }),
      '',
      'Please come by when you can, or reply to tell us when to expect you.',
    );
  } else {
    lines.push(
      `Thank you for using ${shop}. Your laundry has been collected.`,
      '',
      ...code,
      ...count,
      ...moneyLines(store, order, clientRef, { collected: true }),
      '',
      'We appreciate your patronage and hope to serve you again.',
    );
  }

  lines.push('', ...shopSignature(store));
  const message = lines.filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n');
  return {
    phone,
    message,
    url: `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
    kind,
  };
}

export function openLaundryWhatsApp(store: StoreData, order: any): boolean {
  const payload = buildLaundryWhatsAppPayload(store, order);
  if (!payload || typeof window === 'undefined') return false;
  window.open(payload.url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * The same message, with WhatsApp asking who it goes to.
 *
 * `wa.me` with no number opens the contact picker with the text already
 * written. That covers everything the customer's own number does not: the
 * owner wanting a copy on their own phone, a bundle dropped off by somebody's
 * driver, a regular whose number the shop has under a different name - and
 * every walk-in who gave no number at all, who until now had no way to be
 * sent anything.
 *
 * It is one tap either way. The shop picks the contact instead of typing a
 * number, which is the part that was slow.
 */
export function openWhatsAppChooser(store: StoreData, order: any): boolean {
  const payload = buildLaundryWhatsAppPayload(store, order);
  if (!payload || typeof window === 'undefined') return false;
  window.open(`https://wa.me/?text=${encodeURIComponent(payload.message)}`, '_blank', 'noopener,noreferrer');
  return true;
}
